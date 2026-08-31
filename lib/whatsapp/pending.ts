import type { SupabaseClient } from "@supabase/supabase-js"
import type { InboundWhatsAppMessage } from "./processor"
import type { MessagingChannelRow } from "./types"
import { normalizeWhatsAppNumber, sendWhatsAppTemplate, sendWhatsAppText } from "./client"

export const DEFAULT_WHATSAPP_REOPEN_TEMPLATE = "hotelaccelerator_nuova_comunicazione"
export const DEFAULT_WHATSAPP_REOPEN_LANGUAGE = "it"
export const WHATSAPP_REOPEN_REQUEST_TTL_MS = 7 * 24 * 60 * 60 * 1000

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
}

export interface QueueReopenInput {
  propertyId: string
  conversationId: string
  contactId?: string | null
  channel: MessagingChannelRow
  toPhone: string
  body: string
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

/**
 * Persist the operator message before contacting Meta. If Meta rejects or is
 * temporarily unavailable the text is not lost and the failure is auditable.
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

  const { data: pending, error: insertError } = await supabase
    .from("whatsapp_pending_messages")
    .insert({
      property_id: input.propertyId,
      conversation_id: input.conversationId,
      contact_id: input.contactId ?? null,
      messaging_channel_id: input.channel.id,
      to_phone: phone,
      body: input.body,
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

  // A copied/stale payload must never authorize sending to another number.
  if (normalizeWhatsAppNumber(msg.fromPhone) !== normalizeWhatsAppNumber(pending.to_phone)) {
    return { handled: true, error: "Numero WhatsApp non coerente con la richiesta in attesa" }
  }

  const now = new Date()
  if (new Date(pending.expires_at).getTime() <= now.getTime()) {
    if (!["sent", "declined", "expired"].includes(pending.status)) {
      await supabase
        .from("whatsapp_pending_messages")
        .update({ status: "expired", updated_at: now.toISOString() })
        .eq("id", pending.id)
        .eq("property_id", propertyId)
    }
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
    return { handled: true, delivered: false }
  }

  if (pending.status === "sent") return { handled: true, delivered: true }
  if (pending.status === "declined" || pending.status === "expired" || pending.status === "failed_template") {
    return { handled: true, delivered: false }
  }

  // Claim before the external call. A concurrent/retried webhook sees `sending`
  // and cannot emit the business message a second time.
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
  if (!claimed?.id) return { handled: true }

  const sent = await sendWhatsAppText(channel.config, channel.credentials, pending.to_phone, pending.body)
  if (!sent.success) {
    await supabase
      .from("whatsapp_pending_messages")
      .update({
        status: "failed_delivery",
        last_error: sent.error ?? "Errore consegna WhatsApp",
        updated_at: new Date().toISOString(),
      })
      .eq("id", pending.id)
      .eq("property_id", propertyId)
    return { handled: true, requiresRetry: true, error: sent.error }
  }

  // Mark external delivery first. If timeline persistence fails later we must
  // prefer one missing local row over sending the guest the same text twice.
  const sentAt = new Date().toISOString()
  await supabase
    .from("whatsapp_pending_messages")
    .update({
      status: "sent",
      sent_message_id: sent.externalMessageId ?? null,
      sent_at: sentAt,
      last_error: null,
      updated_at: sentAt,
    })
    .eq("id", pending.id)
    .eq("property_id", propertyId)

  const { error: timelineError } = await supabase.from("messages").insert({
    property_id: propertyId,
    conversation_id: pending.conversation_id,
    sender_type: "agent",
    sender_id: pending.operator_admin_user_id,
    sender_name: pending.operator_label,
    content: pending.body,
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

  if (timelineError) {
    await supabase
      .from("whatsapp_pending_messages")
      .update({ last_error: `Consegnato a Meta ma timeline non salvata: ${timelineError.message}`, updated_at: new Date().toISOString() })
      .eq("id", pending.id)
      .eq("property_id", propertyId)
  }

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
    .update({ last_outbound_at: sentAt, last_error: null })
    .eq("id", channel.id)
    .eq("property_id", propertyId)

  return { handled: true, delivered: true, error: timelineError?.message }
}
