import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { richiediOperatore } from "@/lib/inbox/identity"
import { trovaAnagraficaPerNumero } from "@/lib/crm/contact-identity"
import { getWhatsAppChannelById, getWhatsAppChannelForProperty } from "@/lib/whatsapp/channels"
import { normalizeWhatsAppNumber, sendWhatsAppText } from "@/lib/whatsapp/client"
import { getWhatsAppWindowState } from "@/lib/whatsapp/window"
import { queueWhatsAppReopen } from "@/lib/whatsapp/pending"

export const runtime = "nodejs"

interface ComposeBody {
  to?: string
  body?: string
  contactId?: string
  contactName?: string
  channelId?: string
}

export async function POST(request: NextRequest) {
  try {
    const operatore = await richiediOperatore(request)
    const propertyId = operatore.propertyId
    const payload = (await request.json()) as ComposeBody
    const phone = normalizeWhatsAppNumber(payload.to || "")
    const text = payload.body?.trim() || ""

    if (phone.length < 8 || phone.length > 15) {
      return NextResponse.json({ error: "Inserisci un numero WhatsApp valido con prefisso internazionale." }, { status: 400 })
    }
    if (!text) {
      return NextResponse.json({ error: "Il messaggio non può essere vuoto." }, { status: 400 })
    }

    const supabase = createServiceClient()
    const channel = payload.channelId
      ? await getWhatsAppChannelById(supabase, propertyId, payload.channelId)
      : await getWhatsAppChannelForProperty(supabase, propertyId)

    if (!channel) {
      return NextResponse.json({ error: "Nessun canale WhatsApp attivo configurato per questa struttura." }, { status: 404 })
    }

    let contact: { id: string; name?: string | null } | null = null
    if (payload.contactId) {
      const { data } = await supabase
        .from("contacts")
        .select("id, name")
        .eq("id", payload.contactId)
        .eq("property_id", propertyId)
        .maybeSingle()
      contact = data
      if (!contact) {
        return NextResponse.json({ error: "Contatto non disponibile per questa struttura." }, { status: 404 })
      }
    }

    if (!contact) {
      const recognized = await trovaAnagraficaPerNumero(supabase, propertyId, phone)
      if (recognized) contact = { id: recognized.id, name: recognized.name }
    }

    if (!contact) {
      const fallbackName = payload.contactName?.trim() || `+${phone}`
      const { data: created, error } = await supabase
        .from("contacts")
        .insert({
          property_id: propertyId,
          name: fallbackName,
          phone: `+${phone}`,
          whatsapp_id: phone,
          source: "manual",
        })
        .select("id, name")
        .single()
      if (error) throw error
      contact = created
    }

    if (!contact) {
      return NextResponse.json({ error: "Impossibile risolvere o creare il contatto WhatsApp." }, { status: 500 })
    }
    const resolvedContact = contact

    const { data: candidates, error: convReadError } = await supabase
      .from("conversations")
      .select("id, contact_id, messaging_channel_id, metadata")
      .eq("property_id", propertyId)
      .eq("channel", "whatsapp")
      .eq("contact_id", resolvedContact.id)
      .order("created_at", { ascending: false })
      .limit(20)
    if (convReadError) throw convReadError

    let conversation = (candidates ?? []).find((row: any) => {
      const pinned = row.messaging_channel_id || row.metadata?.messaging_channel_id
      return pinned === channel.id
    }) as { id: string } | undefined

    if (!conversation) {
      const label = resolvedContact.name?.trim() || `+${phone}`
      const { data: created, error } = await supabase
        .from("conversations")
        .insert({
          property_id: propertyId,
          contact_id: resolvedContact.id,
          channel: "whatsapp",
          status: "open",
          subject: `WhatsApp · ${label}`,
          contact_name: label,
          messaging_channel_id: channel.id,
          last_message_at: new Date().toISOString(),
          unread_count: 0,
          metadata: {
            channel: "whatsapp",
            phone,
            messaging_channel_id: channel.id,
          },
        })
        .select("id")
        .single()
      if (error) throw error
      conversation = created
    }

    if (!conversation) {
      return NextResponse.json({ error: "Impossibile risolvere o creare la conversazione WhatsApp." }, { status: 500 })
    }
    const resolvedConversation = conversation

    const window = await getWhatsAppWindowState(supabase, propertyId, resolvedConversation.id)

    if (window.isOpen) {
      const sent = await sendWhatsAppText(channel.config, channel.credentials, phone, text)
      if (!sent.success) {
        await supabase
          .from("messaging_channels")
          .update({ last_error: sent.error ?? "Errore invio WhatsApp" })
          .eq("id", channel.id)
          .eq("property_id", propertyId)
        return NextResponse.json({ error: sent.error ?? "Errore invio WhatsApp." }, { status: 502 })
      }

      const sentAt = new Date().toISOString()
      const { data: message, error: messageError } = await supabase
        .from("messages")
        .insert({
          property_id: propertyId,
          conversation_id: resolvedConversation.id,
          sender_type: "agent",
          sender_id: operatore.titolare.adminUserId,
          sender_name: operatore.titolare.label,
          content: text,
          content_type: "text",
          external_message_id: sent.externalMessageId ?? null,
          status: "sent",
          stored_at: sentAt,
          metadata: { channel: "whatsapp", source: "omnichannel_compose" },
        })
        .select("id")
        .single()
      if (messageError) throw messageError

      await Promise.all([
        supabase
          .from("conversations")
          .update({ last_message_at: sentAt, status: "open", updated_at: sentAt })
          .eq("id", resolvedConversation.id)
          .eq("property_id", propertyId),
        supabase
          .from("messaging_channels")
          .update({ last_outbound_at: sentAt, last_error: null })
          .eq("id", channel.id)
          .eq("property_id", propertyId),
        supabase
          .from("messages")
          .update({ status: "replied" })
          .eq("property_id", propertyId)
          .eq("conversation_id", resolvedConversation.id)
          .eq("sender_type", "customer")
          .in("status", ["received", "read"]),
      ])

      return NextResponse.json({
        success: true,
        mode: "sent",
        conversationId: resolvedConversation.id,
        messageId: message.id,
        window,
      })
    }

    const queued = await queueWhatsAppReopen(supabase, {
      propertyId,
      conversationId: resolvedConversation.id,
      contactId: resolvedContact.id,
      channel,
      toPhone: phone,
      body: text,
      operatorAdminUserId: operatore.titolare.adminUserId,
      operatorActorKey: operatore.titolare.key,
      operatorLabel: operatore.titolare.label,
    })

    if (!queued.ok) {
      const status = queued.code === "ALREADY_PENDING" ? 409 : 502
      return NextResponse.json({ error: queued.error, code: queued.code, conversationId: resolvedConversation.id }, { status })
    }

    return NextResponse.json({
      success: true,
      mode: "queued",
      conversationId: resolvedConversation.id,
      pendingId: queued.pendingId,
      message: "Finestra WhatsApp chiusa: richiesta di apertura inviata al cliente.",
      window,
    })
  } catch (error) {
    const status = typeof (error as any)?.status === "number" ? (error as any).status : 500
    console.error("[WhatsApp compose] error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Errore durante la creazione del messaggio WhatsApp." },
      { status },
    )
  }
}
