import { decryptSecretIfNeeded, encryptSecret, isEncryptedSecret } from "@/lib/crypto/secrets"

/**
 * At-rest encryption of Telegram secrets nested in
 * `messaging_channels.credentials`. Mirrors the WhatsApp channel-secrets
 * helper: only the secret VALUES are encrypted, `config` is never touched.
 */

/** Secret fields nested in `messaging_channels.credentials` for Telegram. */
export const TELEGRAM_CREDENTIAL_SECRET_FIELDS = ["bot_token", "webhook_secret"] as const

export type TelegramCredentialsBag = Record<string, unknown> | null | undefined

/**
 * DUAL-READ: decrypt secrets, tolerating both legacy plaintext and `enc:v1:...`.
 * Only touches secret fields actually present; does not mutate the input.
 */
export function decryptTelegramCredentials<T extends TelegramCredentialsBag>(credentials: T): T {
  if (!credentials) return credentials
  const result: Record<string, unknown> = { ...credentials }
  for (const key of TELEGRAM_CREDENTIAL_SECRET_FIELDS) {
    if (key in result) {
      result[key] = decryptSecretIfNeeded(result[key] as string | null | undefined)
    }
  }
  return result as T
}

/**
 * WRITE-ENCRYPT: encrypt secret fields present in a payload before insert/update,
 * preserving partial-update semantics (absent stays absent, undefined removed).
 */
export function encryptTelegramCredentialsForWrite<T extends TelegramCredentialsBag>(credentials: T): T {
  if (!credentials) return credentials
  const result: Record<string, unknown> = { ...credentials }
  for (const key of TELEGRAM_CREDENTIAL_SECRET_FIELDS) {
    if (!(key in result)) continue
    if (result[key] === undefined) {
      delete result[key]
      continue
    }
    result[key] = encryptSecret(result[key] as string | null | undefined)
  }
  return result as T
}

/**
 * Diagnostics: true if at least one present secret field is encrypted.
 */
export function hasEncryptedTelegramCredentials(credentials: TelegramCredentialsBag): boolean {
  if (!credentials) return false
  return TELEGRAM_CREDENTIAL_SECRET_FIELDS.some(
    (key) => key in credentials && isEncryptedSecret((credentials as Record<string, unknown>)[key]),
  )
}
