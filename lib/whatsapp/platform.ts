/**
 * Platform-level WhatsApp configuration (Meta "Tech Provider" / Embedded Signup
 * model).
 *
 * With Embedded Signup, there is ONE Meta App owned by the platform (4Bid).
 * Hotels connect their own WhatsApp number with a single click — they never
 * see tokens or app secrets. The secrets below live in environment variables
 * and are shared across all tenants; per-tenant we only store the resulting
 * `phone_number_id` + `waba_id` in `messaging_channels.config`.
 *
 * Required env (set once by the platform admin after completing Meta Tech
 * Provider onboarding):
 *  - META_APP_ID                 : Meta App ID (also fine as NEXT_PUBLIC_META_APP_ID)
 *  - META_APP_SECRET             : App secret (code exchange + webhook signature)
 *  - META_CONFIG_ID              : Embedded Signup configuration ID
 *  - META_SYSTEM_USER_TOKEN      : permanent system-user token (send + admin)
 *  - META_WEBHOOK_VERIFY_TOKEN   : single verify token for the shared webhook
 *  - META_GRAPH_VERSION          : optional, defaults to v21.0
 */

import { WHATSAPP_DEFAULT_GRAPH_VERSION } from "./types"

export interface PlatformWhatsAppConfig {
  appId: string
  appSecret: string
  configId: string
  systemUserToken: string
  verifyToken: string
  graphVersion: string
  /** True when every secret needed for Embedded Signup is present. */
  isConfigured: boolean
}

export function getPlatformWhatsAppConfig(): PlatformWhatsAppConfig {
  const appId = process.env.META_APP_ID || process.env.NEXT_PUBLIC_META_APP_ID || ""
  const appSecret = process.env.META_APP_SECRET || ""
  const configId = process.env.META_CONFIG_ID || process.env.NEXT_PUBLIC_META_CONFIG_ID || ""
  const systemUserToken = process.env.META_SYSTEM_USER_TOKEN || ""
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN || ""
  const graphVersion = process.env.META_GRAPH_VERSION || WHATSAPP_DEFAULT_GRAPH_VERSION

  const isConfigured = Boolean(appId && appSecret && configId && systemUserToken && verifyToken)

  return { appId, appSecret, configId, systemUserToken, verifyToken, graphVersion, isConfigured }
}

/**
 * Public (non-secret) subset safe to expose to the browser so the Embedded
 * Signup widget can boot. App ID and Config ID are visible in the client flow
 * by design.
 */
export function getPublicWhatsAppConfig(): {
  appId: string
  configId: string
  graphVersion: string
  configured: boolean
} {
  const c = getPlatformWhatsAppConfig()
  return { appId: c.appId, configId: c.configId, graphVersion: c.graphVersion, configured: c.isConfigured }
}
