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
import { sendGmailEmail } from "@/lib/gmail-client"
import type { SupabaseClient } from "@supabase/supabase-js"

export class InboxWriteService {
  private repository: InboxWriteRepository
  private supabase: SupabaseClient

  constructor(supabase: SupabaseClient) {
    this.repository = new InboxWriteRepository(supabase)
    this.supabase = supabase
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

    if (conversation.channel === "email") {
      const emailSendResult = await this.sendEmailViaGmail(conversation, command.content, command.propertyId)
      if (!emailSendResult.success) {
        throw new ValidationError(emailSendResult.error || "Errore invio email")
      }
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

  private async sendEmailViaGmail(
    conversation: any,
    content: string,
    propertyId: string,
  ): Promise<{ success: boolean; error?: string }> {
    // Get the email channel for this property
    const { data: emailChannel, error: channelError } = await this.supabase
      .from("email_channels")
      .select("id, email_address")
      .eq("property_id", propertyId)
      .eq("is_default", true)
      .single()

    if (channelError || !emailChannel) {
      // Try to get any email channel for this property
      const { data: anyChannel } = await this.supabase
        .from("email_channels")
        .select("id, email_address")
        .eq("property_id", propertyId)
        .limit(1)
        .single()

      if (!anyChannel) {
        console.error("[v0] No email channel found for property:", propertyId)
        return { success: false, error: "Nessun canale email configurato" }
      }

      return this.doSendEmail(anyChannel, conversation, content)
    }

    return this.doSendEmail(emailChannel, conversation, content)
  }

  private async doSendEmail(
    emailChannel: { id: string; email_address: string },
    conversation: any,
    content: string,
  ): Promise<{ success: boolean; error?: string }> {
    // Get recipient email from conversation metadata or contact
    let recipientEmail = conversation.contact_email

    if (!recipientEmail && conversation.metadata?.email) {
      recipientEmail = conversation.metadata.email
    }

    if (!recipientEmail && conversation.metadata?.from) {
      recipientEmail = conversation.metadata.from
    }

    if (!recipientEmail) {
      // Try to get from contacts table
      const { data: contact } = await this.supabase
        .from("contacts")
        .select("email")
        .eq("id", conversation.contact_id)
        .single()

      recipientEmail = contact?.email
    }

    if (!recipientEmail) {
      console.error("[v0] No recipient email found for conversation:", conversation.id)
      return { success: false, error: "Email destinatario non trovata" }
    }

    // Build subject - use Re: prefix for replies
    const subject = conversation.subject?.startsWith("Re:")
      ? conversation.subject
      : `Re: ${conversation.subject || "Senza oggetto"}`

    // Convert plain text to simple HTML
    const htmlContent = `<div style="font-family: Arial, sans-serif;">${content.replace(/\n/g, "<br>")}</div>`

    // Get thread info for proper Gmail threading
    const threadId = conversation.metadata?.gmail_thread_id
    const replyToMessageId = conversation.metadata?.gmail_message_id

    console.log("[v0] Sending email via Gmail:", {
      channelId: emailChannel.id,
      to: recipientEmail,
      subject,
      threadId,
      replyToMessageId,
    })

    const result = await sendGmailEmail(
      emailChannel.id,
      recipientEmail,
      subject,
      htmlContent,
      replyToMessageId,
      threadId,
    )

    return result
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
