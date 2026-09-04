import crypto from "crypto"
import { z } from "zod"
import { MAX_SOURCE_CHARS } from "@/lib/ai/config"

export const INTERNAL_KNOWLEDGE_PRODUCT_KEYS = [
  "hotel-accelerator",
  "santaddeo-rms",
  "hotel-profit-ai",
  "manubot",
  "autoexel",
  "mypetsenseai",
  "daynext",
  "risparmio-compulsivo",
] as const

export type InternalKnowledgeProductKey = (typeof INTERNAL_KNOWLEDGE_PRODUCT_KEYS)[number]

const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const REVISION = /^[A-Fa-f0-9]{7,64}$/
const REPO_PATH = /^(?![./\\])(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9_./ @()[\]-]+\.(?:md|mdx|ts|tsx|js|jsx|mjs|cjs|sql|json|ya?ml|toml|py|css|scss)$/i
const SHA256 = /^[A-Fa-f0-9]{64}$/
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000
const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com"
const GITHUB_OIDC_JWKS = `${GITHUB_OIDC_ISSUER}/.well-known/jwks`
export const GITHUB_KNOWLEDGE_SYNC_AUDIENCE = "hotelaccelerator-knowledge-sync"

type RepositoryBinding = { repository: string; ref: string }

const BUILTIN_REPOSITORY_BINDINGS: Partial<Record<InternalKnowledgeProductKey, RepositoryBinding>> = {
  autoexel: { repository: "fmancini-create/v0-autoexel", ref: "refs/heads/main" },
  mypetsenseai: { repository: "fmancini-create/v0-mypetsenseai-v2", ref: "refs/heads/MyPetSense" },
  daynext: { repository: "fmancini-create/daynext-it", ref: "refs/heads/main" },
  "risparmio-compulsivo": { repository: "fmancini-create/v0-risparmio-compulsivo", ref: "refs/heads/main" },
}

const repositoryAuthorizationSchema = z.object({
  "hotel-accelerator": z.string().trim().regex(REPOSITORY).max(160).optional(),
  "santaddeo-rms": z.string().trim().regex(REPOSITORY).max(160).optional(),
  "hotel-profit-ai": z.string().trim().regex(REPOSITORY).max(160).optional(),
  manubot: z.string().trim().regex(REPOSITORY).max(160).optional(),
  autoexel: z.string().trim().regex(REPOSITORY).max(160).optional(),
  mypetsenseai: z.string().trim().regex(REPOSITORY).max(160).optional(),
  daynext: z.string().trim().regex(REPOSITORY).max(160).optional(),
  "risparmio-compulsivo": z.string().trim().regex(REPOSITORY).max(160).optional(),
}).strict()

export const internalKnowledgeSyncSchema = z.object({
  product_key: z.enum(INTERNAL_KNOWLEDGE_PRODUCT_KEYS),
  repository: z.string().trim().regex(REPOSITORY).max(160),
  revision: z.string().trim().regex(REVISION),
  source_paths: z.array(z.string().trim().regex(REPO_PATH).max(300)).min(1).max(200),
  content_sha256: z.string().trim().regex(SHA256),
  content: z.string().min(80).max(MAX_SOURCE_CHARS),
})

export type InternalKnowledgeSyncPayload = z.infer<typeof internalKnowledgeSyncSchema>

/**
 * Il segreto HMAC dimostra l'integrità della richiesta, ma non determina il
 * proprietario del prodotto. Questa configurazione associa esplicitamente un
 * repository autorizzato a ciascun prodotto, così un repo con il segreto non
 * può aggiornare la KB di un altro prodotto.
 */
export function getAuthorizedInternalKnowledgeRepository(
  productKey: InternalKnowledgeProductKey,
  configuredRepositories: string | undefined,
): string | null {
  if (!configuredRepositories) return null
  try {
    const parsed = repositoryAuthorizationSchema.safeParse(JSON.parse(configuredRepositories))
    if (!parsed.success) return null
    return parsed.data[productKey] ?? null
  } catch {
    return null
  }
}

/**
 * I repository satelliti nuovi usano GitHub Actions OIDC: non serve copiare un
 * segreto condiviso in ogni repository. Il binding codice prodotto/repository
 * resta stretto e il token è valido soltanto per il branch canonico.
 */
export function getBuiltinInternalKnowledgeRepository(productKey: InternalKnowledgeProductKey): RepositoryBinding | null {
  return BUILTIN_REPOSITORY_BINDINGS[productKey] ?? null
}

export function contentSha256(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex")
}

export function createInternalKnowledgeSyncSignature(rawBody: string, timestamp: string, secret: string): string {
  return `sha256=${crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex")}`
}

