import type { SupabaseClient } from "@supabase/supabase-js"
import { autoCaptureContact } from "@/lib/crm/auto-capture"

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

export function isUnreadFromGmailLabels(labelIds?: string[]): boolean {
  // Non-Gmail providers may not supply labels; preserve the inbound default.
  return !labelIds || labelIds.includes("UNREAD")
}

export function statusFromGmailLabels(labelIds: string[]): "open" | "resolved" | "spam" | "deleted" {
  if (labelIds.includes("SPAM") || labelIds.includes("CATEGORY_SPAM")) return "spam"
  if (labelIds.includes("TRASH")) return "deleted"
  if (labelIds.includes("INBOX")) return "open"
  return "resolved"
}

type ConversationState = {
  unread_count?: number | null
  last_message_at?: string | null
  status?: string | null
}

export function deriveInboundConversationState(
  conversation: ConversationState,
  receivedAtIso: string,
  isUnread: boolean,
  labelIds?: string[],
): Record<string, unknown> {
  const isLatestMessage =
    !conversation.last_message_at ||
    new Date(receivedAtIso).getTime() >= new Date(conversation.last_message_at).getTime()
  const update: Record<string, unknown> = {
    unread_count: (conversation.unread_count || 0) + (isUnread ? 1 : 0),
    // The DB trigger temporarily writes the insert timestamp. Explicitly
    // restore the provider timestamp so a historical backfill cannot make an
    // old conversation look new.
    last_message_at: isLatestMessage ? receivedAtIso : conversation.last_message_at || receivedAtIso,
  }

  if (!isLatestMessage) return update

  if (labelIds) {
    update.gmail_labels = labelIds
    const desiredStatus = statusFromGmailLabels(labelIds)
    const hasWorkflowStatus =
      Boolean(conversation.status) && !["open", "resolved", "spam", "deleted"].includes(conversation.status || "")
    if (!hasWorkflowStatus || desiredStatus === "spam" || desiredStatus === "deleted") {
      update.status = desiredStatus
    }
  } else if (["resolved", "spam", "deleted"].includes(conversation.status || "")) {
    update.status = "open"
  }

  return update
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
        // Polling is intentionally idempotent and sees the same recent Gmail
        // messages repeatedly. Writing one audit row per duplicate created
        // thousands of useless inserts every few hours and amplified database
        // incidents. Aggregate duplicate counters are emitted by the sync job.
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

      const isUnread = isUnreadFromGmailLabels(email.labelIds)
      const receivedAtIso = email.receivedAt.toISOString()

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
          received_at: receivedAtIso, // TASK 4: Channel timestamp
          stored_at: new Date().toISOString(), // TASK 4: DB timestamp
          status: isUnread ? "received" : "read", // Gmail UNREAD is the source of truth
          in_reply_to: email.inReplyTo,
          email_references: email.references,
          metadata: {
            from: email.from,
            to: email.to,
            subject: email.subject,
            // Preserve Gmail's source-of-truth state so historical data can be
            // reconciled without re-downloading message bodies.
            gmail_labels: email.labelIds || [],
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

      // Historical sync runs newest-first. Never let an older message move the
      // conversation timestamp/state backwards. Unread count still includes
      // every unread message in the thread.
      const conversationUpdate: Record<string, unknown> = {
        ...deriveInboundConversationState(conversation, receivedAtIso, isUnread, email.labelIds),
        updated_at: new Date().toISOString(),
      }

      await this.supabase.from("conversations").update(conversationUpdate).eq("id", conversation.id)

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
      const { data: byThreadCandidates, error: byThreadError } = await this.supabase
        .from("conversations")
        .select("id, unread_count, internal_thread_id, last_message_at, status")
        .eq("property_id", propertyId)
        .eq("gmail_thread_id", email.threadId)
        .order("created_at", { ascending: true })
        .limit(25)

      if (byThreadError) throw byThreadError
      if (byThreadCandidates?.length === 1) return byThreadCandidates[0]

      if (byThreadCandidates && byThreadCandidates.length > 1) {
        // A historical race could create several rows for one Gmail thread
        // before the message-level UNIQUE constraint stopped the losers. Reuse
        // the candidate that already owns messages; otherwise fall back to the
        // oldest row. This contains the legacy ambiguity without deleting data.
        const candidateIds = byThreadCandidates.map((candidate) => candidate.id)
        const { data: linkedConversation, error: linkedConversationError } = await this.supabase
          .from("messages")
          .select("conversation_id")
          .in("conversation_id", candidateIds)
          .order("received_at", { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle()

        if (linkedConversationError) throw linkedConversationError

        return (
          byThreadCandidates.find(
            (candidate) => candidate.id === linkedConversation?.conversation_id,
          ) || byThreadCandidates[0]
        )
      }
    }

    // Try 2: Match by In-Reply-To
    if (email.inReplyTo) {
      const { data: byReplyTo } = await this.supabase
        .from("messages")
        .select("conversation_id, conversations!inner(id, unread_count, internal_thread_id, last_message_at, status)")
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
          .select("conversation_id, conversations!inner(id, unread_count, internal_thread_id, last_message_at, status)")
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
        .select("id, unread_count, internal_thread_id, last_message_at, status")
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
      .select("id, unread_count, internal_thread_id, last_message_at, status")
      .single()

    if (error) throw error
    return newConv
  }

  private async findOrCreateContact(propertyId: string, email: string, name: string) {
    // Delegate to the central CRM auto-capture policy so tenant toggles,
    // blacklists, and tagging are applied consistently across inbound channels.
    // Inbound always guarantees a contact (even a minimal one) because the
    // conversation record requires a valid contact_id for thread-linking.
    const result = await autoCaptureContact({
      supabase: this.supabase,
      propertyId,
      email,
      name,
      direction: "inbound",
    })

    if (result.contactId) {
      return { id: result.contactId }
    }

    // Fallback: the policy layer failed unexpectedly. Insert a minimal
    // contact so the inbound pipeline never drops a conversation.
    const { data: fallback, error } = await this.supabase
      .from("contacts")
      .insert({ property_id: propertyId, email, name, source: "system" })
      .select("id")
      .single()

    if (error) throw error
    return fallback
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
