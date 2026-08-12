import "server-only"
import { embed, embedMany } from "ai"
import { EMBEDDING_MODEL } from "./config"

/**
 * True when an error looks like a rate-limit / quota response (HTTP 429 or the
 * AI Gateway's GatewayRateLimitError). These are transient and worth retrying;
 * anything else (bad input, auth) is not.
 */
function isRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false
  const anyErr = err as { statusCode?: number; status?: number; name?: string; message?: string }
  if (anyErr.statusCode === 429 || anyErr.status === 429) return true
  const name = anyErr.name ?? ""
  const message = anyErr.message ?? ""
  return /rate.?limit|429|quota|too many requests/i.test(`${name} ${message}`)
}

/**
 * Retry an embedding call with exponential backoff + jitter, but ONLY for
 * rate-limit (429) errors. On the free AI Gateway tier the embedding model is
 * aggressively throttled, so a single 429 must not bubble up and either leave
 * a source stuck in "error" or make the bot go silent mid-conversation.
 */
async function withRateLimitRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  const MAX_ATTEMPTS = 5
  let lastErr: unknown
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (!isRateLimitError(err) || attempt === MAX_ATTEMPTS - 1) throw err
      // 0.5s, 1s, 2s, 4s (+/- up to 250ms jitter).
      const base = 500 * 2 ** attempt
      const delay = base + Math.floor(Math.random() * 250)
      console.log(`[v0] ${label}: rate limited (429), retry ${attempt + 1}/${MAX_ATTEMPTS - 1} in ${delay}ms`)
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw lastErr
}

/**
 * Embed a single value (used for the incoming user query at retrieval time).
 */
export async function embedText(value: string): Promise<number[]> {
  const { embedding } = await withRateLimitRetry(
    () => embed({ model: EMBEDDING_MODEL, value: value.slice(0, 8000) }),
    "embedText",
  )
  return embedding
}

/**
 * Embed many values in one batched call (used when indexing a source's chunks).
 * Returned embeddings are in the same order as the input values.
 */
export async function embedTexts(values: string[]): Promise<number[][]> {
  if (values.length === 0) return []
  const { embeddings } = await withRateLimitRetry(
    () =>
      embedMany({
        model: EMBEDDING_MODEL,
        values: values.map((v) => v.slice(0, 8000)),
        maxParallelCalls: 2,
      }),
    "embedTexts",
  )
  return embeddings
}

/**
 * pgvector accepts a bracketed, comma-separated string literal for the
 * `vector` type. Serialize a JS number[] to that format for inserts.
 */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`
}
