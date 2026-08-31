import { getGraphVersion, type WhatsAppConfig, type WhatsAppCredentials } from "./types"
import { getPlatformWhatsAppConfig } from "./platform"

/**
 * Resolve the access token to use for an outbound call: prefer the per-tenant
 * token (manual/advanced setup) and fall back to the platform system-user token
 * (Embedded Signup tenants share the single Meta app token).
 */
function resolveAccessToken(credentials: WhatsAppCredentials): string {
  return credentials.access_token || getPlatformWhatsAppConfig().systemUserToken || ""
}

export interface SendTextResult {
  success: boolean
  externalMessageId?: string
  error?: string
  /** True only when the network failed before we could learn Meta's outcome. */
  outcomeUnknown?: boolean
}

export interface WhatsAppTemplateQuickReply {
  /** Zero-based button index in the approved Meta template. */
  index: number
  /** Opaque value returned by Meta when the customer taps this quick reply. */
  payload: string
}

export interface SendTemplateOptions {
  name: string
  language: string
  /** Text values for BODY placeholders {{1}}, {{2}}, ... in order. */
  bodyParameters?: string[]
  quickReplies?: WhatsAppTemplateQuickReply[]
}

/**
 * Send a free-form text message via the WhatsApp Cloud API.
 *
 * IMPORTANT: this low-level client does not decide whether the 24h customer
 * care window is open. Every operator-facing caller must check the exact
 * conversation window before calling it. Webhook/autopilot callers are allowed
 * because they execute immediately after an inbound customer message.
 */
export async function sendWhatsAppText(
  config: WhatsAppConfig,
  credentials: WhatsAppCredentials,
  toPhone: string,
  text: string,
): Promise<SendTextResult> {
  const phoneNumberId = config.phone_number_id
  const accessToken = resolveAccessToken(credentials)

  if (!phoneNumberId) {
    return { success: false, error: "phone_number_id mancante nella configurazione del canale" }
  }
  if (!accessToken) {
    return { success: false, error: "access_token mancante nelle credenziali del canale" }
  }

  const version = getGraphVersion(config)
  const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`
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
      const apiError = json?.error?.message || `WhatsApp API error (HTTP ${res.status})`
      // Meta answered explicitly: the request was not accepted as successful,
      // therefore a controlled retry can be considered by the caller.
      return { success: false, error: apiError, outcomeUnknown: false }
    }

    const externalMessageId: string | undefined = json?.messages?.[0]?.id
    return { success: true, externalMessageId }
  } catch (e) {
    // A transport failure is different from an HTTP rejection: Meta may have
    // accepted the message before the connection broke. Automatic resend could
    // therefore duplicate a guest message, so callers must treat this outcome
    // as unknown rather than retrying blindly.
    return {
      success: false,
      error: e instanceof Error ? e.message : "Errore di rete verso WhatsApp",
      outcomeUnknown: true,
    }
  }
}

/**
 * Send an approved WhatsApp message template. Used when the business needs to
 * reopen a conversation outside the 24h customer-care window.
 */
export async function sendWhatsAppTemplate(
  config: WhatsAppConfig,
  credentials: WhatsAppCredentials,
  toPhone: string,
  template: SendTemplateOptions,
): Promise<SendTextResult> {
  const phoneNumberId = config.phone_number_id
  const accessToken = resolveAccessToken(credentials)

  if (!phoneNumberId) {
    return { success: false, error: "phone_number_id mancante nella configurazione del canale" }
  }
  if (!accessToken) {
    return { success: false, error: "access_token mancante nelle credenziali del canale" }
  }
  if (!template.name?.trim()) {
    return { success: false, error: "Nome template WhatsApp mancante" }
  }

  const version = getGraphVersion(config)
  const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`
  const to = normalizeWhatsAppNumber(toPhone)

  const components: Array<Record<string, unknown>> = []
  if (template.bodyParameters?.length) {
    components.push({
      type: "body",
      parameters: template.bodyParameters.map((text) => ({ type: "text", text })),
    })
  }
  for (const reply of template.quickReplies ?? []) {
    components.push({
      type: "button",
      sub_type: "quick_reply",
      index: String(reply.index),
      parameters: [{ type: "payload", payload: reply.payload }],
    })
  }

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
        type: "template",
        template: {
          name: template.name.trim(),
          language: { code: template.language || "it" },
          ...(components.length ? { components } : {}),
        },
      }),
    })

    const json = await res.json().catch(() => null)
    if (!res.ok) {
      const apiError = json?.error?.message || `WhatsApp template API error (HTTP ${res.status})`
      return { success: false, error: apiError, outcomeUnknown: false }
    }

    return { success: true, externalMessageId: json?.messages?.[0]?.id }
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Errore di rete verso WhatsApp",
      outcomeUnknown: true,
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
  const accessToken = resolveAccessToken(credentials)
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