export function verifyInternalKnowledgeSyncSignature(input: {
  rawBody: string
  timestamp: string | null
  signature: string | null
  secret: string | undefined
  now?: number
}): boolean {
  const { rawBody, timestamp, signature, secret, now = Date.now() } = input
  if (!secret || secret.length < 32 || !timestamp || !signature) return false
  if (!/^\d{10,13}$/.test(timestamp)) return false

  const timestampMs = Number(timestamp.length === 10 ? `${timestamp}000` : timestamp)
  if (!Number.isSafeInteger(timestampMs) || Math.abs(now - timestampMs) > MAX_CLOCK_SKEW_MS) return false

  const expected = createInternalKnowledgeSyncSignature(rawBody, timestamp, secret)
  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer)
}

type GithubOidcHeader = { alg?: string; kid?: string }
type GithubOidcClaims = {
  iss?: string
  aud?: string | string[]
  sub?: string
  exp?: number
  nbf?: number
  repository?: string
  repository_owner?: string
  ref?: string
  event_name?: string
}
type GithubJwk = JsonWebKey & { kid?: string; alg?: string; use?: string }

type CachedJwks = { expiresAt: number; keys: GithubJwk[] }
let cachedJwks: CachedJwks | null = null

function parseJwtPart<T>(part: string): T | null {
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as T
  } catch {
    return null
  }
}

async function githubOidcJwks(): Promise<GithubJwk[]> {
  if (cachedJwks && cachedJwks.expiresAt > Date.now()) return cachedJwks.keys
  const response = await fetch(GITHUB_OIDC_JWKS, { cache: "no-store", signal: AbortSignal.timeout(5000) })
  if (!response.ok) throw new Error(`GitHub OIDC JWKS ${response.status}`)
  const body = (await response.json()) as { keys?: GithubJwk[] }
  if (!Array.isArray(body.keys) || body.keys.length === 0) throw new Error("GitHub OIDC JWKS vuoto")
  cachedJwks = { expiresAt: Date.now() + 60 * 60 * 1000, keys: body.keys }
  return body.keys
}

function audienceIncludes(aud: string | string[] | undefined, expected: string): boolean {
  return typeof aud === "string" ? aud === expected : Array.isArray(aud) && aud.includes(expected)
}

/** Verifica un token OIDC emesso da GitHub Actions per uno specifico prodotto. */
export async function verifyGithubActionsKnowledgeToken(
  token: string,
  productKey: InternalKnowledgeProductKey,
  now = Date.now(),
): Promise<boolean> {
  const binding = getBuiltinInternalKnowledgeRepository(productKey)
  if (!binding) return false

  const parts = token.split(".")
  if (parts.length !== 3) return false
  const header = parseJwtPart<GithubOidcHeader>(parts[0])
  const claims = parseJwtPart<GithubOidcClaims>(parts[1])
  if (!header?.kid || header.alg !== "RS256" || !claims) return false

  const nowSeconds = Math.floor(now / 1000)
  if (claims.iss !== GITHUB_OIDC_ISSUER) return false
  if (!audienceIncludes(claims.aud, GITHUB_KNOWLEDGE_SYNC_AUDIENCE)) return false
  if (!claims.exp || claims.exp <= nowSeconds - 30) return false
  if (claims.nbf && claims.nbf > nowSeconds + 30) return false
  if (claims.repository !== binding.repository || claims.repository_owner !== "fmancini-create") return false
  if (claims.ref !== binding.ref) return false
  if (claims.sub !== `repo:${binding.repository}:ref:${binding.ref}`) return false
  if (claims.event_name !== "push" && claims.event_name !== "workflow_dispatch") return false

  try {
    const keys = await githubOidcJwks()
    const jwk = keys.find((candidate) => candidate.kid === header.kid && (!candidate.alg || candidate.alg === "RS256"))
    if (!jwk) return false
    const publicKey = crypto.createPublicKey({ key: jwk, format: "jwk" })
    return crypto.verify(
      "RSA-SHA256",
      Buffer.from(`${parts[0]}.${parts[1]}`, "utf8"),
      publicKey,
      Buffer.from(parts[2], "base64url"),
    )
  } catch (error) {
    console.error("[internal-knowledge-sync] verifica GitHub OIDC fallita", {
      message: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

export function isMissingInternalKnowledgeSyncSchema(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string } | null
  return candidate?.code === "42P01" || candidate?.code === "PGRST202" || candidate?.code === "PGRST205"
    || candidate?.message?.includes("internal_knowledge_sync_sources") === true
}
