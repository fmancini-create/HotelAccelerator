import { decryptSecretIfNeeded, encryptSecret, isEncryptedSecret } from "@/lib/crypto/secrets"

/**
 * Cifratura at-rest dei segreti WhatsApp dentro `messaging_channels.credentials`.
 *
 * SCOPO (questo step): fornire l'helper riutilizzabile per cifrare/decifrare
 * SOLO i campi sensibili annidati in `credentials`. NON è ancora collegato ai
 * reader/writer reali, NON tocca il DB, NON fa backfill.
 *
 * REGOLE CHIAVE:
 *  - Si cifra SOLO il VALORE dei tre campi segreti dentro `credentials`.
 *  - NON si cifra l'intero JSONB.
 *  - `config` (phone_number_id, waba_id, ...) NON viene MAI toccato: deve
 *    restare in chiaro e queryabile (es. `config->>phone_number_id`).
 *  - Nessun log di plaintext, ciphertext o chiave.
 */

/** Campi segreti annidati in `messaging_channels.credentials`. */
export const WHATSAPP_CREDENTIAL_SECRET_FIELDS = ["access_token", "app_secret", "verify_token"] as const

/** Tipo permissivo e sicuro per l'oggetto `credentials`. */
export type WhatsAppCredentials = Record<string, unknown> | null | undefined

/**
 * DUAL-READ dei segreti dentro `credentials`.
 *
 * Tollera sia valori legacy in chiaro sia valori cifrati `enc:v1:...`:
 *  - valore in chiaro   -> restituito invariato
 *  - valore `enc:v1:`   -> decifrato (richiede ENCRYPTION_KEY valida)
 *  - null / undefined   -> invariato
 *
 * Tocca SOLO i campi segreti effettivamente presenti; ogni altro campo (incl.
 * tutti i campi non segreti) resta invariato. NON cifra, NON scrive nulla.
 * Non muta l'input: ritorna una copia superficiale.
 */
export function decryptWhatsAppCredentials<T extends WhatsAppCredentials>(credentials: T): T {
  if (!credentials) return credentials
  const result: Record<string, unknown> = { ...credentials }
  for (const key of WHATSAPP_CREDENTIAL_SECRET_FIELDS) {
    if (key in result) {
      result[key] = decryptSecretIfNeeded(result[key] as string | null | undefined)
    }
  }
  return result as T
}

/**
 * WRITE-ENCRYPT dei segreti dentro `credentials` per un payload destinato a
 * insert/update. Cifra con `encryptSecret` SOLO i campi segreti effettivamente
 * PRESENTI come chiavi proprie, preservando la semantica dei partial update:
 *  - chiave assente       -> resta assente (NON sovrascrive l'esistente)
 *  - chiave undefined     -> rimossa (la colonna/chiave non va toccata)
 *  - chiave null / ""     -> diventa null (semantica di cancellazione di encryptSecret)
 *  - valore in chiaro     -> cifrato `enc:v1:...`
 *  - valore già `enc:v1:` -> invariato (encryptSecret è idempotente)
 *
 * Richiede ENCRYPTION_KEY valida quando c'è almeno un segreto non vuoto da
 * cifrare. Non tocca alcun campo non segreto. Non muta l'input.
 */
export function encryptWhatsAppCredentialsForWrite<T extends WhatsAppCredentials>(credentials: T): T {
  if (!credentials) return credentials
  const result: Record<string, unknown> = { ...credentials }
  for (const key of WHATSAPP_CREDENTIAL_SECRET_FIELDS) {
    if (!(key in result)) continue
    if (result[key] === undefined) {
      // Partial update: non toccare la chiave esistente.
      delete result[key]
      continue
    }
    result[key] = encryptSecret(result[key] as string | null | undefined)
  }
  return result as T
}

/**
 * Utility per test/diagnostica: true se almeno uno dei campi segreti presenti
 * è cifrato (`enc:v1:`). Non verifica l'integrità crittografica.
 */
export function hasEncryptedWhatsAppCredentials(credentials: WhatsAppCredentials): boolean {
  if (!credentials) return false
  return WHATSAPP_CREDENTIAL_SECRET_FIELDS.some(
    (key) => key in credentials && isEncryptedSecret((credentials as Record<string, unknown>)[key]),
  )
}
