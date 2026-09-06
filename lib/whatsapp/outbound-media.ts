import type { SupabaseClient } from "@supabase/supabase-js"
import { getPlatformWhatsAppConfig } from "./platform"
import { getGraphVersion, type MessagingChannelRow } from "./types"
import { normalizeWhatsAppNumber } from "./client"

export const WHATSAPP_OUTBOUND_BUCKET = "support-private"
const PENDING_MEDIA_PREFIX = "__HA_WA_MEDIA_V1__:"

export type WhatsAppOutboundMediaKind = "image" | "video" | "audio" | "document"

export interface StagedWhatsAppMedia {
  path: string
  name: string
  mimeType: string
  size: number
}

export interface PendingWhatsAppPayload {
  text: string
  media: StagedWhatsAppMedia | null
}

export interface SentWhatsAppMedia {
  success: boolean
  externalMessageId?: string
  mediaId?: string
  kind?: WhatsAppOutboundMediaKind
  contentHtml?: string
  captionConsumed?: boolean
  error?: string
  outcomeUnknown?: boolean
}

const MIME_KIND: Record<string, WhatsAppOutboundMediaKind> = {
  "image/jpeg": "image",
  "image/png": "image",
  "video/mp4": "video",
  "video/3gpp": "video",
  "audio/aac": "audio",
  "audio/mp4": "audio",
  "audio/mpeg": "audio",
  "audio/amr": "audio",
  "audio/ogg": "audio",
  "application/pdf": "document",
  "application/msword": "document",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "document",
  "application/vnd.ms-excel": "document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "document",
  "application/vnd.ms-powerpoint": "document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "document",
  "text/plain": "document",
}

const MAX_BYTES: Record<WhatsAppOutboundMediaKind, number> = {
  image: 5 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  document: 20 * 1024 * 1024,
}

function cleanMime(value: string): string {
  return (value || "application/octet-stream").split(";")[0].trim().toLowerCase()
}

export function classifyWhatsAppOutboundMedia(mimeType: string): WhatsAppOutboundMediaKind | null {
  return MIME_KIND[cleanMime(mimeType)] ?? null
}

export function validateWhatsAppOutboundMedia(
  name: string,
  mimeType: string,
  size: number,
): { ok: true; kind: WhatsAppOutboundMediaKind; mimeType: string } | { ok: false; error: string } {
  const normalizedMime = cleanMime(mimeType)
  const kind = classifyWhatsAppOutboundMedia(normalizedMime)
  if (!kind) {
    return {
      ok: false,
      error: `Formato WhatsApp non supportato per ${name || "il file"}. Usa JPG/PNG, MP4/3GP, AAC/M4A/MP3/AMR/OGG oppure un documento PDF/Office.`,
    }
  }
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, error: "Il file selezionato è vuoto o non valido." }
  }
  const max = MAX_BYTES[kind]
  if (size > max) {
    const mb = Math.round(max / (1024 * 1024))
    return { ok: false, error: `${name || "Il file"} supera il limite WhatsApp di ${mb} MB per questo tipo di contenuto.` }
  }
  return { ok: true, kind, mimeType: normalizedMime }
}

export function encodePendingWhatsAppPayload(text: string, media?: StagedWhatsAppMedia | null): string {
  if (!media) return text
  return `${PENDING_MEDIA_PREFIX}${JSON.stringify({ text, media })}`
}

export function decodePendingWhatsAppPayload(value: string): PendingWhatsAppPayload {
  if (!value.startsWith(PENDING_MEDIA_PREFIX)) return { text: value, media: null }
  try {
    const parsed = JSON.parse(value.slice(PENDING_MEDIA_PREFIX.length)) as Partial<PendingWhatsAppPayload>
    const media = parsed.media
    if (
      media &&
      typeof media.path === "string" &&
      typeof media.name === "string" &&
      typeof media.mimeType === "string" &&
      typeof media.size === "number"
    ) {
      return { text: typeof parsed.text === "string" ? parsed.text : "", media }
    }
  } catch {
    // Fall back to the raw text if a legacy/manually edited row looks like our prefix.
  }
  return { text: value, media: null }
}

