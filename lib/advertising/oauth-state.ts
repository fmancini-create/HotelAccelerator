import "server-only"
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import type { AdvertisingProvider } from "@/lib/advertising/types"

interface AdvertisingOAuthState {
  provider: AdvertisingProvider
  propertyId: string
  nonce: string
  exp: number
}

function secret() {
  const value = process.env.ADVERTISING_OAUTH_STATE_SECRET || process.env.ENCRYPTION_KEY
  if (!value) throw new Error("ADVERTISING_OAUTH_STATE_SECRET o ENCRYPTION_KEY non configurata")
  return value
}

export function createAdvertisingOAuthState(provider: AdvertisingProvider, propertyId: string): string {
  const payload: AdvertisingOAuthState = {
    provider,
    propertyId,
    nonce: randomBytes(18).toString("base64url"),
    exp: Date.now() + 10 * 60 * 1000,
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url")
  const signature = createHmac("sha256", secret()).update(encoded).digest("base64url")
  return `${encoded}.${signature}`
}

export function verifyAdvertisingOAuthState(value: string): AdvertisingOAuthState {
  const [encoded, signature] = value.split(".")
  if (!encoded || !signature) throw new Error("OAuth state non valido")
  const expected = createHmac("sha256", secret()).update(encoded).digest("base64url")
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("OAuth state non valido")

  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as AdvertisingOAuthState
  if (!payload.propertyId || !payload.provider || !payload.exp || payload.exp < Date.now()) {
    throw new Error("OAuth state scaduto o incompleto")
  }
  return payload
}
