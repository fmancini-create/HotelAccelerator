import "server-only"
import { createServiceClient } from "@/lib/supabase/server"
import { decryptSecretIfNeeded, encryptSecret } from "@/lib/crypto/secrets"
import type { ThreeCxConfig } from "@/lib/telephony/threecx-client"
import type { TelephonyProviderId } from "@/lib/telephony/providers"
import type { ProviderRuntimeConfig } from "@/lib/telephony/adapters"

/**
 * Configurazione telefonica tenant-scoped.
 *
 * `provider` non e piu sinonimo di 3CX: il Core mantiene un record per ogni
 * provider configurato e un solo record attivo per tenant. I segreti restano
 * cifrati a riposo con ENCRYPTION_KEY.
 */
export type TelephonyRow = {
  id: string
  property_id: string
  provider: string
  base_url: string | null
  client_id: string | null
  client_secret_encrypted: string | null
  default_extension: string | null
  inbound_secret_encrypted: string | null
  voice_inbound_secret_encrypted: string | null
  shared_pbx_journal_property_id: string | null
  provider_config: Record<string, unknown> | null
  is_active: boolean
  last_check_at: string | null
  last_check_status: string | null
  last_check_error: string | null
  updated_at: string | null
}

export function maskSecret(value: string | null | undefined): string {
  if (!value) return ""
  const v = String(value)
  if (v.length <= 4) return "••••"
  return "••••••••" + v.slice(-4)
}

export async function loadTelephonyRow(propertyId: string, provider: string = "3cx"): Promise<TelephonyRow | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("telephony_integrations")
    .select("*")
    .eq("property_id", propertyId)
    .eq("provider", provider)
    .maybeSingle()
  if (error) throw error
  return (data as TelephonyRow | null) ?? null
}

export async function loadActiveTelephonyRow(propertyId: string): Promise<TelephonyRow | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("telephony_integrations")
    .select("*")
    .eq("property_id", propertyId)
    .eq("is_active", true)
    .maybeSingle()
  if (error) throw error
  return (data as TelephonyRow | null) ?? null
}

export async function loadTelephonyRows(propertyId: string): Promise<TelephonyRow[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("telephony_integrations")
    .select("*")
    .eq("property_id", propertyId)
    .order("updated_at", { ascending: false })
  if (error) throw error
  return (data as TelephonyRow[] | null) ?? []
}

export function toProviderRuntimeConfig(row: TelephonyRow | null): ProviderRuntimeConfig | null {
  if (!row || !row.is_active) return null
  const clientSecret = decryptSecretIfNeeded(row.client_secret_encrypted) || ""
  return {
    baseUrl: row.base_url?.trim() || "",
    clientId: row.client_id?.trim() || "",
    clientSecret,
    defaultExtension: row.default_extension?.trim() || "",
    providerConfig: row.provider_config && typeof row.provider_config === "object" ? row.provider_config : {},
  }
}

/** Compatibilita con le route 3CX esistenti. */
export function toThreeCxConfig(row: TelephonyRow | null): ThreeCxConfig | null {
  if (!row || row.provider !== "3cx" || !row.is_active) return null
  const runtime = toProviderRuntimeConfig(row)
  if (!runtime?.baseUrl || !runtime.clientId || !runtime.clientSecret) return null
  return { baseUrl: runtime.baseUrl, clientId: runtime.clientId, clientSecret: runtime.clientSecret }
}

export function inboundSecretOf(row: TelephonyRow | null): string | null {
  return row ? decryptSecretIfNeeded(row.inbound_secret_encrypted) : null
}

export function voiceInboundSecretOf(row: TelephonyRow | null): string | null {
  return row ? decryptSecretIfNeeded(row.voice_inbound_secret_encrypted) : null
}

export function encryptForWrite(value: string | null | undefined): string | null {
  return encryptSecret(value)
}

export function providerIdOf(row: TelephonyRow | null): TelephonyProviderId | null {
  if (!row) return null
  return row.provider as TelephonyProviderId
}
