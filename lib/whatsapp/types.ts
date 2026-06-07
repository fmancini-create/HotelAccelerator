/**
 * WhatsApp Cloud API (Meta) types and credential helpers.
 *
 * Credentials are stored PER-TENANT in `messaging_channels.credentials` /
 * `.config` (never global env vars) so the platform stays multitenant.
 *
 *  config (non-secret):
 *    - phone_number_id       : WhatsApp Business phone number ID (routing key)
 *    - waba_id               : WhatsApp Business Account ID (optional)
 *    - display_phone_number  : human-readable number (e.g. +39 055 ...)
 *    - graph_version         : Graph API version (default v21.0)
 *
 *  credentials (secret):
 *    - access_token          : permanent/system-user token used to SEND
 *    - app_secret            : used to verify X-Hub-Signature-256 on webhooks
 *    - verify_token          : used for the GET webhook handshake
 */

export const WHATSAPP_DEFAULT_GRAPH_VERSION = "v21.0"

export interface WhatsAppConfig {
  phone_number_id?: string
  waba_id?: string
  display_phone_number?: string
  graph_version?: string
}

export interface WhatsAppCredentials {
  access_token?: string
  app_secret?: string
  verify_token?: string
}

export interface MessagingChannelRow {
  id: string
  property_id: string
  channel_type: "whatsapp" | "telegram" | "messenger" | "instagram"
  display_name: string | null
  config: WhatsAppConfig & Record<string, unknown>
  credentials: WhatsAppCredentials & Record<string, unknown>
  is_active: boolean
  is_default: boolean
  last_inbound_at: string | null
  last_outbound_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

export function getGraphVersion(config: WhatsAppConfig | null | undefined): string {
  return config?.graph_version?.trim() || WHATSAPP_DEFAULT_GRAPH_VERSION
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
