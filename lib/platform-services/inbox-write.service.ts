import { InboxWriteRepository } from "@/lib/platform-repositories"
import type {
  MarkConversationReadCommand,
  ToggleStarCommand,
  UpdateOutcomeCommand,
  UpdateBookingDataCommand,
  SendMessageCommand,
  UpdateStatusCommand,
} from "@/lib/types/inbox-write.types"
import { ValidationError, NotFoundError } from "@/lib/errors"
import { logCommand } from "@/lib/logging/command-log"
import type { SupabaseClient } from "@supabase/supabase-js"

export class InboxWriteService {
  private repository: InboxWriteRepository

  constructor(supabase: SupabaseClient) {
    this.repository = new InboxWriteRepository(supabase)
  }

  async markAsRead(command: MarkConversationReadCommand, actorId?: string) {
    const conversation = await this.repository.getConversation(command.conversationId, command.propertyId)
    if (!conversation) {
      throw new NotFoundError("Conversation not found")
    }
    await this.repository.markConversationAsRead(command.conversationId, command.propertyId)
    await logCommand({
      command: "markAsRead",
      payload: command,
      actorId,
      propertyId: command.propertyId,
      entityType: "conversation",
      entityId: command.conversationId,
      result: { success: true },
    })
    return { success: true }
  }

  async toggleStar(command: ToggleStarCommand, actorId?: string) {
    const conversation = await this.repository.getConversation(command.conversationId, command.propertyId)
    if (!conversation) {
      throw new NotFoundError("Conversation not found")
    }
    const newStarred = command.isStarred
    await this.repository.toggleStar(command.conversationId, command.propertyId, newStarred)
    await logCommand({
      command: "toggleStar",
      payload: command,
      actorId,
      propertyId: command.propertyId,
      entityType: "conversation",
      entityId: command.conversationId,
      result: { starred: newStarred },
    })
    return { starred: newStarred }
  }

  async updateOutcome(command: UpdateOutcomeCommand, actorId?: string) {
    const conversation = await this.repository.getConversation(command.conversationId, command.propertyId)
    if (!conversation) {
      throw new NotFoundError("Conversation not found")
    }
    if (!["converted", "lost", "pending", "followup"].includes(command.outcome)) {
      throw new ValidationError("Invalid outcome value")
    }
    await logCommand({
      command: "updateOutcome",
      payload: command,
      actorId,
      propertyId: command.propertyId,
      entityType: "conversation",
      entityId: command.conversationId,
      result: { outcome: command.outcome },
    })
    return { outcome: command.outcome }
  }

  async updateBookingData(command: UpdateBookingDataCommand, actorId?: string) {
    const conversation = await this.repository.getConversation(command.conversationId, command.propertyId)
    if (!conversation) {
      throw new NotFoundError("Conversation not found")
    }
    await this.repository.updateBookingData(command.conversationId, command.propertyId, command.bookingData)
    await logCommand({
      command: "updateBookingData",
      payload: command,
      actorId,
      propertyId: command.propertyId,
      entityType: "conversation",
      entityId: command.conversationId,
      result: { bookingData: command.bookingData },
    })
    return { bookingData: command.bookingData }
  }

  async sendMessage(command: SendMessageCommand, actorId?: string) {
    const conversation = await this.repository.getConversation(command.conversationId, command.propertyId)
    if (!conversation) {
      throw new NotFoundError("Conversation not found")
    }
    if (!command.content || command.content.trim() === "") {
      throw new ValidationError("Message content cannot be empty")
    }
    const message = await this.repository.insertMessage(
      command.conversationId,
      command.propertyId,
      command.content,
      "agent",
      actorId || null,
      "text",
      [],
    )
    await this.repository.updateLastMessageAt(command.conversationId, command.propertyId)
    await logCommand({
      command: "sendMessage",
      payload: { ...command, content: "[REDACTED]" },
      actorId,
      propertyId: command.propertyId,
      entityType: "message",
      entityId: message.id,
      result: { messageId: message.id },
    })
    return message
  }

  async updateStatus(command: UpdateStatusCommand, actorId?: string) {
    const conversation = await this.repository.getConversation(command.conversationId, command.propertyId)
    if (!conversation) {
      throw new NotFoundError("Conversation not found")
    }
    if (!["open", "closed", "archived"].includes(command.status)) {
      throw new ValidationError("Invalid status value")
    }
    await this.repository.updateStatus(command.conversationId, command.propertyId, command.status)
    await logCommand({
      command: "updateStatus",
      payload: command,
      actorId,
      propertyId: command.propertyId,
      entityType: "conversation",
      entityId: command.conversationId,
      result: { status: command.status },
    })
    return { status: command.status }
  }
}
