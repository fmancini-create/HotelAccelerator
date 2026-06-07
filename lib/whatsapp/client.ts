import { getGraphVersion, type WhatsAppConfig, type WhatsAppCredentials } from "./types"

export interface SendTextResult {
  success: boolean
  externalMessageId?: string
  error?: string
}

/**
 * Send a free-form text message via the WhatsApp Cloud API.
 *
 * NOTE: free-form (session) messages are only deliverable inside the 24h
 * customer-care window (i.e. after the user messaged the business). Outside it,
 * an approved template is required — not handled here (out of scope for v1).
 */
export async function sendWhatsAppText(
  config: WhatsAppConfig,
  credentials: WhatsAppCredentials,
  toPhone: string,
  text: string,
): Promise<SendTextResult> {
  const phoneNumberId = config.phone_number_id
  const accessToken = credentials.access_token

  if (!phoneNumberId) {
    return { success: false, error: "phone_number_id mancante nella configurazione del canale" }
  }
  if (!accessToken) {
    return { success: false, error: "access_token mancante nelle credenziali del canale" }
  }

  const version = getGraphVersion(config)
  const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`

  // WhatsApp expects the recipient as digits only (E.164 without '+').
  const to = normalizeWhatsAppNumber(toPhone)

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { preview_url: false, body: text },
      }),
    })

    const json = await res.json().catch(() => null)

    if (!res.ok) {
      const apiError =
        json?.error?.message || `WhatsApp API error (HTTP ${res.status})`
      return { success: false, error: apiError }
    }

    const externalMessageId: string | undefined = json?.messages?.[0]?.id
    return { success: true, externalMessageId }
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Errore di rete verso WhatsApp",
    }
  }
}

/**
 * Mark an inbound WhatsApp message as read (blue ticks). Best-effort: failures
 * are swallowed because read receipts must never break the inbound pipeline.
 */
export async function markWhatsAppRead(
  config: WhatsAppConfig,
  credentials: WhatsAppCredentials,
  messageId: string,
): Promise<void> {
  const phoneNumberId = config.phone_number_id
  const accessToken = credentials.access_token
  if (!phoneNumberId || !accessToken || !messageId) return

  const version = getGraphVersion(config)
  const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`

  try {
    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
      }),
    })
  } catch {
    // ignore
  }
}

/**
 * Normalize a phone number to WhatsApp's expected format: digits only, no '+',
 * no spaces or punctuation.
 */
export function normalizeWhatsAppNumber(raw: string): string {
  return (raw || "").replace(/[^\d]/g, "")
}
