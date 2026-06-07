import type { SupabaseClient } from "@supabase/supabase-js"
import { normalizeWhatsAppNumber } from "./client"

/**
 * Normalized inbound WhatsApp message extracted from the Meta webhook payload.
 */
export interface InboundWhatsAppMessage {
  externalId: string // WhatsApp message id (wamid....) — idempotency key
  fromPhone: string // sender phone (digits only)
  fromName?: string // WhatsApp profile name, if present
  body: string // text body (or a placeholder for non-text)
  messageType: string // text | image | audio | document | ...
  timestamp: Date
  raw?: unknown // original message object for metadata/debugging
}

export interface ProcessingResult {
  success: boolean
  messageId?: string
  conversationId?: string
  error?: string
  isDuplicate?: boolean
}

/**
 * Centralized WhatsApp inbound processor. Mirrors EmailProcessor:
 *  - Idempotency via messages.external_message_id (unique partial index)
 *  - Contact auto-capture keyed by phone / whatsapp_id (WhatsApp has no email)
 *  - One open conversation per (property, channel='whatsapp', contact)
 *  - Processing logs in message_processing_logs
 */
export class WhatsAppProcessor {
  constructor(private supabase: SupabaseClient) {}

  async processInbound(
    msg: InboundWhatsAppMessage,
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

      const phone = normalizeWhatsAppNumber(msg.fromPhone)
      const name = msg.fromName?.trim() || `+${phone}`

      const contact = await this.findOrCreateContact(propertyId, phone, name)
      const conversation = await this.findOrCreateConversation(propertyId, channelId, contact.id, phone, name)

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
            channel: "whatsapp",
            from_phone: phone,
            from_name: msg.fromName,
            wa_message_type: msg.messageType,
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

      return { success: true, messageId: message.id, conversationId: conversation.id }
    } catch (error) {
      const errMsg =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null
            ? JSON.stringify(error)
            : String(error)
      console.error("[v0] WhatsApp processor error:", errMsg)
      await this.logEvent(propertyId, msg.externalId, "error", { error: errMsg })
      return { success: false, error: errMsg }
    }
  }

  /**
   * Find-or-create a contact keyed by phone. WhatsApp contacts have no email,
   * so we match on whatsapp_id first, then phone. Existing contacts are never
   * mutated (consistent with the email auto-capture immutability policy).
   */
  private async findOrCreateContact(propertyId: string, phone: string, name: string) {
    const { data: byWa } = await this.supabase
      .from("contacts")
      .select("id")
      .eq("property_id", propertyId)
      .eq("whatsapp_id", phone)
      .maybeSingle()
    if (byWa) return byWa

    const { data: byPhone } = await this.supabase
      .from("contacts")
      .select("id")
      .eq("property_id", propertyId)
      .eq("phone", phone)
      .maybeSingle()
    if (byPhone) return byPhone

    const { data: created, error } = await this.supabase
      .from("contacts")
      .insert({
        property_id: propertyId,
        name,
        phone,
        whatsapp_id: phone,
        source: "whatsapp",
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
          .eq("whatsapp_id", phone)
          .maybeSingle()
        if (again) return again
      }
      throw error
    }
    return created
  }

  /**
   * One conversation per (property, channel='whatsapp', contact). Reuse the
   * most recent one; create a new one only if none exists.
   */
  private async findOrCreateConversation(
    propertyId: string,
    channelId: string,
    contactId: string,
    phone: string,
    name: string,
  ) {
    const { data: existing } = await this.supabase
      .from("conversations")
      .select("id, unread_count")
      .eq("property_id", propertyId)
      .eq("channel", "whatsapp")
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
        // NOTE: conversations.channel_id has a FK to email_channels, so it must
        // stay NULL for WhatsApp. The messaging_channels id is kept in metadata.
        channel: "whatsapp",
        subject: `WhatsApp · ${name}`,
        status: "open",
        unread_count: 0,
        last_message_at: new Date().toISOString(),
        metadata: { channel: "whatsapp", phone, messaging_channel_id: channelId },
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
        channel: "whatsapp",
        event_type: eventType,
        event_data: eventData,
      })
    } catch (e) {
      console.error("[WhatsAppProcessor] Failed to log event:", e)
    }
  }
}
