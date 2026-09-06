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

async function sendTelegramMultipart(
  credentials: TelegramCredentials,
  chatId: string,
  method: "sendDocument" | "sendAudio" | "sendVoice" | "sendVideo",
  field: "document" | "audio" | "voice" | "video",
  file: File,
  caption?: string,
): Promise<SendTextResult> {
  const token = credentials.bot_token
  if (!token) return { success: false, error: "bot_token mancante nelle credenziali del canale" }

  try {
    const form = new FormData()
    form.append("chat_id", chatId)
    form.append(field, file, file.name || field)
    if (caption?.trim()) form.append("caption", caption.trim().slice(0, 1024))
    if (method === "sendVideo") form.append("supports_streaming", "true")

    const res = await fetch(apiUrl(token, method), { method: "POST", body: form })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.ok) {
      return { success: false, error: json?.description || `Telegram API error (HTTP ${res.status})` }
    }
    return {
      success: true,
      externalMessageId: json?.result?.message_id != null ? String(json.result.message_id) : undefined,
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Errore di rete verso Telegram" }
  }
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
  if (!token) return { success: false, error: "bot_token mancante nelle credenziali del canale" }

  try {
    const res = await fetch(apiUrl(token, "sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.ok) {
      return { success: false, error: json?.description || `Telegram API error (HTTP ${res.status})` }
    }
    return {
      success: true,
      externalMessageId: json?.result?.message_id != null ? String(json.result.message_id) : undefined,
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Errore di rete verso Telegram" }
  }
}

/** Send a local document through Telegram Bot API. */
export async function sendTelegramDocument(
  credentials: TelegramCredentials,
  chatId: string,
  file: File,
  caption?: string,
): Promise<SendTextResult> {
  return sendTelegramMultipart(credentials, chatId, "sendDocument", "document", file, caption)
}

/** Send MP3/M4A-compatible audio as a native Telegram audio player. */
export async function sendTelegramAudio(
  credentials: TelegramCredentials,
  chatId: string,
  file: File,
  caption?: string,
): Promise<SendTextResult> {
  return sendTelegramMultipart(credentials, chatId, "sendAudio", "audio", file, caption)
}

/** Send OGG/Opus-style audio as a Telegram voice message. */
export async function sendTelegramVoice(
  credentials: TelegramCredentials,
  chatId: string,
  file: File,
  caption?: string,
): Promise<SendTextResult> {
  return sendTelegramMultipart(credentials, chatId, "sendVoice", "voice", file, caption)
}

/** Send MP4 video as a native, streamable Telegram video. */
export async function sendTelegramVideo(
  credentials: TelegramCredentials,
  chatId: string,
  file: File,
  caption?: string,
): Promise<SendTextResult> {
  return sendTelegramMultipart(credentials, chatId, "sendVideo", "video", file, caption)
}

export interface GetMeResult {
  success: boolean
  botId?: string
  username?: string
  firstName?: string
  error?: string
}

export async function getTelegramMe(botToken: string): Promise<GetMeResult> {
  if (!botToken) return { success: false, error: "Token mancante" }
  try {
    const res = await fetch(apiUrl(botToken, "getMe"), { method: "GET" })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.ok) return { success: false, error: json?.description || `HTTP ${res.status}` }
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
    if (!res.ok || !json?.ok) return { success: false, error: json?.description || `HTTP ${res.status}` }
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

export async function getTelegramWebhookInfo(botToken: string): Promise<WebhookInfoResult> {
  if (!botToken) return { success: false, error: "Token mancante" }
  try {
    const res = await fetch(apiUrl(botToken, "getWebhookInfo"), { method: "GET" })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.ok) return { success: false, error: json?.description || `HTTP ${res.status}` }
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

export async function deleteTelegramWebhook(botToken: string): Promise<SetWebhookResult> {
  if (!botToken) return { success: false, error: "Token mancante" }
  try {
    const res = await fetch(apiUrl(botToken, "deleteWebhook"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drop_pending_updates: false }),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.ok) return { success: false, error: json?.description || `HTTP ${res.status}` }
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Errore di rete" }
  }
}
