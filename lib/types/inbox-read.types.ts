/**
 * READ MODELS for Inbox domain
 * These types represent optimized data structures for UI consumption
 */

// Base types
export interface ConversationContact {
  id: string
  email: string
  name: string | null
  phone: string | null
}

export interface ConversationAssignee {
  id: string
  name: string
  email: string
}

export interface MessageSummary {
  id: string
  content: string
  sender_type: "customer" | "agent" | "staff" | "system"
  created_at: string
}

export interface IntelligenceSummary {
  state?: string
  intent?: string
  sentiment?: "positive" | "negative" | "neutral"
  dates_status?: {
    check_in?: string
    check_out?: string
    days?: number
  }
  guests_status?: {
    adults?: number
    children?: number
  }
  next_action?: {
    action: string
    priority: "high" | "medium" | "low"
    reason?: string
  }
}

// List item - minimal data for conversation list
export interface ConversationListItem {
  id: string
  subject: string | null
  status: string
  channel: string
  is_starred: boolean
  last_message_at: string
  created_at: string
  unread_count: number

  // Related entities - minimal fields
  contact: ConversationContact | null
  assigned: ConversationAssignee | null

  // Last message preview
  last_message: MessageSummary | null

  // Intelligence summary (optional, pre-aggregated)
  intelligence_summary: IntelligenceSummary | null

  // Booking data (optional)
  booking_data: {
    check_in?: string
    check_out?: string
    guests_adults?: number
    outcome?: string
  } | null

  gmail_thread_id?: string | null
  gmail_labels?: string[] | null
}

// Detail item - full data for selected conversation
export interface MessageItem {
  id: string
  content: string
  sender_type: "customer" | "agent" | "staff" | "system"
  sender_id: string | null
  created_at: string
  metadata: Record<string, unknown>
  gmail_id?: string | null
  gmail_internal_date?: string | null
  received_at?: string | null
  status?: "received" | "read" | "replied"
}

export interface ConversationDetail {
  id: string
  subject: string | null
  status: string
  channel: string
  is_starred: boolean
  priority: string
  last_message_at: string
  created_at: string
  property_id: string
  unread_count: number

  // Related entities - full data
  contact: ConversationContact | null
  assigned: ConversationAssignee | null

  // All messages
  messages: MessageItem[]

  // Metadata
  metadata: {
    intelligence_summary?: IntelligenceSummary
  } | null

  // Booking data
  booking_data: {
    check_in?: string
    check_out?: string
    guests_adults?: number
    guests_children?: number
    room_type?: string
    room_notes?: string
    quote_amount?: number
    quote_sent_at?: string
    outcome?: "pending" | "confirmed" | "cancelled" | "no_response"
    outcome_notes?: string
  } | null

  gmail_thread_id?: string | null
  gmail_labels?: string[] | null
}

export type GmailLabel = "INBOX" | "SENT" | "DRAFT" | "SPAM" | "TRASH" | "STARRED" | "ALL"

// Query options
export interface ConversationListOptions {
  status?: "open" | "closed" | "archived" | "all"
  channel?: "email" | "chat" | "whatsapp" | "telegram" | "all"
  limit?: number
  offset?: number
  search?: string
  filter?: "all" | "action_needed" | "high_priority"
  mode?: "smart" | "gmail"
  gmail_label?: GmailLabel
}
