import type { MessagingChannelRow } from "./types"

export interface WhatsAppRuntimeAccessResult {
  ok: boolean
  wabaId: string
  phoneNumberId: string
  error?: string
}

async function graphJson(url: string, token: string): Promise<{ ok: boolean; json: any }> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  })
  return { ok: res.ok, json: await res.json().catch(() => null) }
}

function graphError(json: any, fallback: string): string {
  return json?.error?.message || json?.message || fallback
}

/**
 * Verifies that the exact credential used at runtime can see the tenant WABA
 * and the exact phone_number_id pinned to this messaging channel.
 *
 * This is deliberately stricter than checking either identifier in isolation:
 * a platform token that can see some WABA must never be considered valid for a
 * different tenant. The pair WABA + phone number is the routing boundary.
 */
export async function validateWhatsAppRuntimeAccess(
  channel: Pick<MessagingChannelRow, "config" | "credentials">,
): Promise<WhatsAppRuntimeAccessResult> {
  const config = (channel.config ?? {}) as Record<string, unknown>
  const credentials = (channel.credentials ?? {}) as Record<string, unknown>
  const wabaId = typeof config.waba_id === "string" ? config.waba_id.trim() : ""
  const phoneNumberId = typeof config.phone_number_id === "string" ? config.phone_number_id.trim() : ""
  const graphVersion = typeof config.graph_version === "string" && config.graph_version.trim()
    ? config.graph_version.trim()
    : "v21.0"
  const token = typeof credentials.access_token === "string" ? credentials.access_token.trim() : ""

  if (!wabaId || !phoneNumberId || !token) {
    return {
      ok: false,
      wabaId,
      phoneNumberId,
      error: "Routing WhatsApp incompleto: WABA, numero o credenziale runtime mancanti.",
    }
  }

  const listUrl = `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name`
  const listed = await graphJson(listUrl, token)
  if (!listed.ok) {
    return {
      ok: false,
      wabaId,
      phoneNumberId,
      error: graphError(listed.json, "La credenziale runtime non può accedere al WABA del tenant."),
    }
  }

  const numbers = Array.isArray(listed.json?.data) ? listed.json.data : []
  const match = numbers.some((row: any) => String(row?.id ?? "") === phoneNumberId)
  if (!match) {
    return {
      ok: false,
      wabaId,
      phoneNumberId,
      error: "La credenziale runtime vede il WABA ma non il numero WhatsApp assegnato a questo tenant.",
    }
  }

  const phoneUrl = `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(phoneNumberId)}?fields=id,display_phone_number,verified_name`
  const phone = await graphJson(phoneUrl, token)
  if (!phone.ok || String(phone.json?.id ?? "") !== phoneNumberId) {
    return {
      ok: false,
      wabaId,
      phoneNumberId,
      error: graphError(phone.json, "La credenziale runtime non può usare il numero WhatsApp del tenant."),
    }
  }

  return { ok: true, wabaId, phoneNumberId }
}
