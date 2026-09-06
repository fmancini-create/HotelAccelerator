import type { SupabaseClient } from "@supabase/supabase-js"
import type { InboundWhatsAppMessage } from "./processor"
import type { MessagingChannelRow } from "./types"
import { normalizeWhatsAppNumber, sendWhatsAppTemplate, sendWhatsAppText } from "./client"
import {
  decodePendingWhatsAppPayload,
  encodePendingWhatsAppPayload,
  removeStagedWhatsAppMedia,
  sendStagedWhatsAppMedia,
  type StagedWhatsAppMedia,
} from "./outbound-media"

export const DEFAULT_WHATSAPP_REOPEN_TEMPLATE = "hotelaccelerator_nuova_comunicazione"
export const DEFAULT_WHATSAPP_REOPEN_LANGUAGE = "it"
export const WHATSAPP_REOPEN_REQUEST_TTL_MS = 7 * 24 * 60 * 60 * 1000
/**
 * While a webhook is actively delivering the queued free-form message, Meta
 * retries the same quick-reply event instead of receiving a false success.
 * After this window we no longer know whether the external send completed, so
 * we stop automatic retries and move the row to a manual-review state.
 */
export const WHATSAPP_SENDING_UNCERTAIN_AFTER_MS = 2 * 60 * 1000

const ACCEPT_PREFIX = "HA_WA_OPEN:"
const DECLINE_PREFIX = "HA_WA_DECLINE:"
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type PendingStatus =
  | "awaiting_acceptance"
  | "sending"
  | "sent"
  | "declined"
  | "failed_template"
  | "failed_delivery"
  | "delivery_unknown"
  | "expired"

interface PendingRow {
  id: string
  property_id: string
  conversation_id: string
  contact_id: string | null
  messaging_channel_id: string
  to_phone: string
  body: string
  operator_admin_user_id: string | null
  operator_actor_key: string | null
  operator_label: string
  status: PendingStatus
  template_name: string
  template_language: string
  expires_at: string
  accepted_at: string | null
  sent_message_id: string | null
  updated_at: string
}

export interface QueueReopenInput {
  propertyId: string
  conversationId: string
  contactId?: string | null
  channel: MessagingChannelRow
  toPhone: string
  body: string
  media?: StagedWhatsAppMedia | null
  operatorAdminUserId?: string | null
  operatorActorKey?: string | null
  operatorLabel: string
}

export type QueueReopenResult =
  | { ok: true; pendingId: string; templateMessageId?: string }
  | { ok: false; error: string; code: "ALREADY_PENDING" | "TEMPLATE_SEND_FAILED" }

function templateName(channel: MessagingChannelRow): string {
  const configured = (channel.config as Record<string, unknown> | null)?.reopen_template_name
  return typeof configured === "string" && configured.trim()
    ? configured.trim()
    : DEFAULT_WHATSAPP_REOPEN_TEMPLATE
}

function templateLanguage(channel: MessagingChannelRow): string {
  const configured = (channel.config as Record<string, unknown> | null)?.reopen_template_language
  return typeof configured === "string" && configured.trim()
    ? configured.trim()
    : DEFAULT_WHATSAPP_REOPEN_LANGUAGE
}

export function isWhatsAppSendingAttemptStale(
  updatedAt: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!updatedAt) return true
  const startedAt = new Date(updatedAt).getTime()
  if (!Number.isFinite(startedAt)) return true
  return nowMs - startedAt >= WHATSAPP_SENDING_UNCERTAIN_AFTER_MS
}

/**
 * Persist the operator message before contacting Meta. If Meta rejects or is
 * temporarily unavailable the payload is not lost and the failure is auditable.
 * Media payloads are encoded inside the existing text column so the feature does
 * not require a schema migration and legacy text-only rows keep working.
 */
