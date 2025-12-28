import type { SupabaseClient } from "@supabase/supabase-js"

export interface InboundEmail {
  externalId: string // Gmail messageId or other provider ID
  threadId?: string // Gmail threadId
  from: string
  fromName?: string
  to: string
  subject: string
  body: string
  contentType: "text" | "html"
  receivedAt: Date
  inReplyTo?: string
  references?: string
  labelIds?: string[]
}

export interface ProcessingResult {
  success: boolean
  messageId?: string
  conversationId?: string
  error?: string
  isDuplicate?: boolean
}

/**
 * Centralized email processor that handles:
 * - Idempotency via external_message_id UNIQUE constraint
 * - Internal threading independent from Gmail
 * - Proper temporal ordering with received_at
 * - Explicit message status
 * - Processing logs for debugging
 */
export class EmailProcessor {
  constructor(private supabase: SupabaseClient) {}

  async processInboundEmail(email: InboundEmail, channelId: string, propertyId: string): Promise<ProcessingResult> {
    const startTime = Date.now()

    try {
      // TASK 2: Idempotency check - if message exists, ignore
      const { data: existing } = await this.supabase
        .from("messages")
        .select("id, conversation_id")
        .eq("external_message_id", email.externalId)
        .maybeSingle()

      if (existing) {
        await this.logEvent(propertyId, email.externalId, "email", "duplicate_ignored", {
          existing_message_id: existing.id,
          existing_conversation_id: existing.conversation_id,
        })
        return {
          success: true,
          isDuplicate: true,
          messageId: existing.id,
          conversationId: existing.conversation_id,
        }
      }

      // Extract sender info
      const senderEmail = this.extractEmail(email.from)
      const senderName = email.fromName || this.extractName(email.from) || senderEmail.split("@")[0]

      // Find or create contact
      const contact = await this.findOrCreateContact(propertyId, senderEmail, senderName)

      // TASK 3: Internal threading - find or create conversation
      const conversation = await this.findOrCreateConversation(propertyId, channelId, contact.id, email)

      // TASK 1 & 4 & 5: Insert message with all required fields
      const { data: message, error: msgError } = await this.supabase
        .from("messages")
        .insert({
          property_id: propertyId,
          conversation_id: conversation.id,
          sender_type: "customer",
          sender_id: contact.id,
          content: email.body,
          content_type: email.contentType,
          external_message_id: email.externalId, // TASK 1: Unique identifier
          gmail_id: email.externalId, // Backwards compatibility
          received_at: email.receivedAt.toISOString(), // TASK 4: Channel timestamp
          stored_at: new Date().toISOString(), // TASK 4: DB timestamp
          status: "received", // TASK 5: Explicit status
          in_reply_to: email.inReplyTo,
          email_references: email.references,
          metadata: {
            from: email.from,
            to: email.to,
            subject: email.subject,
          },
        })
        .select("id")
        .single()

      if (msgError) {
        // Check if it's a duplicate constraint violation
        if (msgError.code === "23505") {
          await this.logEvent(propertyId, email.externalId, "email", "duplicate_ignored", {
            error: "UNIQUE constraint violation",
          })
          return { success: true, isDuplicate: true }
        }
        throw msgError
      }

      // Update conversation
      await this.supabase
        .from("conversations")
        .update({
          last_message_at: email.receivedAt.toISOString(),
          unread_count: conversation.unread_count + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", conversation.id)

      // TASK 7: Log success
      await this.logEvent(propertyId, email.externalId, "email", "processed", {
        message_id: message.id,
        conversation_id: conversation.id,
        processing_time_ms: Date.now() - startTime,
      })

      return {
        success: true,
        messageId: message.id,
        conversationId: conversation.id,
      }
    } catch (error) {
      // TASK 7: Log error
      await this.logEvent(propertyId, email.externalId, "email", "error", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * TASK 3: Internal threading logic
   * Priority:
   * 1. Gmail threadId match
   * 2. In-Reply-To header match
   * 3. References header match
   * 4. Normalized subject + contact match
   */
  private async findOrCreateConversation(
    propertyId: string,
    channelId: string,
    contactId: string,
    email: InboundEmail,
  ) {
    // Try 1: Match by Gmail threadId
    if (email.threadId) {
      const { data: byThread } = await this.supabase
        .from("conversations")
        .select("id, unread_count, internal_thread_id")
        .eq("property_id", propertyId)
        .eq("gmail_thread_id", email.threadId)
        .maybeSingle()

      if (byThread) return byThread
    }

    // Try 2: Match by In-Reply-To
    if (email.inReplyTo) {
      const { data: byReplyTo } = await this.supabase
        .from("messages")
        .select("conversation_id, conversations!inner(id, unread_count, internal_thread_id)")
        .eq("external_message_id", email.inReplyTo)
        .eq("property_id", propertyId)
        .maybeSingle()

      if (byReplyTo?.conversations) {
        return byReplyTo.conversations as any
      }
    }

    // Try 3: Match by References
    if (email.references) {
      const refIds = email.references.split(/\s+/).filter(Boolean)
      for (const refId of refIds.slice(-3)) {
        // Check last 3 references
        const { data: byRef } = await this.supabase
          .from("messages")
          .select("conversation_id, conversations!inner(id, unread_count, internal_thread_id)")
          .eq("external_message_id", refId)
          .eq("property_id", propertyId)
          .maybeSingle()

        if (byRef?.conversations) {
          return byRef.conversations as any
        }
      }
    }

    // Try 4: Match by normalized subject + contact (fallback)
    const normalizedSubject = this.normalizeSubject(email.subject)
    if (normalizedSubject) {
      const { data: bySubject } = await this.supabase
        .from("conversations")
        .select("id, unread_count, internal_thread_id")
        .eq("property_id", propertyId)
        .eq("contact_id", contactId)
        .eq("normalized_subject", normalizedSubject)
        .eq("channel", "email")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (bySubject) return bySubject
    }

    // Create new conversation
    const { data: newConv, error } = await this.supabase
      .from("conversations")
      .insert({
        property_id: propertyId,
        contact_id: contactId,
        channel_id: channelId,
        channel: "email",
        subject: email.subject || "(Nessun oggetto)",
        normalized_subject: normalizedSubject,
        status: "open",
        gmail_thread_id: email.threadId,
        gmail_message_id: email.externalId,
        unread_count: 0,
        last_message_at: email.receivedAt.toISOString(),
      })
      .select("id, unread_count, internal_thread_id")
      .single()

    if (error) throw error
    return newConv
  }

  private async findOrCreateContact(propertyId: string, email: string, name: string) {
    const { data: existing } = await this.supabase
      .from("contacts")
      .select("id")
      .eq("property_id", propertyId)
      .eq("email", email)
      .maybeSingle()

    if (existing) return existing

    const { data: newContact, error } = await this.supabase
      .from("contacts")
      .insert({
        property_id: propertyId,
        email,
        name,
      })
      .select("id")
      .single()

    if (error) throw error
    return newContact
  }

  private normalizeSubject(subject: string): string | null {
    if (!subject) return null
    // Remove Re:, Fwd:, R:, I:, etc. prefixes
    return (
      subject
        .replace(/^(re|fwd|fw|r|i|sv|vs|aw|antw|odp|enc):\s*/gi, "")
        .trim()
        .toLowerCase()
        .slice(0, 500) || null
    )
  }

  private extractEmail(from: string): string {
    const match = from.match(/<(.+)>/)
    return match ? match[1] : from.trim()
  }

  private extractName(from: string): string {
    return from.split("<")[0].trim().replace(/"/g, "")
  }

  private async logEvent(
    propertyId: string,
    externalMessageId: string | undefined,
    channel: string,
    eventType: string,
    eventData: any,
    errorMessage?: string,
  ) {
    try {
      await this.supabase.from("message_processing_logs").insert({
        property_id: propertyId,
        external_message_id: externalMessageId,
        channel,
        event_type: eventType,
        event_data: eventData,
        error_message: errorMessage,
      })
    } catch (e) {
      console.error("[EmailProcessor] Failed to log event:", e)
    }
  }

  /**
   * Update message status
   */
  async updateMessageStatus(messageId: string, status: "received" | "read" | "replied") {
    const updates: any = { status, updated_at: new Date().toISOString() }

    if (status === "read") {
      updates.read_at = new Date().toISOString()
    }

    await this.supabase.from("messages").update(updates).eq("id", messageId)
  }
}
