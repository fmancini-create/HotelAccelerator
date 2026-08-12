import type { TelegramCredentials } from "./types"

/**
 * Thin wrapper around the Telegram Bot API. All calls are POST to
 * https://api.telegram.org/bot<token>/<method>. The bot token is per-tenant.
 */

const API_BASE = "https://api.telegram.org"

export interface SendTextResult {
  success: boolean
  externalMessageId?: string
  error?: string
}

function apiUrl(token: string, method: string): string {
  return `${API_BASE}/bot${token}/${method}`
}

/**
 * Send a free-form text message to a Telegram chat. Unlike WhatsApp, Telegram
 * has no 24h session window — a bot can message any chat that has started it.
 */
export async function sendTelegramText(
  credentials: TelegramCredentials,
  chatId: string,
  text: string,
): Promise<SendTextResult> {
  const token = credentials.bot_token
  if (!token) {
    return { success: false, error: "bot_token mancante nelle credenziali del canale" }
  }

  try {
    const res = await fetch(apiUrl(token, "sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        // Telegram rejects unbalanced markdown; keep it plain for safety.
        disable_web_page_preview: true,
      }),
    })

    const json = await res.json().catch(() => null)

    if (!res.ok || !json?.ok) {
      const apiError = json?.description || `Telegram API error (HTTP ${res.status})`
      return { success: false, error: apiError }
    }

    const externalMessageId =
      json?.result?.message_id != null ? String(json.result.message_id) : undefined
    return { success: true, externalMessageId }
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Errore di rete verso Telegram",
    }
  }
}

export interface GetMeResult {
  success: boolean
  botId?: string
  username?: string
  firstName?: string
  error?: string
}

/**
 * Validate a bot token and fetch the bot's identity (id, username). Used at
 * connect time to confirm the token works before we persist it.
 */
export async function getTelegramMe(botToken: string): Promise<GetMeResult> {
  if (!botToken) return { success: false, error: "Token mancante" }
  try {
    const res = await fetch(apiUrl(botToken, "getMe"), { method: "GET" })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.ok) {
      return { success: false, error: json?.description || `HTTP ${res.status}` }
    }
    return {
      success: true,
      botId: json.result?.id != null ? String(json.result.id) : undefined,
      username: json.result?.username,
      firstName: json.result?.first_name,
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Errore di rete" }
  }
}

export interface SetWebhookResult {
  success: boolean
  error?: string
}

/**
 * Register the webhook URL for a bot. Telegram will POST updates to `url` and
 * echo `secretToken` in the X-Telegram-Bot-Api-Secret-Token header so we can
 * verify authenticity without a signature scheme.
 */
export async function setTelegramWebhook(
  botToken: string,
  url: string,
  secretToken: string,
): Promise<SetWebhookResult> {
  if (!botToken) return { success: false, error: "Token mancante" }
  try {
    const res = await fetch(apiUrl(botToken, "setWebhook"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        secret_token: secretToken,
        allowed_updates: ["message", "edited_message"],
        drop_pending_updates: false,
      }),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.ok) {
      return { success: false, error: json?.description || `HTTP ${res.status}` }
    }
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Errore di rete" }
  }
}

export interface WebhookInfoResult {
  success: boolean
  url?: string
  pendingUpdateCount?: number
  lastErrorMessage?: string
  lastErrorDate?: number
  ipAddress?: string
  error?: string
}

/**
 * Ask Telegram what webhook it currently has registered for this bot, plus any
 * delivery errors. This is the ground truth for diagnosing "messages don't
 * arrive": a non-empty `lastErrorMessage` or a `url` on a redirecting host
 * (e.g. non-www) explains silent non-delivery.
 */
export async function getTelegramWebhookInfo(botToken: string): Promise<WebhookInfoResult> {
  if (!botToken) return { success: false, error: "Token mancante" }
  try {
    const res = await fetch(apiUrl(botToken, "getWebhookInfo"), { method: "GET" })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.ok) {
      return { success: false, error: json?.description || `HTTP ${res.status}` }
    }
    const r = json.result || {}
    return {
      success: true,
      url: r.url || "",
      pendingUpdateCount: r.pending_update_count ?? 0,
      lastErrorMessage: r.last_error_message,
      lastErrorDate: r.last_error_date,
      ipAddress: r.ip_address,
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Errore di rete" }
  }
}

/**
 * Remove the webhook for a bot (used on disconnect). Best-effort.
 */
export async function deleteTelegramWebhook(botToken: string): Promise<SetWebhookResult> {
  if (!botToken) return { success: false, error: "Token mancante" }
  try {
    const res = await fetch(apiUrl(botToken, "deleteWebhook"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drop_pending_updates: false }),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.ok) {
      return { success: false, error: json?.description || `HTTP ${res.status}` }
    }
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Errore di rete" }
  }
}
