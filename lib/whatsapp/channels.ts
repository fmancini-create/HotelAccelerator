import type { SupabaseClient } from "@supabase/supabase-js"
import type { InboundWhatsAppMessage, OutboundWhatsAppMessage } from "./processor"
import type { MessagingChannelRow } from "./types"
import { decryptWhatsAppCredentials } from "./channel-secrets"

/**
 * DUAL-READ: decifra i segreti annidati in `credentials` di un channel appena
 * letto dal DB, tollerando sia il formato legacy in chiaro sia `enc:v1:...`.
 * Lascia invariato ogni altro campo (incl. `config`) e non muta l'input.
 * Centralizzando qui, tutti i consumer dei reader sotto ricevono credenziali
 * già decifrate lato server. NON cifra e NON scrive nulla.
 */
function withDecryptedCredentials<T extends MessagingChannelRow | null>(channel: T): T {
  if (!channel) return channel
  return {
    ...channel,
    credentials: decryptWhatsAppCredentials(channel.credentials),
  }
}

/**
 * Resolve the WhatsApp messaging channel for an incoming webhook by the
 * business `phone_number_id` (present in the webhook value metadata). This is
 * what makes inbound routing multitenant: each tenant registers its own
 * phone_number_id.
 */
export async function getWhatsAppChannelByPhoneNumberId(
  supabase: SupabaseClient,
  phoneNumberId: string,
): Promise<MessagingChannelRow | null> {
  const { data } = await supabase
    .from("messaging_channels")
    .select("*")
    .eq("channel_type", "whatsapp")
    .eq("config->>phone_number_id", phoneNumberId)
    .eq("is_active", true)
    .maybeSingle()
  return withDecryptedCredentials((data as MessagingChannelRow) ?? null)
}

/**
 * Get the DEFAULT active WhatsApp channel for a property (fallback for outbound
 * sends when a conversation has no specific channel pinned).
 */
export async function getWhatsAppChannelForProperty(
  supabase: SupabaseClient,
  propertyId: string,
): Promise<MessagingChannelRow | null> {
  const { data } = await supabase
    .from("messaging_channels")
    .select("*")
    .eq("channel_type", "whatsapp")
    .eq("property_id", propertyId)
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  return withDecryptedCredentials((data as MessagingChannelRow) ?? null)
}

/**
 * Fetch a specific WhatsApp channel by id, scoped to the property (so a tenant
 * can never send through another tenant's number).
 */
export async function getWhatsAppChannelById(
  supabase: SupabaseClient,
  propertyId: string,
  channelId: string,
): Promise<MessagingChannelRow | null> {
  const { data } = await supabase
    .from("messaging_channels")
    .select("*")
    .eq("id", channelId)
    .eq("channel_type", "whatsapp")
    .eq("property_id", propertyId)
    .eq("is_active", true)
    .maybeSingle()
  return withDecryptedCredentials((data as MessagingChannelRow) ?? null)
}

/**
 * Resolve the WhatsApp channel to use when replying to a conversation.
 *
 * Multi-number aware: prefers the channel the conversation came in on
 * (`metadata.messaging_channel_id`, written by the inbound processor), falling
 * back to the property's default channel for older conversations.
 */
export async function getWhatsAppChannelForConversation(
  supabase: SupabaseClient,
  propertyId: string,
  conversation: { metadata?: { messaging_channel_id?: string | null } | null } | null,
): Promise<MessagingChannelRow | null> {
  const pinnedId = conversation?.metadata?.messaging_channel_id
  if (pinnedId) {
    const pinned = await getWhatsAppChannelById(supabase, propertyId, pinnedId)
    if (pinned) return pinned
  }
  return getWhatsAppChannelForProperty(supabase, propertyId)
}

/**
 * List all WhatsApp channels for a property (active first, oldest first).
 */
export async function listWhatsAppChannelsForProperty(
  supabase: SupabaseClient,
  propertyId: string,
): Promise<MessagingChannelRow[]> {
  const { data } = await supabase
    .from("messaging_channels")
    .select("*")
    .eq("channel_type", "whatsapp")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: true })
  return ((data as MessagingChannelRow[]) ?? []).map((row) => withDecryptedCredentials(row))
}

export interface WhatsAppDeliveryStatusError {
  code?: number | string
  title?: string
  message?: string
  details?: string
}

export interface WhatsAppDeliveryStatus {
  phoneNumberId: string
  id: string
  status: string
  recipientId?: string
  timestamp: Date
  errors: WhatsAppDeliveryStatusError[]
}

