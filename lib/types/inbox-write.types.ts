// Command types for inbox write operations
export interface MarkConversationReadCommand {
  conversationId: string
  propertyId: string
}

export interface ToggleStarCommand {
  conversationId: string
  propertyId: string
  isStarred: boolean
}

export interface UpdateOutcomeCommand {
  conversationId: string
  propertyId: string
  outcome: string
  bookingData?: Record<string, any>
}

export interface UpdateBookingDataCommand {
  conversationId: string
  propertyId: string
  bookingData: Record<string, any>
}

export interface SendMessageCommand {
  conversationId: string
  propertyId: string
  content: string
  senderType: "agent" | "contact"
  senderId?: string
  contentType?: string
  attachments?: string[]
  // Forwarding: when set, the message is sent to this recipient (email address
  // or phone) instead of the conversation's contact, as a fresh message.
  forwardTo?: string
  forwardSubject?: string
}

export interface UpdateStatusCommand {
  conversationId: string
  propertyId: string
  status: "open" | "closed" | "archived"
}
