/**
 * INBOX READ REPOSITORY
 * Data access layer - Supabase queries ONLY, zero business logic
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  ConversationListItem,
  ConversationDetail,
  ConversationListOptions,
  MessageItem,
} from "@/lib/types/inbox-read.types"

export class InboxReadRepository {
  constructor(private supabase: SupabaseClient) {}

  /**
   * List conversations with optimized selects
   * No business logic - just data fetching
   */
  async listConversations(propertyId: string, options: ConversationListOptions = {}): Promise<ConversationListItem[]> {
    const { status = "open", channel, limit = 50, offset = 0, search, ids } = options

    let query = this.supabase
      .from("conversations")
      .select(
        `
        id,
        subject,
        status,
        channel,
        is_starred,
        last_message_at,
        created_at,
        unread_count,
        booking_data,
        metadata,
        contact_email,
        contact_name,
        contact:contacts(id, email, name, phone),
        assigned:admin_users(id, name, email)
      `,
      )
      .eq("property_id", propertyId)
      .order("last_message_at", { ascending: false })
      .range(offset, offset + limit - 1)

    // Richiesta di conversazioni precise (vista "Bozze": si apre un messaggio
    // che puo' essere fuori dalla pagina caricata, e anche in uno stato diverso
    // da quello selezionato). Lo stato non va applicato, o una bozza su una
    // conversazione risolta resterebbe irraggiungibile: e' l'id che comanda.
    // Il filtro per struttura resta sopra, quindi l'isolamento non cambia.
    if (ids && ids.length > 0) {
      query = query.in("id", ids)
    } else if (status !== "all") {
      query = query.eq("status", status)
    }

    if (channel && channel !== "all") {
      query = query.eq("channel", channel)
    }

    if (search) {
      // Match the sender on the conversation's own columns: an OR on the
      // embedded contact would silently require an inner join and hide every
      // conversation without a CRM contact.
      const term = search.replace(/[,()"]/g, " ").trim()
      query = query.or(`subject.ilike.%${term}%,contact_email.ilike.%${term}%,contact_name.ilike.%${term}%`)
    }

    const { data, error } = await query

    if (error) throw error

    // Get last message for each conversation in a single query
    const conversationIds = (data || []).map((c) => c.id)
    const { data: lastMessages } = await this.supabase
      .from("messages")
      .select("id, content, sender_type, created_at, conversation_id")
      .in("conversation_id", conversationIds)
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false })

    // Map last message to each conversation
    const lastMessageMap = new Map()
    lastMessages?.forEach((msg) => {
      if (!lastMessageMap.has(msg.conversation_id)) {
        lastMessageMap.set(msg.conversation_id, {
          id: msg.id,
          content: msg.content,
          sender_type: msg.sender_type,
          created_at: msg.created_at,
        })
      }
    })

    return (data || []).map((conv) => ({
      ...conv,
      is_starred: conv.is_starred ?? false,
      contact:
        (Array.isArray(conv.contact) ? conv.contact[0] : conv.contact) ??
        (conv.contact_email || conv.contact_name
          ? { id: null, email: conv.contact_email ?? null, name: conv.contact_name ?? conv.contact_email, phone: null }
          : null),
      assigned: Array.isArray(conv.assigned) ? conv.assigned[0] : conv.assigned,
      last_message: lastMessageMap.get(conv.id) || null,
      intelligence_summary: conv.metadata?.intelligence_summary || null,
      booking_data: conv.booking_data || null,
    })) as ConversationListItem[]
  }

  /**
   * Get single conversation with all messages
   * No business logic - just data fetching
   */
  async getConversation(propertyId: string, conversationId: string): Promise<ConversationDetail | null> {
    const { data: conversation, error: convError } = await this.supabase
      .from("conversations")
      .select(
        `
        id,
        subject,
        status,
        channel,
        priority,
        is_starred,
        last_message_at,
        created_at,
        property_id,
        unread_count,
        metadata,
        booking_data,
        contact:contacts(id, email, name, phone),
        assigned:admin_users(id, name, email)
      `,
      )
      .eq("id", conversationId)
      .eq("property_id", propertyId)
      .single()

    if (convError) throw convError
    if (!conversation) return null

    // Get all messages
    const { data: messages, error: msgError } = await this.supabase
      .from("messages")
      .select("id, content, sender_type, sender_id, created_at, metadata")
      .eq("conversation_id", conversationId)
      .eq("property_id", propertyId)
      .order("created_at", { ascending: true })

    if (msgError) throw msgError

    return {
      ...conversation,
      is_starred: conversation.is_starred ?? false,
      contact: Array.isArray(conversation.contact) ? conversation.contact[0] : conversation.contact,
      assigned: Array.isArray(conversation.assigned) ? conversation.assigned[0] : conversation.assigned,
      messages: (messages || []) as MessageItem[],
      priority: conversation.priority || "normal",
    } as ConversationDetail
  }

  /**
   * Count conversations by status
   */
  async countByStatus(propertyId: string): Promise<Record<string, number>> {
    const { data, error } = await this.supabase.from("conversations").select("status").eq("property_id", propertyId)

    if (error) throw error

    const counts: Record<string, number> = {}
    data?.forEach((row) => {
      counts[row.status] = (counts[row.status] || 0) + 1
    })

    return counts
  }
}
