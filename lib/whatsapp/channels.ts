import type { SupabaseClient } from "@supabase/supabase-js"
import type { InboundWhatsAppMessage } from "./processor"
import type { MessagingChannelRow } from "./types"

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
  return (data as MessagingChannelRow) ?? null
}

/**
 * Get the active WhatsApp channel for a property (used for outbound sends).
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
    .limit(1)
    .maybeSingle()
  return (data as MessagingChannelRow) ?? null
}

interface ParsedWebhook {
  phoneNumberId: string | null
  messages: InboundWhatsAppMessage[]
  statuses: Array<{ id: string; status: string; recipientId?: string }>
}

/**
 * Parse a Meta WhatsApp webhook body into a flat list of inbound messages and
 * delivery statuses. Tolerant of the nested entry/changes/value shape and of
 * non-text message types (mapped to a readable placeholder).
 */
export function parseWhatsAppWebhook(body: any): ParsedWebhook {
  const result: ParsedWebhook = { phoneNumberId: null, messages: [], statuses: [] }
  if (!body || body.object !== "whatsapp_business_account") return result

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {}
      const phoneNumberId: string | undefined = value.metadata?.phone_number_id
      if (phoneNumberId) result.phoneNumberId = phoneNumberId

      // Map contact wa_id -> profile name for enrichment.
      const nameByWaId = new Map<string, string>()
      for (const c of value.contacts ?? []) {
        if (c?.wa_id) nameByWaId.set(c.wa_id, c?.profile?.name ?? "")
      }

      for (const m of value.messages ?? []) {
        const fromPhone: string = m.from ?? ""
        const tsSeconds = Number(m.timestamp ?? 0)
        result.messages.push({
          externalId: m.id,
          fromPhone,
          fromName: nameByWaId.get(fromPhone) || undefined,
          body: extractBody(m),
          messageType: m.type ?? "unknown",
          timestamp: tsSeconds ? new Date(tsSeconds * 1000) : new Date(),
          raw: m,
        })
      }

      for (const s of value.statuses ?? []) {
        result.statuses.push({ id: s.id, status: s.status, recipientId: s.recipient_id })
      }
    }
  }

  return result
}

function extractBody(m: any): string {
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
    case "image":
      return m.image?.caption ? `[immagine] ${m.image.caption}` : "[immagine]"
    case "video":
      return m.video?.caption ? `[video] ${m.video.caption}` : "[video]"
    case "audio":
      return "[messaggio vocale]"
    case "document":
      return m.document?.filename ? `[documento] ${m.document.filename}` : "[documento]"
    case "location":
      return "[posizione]"
    case "contacts":
      return "[contatto]"
    case "sticker":
      return "[sticker]"
    default:
      return `[messaggio ${m.type ?? "sconosciuto"}]`
  }
}
