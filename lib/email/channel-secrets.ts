import { decryptSecretIfNeeded, encryptSecret } from "@/lib/crypto/secrets"

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

/**
 * WRITE-ENCRYPT dei segreti di un payload destinato a insert/update su
 * `email_channels`. Cifra con `encryptSecret` SOLO i campi segreti
 * effettivamente PRESENTI come chiavi proprie del payload, preservando la
 * semantica dei partial update:
 * - chiave assente      -> resta assente (NON sovrascrive il valore esistente)
 * - chiave undefined    -> rimossa (Supabase non deve toccare la colonna)
 * - chiave null / ""    -> diventa null (semantica di cancellazione di encryptSecret)
 * - valore in chiaro    -> cifrato `enc:v1:...`
 * - valore già `enc:v1:`-> invariato (encryptSecret è idempotente)
 *
 * Richiede ENCRYPTION_KEY valida quando c'è almeno un segreto non vuoto da cifrare.
 * Non tocca alcun campo non segreto.
 */
export function encryptChannelSecretsForWrite<T extends Record<string, any>>(payload: T): T {
  const result: Record<string, any> = { ...payload }
  for (const key of CHANNEL_SECRET_FIELDS) {
    if (!(key in result)) continue
    if (result[key] === undefined) {
      // Partial update: non toccare la colonna esistente.
      delete result[key]
      continue
    }
    result[key] = encryptSecret(result[key])
  }
  return result as T
}
