export const ADVERTISING_PROVIDERS = ["google", "meta", "tiktok"] as const
export type AdvertisingProvider = (typeof ADVERTISING_PROVIDERS)[number]

export type AdvertisingConnectionMode = "own_account" | "managed_4bid"
export type AdvertisingManagementMode = "observe" | "assist" | "autopilot"
export type AdvertisingCampaignOrigin = "imported" | "hotelaccelerator"

export interface AdvertisingAccount {
  id: string
  property_id: string
  provider: AdvertisingProvider
  external_account_id: string
  name: string
  currency: string | null
  timezone: string | null
  status: "connected" | "disconnected" | "error"
  connection_mode: AdvertisingConnectionMode
  last_synced_at: string | null
  last_error: string | null
  metadata: Record<string, unknown>
}

export interface AdvertisingCampaign {
  id: string
  property_id: string
  advertising_account_id: string
  provider: AdvertisingProvider
  external_campaign_id: string
  name: string
  status: string
  objective: string | null
  origin: AdvertisingCampaignOrigin
  management_mode: AdvertisingManagementMode
  budget_amount: number | null
  budget_period: "daily" | "lifetime" | "total" | null
  currency: string | null
  starts_at: string | null
  ends_at: string | null
  imported_at: string
  last_synced_at: string | null
}

export function isAdvertisingProvider(value: string): value is AdvertisingProvider {
  return ADVERTISING_PROVIDERS.includes(value as AdvertisingProvider)
}

export function providerLabel(provider: AdvertisingProvider): string {
  if (provider === "google") return "Google Ads"
  if (provider === "meta") return "Meta Ads"
  return "TikTok Ads"
}
