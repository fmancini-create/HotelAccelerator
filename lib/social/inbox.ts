import { createServiceClient } from "@/lib/supabase/server"
import type { SocialChannelType, SocialProvider } from "@/lib/social/providers"

export interface SocialInboxEvent {
  provider: SocialProvider
  channel: SocialChannelType
  externalAccountId: string
  externalThreadId: string
  externalMessageId: string
  eventType: "direct_message" | "comment" | "mention" | "reaction" | "post"
  text: string
  actorId?: string | null
  actorName?: string | null
  occurredAt?: string | null
  metadata?: Record<string, unknown>
}

export async function ingestSocialInboxEvent(event: SocialInboxEvent): Promise<{ inserted: boolean; conversationId?: string }> {
  const supabase = createServiceClient()
  const { data: channels, error: channelError } = await supabase
    .from("messaging_channels")
    .select("id, property_id, config, is_active")
    .eq("channel_type", event.channel)
    .eq("is_active", true)
  if (channelError) throw channelError

  const channel = (channels || []).find(
    (row: { config?: Record<string, unknown> }) => String(row.config?.external_account_id || "") === event.externalAccountId,
  ) as { id: string; property_id: string; config?: Record<string, unknown> } | undefined
  if (!channel) return { inserted: false }

  const { data: duplicate } = await supabase
    .from("messages")
    .select("id, conversation_id, metadata")
    .eq("property_id", channel.property_id)
    .eq("external_message_id", event.externalMessageId)
    .limit(10)
  const existing = (duplicate || []).find((row: { metadata?: Record<string, any> }) => row.metadata?.social?.provider === event.provider)
  if (existing) return { inserted: false, conversationId: existing.conversation_id }

  let { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id, unread_count")
    .eq("property_id", channel.property_id)
    .eq("channel", event.channel)
    .eq("messaging_channel_id", channel.id)
    .eq("external_thread_id", event.externalThreadId)
    .maybeSingle()
  if (conversationError) throw conversationError

  const occurredAt = event.occurredAt || new Date().toISOString()
  if (!conversation) {
    const { data: insertedConversation, error } = await supabase
      .from("conversations")
      .insert({
        property_id: channel.property_id,
        channel: event.channel,
        status: "open",
        subject: event.eventType === "direct_message" ? `Messaggio ${event.provider}` : `${event.eventType} ${event.provider}`,
        messaging_channel_id: channel.id,
        external_thread_id: event.externalThreadId,
        contact_name: event.actorName || null,
        last_message_at: occurredAt,
        unread_count: 0,
        metadata: {
          social: {
            provider: event.provider,
            external_account_id: event.externalAccountId,
            external_actor_id: event.actorId || null,
            event_type: event.eventType,
          },
        },
      })
      .select("id, unread_count")
      .single()
    if (error) throw error
    conversation = insertedConversation
  }

  const content = event.text?.trim() || `[${event.eventType}]`
  const { error: messageError } = await supabase.from("messages").insert({
    property_id: channel.property_id,
    conversation_id: conversation.id,
    sender_type: "customer",
    sender_name: event.actorName || null,
    content,
    content_type: "text",
    external_message_id: event.externalMessageId,
    received_at: occurredAt,
    status: "received",
    metadata: {
      social: {
        provider: event.provider,
        channel: event.channel,
        event_type: event.eventType,
        external_account_id: event.externalAccountId,
        external_thread_id: event.externalThreadId,
        external_actor_id: event.actorId || null,
        ...(event.metadata || {}),
      },
    },
  })
  if (messageError) throw messageError

  const { error: updateError } = await supabase
    .from("conversations")
    .update({
      last_message_at: occurredAt,
      unread_count: Number(conversation.unread_count || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversation.id)
    .eq("property_id", channel.property_id)
  if (updateError) throw updateError

  await supabase
    .from("messaging_channels")
    .update({ last_inbound_at: occurredAt, last_error: null, updated_at: new Date().toISOString() })
    .eq("id", channel.id)

  return { inserted: true, conversationId: conversation.id }
}