interface ParsedWebhook {
  phoneNumberId: string | null
  messages: InboundWhatsAppMessage[]
  /** Messages sent from the WhatsApp Business app and mirrored by coexistence. */
  echoes: OutboundWhatsAppMessage[]
  /** Delivery receipts are kept tenant-routable by preserving their source number. */
  statuses: WhatsAppDeliveryStatus[]
}

/**
 * Parse a Meta WhatsApp webhook body into a flat list of inbound messages and
 * delivery statuses. Tolerant of the nested entry/changes/value shape and of
 * non-text message types.
 *
 * Media messages are rendered through our authenticated media proxy. Meta only
 * gives us a media id in the webhook; the actual URL is short-lived and
 * requires a bearer token. Keeping the media id in the stored HTML lets the
 * Inbox display/play/download the asset without ever exposing tenant Meta
 * credentials to the browser. The proxy caches the binary in private storage.
 */
export function parseWhatsAppWebhook(body: any): ParsedWebhook {
  const result: ParsedWebhook = { phoneNumberId: null, messages: [], echoes: [], statuses: [] }
  if (!body || body.object !== "whatsapp_business_account") return result

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {}
      const phoneNumberId: string | undefined = value.metadata?.phone_number_id
      if (phoneNumberId) result.phoneNumberId = phoneNumberId
      // A payload without its originating number cannot be routed safely in a
      // multi-tenant webhook, so leave it unacknowledged as an event to process.
      if (!phoneNumberId) continue

      // Map contact wa_id -> profile name for enrichment.
      const nameByWaId = new Map<string, string>()
      for (const c of value.contacts ?? []) {
        if (c?.wa_id) nameByWaId.set(c.wa_id, c?.profile?.name ?? "")
      }

      for (const m of value.messages ?? []) {
        const fromPhone: string = m.from ?? ""
        const tsSeconds = Number(m.timestamp ?? 0)
        result.messages.push({
          phoneNumberId,
          externalId: m.id,
          fromPhone,
          fromName: nameByWaId.get(fromPhone) || undefined,
          body: extractBody(m, phoneNumberId),
          messageType: m.type ?? "unknown",
          timestamp: tsSeconds ? new Date(tsSeconds * 1000) : new Date(),
          raw: m,
        })
      }

      // In coexistence, messages sent from the Business App are delivered as
      // smb_message_echoes. They are outbound operator messages, not customer
      // inbound messages, so they must follow a separate timeline path.
      // Meta can also emit echo-side edit/revoke/control events without a `to`.
      // Those cannot be attached to a customer conversation safely, so ignore
      // them instead of turning a harmless sync event into an HTTP 500/retry loop.
      for (const m of value.message_echoes ?? []) {
        const toPhone: string = m.to ?? m.recipient_id ?? m.recipient?.wa_id ?? ""
        if (!toPhone) continue
        const tsSeconds = Number(m.timestamp ?? 0)
        result.echoes.push({
          phoneNumberId,
          externalId: m.id,
          toPhone,
          body: extractBody(m, phoneNumberId),
          messageType: m.type ?? "unknown",
          timestamp: tsSeconds ? new Date(tsSeconds * 1000) : new Date(),
          raw: m,
        })
      }

      for (const s of value.statuses ?? []) {
        const id = typeof s?.id === "string" ? s.id.trim() : ""
        const status = typeof s?.status === "string" ? s.status.trim().toLowerCase() : ""
        if (!id || !status) continue

        const tsSeconds = Number(s.timestamp ?? 0)
        const errors: WhatsAppDeliveryStatusError[] = (Array.isArray(s.errors) ? s.errors : []).map(
          (error: any) => ({
            code:
              typeof error?.code === "number" || typeof error?.code === "string"
                ? error.code
                : undefined,
            title: typeof error?.title === "string" ? error.title : undefined,
            message: typeof error?.message === "string" ? error.message : undefined,
            details:
              typeof error?.error_data?.details === "string" ? error.error_data.details : undefined,
          }),
        )

        result.statuses.push({
          phoneNumberId,
          id,
          status,
          recipientId: typeof s.recipient_id === "string" ? s.recipient_id : undefined,
          timestamp: tsSeconds ? new Date(tsSeconds * 1000) : new Date(),
          errors,
        })
      }
    }
  }

  return result
}

function escapeWhatsAppHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function whatsappMediaProxyUrl(phoneNumberId: string, mediaId: string): string {
  return `/api/channels/whatsapp/media/${encodeURIComponent(phoneNumberId)}/${encodeURIComponent(mediaId)}`
}

function renderCaption(caption?: string): string {
  const value = caption?.trim()
  return value ? `<div style="margin-top:6px;white-space:pre-wrap">${escapeWhatsAppHtml(value)}</div>` : ""
}

