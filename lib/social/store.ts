import { createServiceClient } from "@/lib/supabase/server"
import { encryptSocialCredentialsForWrite } from "@/lib/social/channel-secrets"
import type { SocialChannelType, SocialProvider } from "@/lib/social/providers"

export interface SocialAccountInput {
  provider: SocialProvider
  channelType: SocialChannelType
  externalAccountId: string
  displayName: string
  config?: Record<string, unknown>
  credentials: Record<string, unknown>
}

export async function upsertSocialAccount(propertyId: string, input: SocialAccountInput) {
  const supabase = createServiceClient()
  const { data: existingRows, error: existingError } = await supabase
    .from("messaging_channels")
    .select("id, config, credentials")
    .eq("property_id", propertyId)
    .eq("channel_type", input.channelType)
  if (existingError) throw existingError

  const existing = (existingRows || []).find(
    (row: { config?: Record<string, unknown> }) => String(row.config?.external_account_id || "") === input.externalAccountId,
  )

  const config = {
    ...(existing?.config || {}),
    ...(input.config || {}),
    provider: input.provider,
    external_account_id: input.externalAccountId,
  }
  const credentials = {
    ...(existing?.credentials || {}),
    ...encryptSocialCredentialsForWrite(input.credentials),
  }
  const payload = {
    property_id: propertyId,
    channel_type: input.channelType,
    display_name: input.displayName,
    config,
    credentials,
    is_active: true,
    last_error: null,
    updated_at: new Date().toISOString(),
  }

  if (existing?.id) {
    const { data, error } = await supabase
      .from("messaging_channels")
      .update(payload)
      .eq("id", existing.id)
      .eq("property_id", propertyId)
      .select("id, channel_type, display_name, config, is_active, updated_at")
      .single()
    if (error) throw error
    return data
  }

  const { data, error } = await supabase
    .from("messaging_channels")
    .insert(payload)
    .select("id, channel_type, display_name, config, is_active, updated_at")
    .single()
  if (error) throw error
  return data
}
