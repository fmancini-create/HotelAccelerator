import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  ConversationListItem,
  ConversationDetail,
  ConversationListOptions,
  MessageItem,
} from "@/lib/types/inbox-read.types"
import { RateLimitError } from "@/lib/errors"

function handleSupabaseError(error: any): never {
  if (error && typeof error === "object") {
    const message = error.message || String(error)
    if (
      message.toLowerCase().includes("too many") ||
      message.toLowerCase().includes("rate limit") ||
      error.code === "429" ||
      error.status === 429
    ) {
      throw new RateLimitError()
    }
  }
  if (typeof error === "string" && error.toLowerCase().includes("too many")) {
    throw new RateLimitError()
  }
  throw error
}

export class InboxReadRepository {
  constructor(private supabase: SupabaseClient) {}

  async listConversations(propertyId: string, options: ConversationListOptions = {}): Promise<ConversationListItem[]> {
    const { status = "open", channel, limit = 50, offset = 0, search, mode = "smart", gmail_label } = options

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
        gmail_thread_id,
        gmail_labels,
        contact:contacts!inner(id, email, name, phone),
        assigned:admin_users(id, name, email)
      `,
      )
      .eq("property_id", propertyId)
      .range(offset, offset + limit - 1)

    if (mode === "gmail") {
      // Gmail Mirror mode: filter by Gmail labels
      query = query.eq("channel", "email")

      if (gmail_label && gmail_label !== "ALL") {
        if (gmail_label === "STARRED") {
          query = query.eq("is_starred", true)
        } else if (gmail_label === "INBOX") {
          // INBOX = has INBOX label or no specific sent/draft/spam/trash status
          query = query.contains("gmail_labels", ["INBOX"])
        } else if (gmail_label === "SENT") {
          query = query.contains("gmail_labels", ["SENT"])
        } else if (gmail_label === "DRAFT") {
          query = query.contains("gmail_labels", ["DRAFT"])
        } else if (gmail_label === "SPAM") {
          query = query.or("status.eq.spam,gmail_labels.cs.{SPAM}")
        } else if (gmail_label === "TRASH") {
          query = query.contains("gmail_labels", ["TRASH"])
        }
      }

      // Gmail mode: order by last_message_at (mirroring Gmail's threading)
      query = query.order("last_message_at", { ascending: false })
    } else {
      // Smart mode: filter by status and prioritize actionable items
      if (status === "starred") {
        query = query.eq("is_starred", true)
      } else if (status !== "all") {
        query = query.eq("status", status)
      }

      // Smart mode: order by priority (unread first, then by date)
      query = query.order("unread_count", { ascending: false })
      query = query.order("last_message_at", { ascending: false })
    }

    if (channel && channel !== "all") {
      query = query.eq("channel", channel)
    }

    if (search) {
      query = query.or(`subject.ilike.%${search}%,contact.name.ilike.%${search}%,contact.email.ilike.%${search}%`)
    }

    const { data, error } = await query

    if (error) handleSupabaseError(error)

    const conversationIds = (data || []).map((c) => c.id)

    if (conversationIds.length === 0) {
      return []
    }

    const { data: lastMessages, error: msgError } = await this.supabase
      .from("messages")
      .select("id, content, sender_type, created_at, conversation_id")
      .in("conversation_id", conversationIds)
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false })

    if (msgError) handleSupabaseError(msgError)

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
      contact: Array.isArray(conv.contact) ? conv.contact[0] : conv.contact,
      assigned: Array.isArray(conv.assigned) ? conv.assigned[0] : conv.assigned,
      last_message: lastMessageMap.get(conv.id) || null,
      intelligence_summary: conv.metadata?.intelligence_summary || null,
      booking_data: conv.booking_data || null,
      gmail_thread_id: conv.gmail_thread_id || null,
      gmail_labels: conv.gmail_labels || null,
    })) as ConversationListItem[]
  }

  async getConversation(propertyId: string, conversationId: string): Promise<ConversationDetail | null> {
    const { data: conversation, error: convError } = await this.supabase
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
        property_id,
        unread_count,
        metadata,
        booking_data,
        gmail_thread_id,
        gmail_labels,
        contact:contacts(id, email, name, phone),
        assigned:admin_users(id, name, email)
      `,
      )
      .eq("id", conversationId)
      .eq("property_id", propertyId)
      .single()

    if (convError) handleSupabaseError(convError)
    if (!conversation) return null

    const { data: messages, error: msgError } = await this.supabase
      .from("messages")
      .select("id, content, sender_type, sender_id, created_at, metadata, gmail_id, received_at, status")
      .eq("conversation_id", conversationId)
      .eq("property_id", propertyId)
      .order("received_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })

    if (msgError) handleSupabaseError(msgError)

    return {
      ...conversation,
      is_starred: conversation.is_starred ?? false,
      contact: Array.isArray(conversation.contact) ? conversation.contact[0] : conversation.contact,
      assigned: Array.isArray(conversation.assigned) ? conversation.assigned[0] : conversation.assigned,
      messages: (messages || []) as MessageItem[],
      priority: "normal",
      gmail_thread_id: conversation.gmail_thread_id || null,
      gmail_labels: conversation.gmail_labels || null,
    } as ConversationDetail
  }

  async countByStatus(propertyId: string): Promise<Record<string, number>> {
    const { data, error } = await this.supabase.from("conversations").select("status").eq("property_id", propertyId)

    if (error) handleSupabaseError(error)

    const counts: Record<string, number> = {}
    data?.forEach((row) => {
      counts[row.status] = (counts[row.status] || 0) + 1
    })

    return counts
  }
}
