import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { resolveWebhookChallenge, verifyWhatsAppSignature } from "@/lib/whatsapp/verify"
import { parseWhatsAppWebhook, getWhatsAppChannelByPhoneNumberId } from "@/lib/whatsapp/channels"
import { decryptWhatsAppCredentials } from "@/lib/whatsapp/channel-secrets"
import { WhatsAppProcessor } from "@/lib/whatsapp/processor"
import { markWhatsAppRead, sendWhatsAppText } from "@/lib/whatsapp/client"
import { handleWhatsAppReopenAction } from "@/lib/whatsapp/pending"
import { getPlatformWhatsAppConfig } from "@/lib/whatsapp/platform"
import { syncWhatsAppReopenTemplateStatusFromWebhook } from "@/lib/whatsapp/template-provisioning"
import { runAutopilot } from "@/lib/ai/autopilot"
import type { MessagingChannelRow } from "@/lib/whatsapp/types"

// Webhook is called by Meta servers, not the browser. No user auth here:
// authenticity is proven by the verify token (GET) and the app-secret HMAC
// signature (POST). Must run on the Node runtime for crypto + raw body.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET: Meta webhook verification handshake. We don't know which tenant is
 * subscribing yet, so we accept the challenge if the verify_token matches ANY
 * active WhatsApp channel. Tenants should use a unique verify token.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const presentedToken = params.get("hub.verify_token")

  if (!presentedToken) {
    return new NextResponse("Missing verify token", { status: 400 })
  }

  // Embedded Signup model: a single shared webhook configured once by the
  // platform admin. Accept the platform-level verify token first — this also
  // works when NO tenant has connected yet (initial Meta dashboard handshake).
  const platform = getPlatformWhatsAppConfig()
  const platformChallenge = resolveWebhookChallenge(params, platform.verifyToken || null)
  if (platformChallenge) {
    return new NextResponse(platformChallenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    })
  }

  // Fallback: legacy per-tenant manual setup (each tenant its own verify token).
  const supabase = createServiceClient()
  const { data } = await supabase
    .from("messaging_channels")
    .select("credentials")
    .eq("channel_type", "whatsapp")
    .eq("is_active", true)

  const rows = (data as Array<{ credentials: { verify_token?: string } }>) ?? []
  for (const row of rows) {
    // Dual-read: tollera verify_token legacy in chiaro o cifrato `enc:v1:`.
    const creds = decryptWhatsAppCredentials(row.credentials)
    const challenge = resolveWebhookChallenge(params, creds?.verify_token as string | undefined)
    if (challenge) {
      return new NextResponse(challenge, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      })
    }
  }

  return new NextResponse("Forbidden", { status: 403 })
}