export async function queueWhatsAppReopen(
  supabase: SupabaseClient,
  input: QueueReopenInput,
): Promise<QueueReopenResult> {
  const phone = normalizeWhatsAppNumber(input.toPhone)
  const activeStatuses: PendingStatus[] = ["awaiting_acceptance", "sending", "failed_delivery"]

  const { data: existing } = await supabase
    .from("whatsapp_pending_messages")
    .select("id")
    .eq("property_id", input.propertyId)
    .eq("conversation_id", input.conversationId)
    .in("status", activeStatuses)
    .limit(1)
    .maybeSingle()

  if (existing?.id) {
    return {
      ok: false,
      code: "ALREADY_PENDING",
      error: "Esiste già una comunicazione WhatsApp in attesa di accettazione per questo contatto.",
    }
  }

  const name = templateName(input.channel)
  const language = templateLanguage(input.channel)
  const expiresAt = new Date(Date.now() + WHATSAPP_REOPEN_REQUEST_TTL_MS).toISOString()
  const persistedBody = encodePendingWhatsAppPayload(input.body, input.media)

  const { data: pending, error: insertError } = await supabase
    .from("whatsapp_pending_messages")
    .insert({
      property_id: input.propertyId,
      conversation_id: input.conversationId,
      contact_id: input.contactId ?? null,
      messaging_channel_id: input.channel.id,
      to_phone: phone,
      body: persistedBody,
      operator_admin_user_id: input.operatorAdminUserId ?? null,
      operator_actor_key: input.operatorActorKey ?? null,
      operator_label: input.operatorLabel,
      status: "awaiting_acceptance",
      template_name: name,
      template_language: language,
      expires_at: expiresAt,
    })
    .select("id")
    .single()

  if (insertError || !pending?.id) {
    if (insertError?.code === "23505") {
      return {
        ok: false,
        code: "ALREADY_PENDING",
        error: "Esiste già una comunicazione WhatsApp in attesa di accettazione per questo contatto.",
      }
    }
    throw insertError ?? new Error("Impossibile creare la comunicazione WhatsApp in attesa")
  }

  const { data: property } = await supabase
    .from("properties")
    .select("name")
    .eq("id", input.propertyId)
    .maybeSingle()
  const companyName = property?.name?.trim() || "La struttura"

  const sent = await sendWhatsAppTemplate(input.channel.config, input.channel.credentials, phone, {
    name,
    language,
    bodyParameters: [companyName],
    quickReplies: [
      { index: 0, payload: `${ACCEPT_PREFIX}${pending.id}` },
      { index: 1, payload: `${DECLINE_PREFIX}${pending.id}` },
    ],
  })

  if (!sent.success) {
    await supabase
      .from("whatsapp_pending_messages")
      .update({
        status: "failed_template",
        last_error: sent.error ?? "Errore invio template WhatsApp",
        updated_at: new Date().toISOString(),
      })
      .eq("id", pending.id)
      .eq("property_id", input.propertyId)

    return {
      ok: false,
      code: "TEMPLATE_SEND_FAILED",
      error: sent.error ?? "Il template WhatsApp non è stato inviato.",
    }
  }

  await supabase
    .from("whatsapp_pending_messages")
    .update({ template_message_id: sent.externalMessageId ?? null, last_error: null, updated_at: new Date().toISOString() })
    .eq("id", pending.id)
    .eq("property_id", input.propertyId)

  await supabase
    .from("messaging_channels")
    .update({ last_outbound_at: new Date().toISOString(), last_error: null })
    .eq("id", input.channel.id)
    .eq("property_id", input.propertyId)

  return { ok: true, pendingId: pending.id, templateMessageId: sent.externalMessageId }
}

export type ReopenAction = { action: "accept" | "decline"; pendingId: string }

/** Extract our opaque quick-reply payload without trusting the visible label. */
export function parseWhatsAppReopenAction(msg: InboundWhatsAppMessage): ReopenAction | null {
  const raw = msg.raw as any
  const payload = raw?.button?.payload ?? raw?.interactive?.button_reply?.id
  if (typeof payload !== "string") return null

  if (payload.startsWith(ACCEPT_PREFIX)) {
    const pendingId = payload.slice(ACCEPT_PREFIX.length)
    return UUID_RE.test(pendingId) ? { action: "accept", pendingId } : null
  }
  if (payload.startsWith(DECLINE_PREFIX)) {
    const pendingId = payload.slice(DECLINE_PREFIX.length)
    return UUID_RE.test(pendingId) ? { action: "decline", pendingId } : null
  }
  return null
}

export interface HandleReopenResult {
  handled: boolean
  delivered?: boolean
  requiresRetry?: boolean
  error?: string
}

/**
 * Handle the template quick reply idempotently. This runs after the inbound
 * button message is persisted, therefore an accepted click has already opened
 * the customer's 24h care window. We skip autopilot for these control messages.
 */
