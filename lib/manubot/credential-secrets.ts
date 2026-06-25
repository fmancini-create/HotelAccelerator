import { decryptSecretIfNeeded, encryptSecret, isEncryptedSecret } from "@/lib/crypto/secrets"

/**
 * Cifratura at-rest del segreto ManuBot `properties.manubot_password`.
 *
 * SCOPO (questo step): fornire l'helper riutilizzabile per cifrare/decifrare
 * SOLO `manubot_password`. NON è ancora collegato ai reader/writer reali, NON
 * tocca il DB, NON fa backfill.
 *
 * PERCHÉ SOLO `manubot_password` E NON `api_token`:
 *  - `manubot_password` è usata SOLO lato server (login a ManuBot) e non viene
 *    MAI usata in query per uguaglianza: candidata ideale per la cifratura
 *    reversibile non-deterministica (`enc:v1:`).
 *  - `api_token` viene cercato con `.eq("api_token", token)` nel webhook
 *    receiver: una cifratura NON deterministica romperebbe quel lookup. Va
 *    trattato separatamente con un hash deterministico (step successivo), NON
 *    con questo helper.
 *
 * Altri campi ManuBot (`manubot_email`, `manubot_supabase_url`,
 * `manubot_company_id`) sono identificativi/config, non segreti: non vengono
 * toccati.
 *
 * REGOLE CHIAVE:
 *  - Si cifra/decifra SOLO il VALORE di `manubot_password`.
 *  - Nessun log di plaintext, ciphertext o chiave.
 */

/** Campo segreto cifrabile in `properties`. */
export const MANUBOT_SECRET_FIELDS = ["manubot_password"] as const

/** Forma minima e permissiva di una property per questi helper. */
export type ManubotCredentialFields = Record<string, unknown> | null | undefined

/**
 * DUAL-READ di un valore `manubot_password`.
 *  - valore in chiaro   -> invariato
 *  - valore `enc:v1:`   -> decifrato (richiede ENCRYPTION_KEY valida)
 *  - null / undefined / "" -> null
 * NON cifra, NON scrive nulla.
 */
export function decryptManubotPassword(value: string | null | undefined): string | null {
  return decryptSecretIfNeeded(value)
}

/**
 * WRITE-ENCRYPT di un valore `manubot_password` per insert/update.
 *  - valore in chiaro     -> cifrato `enc:v1:...`
 *  - valore già `enc:v1:` -> invariato (idempotente)
 *  - null / undefined / "" -> null (semantica di cancellazione)
 * Richiede ENCRYPTION_KEY valida quando c'è un valore non vuoto da cifrare.
 */
export function encryptManubotPasswordForWrite(value: string | null | undefined): string | null {
  return encryptSecret(value)
}

/**
 * DUAL-READ a livello oggetto: data una property letta dal DB, restituisce una
 * COPIA con `manubot_password` decifrato (passthrough sui legacy in chiaro).
 * Tocca SOLO `manubot_password` se presente come chiave propria; ogni altro
 * campo resta invariato. Non muta l'input.
 */
export function decryptManubotCredentials<T extends ManubotCredentialFields>(property: T): T {
  if (!property) return property
  const result: Record<string, unknown> = { ...property }
  if ("manubot_password" in result) {
    result.manubot_password = decryptSecretIfNeeded(result.manubot_password as string | null | undefined)
  }
  return result as T
}

/**
 * WRITE-ENCRYPT a livello oggetto: data una porzione di payload destinata a
 * insert/update, restituisce una COPIA con `manubot_password` cifrato.
 * Semantica partial-update:
 *  - chiave assente   -> resta assente (non sovrascrive l'esistente)
 *  - chiave undefined -> rimossa (la colonna non va toccata)
 *  - chiave null / "" -> null (cancellazione)
 *  - valore in chiaro -> cifrato; valore già `enc:v1:` -> invariato
 * Non muta l'input.
 */
export function encryptManubotCredentialsForWrite<T extends ManubotCredentialFields>(payload: T): T {
  if (!payload) return payload
  const result: Record<string, unknown> = { ...payload }
  if ("manubot_password" in result) {
    if (result.manubot_password === undefined) {
      delete result.manubot_password
    } else {
      result.manubot_password = encryptSecret(result.manubot_password as string | null | undefined)
    }
  }
  return result as T
}

/**
 * Utility per test/diagnostica: true se `manubot_password` presente è cifrato
 * (`enc:v1:`). Non verifica l'integrità crittografica.
 */
export function hasEncryptedManubotPassword(property: ManubotCredentialFields): boolean {
  if (!property) return false
  return "manubot_password" in property && isEncryptedSecret((property as Record<string, unknown>).manubot_password)
}