/**
 * POST: inbound messages, delivery statuses and managed-template lifecycle
 * events from Meta.
 *
 * Embedded-Signup tenants are signed by the shared platform app. Legacy/manual
 * tenants may still be connected through a different Meta app, so message
 * events fall back to the routed tenant channel's app secret. Template lifecycle
 * events have no safe phone-number route and are accepted ONLY with the shared
 * platform signature.
 *
 * Transient processing errors return 500 so Meta can retry. Every externally
 * visible write is idempotent on Meta message id or on the durable pending
 * message state machine.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signature = request.headers.get("x-hub-signature-256")

  let body: any
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ received: true }, { status: 200 })
  }

  const supabase = createServiceClient()

  try {
    const parsed = parseWhatsAppWebhook(body)
    const platform = getPlatformWhatsAppConfig()
    const platformSignatureValid = Boolean(
      platform.appSecret && verifyWhatsAppSignature(rawBody, signature, platform.appSecret),
    )

    // Status callbacks can lack phone_number_id. Never route them by guesswork:
    // only the platform app signature can mutate managed-template metadata.
    if (platformSignatureValid) {
      await syncWhatsAppReopenTemplateStatusFromWebhook(supabase, body)
    }

    // Coexistence also emits history/state-sync/status callbacks with no Inbox
    // message. They can still carry metadata.phone_number_id and may be signed
    // by the tenant/legacy app rather than the shared platform app. Route those
    // by the concrete phone number and verify that tenant secret before acking;
    // otherwise Meta retries valid tenant events forever with 401 noise.
    if (parsed.messages.length === 0 && parsed.echoes.length === 0) {
      let tenantSignatureValid = false
      if (!platformSignatureValid && parsed.phoneNumberId) {
        const routed = await getWhatsAppChannelByPhoneNumberId(supabase, parsed.phoneNumberId)
        if (routed) {
          tenantSignatureValid = verifyWhatsAppSignature(
            rawBody,
            signature,
            routed.credentials?.app_secret || null,
          )
        }
      }

      if (platform.appSecret && !platformSignatureValid && !tenantSignatureValid) {
        console.warn("[WhatsApp webhook] invalid signature on non-message event", {
          phone_number_id: parsed.phoneNumberId,
        })
        return NextResponse.json({ received: false }, { status: 401 })
      }
      return NextResponse.json({ received: true }, { status: 200 })
    }

    const eventsByPhone = new Map<
      string,
      { messages: typeof parsed.messages; echoes: typeof parsed.echoes }
    >()
    const eventsFor = (phoneNumberId: string) => {
      let events = eventsByPhone.get(phoneNumberId)
      if (!events) {
        events = { messages: [], echoes: [] }
        eventsByPhone.set(phoneNumberId, events)
      }
      return events
    }

    for (const message of parsed.messages) eventsFor(message.phoneNumberId).messages.push(message)
    for (const echo of parsed.echoes) eventsFor(echo.phoneNumberId).echoes.push(echo)

    const processor = new WhatsAppProcessor(supabase)
    let requiresRetry = false
    let processedAuthenticatedGroup = false
    let invalidSignatureSeen = false

    for (const [phoneNumberId, events] of eventsByPhone) {
      const channel = await getWhatsAppChannelByPhoneNumberId(supabase, phoneNumberId)
      if (!channel) {
        // An authenticated platform event may reference a number no longer
        // connected. There is no tenant data to mutate, so ignore it.
        continue
      }

      const typedChannel = channel as MessagingChannelRow
      // Backward compatibility: once the platform app secret is configured we
      // must NOT lock out legacy tenants that were onboarded with another Meta
      // app. Route first by phone_number_id, then verify that channel's own
      // decrypted app secret when the shared signature does not match.
      const tenantSignatureValid = platformSignatureValid
        ? true
        : verifyWhatsAppSignature(rawBody, signature, typedChannel.credentials?.app_secret || null)

      if (!tenantSignatureValid) {
        invalidSignatureSeen = true
        await supabase.from("message_processing_logs").insert({
          property_id: typedChannel.property_id,
          channel: "whatsapp",
          event_type: "signature_invalid",
          event_data: { phone_number_id: phoneNumberId },
        })
        continue
      }

      processedAuthenticatedGroup = true
      let anyInbound = false
      let anyAppEcho = false

      for (const msg of events.messages) {
        const result = await processor.processInbound(msg, typedChannel.id, typedChannel.property_id)
        if (!result.success) {
          requiresRetry = true
          console.error("[WhatsApp webhook] inbound persistence failed:", result.error)
          continue
        }

        // Our reopen-template buttons are control messages. Handle them before
        // the duplicate guard so a Meta retry can recover a failed delivery,
        // while the pending status machine still guarantees no blind resend.
        const reopen = await handleWhatsAppReopenAction(
          supabase,
          msg,
          typedChannel,
          typedChannel.property_id,
        )
        if (reopen.requiresRetry) {
          requiresRetry = true
          console.error("[WhatsApp reopen] retry required:", reopen.error)
        }

        if (!result.isDuplicate) {
          anyInbound = true
          await markWhatsAppRead(typedChannel.config, typedChannel.credentials, msg.externalId)
        }

        // A quick-reply such as "Apri comunicazione" is not guest prose. It
        // must never be fed to the hotel assistant, otherwise the AI could send
        // an unrelated answer immediately after delivering the queued message.
        if (reopen.handled) continue
        if (result.isDuplicate) continue

        // The inbound message opens WhatsApp's 24h window, so a free-form
        // assistant response remains deliverable here.
        if (result.conversationId) {
          try {
            const outcome = await runAutopilot({
              supabase,
              propertyId: typedChannel.property_id,
              conversationId: result.conversationId,
              channel: "whatsapp",
              channelId: typedChannel.id,
              incomingText: msg.body,
              send: async (text) => {
                const sent = await sendWhatsAppText(
                  typedChannel.config,
                  typedChannel.credentials,
                  msg.fromPhone,
                  text,
                )
                if (!sent.success) throw new Error(sent.error ?? "Errore invio WhatsApp")
                return { externalId: sent.externalMessageId }
              },
            })
            if (outcome.action === "sent") {
              await supabase
                .from("messaging_channels")
                .update({ last_outbound_at: new Date().toISOString() })
                .eq("id", typedChannel.id)
            }
          } catch (error) {
            console.error("[WhatsApp autopilot] error:", error)
          }
        }
      }

      for (const echo of events.echoes) {
        const result = await processor.processOutgoingEcho(echo, typedChannel.id, typedChannel.property_id)
        if (!result.success) {
          // Returning 5xx keeps the raw Meta delivery retryable. The message
          // external ID is the idempotency key, so successfully stored events
          // are safe when the mixed batch is delivered again.
          requiresRetry = true
          console.error("[WhatsApp webhook] app echo persistence failed:", result.error)
          continue
        }
        if (!result.isDuplicate) anyAppEcho = true
      }

      if (anyInbound) {
        await supabase
          .from("messaging_channels")
          .update({ last_inbound_at: new Date().toISOString(), last_error: null })
          .eq("id", typedChannel.id)
      }

      if (anyAppEcho) {
        await supabase
          .from("messaging_channels")
          .update({ last_outbound_at: new Date().toISOString(), last_error: null })
          .eq("id", typedChannel.id)
      }
    }

    if (!processedAuthenticatedGroup && invalidSignatureSeen) {
      return NextResponse.json({ received: false }, { status: 401 })
    }
    if (requiresRetry) {
      return NextResponse.json({ received: false, retry: true }, { status: 500 })
    }
    return NextResponse.json({ received: true }, { status: 200 })
  } catch (error) {
    console.error("[WhatsApp webhook] unexpected error:", error)
    // A transient processing failure must remain retryable. Inbound and echo
    // inserts are idempotent on Meta's external message ID.
    return NextResponse.json({ received: false, retry: true }, { status: 500 })
  }
}