export async function handleWhatsAppReopenAction(
  supabase: SupabaseClient,
  msg: InboundWhatsAppMessage,
  channel: MessagingChannelRow,
  propertyId: string,
): Promise<HandleReopenResult> {
  const action = parseWhatsAppReopenAction(msg)
  if (!action) return { handled: false }

  const { data } = await supabase
    .from("whatsapp_pending_messages")
    .select("*")
    .eq("id", action.pendingId)
    .eq("property_id", propertyId)
    .eq("messaging_channel_id", channel.id)
    .maybeSingle()

  const pending = data as PendingRow | null
  if (!pending) return { handled: true }
  const pendingPayload = decodePendingWhatsAppPayload(pending.body)

  // A copied/stale payload must never authorize sending to another number.
  if (normalizeWhatsAppNumber(msg.fromPhone) !== normalizeWhatsAppNumber(pending.to_phone)) {
    return { handled: true, error: "Numero WhatsApp non coerente con la richiesta in attesa" }
  }

  const now = new Date()
  if (new Date(pending.expires_at).getTime() <= now.getTime()) {
    if (!["sent", "declined", "expired", "delivery_unknown"].includes(pending.status)) {
      await supabase
        .from("whatsapp_pending_messages")
        .update({ status: "expired", updated_at: now.toISOString() })
        .eq("id", pending.id)
        .eq("property_id", propertyId)
    }
    if (pendingPayload.media) await removeStagedWhatsAppMedia(supabase, pendingPayload.media)
    return { handled: true }
  }

  if (action.action === "decline") {
    if (pending.status !== "sent") {
      await supabase
        .from("whatsapp_pending_messages")
        .update({ status: "declined", declined_at: now.toISOString(), last_error: null, updated_at: now.toISOString() })
        .eq("id", pending.id)
        .eq("property_id", propertyId)
        .neq("status", "sent")
    }
    if (pendingPayload.media) await removeStagedWhatsAppMedia(supabase, pendingPayload.media)
    return { handled: true, delivered: false }
  }

  if (pending.status === "sent") return { handled: true, delivered: true }
  if (
    pending.status === "declined" ||
    pending.status === "expired" ||
    pending.status === "failed_template" ||
    pending.status === "delivery_unknown"
  ) {
    return { handled: true, delivered: false, error: pending.status === "delivery_unknown" ? "Esito consegna da verificare manualmente" : undefined }
  }

  // If a previous invocation died after claiming the row, replying 200 here
  // would strand it forever. While the attempt is fresh we ask Meta to retry
  // the webhook, but we NEVER issue a second send. Once it is stale the real
  // external outcome is unknowable, so it becomes terminal/manual-review.
  if (pending.status === "sending") {
    if (!isWhatsAppSendingAttemptStale(pending.updated_at, now.getTime())) {
      return { handled: true, requiresRetry: true, error: "Consegna WhatsApp ancora in corso" }
    }

    const unknownMessage =
      "Esito consegna WhatsApp incerto: nessun reinvio automatico per evitare duplicati. Verificare la conversazione prima di ritentare."
    await supabase
      .from("whatsapp_pending_messages")
      .update({ status: "delivery_unknown", last_error: unknownMessage, updated_at: now.toISOString() })
      .eq("id", pending.id)
      .eq("property_id", propertyId)
      .eq("status", "sending")
    return { handled: true, delivered: false, error: unknownMessage }
  }

  const { data: claimed, error: claimError } = await supabase
    .from("whatsapp_pending_messages")
    .update({
      status: "sending",
      accepted_at: pending.accepted_at ?? now.toISOString(),
      last_error: null,
      updated_at: now.toISOString(),
    })
    .eq("id", pending.id)
    .eq("property_id", propertyId)
    .in("status", ["awaiting_acceptance", "failed_delivery"])
    .select("id")
    .maybeSingle()

  if (claimError) return { handled: true, requiresRetry: true, error: claimError.message }
  if (!claimed?.id) return { handled: true, requiresRetry: true, error: "Consegna già presa in carico" }

  const sentAt = new Date().toISOString()
  const timelineRows: Array<Record<string, unknown>> = []
  let sentMessageId: string | null = null
  let deliveryWarning = ""

  if (pendingPayload.media) {
    const sentMedia = await sendStagedWhatsAppMedia(supabase, {
      propertyId,
      channel,
      toPhone: pending.to_phone,
      media: pendingPayload.media,
      caption: pendingPayload.text,
    })

    if (!sentMedia.success) {
      const outcomeUnknown = sentMedia.outcomeUnknown === true
      const message = outcomeUnknown
        ? `Esito consegna media WhatsApp incerto: ${sentMedia.error ?? "errore di rete"}. Nessun reinvio automatico.`
        : sentMedia.error ?? "Errore consegna media WhatsApp"

      await supabase
        .from("whatsapp_pending_messages")
        .update({
          status: outcomeUnknown ? "delivery_unknown" : "failed_delivery",
          last_error: message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", pending.id)
        .eq("property_id", propertyId)

      return {
        handled: true,
        requiresRetry: !outcomeUnknown,
        delivered: false,
        error: message,
      }
    }

    sentMessageId = sentMedia.externalMessageId ?? null
    timelineRows.push({
      property_id: propertyId,
      conversation_id: pending.conversation_id,
      sender_type: "agent",
      sender_id: pending.operator_admin_user_id,
      sender_name: pending.operator_label,
      content: sentMedia.contentHtml || `[${sentMedia.kind || "media"}] ${pendingPayload.media.name}`,
      content_type: "text/html",
      external_message_id: sentMedia.externalMessageId ?? null,
      status: "sent",
      stored_at: sentAt,
      metadata: {
        channel: "whatsapp",
        source: "whatsapp_reopen_queue",
        pending_message_id: pending.id,
        wa_message_type: sentMedia.kind,
        whatsapp_media_id: sentMedia.mediaId,
        filename: pendingPayload.media.name,
      },
    })

    if (pendingPayload.text && !sentMedia.captionConsumed) {
      const sentText = await sendWhatsAppText(channel.config, channel.credentials, pending.to_phone, pendingPayload.text)
      if (sentText.success) {
        sentMessageId = sentText.externalMessageId ?? sentMessageId
        timelineRows.push({
          property_id: propertyId,
          conversation_id: pending.conversation_id,
          sender_type: "agent",
          sender_id: pending.operator_admin_user_id,
          sender_name: pending.operator_label,
          content: pendingPayload.text,
          content_type: "text",
          external_message_id: sentText.externalMessageId ?? null,
          status: "sent",
          stored_at: sentAt,
          metadata: {
            channel: "whatsapp",
            source: "whatsapp_reopen_queue",
            pending_message_id: pending.id,
          },
        })
      } else {
        // The media is already externally delivered. Retrying the whole pending
        // request would duplicate it, so finish as sent and surface the text failure.
        deliveryWarning = `Media consegnato; testo aggiuntivo non inviato: ${sentText.error ?? "errore WhatsApp"}`
      }
    }
  } else {
    const sent = await sendWhatsAppText(channel.config, channel.credentials, pending.to_phone, pendingPayload.text)
    if (!sent.success) {
      const outcomeUnknown = sent.outcomeUnknown === true
      const message = outcomeUnknown
        ? `Esito consegna WhatsApp incerto: ${sent.error ?? "errore di rete"}. Nessun reinvio automatico.`
        : sent.error ?? "Errore consegna WhatsApp"

      await supabase
        .from("whatsapp_pending_messages")
        .update({
          status: outcomeUnknown ? "delivery_unknown" : "failed_delivery",
          last_error: message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", pending.id)
        .eq("property_id", propertyId)

      return {
        handled: true,
        requiresRetry: !outcomeUnknown,
        delivered: false,
        error: message,
      }
    }

    sentMessageId = sent.externalMessageId ?? null
    timelineRows.push({
      property_id: propertyId,
      conversation_id: pending.conversation_id,
      sender_type: "agent",
      sender_id: pending.operator_admin_user_id,
      sender_name: pending.operator_label,
      content: pendingPayload.text,
      content_type: "text",
      external_message_id: sent.externalMessageId ?? null,
      status: "sent",
      stored_at: sentAt,
      metadata: {
        channel: "whatsapp",
        source: "whatsapp_reopen_queue",
        pending_message_id: pending.id,
      },
    })
  }

  // Mark external delivery first. If timeline persistence fails later we must
  // prefer one missing local row over sending the guest the same payload twice.
  await supabase
    .from("whatsapp_pending_messages")
    .update({
      status: "sent",
      sent_message_id: sentMessageId,
      sent_at: sentAt,
      last_error: deliveryWarning || null,
      updated_at: sentAt,
    })
    .eq("id", pending.id)
    .eq("property_id", propertyId)

  const { error: timelineError } = await supabase.from("messages").insert(timelineRows)

  if (timelineError) {
    await supabase
      .from("whatsapp_pending_messages")
      .update({
        last_error: deliveryWarning
          ? `${deliveryWarning}; timeline non salvata: ${timelineError.message}`
          : `Consegnato a Meta ma timeline non salvata: ${timelineError.message}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", pending.id)
      .eq("property_id", propertyId)
  }

  if (pendingPayload.media) await removeStagedWhatsAppMedia(supabase, pendingPayload.media)

  await supabase
    .from("messages")
    .update({ status: "replied" })
    .eq("property_id", propertyId)
    .eq("conversation_id", pending.conversation_id)
    .eq("sender_type", "customer")
    .in("status", ["received", "read"])

  await supabase
    .from("conversations")
    .update({ last_message_at: sentAt, status: "open", updated_at: sentAt })
    .eq("id", pending.conversation_id)
    .eq("property_id", propertyId)

  await supabase
    .from("messaging_channels")
    .update({ last_outbound_at: sentAt, last_error: deliveryWarning || null })
    .eq("id", channel.id)
    .eq("property_id", propertyId)

  const error = [deliveryWarning, timelineError?.message].filter(Boolean).join("; ") || undefined
  return { handled: true, delivered: true, error }
}
