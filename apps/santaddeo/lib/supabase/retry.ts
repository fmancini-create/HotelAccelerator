/**
 * Shared retry utility for Supabase queries.
 *
 * The Supabase REST API may return HTTP 429 "Too Many Requests" as plain text.
 * The PostgREST client tries JSON.parse on the body, which throws a SyntaxError
 * before the {data, error} shape is formed.  This wrapper catches both returned
 * errors AND thrown exceptions and retries with exponential back-off.
 *
 * Also includes a concurrency limiter to prevent overwhelming the Supabase rate limiter
 * when multiple API routes execute in parallel (e.g. dashboard loading).
 */

const MAX_RETRIES = 5
const BASE_DELAY_MS = 600
const MAX_CONCURRENT = 4 // Keep low to avoid 429 rate-limiting in v0 preview

// Global concurrency limiter
let _activeQueries = 0
const _waitQueue: Array<() => void> = []

async function acquireSlot(): Promise<void> {
  if (_activeQueries < MAX_CONCURRENT) {
    _activeQueries++
    return
  }
  // Wait for a slot to free up
  return new Promise<void>((resolve) => {
    _waitQueue.push(() => {
      _activeQueries++
      resolve()
    })
  })
}

function releaseSlot(): void {
  _activeQueries--
  if (_waitQueue.length > 0 && _activeQueries < MAX_CONCURRENT) {
    const next = _waitQueue.shift()
    next?.()
  }
}

function isRetryableMessage(msg: string): boolean {
  const lower = msg.toLowerCase()

  // FIX 04/07/2026: PGRST002 "Could not query the database for the schema
  // cache. Retrying." e' TRANSITORIO (DB momentaneamente irraggiungibile a
  // startup PostgREST), quindi RITENTABILE. Va intercettato PRIMA del blocco
  // di esclusione sotto, altrimenti verrebbe scartato come "pgrst"/"schema
  // cache". Distinto da PGRST205 (tabella non trovata = permanente).
  if (lower.includes("pgrst002") || lower.includes("could not query the database for the schema cache")) {
    return true
  }

  // Non-retryable errors: schema/table issues are permanent, not transient
  if (
    lower.includes("pgrst") ||        // PostgREST errors like PGRST205 (table not found)
    lower.includes("schema cache") ||  // "Could not find table in schema cache"
    lower.includes("does not exist") ||
    lower.includes("relation") ||
    lower.includes("42p01")           // PostgreSQL error code for "undefined table"
  ) {
    return false
  }

  return (
    lower.includes("too many r") ||
    lower.includes("rate") ||
    lower.includes("429") ||
    lower.includes("timeout") ||
    lower.includes("econnreset") ||
    lower.includes("unexpected token") ||
    lower.includes("syntaxerror") ||
    lower.includes("not valid json") ||
    lower.includes("failed to fetch") ||
    lower.includes("fetch failed") ||
    lower.includes("econnrefused") ||
    lower.includes("etimedout") ||
    lower.includes("socket hang up") ||
    lower.includes("network") ||
    lower.includes("object object") ||
    lower.includes("is not valid json") ||
    lower.includes("too many requests") ||
    lower.includes("aborted")
  )
}

/**
 * Execute a single Supabase query with automatic retry on transient / rate-limit errors.
 *
 * Usage:
 *   const data = await supabaseRetry(() =>
 *     supabase.from("table").select("*").eq("id", id)
 *   )
 *
 * @param queryFn  A **thunk** that returns a Supabase query builder (must be
 *                 called fresh on every retry so `.range()` etc. are not reused).
 * @returns        The `data` array on success, or `[]` on permanent failure.
 */
export async function supabaseRetry<T = any>(
  queryFn: () => PromiseLike<{ data: T | null; error: any }>,
): Promise<T> {
  await acquireSlot()
  try {
    return await _supabaseRetryInner<T>(queryFn)
  } finally {
    releaseSlot()
  }
}

async function _supabaseRetryInner<T = any>(
  queryFn: () => PromiseLike<{ data: T | null; error: any }>,
): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { data, error } = await queryFn()

      if (!error) return data as T

      // Build a comprehensive message string from the error object
      // SyntaxError from JSON.parse may land here as error (not thrown)
      const msg = typeof error === "string"
        ? error
        : [error?.message, error?.name, error?.code, error?.status, String(error)]
            .filter(Boolean)
            .join(" | ")
      if (attempt === MAX_RETRIES) {
        console.error(`[supabaseRetry] retries exhausted after ${MAX_RETRIES} attempts:`, msg)
        return (Array.isArray(data) ? data : data ?? []) as T
      }
      if (!isRetryableMessage(msg)) {
        console.error("[supabaseRetry] non-retryable error:", msg)
        return (Array.isArray(data) ? data : data ?? []) as T
      }

      const delay = BASE_DELAY_MS * Math.pow(2, attempt)
      console.warn(`[supabaseRetry] retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES}): ${msg}`)
      await new Promise((r) => setTimeout(r, delay))
    } catch (thrown: any) {
      const msg = thrown?.message || String(thrown)
      if (attempt === MAX_RETRIES) {
        console.error(`[supabaseRetry] thrown error, retries exhausted after ${MAX_RETRIES} attempts:`, msg)
        return [] as unknown as T
      }
      if (!isRetryableMessage(msg)) {
        console.error("[supabaseRetry] thrown non-retryable error:", msg)
        return [] as unknown as T
      }

      const delay = BASE_DELAY_MS * Math.pow(2, attempt)
      console.warn(`[supabaseRetry] thrown, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES}): ${msg}`)
      await new Promise((r) => setTimeout(r, delay))
    }
  }

  return [] as unknown as T
}
