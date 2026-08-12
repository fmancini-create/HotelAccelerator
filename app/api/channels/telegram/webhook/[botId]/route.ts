import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getTelegramChannelById, parseTelegramUpdate } from "@/lib/telegram/channels"
import { TelegramProcessor } from "@/lib/telegram/processor"
import { sendTelegramText } from "@/lib/telegram/client"
import { computeAutopilotReply, requestManubotReply } from "@/lib/telegram/commands"
import type { TelegramChannelRow } from "@/lib/telegram/types"

// Webhook is called by Telegram servers, not the browser. Authenticity is
// proven by the per-channel secret token echoed in the
// X-Telegram-Bot-Api-Secret-Token header. Node runtime for consistency.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST: inbound updates from Telegram for a specific tenant bot.
 *
 * Routing is multitenant via the [botId] path segment (= messaging_channels.id).
 * We look up the channel, verify the secret token header, then process the
 * message idempotently. Autopilot (if enabled) sends a rule-based reply.
 *
 * Always returns 200 quickly so Telegram does not retry/disable the webhook.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ botId: string }> }) {
  const { botId } = await params
  const presentedSecret = request.headers.get("x-telegram-bot-api-secret-token")

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: true }, { status: 200 })
  }

  const supabase = createServiceClient()

  try {
    const channel = await getTelegramChannelById(supabase, botId)
    if (!channel) {
      // Unknown/inactive bot id -> not one of our tenants.
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    const typedChannel = channel as TelegramChannelRow
    const expectedSecret = typedChannel.credentials?.webhook_secret

    // Verify the secret token. If a secret is configured it MUST match.
    if (expectedSecret && presentedSecret !== expectedSecret) {
      await supabase.from("message_processing_logs").insert({
        property_id: typedChannel.property_id,
        channel: "telegram",
        event_type: "signature_invalid",
        event_data: { bot_id: botId },
      })
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    const parsed = parseTelegramUpdate(body)
    if (parsed.messages.length === 0) {
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    const processor = new TelegramProcessor(supabase)
    let anyInbound = false

    for (const msg of parsed.messages) {
      const result = await processor.processInbound(msg, typedChannel.id, typedChannel.property_id)
      if (result.success && !result.isDuplicate) {
        anyInbound = true

        // Autopilot: rule-based reply (commands) + future ManuBot brain seam.
        if (typedChannel.config?.autopilot_enabled && result.conversationId && result.contactId) {
          await maybeAutopilotReply(supabase, typedChannel, msg.chatId, msg.body, {
            conversationId: result.conversationId,
            contactId: result.contactId,
          })
        }
      }
    }

    if (anyInbound) {
      await supabase
        .from("messaging_channels")
        .update({ last_inbound_at: new Date().toISOString(), last_error: null })
        .eq("id", typedChannel.id)
    }

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    console.error("[Telegram webhook] error:", error)
    return NextResponse.json({ ok: true }, { status: 200 })
  }
}

/**
 * Compute an autopilot reply, send it via Telegram, and store it as an agent
 * message so it shows up in the operator inbox thread. Best-effort: reply
 * failures never break the inbound pipeline.
 */
async function maybeAutopilotReply(
  supabase: ReturnType<typeof createServiceClient>,
  channel: TelegramChannelRow,
  chatId: string,
  inboundText: string,
  ctx: { conversationId: string; contactId: string },
) {
  try {
    // 1) Deterministic rules (slash commands / welcome).
    const decision = computeAutopilotReply(inboundText, channel)
    let replyText = decision.reply

    // 2) Future: ManuBot conversational brain for non-command messages.
    if (!replyText) {
      replyText = await requestManubotReply({
        propertyId: channel.property_id,
        channel,
        conversationId: ctx.conversationId,
        contactId: ctx.contactId,
        text: inboundText,
      })
    }

    if (!replyText) return // stay silent -> operator handles it in the inbox

    const sent = await sendTelegramText(channel.credentials, chatId, replyText)
    if (!sent.success) {
      await supabase
        .from("messaging_channels")
        .update({ last_error: sent.error ?? "Errore invio autopilot" })
        .eq("id", channel.id)
      return
    }

    // Store the outbound autopilot reply in the conversation thread.
    await supabase.from("messages").insert({
      property_id: channel.property_id,
      conversation_id: ctx.conversationId,
      sender_type: "agent",
      content: replyText,
      content_type: "text",
      external_message_id: sent.externalMessageId ? `tg-out:${chatId}:${sent.externalMessageId}` : null,
      received_at: new Date().toISOString(),
      stored_at: new Date().toISOString(),
      status: "sent",
      metadata: { channel: "telegram", chat_id: chatId, autopilot: true, reason: decision.reason },
    })

    await supabase
      .from("messaging_channels")
      .update({ last_outbound_at: new Date().toISOString(), last_error: null })
      .eq("id", channel.id)

    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", ctx.conversationId)
  } catch (e) {
    console.error("[Telegram autopilot] error:", e)
  }
}
