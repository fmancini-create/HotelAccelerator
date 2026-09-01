import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { richiediOperatore } from "@/lib/inbox/identity"
import { getTelegramChannelByIdForProperty, getTelegramChannelForProperty } from "@/lib/telegram/channels"
import { sendTelegramText } from "@/lib/telegram/client"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    const operatore = await richiediOperatore(request)
    const propertyId = operatore.propertyId
    const payload = await request.json()
    const chatId = String(payload.to || "").trim()
    const text = String(payload.body || "").trim()
    const channelId = String(payload.channelId || "").trim()

    if (!chatId) return NextResponse.json({ error: "Chat Telegram obbligatoria." }, { status: 400 })
    if (!text) return NextResponse.json({ error: "Il messaggio non può essere vuoto." }, { status: 400 })

    const supabase = createServiceClient()
    const channel = channelId
      ? await getTelegramChannelByIdForProperty(supabase, propertyId, channelId)
      : await getTelegramChannelForProperty(supabase, propertyId)

    if (!channel || !channel.is_active) {
      return NextResponse.json({ error: "Nessun canale Telegram attivo per questa struttura." }, { status: 404 })
    }

    const sent = await sendTelegramText(channel.credentials, chatId, text)
    if (!sent.success) return NextResponse.json({ error: sent.error || "Invio Telegram non riuscito." }, { status: 502 })

    const sentAt = new Date().toISOString()
    let conversationId: string | null = null
    const { data: existing } = await supabase
      .from("conversations")
      .select("id")
      .eq("property_id", propertyId)
      .eq("channel", "telegram")
      .eq("messaging_channel_id", channel.id)
      .eq("metadata->>telegram_chat_id", chatId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    conversationId = existing?.id ?? null
    if (!conversationId) {
      const { data: created, error } = await supabase
        .from("conversations")
        .insert({
          property_id: propertyId,
          channel: "telegram",
          status: "open",
          subject: `Telegram · ${chatId}`,
          contact_name: chatId,
          messaging_channel_id: channel.id,
          last_message_at: sentAt,
          unread_count: 0,
          metadata: { channel: "telegram", telegram_chat_id: chatId, messaging_channel_id: channel.id },
        })
        .select("id")
        .single()
      if (error) throw error
      conversationId = created.id
    }

    await supabase.from("messages").insert({
      property_id: propertyId,
      conversation_id: conversationId,
      sender_type: "agent",
      sender_id: operatore.titolare.adminUserId,
      sender_name: operatore.titolare.label,
      content: text,
      content_type: "text",
      external_message_id: sent.externalMessageId ?? null,
      status: "sent",
      stored_at: sentAt,
      metadata: { channel: "telegram", source: "omnichannel_compose" },
    })

    await supabase
      .from("conversations")
      .update({ last_message_at: sentAt, status: "open", updated_at: sentAt })
      .eq("id", conversationId)
      .eq("property_id", propertyId)

    return NextResponse.json({ success: true, conversationId, externalMessageId: sent.externalMessageId })
  } catch (error) {
    console.error("[Telegram compose] error", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Errore durante l'invio Telegram." }, { status: 500 })
  }
}
