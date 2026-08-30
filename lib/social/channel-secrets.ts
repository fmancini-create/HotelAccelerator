import { decryptSecretIfNeeded, encryptSecret } from "@/lib/crypto/secrets"

export const SOCIAL_CREDENTIAL_SECRET_FIELDS = [
  "access_token",
  "refresh_token",
  "page_access_token",
] as const

export type SocialCredentials = Record<string, unknown> | null | undefined

export function decryptSocialCredentials<T extends SocialCredentials>(credentials: T): T {
  if (!credentials) return credentials
  const result: Record<string, unknown> = { ...credentials }
  for (const key of SOCIAL_CREDENTIAL_SECRET_FIELDS) {
    if (key in result) {
      result[key] = decryptSecretIfNeeded(result[key] as string | null | undefined)
    }
  }
  return result as T
}

export function encryptSocialCredentialsForWrite<T extends SocialCredentials>(credentials: T): T {
  if (!credentials) return credentials
  const result: Record<string, unknown> = { ...credentials }
  for (const key of SOCIAL_CREDENTIAL_SECRET_FIELDS) {
    if (!(key in result)) continue
    if (result[key] === undefined) {
      delete result[key]
      continue
    }
    result[key] = encryptSecret(result[key] as string | null | undefined)
  }
  return result as T
}
