import "server-only"
import { createServiceClient } from "@/lib/supabase/server"
import { decryptSecretIfNeeded, encryptSecret } from "@/lib/crypto/secrets"
import type { ThreeCxConfig } from "@/lib/telephony/threecx-client"

/**
 * Lettura/scrittura della connessione 3CX di una struttura.
 *
 * I segreti sono cifrati a riposo con ENCRYPTION_KEY (`enc:v1:`), come per
 * Telegram e WhatsApp, e in lettura si tollera il testo in chiaro legacy
 * (`decryptSecretIfNeeded`) per non rompere righe scritte prima della cifratura.
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
  is_active: boolean
  last_check_at: string | null
  last_check_status: string | null
  last_check_error: string | null
  updated_at: string | null
}

/** Nasconde un segreto lasciando solo le ultime 4 cifre (come gli altri canali). */
export function maskSecret(value: string | null | undefined): string {
  if (!value) return ""
  const v = String(value)
  if (v.length <= 4) return "••••"
  return "••••••••" + v.slice(-4)
}

export async function loadTelephonyRow(propertyId: string): Promise<TelephonyRow | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("telephony_integrations")
    .select("*")
    .eq("property_id", propertyId)
    .eq("provider", "3cx")
    .maybeSingle()

  if (error) throw error
  return (data as TelephonyRow | null) ?? null
}

/**
 * Config pronta per chiamare il centralino, o `null` se incompleta.
 *
 * Restituisce `null` invece di una config a metà: una chiamata con `clientSecret`
 * vuoto otterrebbe un 400 dal centralino e il messaggio d'errore parlerebbe di
 * credenziali rifiutate, quando il vero problema e' che non sono state inserite.
 */
export function toThreeCxConfig(row: TelephonyRow | null): ThreeCxConfig | null {
  if (!row || !row.is_active) return null
  const baseUrl = row.base_url?.trim()
  const clientId = row.client_id?.trim()
  const clientSecret = decryptSecretIfNeeded(row.client_secret_encrypted)
  if (!baseUrl || !clientId || !clientSecret) return null
  return { baseUrl, clientId, clientSecret }
}

/** Segreto che 3CX deve presentare quando chiama i nostri endpoint. */
export function inboundSecretOf(row: TelephonyRow | null): string | null {
  if (!row) return null
  return decryptSecretIfNeeded(row.inbound_secret_encrypted)
}

export function encryptForWrite(value: string | null | undefined): string | null {
  return encryptSecret(value)
}
