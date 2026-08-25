import crypto from "crypto"
import { z } from "zod"
import { MAX_SOURCE_CHARS } from "@/lib/ai/config"

export const INTERNAL_KNOWLEDGE_PRODUCT_KEYS = [
  "hotel-accelerator",
  "santaddeo-rms",
  "hotel-profit-ai",
  "manubot",
] as const

export type InternalKnowledgeProductKey = (typeof INTERNAL_KNOWLEDGE_PRODUCT_KEYS)[number]

const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const REVISION = /^[A-Fa-f0-9]{7,64}$/
const REPO_PATH = /^(?![./\\])(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9_./ -]+\.md$/
const SHA256 = /^[A-Fa-f0-9]{64}$/
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000

const repositoryAuthorizationSchema = z.object({
  "hotel-accelerator": z.string().trim().regex(REPOSITORY).max(160).optional(),
  "santaddeo-rms": z.string().trim().regex(REPOSITORY).max(160).optional(),
  "hotel-profit-ai": z.string().trim().regex(REPOSITORY).max(160).optional(),
  manubot: z.string().trim().regex(REPOSITORY).max(160).optional(),
}).strict()

export const internalKnowledgeSyncSchema = z.object({
  product_key: z.enum(INTERNAL_KNOWLEDGE_PRODUCT_KEYS),
  repository: z.string().trim().regex(REPOSITORY).max(160),
  revision: z.string().trim().regex(REVISION),
  source_paths: z.array(z.string().trim().regex(REPO_PATH).max(300)).min(1).max(40),
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

export function isMissingInternalKnowledgeSyncSchema(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string } | null
  return candidate?.code === "42P01" || candidate?.code === "PGRST202" || candidate?.code === "PGRST205"
    || candidate?.message?.includes("internal_knowledge_sync_sources") === true
}
