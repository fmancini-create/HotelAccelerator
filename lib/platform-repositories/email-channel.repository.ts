import type { SupabaseClient } from "@supabase/supabase-js"
import { decryptSecretIfNeeded } from "@/lib/crypto/secrets"
import { encryptChannelSecretsForWrite } from "@/lib/email/channel-secrets"

/**
 * DUAL-READ: decifra i segreti del canale email letti dal DB, tollerando sia
 * valori legacy in chiaro sia valori cifrati `enc:v1:...`. Tocca SOLO i campi
 * segreti presenti nel record; lascia invariato tutto il resto. NON cifra nulla.
 */
function decryptEmailChannelSecrets<T extends Record<string, any> | null | undefined>(channel: T): T {
  if (!channel) return channel
  const result: Record<string, any> = { ...channel }
  for (const key of ["oauth_access_token", "oauth_refresh_token", "smtp_password"]) {
    if (key in result) {
      result[key] = decryptSecretIfNeeded(result[key])
    }
  }
  return result as T
}

export interface EmailChannel {
  id: string
  property_id: string
  email_address: string
  name: string
  display_name: string | null
  provider: "gmail" | "outlook" | "manual" | null
  is_active: boolean
  sync_enabled: boolean
  last_sync_at: string | null
  oauth_access_token: string | null
  oauth_refresh_token: string | null
  oauth_expiry: string | null
  color: string | null
  created_at: string
  updated_at: string
}

export interface EmailChannelAssignment {
  id: string
  channel_id: string
  user_id: string
  assignment_type: "owner" | "member"
  created_at: string
}

export interface CreateChannelInput {
  property_id: string
  email_address: string
  name: string
  display_name: string | null
  is_active: boolean
  provider?: "gmail" | "outlook" | "manual" | null
  oauth_access_token?: string | null
  oauth_refresh_token?: string | null
  oauth_expiry?: string | null
  sync_enabled?: boolean
  color?: string | null
}

export interface UpdateChannelInput {
  email_address?: string
  name?: string
  display_name?: string | null
  is_active?: boolean
  provider?: "gmail" | "outlook" | "manual" | null
  oauth_access_token?: string | null
  oauth_refresh_token?: string | null
  oauth_expiry?: string | null
  sync_enabled?: boolean
  last_sync_at?: string | null
  color?: string | null
}

export class EmailChannelRepository {
  constructor(private supabase: SupabaseClient) {}

  async listByProperty(propertyId: string): Promise<EmailChannel[]> {
    const { data, error } = await this.supabase
      .from("email_channels")
      .select("*")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false })

    if (error) throw error
    return (data || []).map(decryptEmailChannelSecrets)
  }

  async findById(channelId: string): Promise<EmailChannel | null> {
    const { data, error } = await this.supabase.from("email_channels").select("*").eq("id", channelId).single()

    if (error) {
      if (error.code === "PGRST116") return null
      throw error
    }
    return decryptEmailChannelSecrets(data)
  }

  async findByEmail(emailAddress: string): Promise<EmailChannel | null> {
    const { data, error } = await this.supabase
      .from("email_channels")
      .select("*")
      .eq("email_address", emailAddress)
      .maybeSingle()

    if (error) throw error
    return decryptEmailChannelSecrets(data)
  }

  async create(input: CreateChannelInput): Promise<EmailChannel> {
    const { data, error } = await this.supabase
      .from("email_channels")
      // WRITE-ENCRYPT: i segreti presenti vengono cifrati prima del salvataggio.
      .insert(
        encryptChannelSecretsForWrite({
          property_id: input.property_id,
          email_address: input.email_address,
          name: input.name,
          display_name: input.display_name,
          provider: input.provider || null,
          is_active: input.is_active,
          sync_enabled: input.sync_enabled ?? false,
          oauth_access_token: input.oauth_access_token || null,
          oauth_refresh_token: input.oauth_refresh_token || null,
          oauth_expiry: input.oauth_expiry || null,
          color: input.color ?? null,
        }),
      )
      .select()
      .single()

    if (error) throw error
    return decryptEmailChannelSecrets(data)
  }

  async update(channelId: string, input: UpdateChannelInput): Promise<EmailChannel> {
    const { data, error } = await this.supabase
      .from("email_channels")
      // WRITE-ENCRYPT: cifra solo i segreti presenti nell'input (partial-safe).
      .update(
        encryptChannelSecretsForWrite({
          ...input,
          updated_at: new Date().toISOString(),
        }),
      )
      .eq("id", channelId)
      .select()
      .single()

    if (error) throw error
    return decryptEmailChannelSecrets(data)
  }

  async delete(channelId: string): Promise<void> {
    const { error } = await this.supabase.from("email_channels").delete().eq("id", channelId)

    if (error) throw error
  }

  async listAssignments(channelId: string): Promise<EmailChannelAssignment[]> {
    const { data, error } = await this.supabase
      .from("email_channel_assignments")
      .select("*")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: true })

    if (error) throw error
    return data || []
  }

  async setAssignments(channelId: string, userIds: string[]): Promise<void> {
    await this.supabase.from("email_channel_assignments").delete().eq("channel_id", channelId)

    if (userIds.length > 0) {
      const assignments = userIds.map((userId, index) => ({
        channel_id: channelId,
        user_id: userId,
        assignment_type: (index === 0 ? "owner" : "member") as "owner" | "member",
      }))

      const { error } = await this.supabase.from("email_channel_assignments").insert(assignments)

      if (error) throw error
    }
  }
}