function accessToken(channel: MessagingChannelRow): string {
  return channel.credentials?.access_token || getPlatformWhatsAppConfig().systemUserToken || ""
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function mediaProxyUrl(phoneNumberId: string, mediaId: string): string {
  return `/api/channels/whatsapp/media/${encodeURIComponent(phoneNumberId)}/${encodeURIComponent(mediaId)}`
}

function renderSentMedia(
  phoneNumberId: string,
  mediaId: string,
  kind: WhatsAppOutboundMediaKind,
  name: string,
  caption: string,
): string {
  const src = mediaProxyUrl(phoneNumberId, mediaId)
  const safeCaption = caption.trim() ? `<div style="margin-top:6px;white-space:pre-wrap">${escapeHtml(caption.trim())}</div>` : ""
  if (kind === "image") {
    return `<div data-whatsapp-media="image" style="max-width:560px"><a href="${src}" target="_blank" rel="noopener noreferrer" style="display:inline-block;max-width:100%"><img src="${src}" alt="Foto WhatsApp" loading="lazy" style="display:block;max-width:100%;height:auto;max-height:680px;border-radius:12px;object-fit:contain" /></a>${safeCaption}</div>`
  }
  if (kind === "video") {
    return `<div data-whatsapp-media="video" style="max-width:560px"><video controls preload="metadata" playsinline style="display:block;width:100%;max-height:680px;border-radius:12px;background:#000"><source src="${src}" /></video>${safeCaption}</div>`
  }
  if (kind === "audio") {
    return `<div data-whatsapp-media="audio" style="max-width:560px"><div style="margin-bottom:6px;font-size:13px;color:#5f6368">Messaggio vocale</div><audio controls preload="metadata" style="width:100%"><source src="${src}" /></audio></div>`
  }
  const label = escapeHtml(name || "Documento WhatsApp")
  return `<div data-whatsapp-media="document" style="max-width:560px"><a href="${src}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid #dadce0;border-radius:10px;text-decoration:none">📎 ${label}</a>${safeCaption}</div>`
}

export function expectedOutboundStagingPrefix(propertyId: string, channelId: string): string {
  return `${propertyId}/whatsapp-outbound/${channelId}/`
}

export async function removeStagedWhatsAppMedia(
  supabase: SupabaseClient,
  media: StagedWhatsAppMedia | null | undefined,
): Promise<void> {
  if (!media?.path) return
  await supabase.storage.from(WHATSAPP_OUTBOUND_BUCKET).remove([media.path]).catch(() => undefined)
}

export async function sendStagedWhatsAppMedia(
  supabase: SupabaseClient,
  input: {
    propertyId: string
    channel: MessagingChannelRow
    toPhone: string
    media: StagedWhatsAppMedia
    caption?: string
  },
): Promise<SentWhatsAppMedia> {
  const { channel, media } = input
  const phoneNumberId = channel.config?.phone_number_id
  const token = accessToken(channel)
  if (!phoneNumberId) return { success: false, error: "phone_number_id WhatsApp mancante" }
  if (!token) return { success: false, error: "access_token WhatsApp mancante" }

  const expectedPrefix = expectedOutboundStagingPrefix(input.propertyId, channel.id)
  if (!media.path.startsWith(expectedPrefix)) {
    return { success: false, error: "Allegato WhatsApp non appartenente a questo tenant o canale." }
  }

  const validation = validateWhatsAppOutboundMedia(media.name, media.mimeType, media.size)
  if (!validation.ok) return { success: false, error: validation.error }

  const { data: stored, error: downloadError } = await supabase.storage
    .from(WHATSAPP_OUTBOUND_BUCKET)
    .download(media.path)
  if (downloadError || !stored) {
    return { success: false, error: downloadError?.message || "Allegato WhatsApp non disponibile nello storage." }
  }

  if (stored.size <= 0 || stored.size > media.size + 1024 || stored.size > MAX_BYTES[validation.kind]) {
    return { success: false, error: "Dimensione dell'allegato WhatsApp non coerente o non valida." }
  }

  const version = getGraphVersion(channel.config)
  const uploadUrl = `https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}/media`
  const form = new FormData()
  form.append("messaging_product", "whatsapp")
  form.append("type", validation.mimeType)
  form.append("file", stored, media.name || `media.${validation.kind}`)

  let uploadedMediaId = ""
  try {
    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })
    const uploadJson = await uploadRes.json().catch(() => null)
    if (!uploadRes.ok) {
      return {
        success: false,
        error: uploadJson?.error?.message || `Upload media WhatsApp fallito (HTTP ${uploadRes.status})`,
        outcomeUnknown: false,
      }
    }
    uploadedMediaId = typeof uploadJson?.id === "string" ? uploadJson.id : ""
    if (!uploadedMediaId) return { success: false, error: "Meta non ha restituito il media ID WhatsApp." }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Errore di rete durante l'upload media WhatsApp",
      outcomeUnknown: true,
    }
  }

  const captionAllowed = validation.kind === "image" || validation.kind === "video" || validation.kind === "document"
  const caption = captionAllowed ? (input.caption || "").trim() : ""
  const mediaObject: Record<string, unknown> = { id: uploadedMediaId }
  if (caption) mediaObject.caption = caption
  if (validation.kind === "document" && media.name) mediaObject.filename = media.name

  const messageUrl = `https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}/messages`
  try {
    const res = await fetch(messageUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizeWhatsAppNumber(input.toPhone),
        type: validation.kind,
        [validation.kind]: mediaObject,
      }),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      return {
        success: false,
        error: json?.error?.message || `Invio media WhatsApp fallito (HTTP ${res.status})`,
        outcomeUnknown: false,
      }
    }
    const externalMessageId = typeof json?.messages?.[0]?.id === "string" ? json.messages[0].id : undefined
    return {
      success: true,
      externalMessageId,
      mediaId: uploadedMediaId,
      kind: validation.kind,
      captionConsumed: Boolean(caption),
      contentHtml: renderSentMedia(phoneNumberId, uploadedMediaId, validation.kind, media.name, caption),
    }
  } catch (error) {
    return {
      success: false,
      mediaId: uploadedMediaId,
      kind: validation.kind,
      error: error instanceof Error ? error.message : "Errore di rete durante l'invio media WhatsApp",
      outcomeUnknown: true,
    }
  }
}
