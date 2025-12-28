import type { SupabaseClient } from "@supabase/supabase-js"

export class InboxWriteRepository {
  constructor(private supabase: SupabaseClient) {}

  async markConversationAsRead(conversationId: string, propertyId: string) {
    const { data, error } = await this.supabase
      .from("conversations")
      .update({
        unread_count: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId)
      .eq("property_id", propertyId)
      .select()
      .single()
    if (error) throw error
    return data
  }

  async toggleStar(conversationId: string, propertyId: string, isStarred: boolean) {
    const { data, error } = await this.supabase
      .from("conversations")
      .update({
        is_starred: isStarred,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId)
      .eq("property_id", propertyId)
      .select()
      .single()
    if (error) throw error
    return { id: data.id, is_starred: data.is_starred }
  }

  async updateStatus(conversationId: string, propertyId: string, status: string) {
    const { data, error } = await this.supabase
      .from("conversations")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId)
      .eq("property_id", propertyId)
      .select()
      .single()
    if (error) throw error
    return data
  }

  async updateBookingData(conversationId: string, propertyId: string, bookingData: Record<string, unknown>) {
    const { data, error } = await this.supabase
      .from("conversations")
      .update({
        booking_data: bookingData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId)
      .eq("property_id", propertyId)
      .select()
      .single()
    if (error) throw error
    return data
  }

  async insertMessage(
    conversationId: string,
    propertyId: string,
    content: string,
    senderType: string,
    senderId: string | null,
    contentType: string,
    attachments: string[],
  ) {
    const { data, error } = await this.supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        property_id: propertyId,
        content,
        sender_type: senderType,
        sender_id: senderId,
        content_type: contentType,
        attachments,
      })
      .select()
      .single()
    if (error) throw error
    return data
  }

  async updateLastMessageAt(conversationId: string, propertyId: string) {
    const { error } = await this.supabase
      .from("conversations")
      .update({
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId)
      .eq("property_id", propertyId)
    if (error) throw error
  }

  async getConversation(conversationId: string, propertyId: string) {
    const { data, error } = await this.supabase
      .from("conversations")
      .select("*")
      .eq("id", conversationId)
      .eq("property_id", propertyId)
      .single()
    if (error) throw error
    return data
  }

  async markMessagesAsReplied(conversationId: string, propertyId: string) {
    const { data, error } = await this.supabase
      .from("messages")
      .update({ status: "replied" })
      .eq("conversation_id", conversationId)
      .eq("property_id", propertyId)
      .eq("sender_type", "customer")
      .in("status", ["received", "read"])
      .select("id")
    if (error) throw error
    return data
  }
}
