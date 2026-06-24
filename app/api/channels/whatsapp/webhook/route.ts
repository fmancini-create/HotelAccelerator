import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { resolveWebhookChallenge, verifyWhatsAppSignature } from "@/lib/whatsapp/verify"
import { parseWhatsAppWebhook, getWhatsAppChannelByPhoneNumberId } from "@/lib/whatsapp/channels"
import { decryptWhatsAppCredentials } from "@/lib/whatsapp/channel-secrets"
import { WhatsAppProcessor } from "@/lib/whatsapp/processor"
import { markWhatsAppRead } from "@/lib/whatsapp/client"
import { getPlatformWhatsAppConfig } from "@/lib/whatsapp/platform"
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
 * POST: inbound messages and delivery statuses from Meta.
 * Flow: read raw body -> route to tenant by phone_number_id -> verify signature
 * with that tenant's app secret -> process messages idempotently.
 *
 * Always returns 200 quickly so Meta does not retry/disable the webhook; real
 * errors are recorded in message_processing_logs.
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

    if (!parsed.phoneNumberId) {
      return NextResponse.json({ received: true }, { status: 200 })
    }

    const channel = await getWhatsAppChannelByPhoneNumberId(supabase, parsed.phoneNumberId)
    if (!channel) {
      // Unknown phone number id -> not one of our tenants (or inactive).
      return NextResponse.json({ received: true }, { status: 200 })
    }

    const typedChannel = channel as MessagingChannelRow
    // Prefer the platform app secret (single shared Meta app); fall back to the
    // per-tenant secret for legacy manual setups.
    const appSecret = getPlatformWhatsAppConfig().appSecret || typedChannel.credentials?.app_secret || null

    // Verify the HMAC signature using the tenant's app secret.
    const signatureValid = verifyWhatsAppSignature(rawBody, signature, appSecret)
    if (!signatureValid) {
      await supabase.from("message_processing_logs").insert({
        property_id: typedChannel.property_id,
        channel: "whatsapp",
        event_type: "signature_invalid",
        event_data: { phone_number_id: parsed.phoneNumberId },
      })
      return NextResponse.json({ received: true }, { status: 200 })
    }

    if (parsed.messages.length === 0 && parsed.statuses.length === 0) {
      return NextResponse.json({ received: true }, { status: 200 })
    }

    const processor = new WhatsAppProcessor(supabase)
    let anyInbound = false

    for (const msg of parsed.messages) {
      const result = await processor.processInbound(msg, typedChannel.id, typedChannel.property_id)
      if (result.success && !result.isDuplicate) {
        anyInbound = true
        // Best-effort read receipt.
        await markWhatsAppRead(typedChannel.config, typedChannel.credentials, msg.externalId)
      }
    }

    if (anyInbound) {
      await supabase
        .from("messaging_channels")
        .update({ last_inbound_at: new Date().toISOString(), last_error: null })
        .eq("id", typedChannel.id)
    }

    return NextResponse.json({ received: true }, { status: 200 })
  } catch (error) {
    console.error("[WhatsApp webhook] error:", error)
    // Still 200 to avoid Meta retries hammering us; error is logged above where possible.
    return NextResponse.json({ received: true }, { status: 200 })
  }
}
