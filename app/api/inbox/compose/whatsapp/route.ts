import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { richiediOperatore } from "@/lib/inbox/identity"
import { trovaAnagraficaPerNumero } from "@/lib/crm/contact-identity"
import { getWhatsAppChannelById, getWhatsAppChannelForProperty } from "@/lib/whatsapp/channels"
import { normalizeWhatsAppNumber, sendWhatsAppText } from "@/lib/whatsapp/client"
import { getWhatsAppWindowState } from "@/lib/whatsapp/window"
import { queueWhatsAppReopen } from "@/lib/whatsapp/pending"
import { ensureWhatsAppReopenTemplateForChannel } from "@/lib/whatsapp/template-provisioning"
import {
  expectedOutboundStagingPrefix,
  removeStagedWhatsAppMedia,
  sendStagedWhatsAppMedia,
  validateWhatsAppOutboundMedia,
  type StagedWhatsAppMedia,
} from "@/lib/whatsapp/outbound-media"

export const runtime = "nodejs"

interface ComposeBody {
  to?: string
  body?: string
  contactId?: string
  contactName?: string
  channelId?: string
  media?: StagedWhatsAppMedia | null
}

export async function POST(request: NextRequest) {
  let mediaToCleanup: StagedWhatsAppMedia | null = null
  try {
    const operatore = await richiediOperatore(request)
    const propertyId = operatore.propertyId
    const payload = (await request.json()) as ComposeBody
    const phone = normalizeWhatsAppNumber(payload.to || "")
    const text = payload.body?.trim() || ""
    const media = payload.media ?? null
    mediaToCleanup = media

    if (phone.length < 8 || phone.length > 15) {
      return NextResponse.json({ error: "Inserisci un numero WhatsApp valido con prefisso internazionale." }, { status: 400 })
    }
    if (!text && !media) {
      return NextResponse.json({ error: "Scrivi un messaggio oppure allega una foto, un video, un vocale o un documento." }, { status: 400 })
    }

    const supabase = createServiceClient()
    const channel = payload.channelId
      ? await getWhatsAppChannelById(supabase, propertyId, payload.channelId)
      : await getWhatsAppChannelForProperty(supabase, propertyId)

    if (!channel) {
      if (media) await removeStagedWhatsAppMedia(supabase, media)
      mediaToCleanup = null
      return NextResponse.json({ error: "Nessun canale WhatsApp attivo configurato per questa struttura." }, { status: 404 })
    }

    if (media) {
      const validation = validateWhatsAppOutboundMedia(media.name, media.mimeType, media.size)
      const expectedPrefix = expectedOutboundStagingPrefix(propertyId, channel.id)
      if (!validation.ok || !media.path.startsWith(expectedPrefix)) {
        await removeStagedWhatsAppMedia(supabase, media)
        mediaToCleanup = null
        return NextResponse.json(
          { error: validation.ok ? "Allegato WhatsApp non valido per questo tenant o numero." : validation.error },
          { status: 400 },
        )
      }
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
        if (media) await removeStagedWhatsAppMedia(supabase, media)
        mediaToCleanup = null
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
      throw new Error("Impossibile risolvere o creare il contatto WhatsApp.")
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

    if (!conversation) throw new Error("Impossibile risolvere o creare la conversazione WhatsApp.")
    const resolvedConversation = conversation
    const window = await getWhatsAppWindowState(supabase, propertyId, resolvedConversation.id)

    if (window.isOpen) {
      const sentAt = new Date().toISOString()
      const timelineRows: Array<Record<string, unknown>> = []
      let warning = ""

      if (media) {
        const sentMedia = await sendStagedWhatsAppMedia(supabase, {
          propertyId,
          channel,
          toPhone: phone,
          media,
          caption: text,
        })
        if (!sentMedia.success) {
          await supabase
            .from("messaging_channels")
            .update({ last_error: sentMedia.error ?? "Errore invio media WhatsApp" })
            .eq("id", channel.id)
            .eq("property_id", propertyId)
          return NextResponse.json({ error: sentMedia.error ?? "Errore invio media WhatsApp." }, { status: 502 })
        }

        timelineRows.push({
          property_id: propertyId,
          conversation_id: resolvedConversation.id,
          sender_type: "agent",
          sender_id: operatore.titolare.adminUserId,
          sender_name: operatore.titolare.label,
          content: sentMedia.contentHtml || `[${sentMedia.kind || "media"}] ${media.name}`,
          content_type: "text/html",
          external_message_id: sentMedia.externalMessageId ?? null,
          status: "sent",
          stored_at: sentAt,
          metadata: {
            channel: "whatsapp",
            source: "omnichannel_compose",
            wa_message_type: sentMedia.kind,
            whatsapp_media_id: sentMedia.mediaId,
            filename: media.name,
          },
        })

        if (text && !sentMedia.captionConsumed) {
          const sentText = await sendWhatsAppText(channel.config, channel.credentials, phone, text)
          if (sentText.success) {
            timelineRows.push({
              property_id: propertyId,
              conversation_id: resolvedConversation.id,
              sender_type: "agent",
              sender_id: operatore.titolare.adminUserId,
              sender_name: operatore.titolare.label,
              content: text,
              content_type: "text",
              external_message_id: sentText.externalMessageId ?? null,
              status: "sent",
              stored_at: sentAt,
              metadata: { channel: "whatsapp", source: "omnichannel_compose" },
            })
          } else {
            warning = `Il media è stato inviato, ma il testo aggiuntivo non è partito: ${sentText.error ?? "errore WhatsApp"}`
          }
        }
      } else {
        const sent = await sendWhatsAppText(channel.config, channel.credentials, phone, text)
        if (!sent.success) {
          await supabase
            .from("messaging_channels")
            .update({ last_error: sent.error ?? "Errore invio WhatsApp" })
            .eq("id", channel.id)
            .eq("property_id", propertyId)
          return NextResponse.json({ error: sent.error ?? "Errore invio WhatsApp." }, { status: 502 })
        }
        timelineRows.push({
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
      }

      const { data: messages, error: messageError } = await supabase
        .from("messages")
        .insert(timelineRows)
        .select("id")
      if (messageError) {
        warning = warning
          ? `${warning} Inoltre la timeline locale non è stata aggiornata: ${messageError.message}`
          : `Messaggio consegnato a WhatsApp, ma timeline locale non aggiornata: ${messageError.message}`
      }

      await Promise.all([
        supabase
          .from("conversations")
          .update({ last_message_at: sentAt, status: "open", updated_at: sentAt })
          .eq("id", resolvedConversation.id)
          .eq("property_id", propertyId),
        supabase
          .from("messaging_channels")
          .update({ last_outbound_at: sentAt, last_error: warning || null })
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

      if (media) {
        await removeStagedWhatsAppMedia(supabase, media)
        mediaToCleanup = null
      }

      return NextResponse.json({
        success: true,
        mode: "sent",
        conversationId: resolvedConversation.id,
        messageId: messages?.[0]?.id,
        messageIds: messages?.map((message) => message.id) ?? [],
        warning: warning || undefined,
        window,
      })
    }

    const { data: property } = await supabase
      .from("properties")
      .select("name")
      .eq("id", propertyId)
      .maybeSingle()

    const template = await ensureWhatsAppReopenTemplateForChannel(
      supabase,
      channel,
      property?.name?.trim() || channel.display_name || "Hotel Demo",
    )

    if (!template.ok || template.status !== "APPROVED") {
      if (media) {
        await removeStagedWhatsAppMedia(supabase, media)
        mediaToCleanup = null
      }
      const isReviewing = template.ok && ["PENDING", "IN_APPEAL"].includes(template.status)
      return NextResponse.json(
        {
          error: isReviewing
            ? "WhatsApp sta completando automaticamente l'attivazione dei messaggi fuori dalla finestra di 24 ore. Riprova quando Meta avrà approvato il modello."
            : "HotelAccelerator non può ancora usare il modello WhatsApp gestito automaticamente. Il problema è stato registrato per il canale; non è richiesta alcuna configurazione Meta al tenant.",
          code: "TEMPLATE_NOT_READY",
          templateStatus: template.status,
          templateManaged: true,
          conversationId: resolvedConversation.id,
        },
        { status: isReviewing ? 409 : 503 },
      )
    }

    const queued = await queueWhatsAppReopen(supabase, {
      propertyId,
      conversationId: resolvedConversation.id,
      contactId: resolvedContact.id,
      channel,
      toPhone: phone,
      body: text,
      media,
      operatorAdminUserId: operatore.titolare.adminUserId,
      operatorActorKey: operatore.titolare.key,
      operatorLabel: operatore.titolare.label,
    })

    if (!queued.ok) {
      if (media) {
        await removeStagedWhatsAppMedia(supabase, media)
        mediaToCleanup = null
      }
      const status = queued.code === "ALREADY_PENDING" ? 409 : 502
      return NextResponse.json({ error: queued.error, code: queued.code, conversationId: resolvedConversation.id }, { status })
    }

    // The pending row owns the staged media from this point until delivery,
    // decline or expiry. Never clean it in the request-finalizer below.
    mediaToCleanup = null
    return NextResponse.json({
      success: true,
      mode: "queued",
      conversationId: resolvedConversation.id,
      pendingId: queued.pendingId,
      message: media
        ? "Finestra WhatsApp chiusa: richiesta di apertura inviata. Il media partirà automaticamente dopo l'accettazione."
        : "Finestra WhatsApp chiusa: richiesta di apertura inviata al cliente.",
      window,
    })
  } catch (error) {
    console.error("[WhatsApp compose] error:", error)
    if (mediaToCleanup) {
      try {
        const supabase = createServiceClient()
        await removeStagedWhatsAppMedia(supabase, mediaToCleanup)
      } catch {
        // Best-effort cleanup; the staged object is private and cannot leak cross-tenant.
      }
    }
    const status = typeof (error as any)?.status === "number" ? (error as any).status : 500
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Errore durante la creazione del messaggio WhatsApp." },
      { status },
    )
  }
}
