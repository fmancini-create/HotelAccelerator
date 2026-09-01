import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { richiediOperatore } from "@/lib/inbox/identity"
import { getTelegramChannelByIdForProperty, getTelegramChannelForProperty } from "@/lib/telegram/channels"
import { sendTelegramDocument, sendTelegramText } from "@/lib/telegram/client"

export const runtime = "nodejs"
const MAX_ATTACHMENTS_BYTES = 20 * 1024 * 1024

export async function POST(request: NextRequest) {
  try {
    const operatore = await richiediOperatore(request)
    const propertyId = operatore.propertyId
    const contentType = request.headers.get("content-type") || ""

    let chatId = ""
    let text = ""
    let channelId = ""
    let attachments: File[] = []

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData()
      chatId = String(form.get("to") || "").trim()
      text = String(form.get("body") || "").trim()
      channelId = String(form.get("channelId") || "").trim()
      attachments = form.getAll("attachments").filter((value): value is File => value instanceof File)
    } else {
      const payload = await request.json()
      chatId = String(payload.to || "").trim()
      text = String(payload.body || "").trim()
      channelId = String(payload.channelId || "").trim()
    }

    if (!chatId) return NextResponse.json({ error: "Chat Telegram obbligatoria." }, { status: 400 })
    if (!text && attachments.length === 0) {
      return NextResponse.json({ error: "Scrivi un messaggio o allega almeno un file." }, { status: 400 })
    }
    if (attachments.reduce((sum, file) => sum + file.size, 0) > MAX_ATTACHMENTS_BYTES) {
      return NextResponse.json({ error: "Gli allegati superano il limite complessivo di 20 MB." }, { status: 413 })
    }

    const supabase = createServiceClient()
    const channel = channelId
      ? await getTelegramChannelByIdForProperty(supabase, propertyId, channelId)
      : await getTelegramChannelForProperty(supabase, propertyId)

    if (!channel || !channel.is_active) {
      return NextResponse.json({ error: "Nessun canale Telegram attivo per questa struttura." }, { status: 404 })
    }

    const externalIds: string[] = []
    if (text) {
      const sent = await sendTelegramText(channel.credentials, chatId, text)
      if (!sent.success) return NextResponse.json({ error: sent.error || "Invio Telegram non riuscito." }, { status: 502 })
      if (sent.externalMessageId) externalIds.push(sent.externalMessageId)
    }

    for (const file of attachments) {
      const sent = await sendTelegramDocument(channel.credentials, chatId, file)
      if (!sent.success) return NextResponse.json({ error: sent.error || `Invio di ${file.name} non riuscito.` }, { status: 502 })
      if (sent.externalMessageId) externalIds.push(sent.externalMessageId)
    }

    const sentAt = new Date().toISOString()
    const { data: candidates } = await supabase
      .from("conversations")
      .select("id, metadata")
      .eq("property_id", propertyId)
      .eq("channel", "telegram")
      .eq("messaging_channel_id", channel.id)
      .order("created_at", { ascending: false })
      .limit(50)

    let conversationId = (candidates ?? []).find((row: any) => {
      const stored = String(row.metadata?.telegram_chat_id || row.metadata?.chat_id || "")
      return stored === chatId
    })?.id as string | undefined

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
          metadata: { channel: "telegram", chat_id: chatId, telegram_chat_id: chatId, messaging_channel_id: channel.id },
        })
        .select("id")
        .single()
      if (error) throw error
      conversationId = created.id
    }

    if (text) {
      await supabase.from("messages").insert({
        property_id: propertyId,
        conversation_id: conversationId,
        sender_type: "agent",
        sender_id: operatore.titolare.adminUserId,
        sender_name: operatore.titolare.label,
        content: text,
        content_type: "text",
        external_message_id: externalIds[0] ?? null,
        status: "sent",
        stored_at: sentAt,
        metadata: { channel: "telegram", source: "omnichannel_compose" },
      })
    }

    for (let index = 0; index < attachments.length; index += 1) {
      const file = attachments[index]
      await supabase.from("messages").insert({
        property_id: propertyId,
        conversation_id: conversationId,
        sender_type: "agent",
        sender_id: operatore.titolare.adminUserId,
        sender_name: operatore.titolare.label,
        content: file.name,
        content_type: "document",
        external_message_id: externalIds[(text ? 1 : 0) + index] ?? null,
        status: "sent",
        stored_at: sentAt,
        metadata: { channel: "telegram", source: "omnichannel_compose", filename: file.name, mime_type: file.type, size: file.size },
      })
    }

    await supabase
      .from("conversations")
      .update({ last_message_at: sentAt, status: "open", updated_at: sentAt })
      .eq("id", conversationId)
      .eq("property_id", propertyId)

    return NextResponse.json({ success: true, conversationId, externalMessageIds: externalIds })
  } catch (error) {
    console.error("[Telegram compose] error", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Errore durante l'invio Telegram." }, { status: 500 })
  }
}
