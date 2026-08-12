import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Normalized inbound Telegram message extracted from a webhook update.
 */
export interface InboundTelegramMessage {
  externalId: string // `tg:<chatId>:<messageId>` — idempotency key
  chatId: string // Telegram chat id (also the reply target)
  fromName: string // display name (first+last / username / title)
  username?: string // @username, if present
  languageCode?: string // e.g. "it", "en"
  body: string // text body (or a placeholder for non-text)
  messageType: string // text | image | audio | document | ...
  timestamp: Date
  raw?: unknown
}

export interface ProcessingResult {
  success: boolean
  messageId?: string
  conversationId?: string
  contactId?: string
  error?: string
  isDuplicate?: boolean
}

/**
 * Centralized Telegram inbound processor. Mirrors WhatsAppProcessor:
 *  - Idempotency via messages.external_message_id (unique partial index)
 *  - Contact auto-capture keyed by telegram_id (Telegram has no phone/email)
 *  - One open conversation per (property, channel='telegram', contact)
 *  - Processing logs in message_processing_logs
 */
export class TelegramProcessor {
  constructor(private supabase: SupabaseClient) {}

  async processInbound(
    msg: InboundTelegramMessage,
    channelId: string,
    propertyId: string,
  ): Promise<ProcessingResult> {
    const startTime = Date.now()
    try {
      // Idempotency: ignore messages we've already stored.
      const { data: existing } = await this.supabase
        .from("messages")
        .select("id, conversation_id")
        .eq("external_message_id", msg.externalId)
        .maybeSingle()

      if (existing) {
        await this.logEvent(propertyId, msg.externalId, "duplicate_ignored", {
          existing_message_id: existing.id,
        })
        return {
          success: true,
          isDuplicate: true,
          messageId: existing.id,
          conversationId: existing.conversation_id,
        }
      }

      const contact = await this.findOrCreateContact(propertyId, msg.chatId, msg.fromName, msg.languageCode)
      const conversation = await this.findOrCreateConversation(
        propertyId,
        channelId,
        contact.id,
        msg.chatId,
        msg.fromName,
      )

      const { data: message, error: msgError } = await this.supabase
        .from("messages")
        .insert({
          property_id: propertyId,
          conversation_id: conversation.id,
          sender_type: "customer",
          sender_id: contact.id,
          content: msg.body,
          content_type: "text",
          external_message_id: msg.externalId,
          received_at: msg.timestamp.toISOString(),
          stored_at: new Date().toISOString(),
          status: "received",
          metadata: {
            channel: "telegram",
            chat_id: msg.chatId,
            from_name: msg.fromName,
            username: msg.username,
            tg_message_type: msg.messageType,
          },
        })
        .select("id")
        .single()

      if (msgError) {
        if (msgError.code === "23505") {
          await this.logEvent(propertyId, msg.externalId, "duplicate_ignored", {
            error: "UNIQUE constraint violation",
          })
          return { success: true, isDuplicate: true }
        }
        throw msgError
      }

      await this.supabase
        .from("conversations")
        .update({
          last_message_at: msg.timestamp.toISOString(),
          unread_count: (conversation.unread_count ?? 0) + 1,
          status: "open",
          updated_at: new Date().toISOString(),
        })
        .eq("id", conversation.id)

      await this.logEvent(propertyId, msg.externalId, "processed", {
        message_id: message.id,
        conversation_id: conversation.id,
        processing_time_ms: Date.now() - startTime,
      })

      return {
        success: true,
        messageId: message.id,
        conversationId: conversation.id,
        contactId: contact.id,
      }
    } catch (error) {
      const errMsg =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null
            ? JSON.stringify(error)
            : String(error)
      console.error("[v0] Telegram processor error:", errMsg)
      await this.logEvent(propertyId, msg.externalId, "error", { error: errMsg })
      return { success: false, error: errMsg }
    }
  }

  /**
   * Find-or-create a contact keyed by telegram_id (chat id). Existing contacts
   * are never mutated (consistent with WhatsApp/email auto-capture policy).
   */
  private async findOrCreateContact(
    propertyId: string,
    chatId: string,
    name: string,
    languageCode?: string,
  ) {
    const { data: byTg } = await this.supabase
      .from("contacts")
      .select("id")
      .eq("property_id", propertyId)
      .eq("telegram_id", chatId)
      .maybeSingle()
    if (byTg) return byTg

    const { data: created, error } = await this.supabase
      .from("contacts")
      .insert({
        property_id: propertyId,
        name,
        telegram_id: chatId,
        language: languageCode || null,
        source: "telegram",
        source_id: chatId,
      })
      .select("id")
      .single()

    if (error) {
      // Race: another concurrent inbound created it first.
      if (error.code === "23505") {
        const { data: again } = await this.supabase
          .from("contacts")
          .select("id")
          .eq("property_id", propertyId)
          .eq("telegram_id", chatId)
          .maybeSingle()
        if (again) return again
      }
      throw error
    }
    return created
  }

  /**
   * One conversation per (property, channel='telegram', contact). Reuse the
   * most recent one; create a new one only if none exists.
   */
  private async findOrCreateConversation(
    propertyId: string,
    channelId: string,
    contactId: string,
    chatId: string,
    name: string,
  ) {
    const { data: existing } = await this.supabase
      .from("conversations")
      .select("id, unread_count")
      .eq("property_id", propertyId)
      .eq("channel", "telegram")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existing) return existing

    const { data: newConv, error } = await this.supabase
      .from("conversations")
      .insert({
        property_id: propertyId,
        contact_id: contactId,
        // conversations.channel_id has a FK to email_channels, so it must stay
        // NULL for Telegram. The messaging_channels id lives in metadata.
        channel: "telegram",
        subject: `Telegram · ${name}`,
        status: "open",
        unread_count: 0,
        last_message_at: new Date().toISOString(),
        metadata: { channel: "telegram", chat_id: chatId, messaging_channel_id: channelId },
      })
      .select("id, unread_count")
      .single()

    if (error) throw error
    return newConv
  }

  private async logEvent(
    propertyId: string,
    externalMessageId: string | undefined,
    eventType: string,
    eventData: unknown,
  ) {
    try {
      await this.supabase.from("message_processing_logs").insert({
        property_id: propertyId,
        external_message_id: externalMessageId,
        channel: "telegram",
        event_type: eventType,
        event_data: eventData,
      })
    } catch (e) {
      console.error("[TelegramProcessor] Failed to log event:", e)
    }
  }
}
