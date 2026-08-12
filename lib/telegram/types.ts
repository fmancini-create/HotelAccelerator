/**
 * Telegram Bot API types and per-tenant channel shape.
 *
 * Like WhatsApp, Telegram credentials are stored PER-TENANT in
 * `messaging_channels` (never global env vars) so the platform stays
 * multitenant. Each tenant registers its own bot.
 *
 *  config (non-secret, queryable):
 *    - bot_id        : numeric Telegram bot id (from getMe) — routing/display
 *    - bot_username  : @username of the bot (for display + deep links)
 *    - autopilot_enabled : when true, the bot answers with rule-based commands
 *
 *  credentials (secret, encrypted at-rest):
 *    - bot_token      : the BotFather token used to call the Bot API
 *    - webhook_secret : random token echoed by Telegram in the
 *                       X-Telegram-Bot-Api-Secret-Token header for verification
 */

export interface TelegramConfig {
  bot_id?: string
  bot_username?: string
  autopilot_enabled?: boolean
}

export interface TelegramCredentials {
  bot_token?: string
  webhook_secret?: string
}

export interface TelegramChannelRow {
  id: string
  property_id: string
  channel_type: "whatsapp" | "telegram" | "messenger" | "instagram"
  display_name: string | null
  config: TelegramConfig & Record<string, unknown>
  credentials: TelegramCredentials & Record<string, unknown>
  is_active: boolean
  is_default: boolean
  last_inbound_at: string | null
  last_outbound_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

/**
 * Mask a secret for safe display in the UI/API: keep only the last 4 chars.
 */
export function maskSecret(value: string | null | undefined): string {
  if (!value) return ""
  const v = String(value)
  if (v.length <= 4) return "••••"
  return "••••••••" + v.slice(-4)
}
