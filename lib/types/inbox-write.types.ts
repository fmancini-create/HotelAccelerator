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
  // This command powers the authenticated operator reply endpoint. Incoming
  // contact messages are recorded by channel webhooks, never by this command.
  senderType: "agent"
  // Nessun `senderId` qui: l'autore non si dichiara nel comando (nessun
  // chiamante lo faceva, e permetterlo significherebbe poter firmare una
  // risposta col nome di un collega). Si passa a `sendMessage` come `actorId`,
  // ricavato dalla sessione sul server.
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
