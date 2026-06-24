import { decryptSecretIfNeeded } from "@/lib/crypto/secrets"

/**
 * Campi segreti di un record `email_channels`.
 */
const CHANNEL_SECRET_FIELDS = ["oauth_access_token", "oauth_refresh_token", "smtp_password"] as const

/**
 * DUAL-READ dei segreti di un canale email letto direttamente dal DB (fuori dai
 * repository, che hanno già il proprio dual-read).
 *
 * Tollera sia valori legacy in chiaro sia valori cifrati `enc:v1:...`:
 * - valore in chiaro  -> restituito invariato
 * - valore `enc:v1:`  -> decifrato (richiede ENCRYPTION_KEY valida)
 * - null / undefined  -> invariato
 *
 * Tocca SOLO i campi segreti effettivamente presenti nel record; ogni altro
 * campo resta invariato. NON cifra nulla, NON scrive nulla.
 */
export function decryptChannelSecrets<T extends Record<string, any> | null | undefined>(channel: T): T {
  if (!channel) return channel
  const result: Record<string, any> = { ...channel }
  for (const key of CHANNEL_SECRET_FIELDS) {
    if (key in result) {
      result[key] = decryptSecretIfNeeded(result[key])
    }
  }
  return result as T
}