function renderWhatsAppImage(
  phoneNumberId: string,
  mediaId: string,
  options: { caption?: string; sticker?: boolean } = {},
): string {
  const src = whatsappMediaProxyUrl(phoneNumberId, mediaId)
  const label = options.sticker ? "Sticker WhatsApp" : "Foto WhatsApp"
  return `<div data-whatsapp-media="${options.sticker ? "sticker" : "image"}" style="max-width:560px"><a href="${src}" target="_blank" rel="noopener noreferrer" style="display:inline-block;max-width:100%"><img src="${src}" alt="${label}" loading="lazy" style="display:block;max-width:100%;height:auto;max-height:680px;border-radius:12px;object-fit:contain" /></a>${renderCaption(options.caption)}</div>`
}

function renderWhatsAppVideo(phoneNumberId: string, mediaId: string, caption?: string): string {
  const src = whatsappMediaProxyUrl(phoneNumberId, mediaId)
  return `<div data-whatsapp-media="video" style="max-width:640px"><video controls preload="metadata" playsinline style="display:block;width:100%;max-height:680px;border-radius:12px;background:#000"><source src="${src}" />Il browser non supporta la riproduzione video.</video>${renderCaption(caption)}</div>`
}

function renderWhatsAppAudio(phoneNumberId: string, mediaId: string, voice: boolean): string {
  const src = whatsappMediaProxyUrl(phoneNumberId, mediaId)
  const label = voice ? "Messaggio vocale WhatsApp" : "Audio WhatsApp"
  return `<div data-whatsapp-media="audio" style="max-width:560px"><div style="margin-bottom:6px;font-size:12px;color:#5f6368">${label}</div><audio controls preload="metadata" style="display:block;width:100%"><source src="${src}" />Il browser non supporta la riproduzione audio.</audio></div>`
}

function renderWhatsAppDocument(phoneNumberId: string, mediaId: string, filename?: string, caption?: string): string {
  const src = whatsappMediaProxyUrl(phoneNumberId, mediaId)
  const safeName = escapeWhatsAppHtml(filename?.trim() || "Documento WhatsApp")
  return `<div data-whatsapp-media="document" style="max-width:560px"><a href="${src}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid #dadce0;border-radius:10px;text-decoration:none;color:#1a73e8;font-weight:500">Apri documento: ${safeName}</a>${renderCaption(caption)}</div>`
}

function extractBody(m: any, phoneNumberId: string): string {
  switch (m.type) {
    case "text":
      return m.text?.body ?? ""
    case "button":
      return m.button?.text ?? ""
    case "interactive":
      return (
        m.interactive?.button_reply?.title ??
        m.interactive?.list_reply?.title ??
        "[messaggio interattivo]"
      )
    case "image": {
      const mediaId = typeof m.image?.id === "string" ? m.image.id.trim() : ""
      const caption = typeof m.image?.caption === "string" ? m.image.caption : ""
      if (!mediaId) return caption ? `[immagine] ${caption}` : "[immagine]"
      return renderWhatsAppImage(phoneNumberId, mediaId, { caption })
    }
    case "video": {
      const mediaId = typeof m.video?.id === "string" ? m.video.id.trim() : ""
      const caption = typeof m.video?.caption === "string" ? m.video.caption : ""
      if (!mediaId) return caption ? `[video] ${caption}` : "[video]"
      return renderWhatsAppVideo(phoneNumberId, mediaId, caption)
    }
    case "audio": {
      const mediaId = typeof m.audio?.id === "string" ? m.audio.id.trim() : ""
      if (!mediaId) return "[messaggio vocale]"
      return renderWhatsAppAudio(phoneNumberId, mediaId, m.audio?.voice === true)
    }
    case "document": {
      const mediaId = typeof m.document?.id === "string" ? m.document.id.trim() : ""
      const filename = typeof m.document?.filename === "string" ? m.document.filename : ""
      const caption = typeof m.document?.caption === "string" ? m.document.caption : ""
      if (!mediaId) return filename ? `[documento] ${filename}` : "[documento]"
      return renderWhatsAppDocument(phoneNumberId, mediaId, filename, caption)
    }
    case "location":
      return "[posizione]"
    case "contacts":
      return "[contatto]"
    case "sticker": {
      const mediaId = typeof m.sticker?.id === "string" ? m.sticker.id.trim() : ""
      return mediaId ? renderWhatsAppImage(phoneNumberId, mediaId, { sticker: true }) : "[sticker]"
    }
    default:
      return `[messaggio ${m.type ?? "sconosciuto"}]`
  }
}
