import { createHmac, randomBytes, timingSafeEqual, createHash } from "node:crypto"
import type { SocialProvider } from "@/lib/social/providers"

interface OAuthStatePayload {
  provider: SocialProvider
  propertyId: string
  nonce: string
  exp: number
}

function stateSecret(): string {
  const secret = process.env.SOCIAL_OAUTH_STATE_SECRET || process.env.ENCRYPTION_KEY
  if (!secret) throw new Error("SOCIAL_OAUTH_STATE_SECRET o ENCRYPTION_KEY non configurata")
  return secret
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url")
}

export function createOAuthState(provider: SocialProvider, propertyId: string): string {
  const payload: OAuthStatePayload = {
    provider,
    propertyId,
    nonce: randomBytes(18).toString("base64url"),
    exp: Date.now() + 10 * 60 * 1000,
  }
  const encoded = b64url(JSON.stringify(payload))
  const signature = createHmac("sha256", stateSecret()).update(encoded).digest("base64url")
  return `${encoded}.${signature}`
}

export function verifyOAuthState(state: string): OAuthStatePayload {
  const [encoded, signature] = state.split(".")
  if (!encoded || !signature) throw new Error("OAuth state non valido")
  const expected = createHmac("sha256", stateSecret()).update(encoded).digest("base64url")
  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new Error("OAuth state non valido")
  }
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as OAuthStatePayload
  if (!payload.propertyId || !payload.provider || !payload.exp || payload.exp < Date.now()) {
    throw new Error("OAuth state scaduto o incompleto")
  }
  return payload
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url")
  const challenge = createHash("sha256").update(verifier).digest("base64url")
  return { verifier, challenge }
}
