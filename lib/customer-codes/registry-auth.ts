import "server-only"

import { timingSafeEqual, webcrypto } from "node:crypto"
import { type SuiteProductKey } from "@/lib/customer-codes/product"

const REGISTRY_KEY_BY_PRODUCT: Record<SuiteProductKey, string | undefined> = {
  hotelaccelerator: process.env.CUSTOMER_CODE_REGISTRY_KEY_HA,
  santaddeo: process.env.CUSTOMER_CODE_REGISTRY_KEY_SNT,
  hotelprofitai: process.env.CUSTOMER_CODE_REGISTRY_KEY_HPA,
  manubot: process.env.CUSTOMER_CODE_REGISTRY_KEY_MB,
}

const VERCEL_TEAM_SLUG = "4bid"
const VERCEL_TEAM_ID = "team_zutObejPRaSuP1fKxOyKHz5M"
const VERCEL_ISSUER = `https://oidc.vercel.com/${VERCEL_TEAM_SLUG}`
const VERCEL_AUDIENCE = `https://vercel.com/${VERCEL_TEAM_SLUG}`
const VERCEL_JWKS_URL = `${VERCEL_ISSUER}/.well-known/jwks`

/**
 * Project IDs are intentionally explicit: an OIDC token issued to another
 * project in the same Vercel team must not gain access to the registry.
 */
const VERCEL_PROJECT_BY_PRODUCT: Partial<Record<SuiteProductKey, string>> = {
  santaddeo: "prj_Ut7SfbEw5FEgWSDYL2cqn69fZBf4",
  hotelprofitai: "prj_9IZhA0CqtBqyasDN2vas7cjbGGe6",
  manubot: "prj_B4Z07WAn9xeBrhUGyGfx5RA7vgQ7",
}

type VercelOidcPayload = {
  iss?: unknown
  aud?: unknown
  sub?: unknown
  exp?: unknown
  nbf?: unknown
  owner_id?: unknown
  project_id?: unknown
  environment?: unknown
}

type JsonWebKeyWithKid = JsonWebKey & { kid?: string; alg?: string }

let jwksCache: { expiresAt: number; keys: JsonWebKeyWithKid[] } | null = null

function sameSecret(expected: string, received: string) {
  const left = Buffer.from(expected)
  const right = Buffer.from(received)
  return left.length === right.length && timingSafeEqual(left, right)
}

function decodeBase64UrlJson<T>(value: string): T | null {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T
  } catch {
    return null
  }
}

async function getVercelJwks(): Promise<JsonWebKeyWithKid[]> {
  const now = Date.now()
  if (jwksCache && jwksCache.expiresAt > now) return jwksCache.keys

  const response = await fetch(VERCEL_JWKS_URL, {
    cache: "no-store",
    signal: AbortSignal.timeout(3_000),
  })
  if (!response.ok) throw new Error(`vercel_jwks_${response.status}`)
  const body = (await response.json()) as { keys?: JsonWebKeyWithKid[] }
  const keys = Array.isArray(body.keys) ? body.keys : []
  if (keys.length === 0) throw new Error("vercel_jwks_empty")

  jwksCache = { expiresAt: now + 10 * 60_000, keys }
  return keys
}

function audienceMatches(value: unknown): boolean {
  if (typeof value === "string") return value === VERCEL_AUDIENCE
  return Array.isArray(value) && value.some((item) => item === VERCEL_AUDIENCE)
}

async function verifyVercelOidc(productKey: SuiteProductKey, bearerToken: string | null): Promise<boolean> {
  const expectedProjectId = VERCEL_PROJECT_BY_PRODUCT[productKey]
  if (!expectedProjectId || !bearerToken) return false

  const token = bearerToken.startsWith("Bearer ") ? bearerToken.slice(7).trim() : ""
  const segments = token.split(".")
  if (segments.length !== 3) return false

  const header = decodeBase64UrlJson<{ alg?: unknown; kid?: unknown }>(segments[0])
  const payload = decodeBase64UrlJson<VercelOidcPayload>(segments[1])
  if (!header || !payload || header.alg !== "RS256" || typeof header.kid !== "string") return false

  const nowSeconds = Math.floor(Date.now() / 1000)
  if (payload.iss !== VERCEL_ISSUER || !audienceMatches(payload.aud)) return false
  if (payload.owner_id !== VERCEL_TEAM_ID) return false
  if (payload.project_id !== expectedProjectId || payload.environment !== "production") return false
  if (typeof payload.exp !== "number" || payload.exp <= nowSeconds) return false
  if (typeof payload.nbf === "number" && payload.nbf > nowSeconds + 30) return false

  try {
    const keys = await getVercelJwks()
    const jwk = keys.find((candidate) => candidate.kid === header.kid && (!candidate.alg || candidate.alg === "RS256"))
    if (!jwk) return false

    const publicKey = await webcrypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    )
    return webcrypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      Buffer.from(segments[2], "base64url"),
      Buffer.from(`${segments[0]}.${segments[1]}`),
    )
  } catch (error) {
    console.warn("[customer-code-registry] Vercel OIDC verification unavailable", {
      product: productKey,
      error: error instanceof Error ? error.message : "unknown",
    })
    return false
  }
}

/**
 * Authenticate a satellite product.
 *
 * Production Vercel deployments use their short-lived project OIDC identity,
 * so there is no manually copied secret to drift or expire. Static per-product
 * keys remain supported as a recovery/local-development fallback.
 */
export async function authenticateRegistryClient(
  productKey: SuiteProductKey,
  receivedKey: string | null,
  authorization: string | null,
): Promise<{ ok: boolean; configured: boolean; method: "oidc" | "static" | null }> {
  if (await verifyVercelOidc(productKey, authorization)) {
    return { ok: true, configured: true, method: "oidc" }
  }

  const expected = REGISTRY_KEY_BY_PRODUCT[productKey]
  if (!expected) return { ok: false, configured: false, method: null }
  if (!receivedKey) return { ok: false, configured: true, method: null }
  return { ok: sameSecret(expected, receivedKey), configured: true, method: "static" }
}
