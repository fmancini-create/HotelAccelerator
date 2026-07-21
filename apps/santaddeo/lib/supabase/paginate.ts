/**
 * Supabase / PostgREST paginated fetch helpers.
 *
 * Why this file exists
 * --------------------
 * Supabase hosted PostgREST enforces a hard cap of 1000 rows per request.
 * A single `.range(0, 9999)` call is silently truncated to 1000 rows by the
 * server (no error, no warning — just a `Content-Range: 0-999/*` header that
 * the @supabase/supabase-js client does not surface).
 *
 * Any query that can return more than ~1000 rows for a realistic input MUST
 * paginate via successive `.range()` calls until the page is smaller than
 * the page size. This module centralises that logic so every callsite gets
 * the same robust implementation (including retry for transient 429 / rate
 * limit / network errors).
 *
 * Usage
 * -----
 * The query MUST be passed as a factory (`() => supabase.from(...).select(...)`),
 * not as a pre-built query object. Supabase query builders are single-shot:
 * calling `.range()` on the same object twice produces undefined behaviour.
 * The factory is invoked once per page so each iteration gets a fresh builder.
 *
 *     // Returns { data, error } — use when you need to surface errors.
 *     const { data, error } = await fetchAllPaginated<Booking>(
 *       () => supabase.from("bookings").select("*").eq("hotel_id", hotelId)
 *     )
 *
 *     // Returns T[] directly — errors are logged but the partial result is
 *     // returned. Use when the caller wants to degrade gracefully.
 *     const rows = await fetchAllPaginatedOrLog<Booking>(
 *       () => supabase.from("bookings").select("*").eq("hotel_id", hotelId),
 *       "bookings-for-dashboard"
 *     )
 */

const DEFAULT_PAGE_SIZE = 1000
const DEFAULT_MAX_RETRIES = 4
const DEFAULT_BASE_DELAY_MS = 1000
// Safety cap: at 1000 rows/page this caps the total at 100k rows. Anything
// beyond that almost certainly indicates a missing filter in the caller.
const MAX_ITERATIONS = 100

export interface PaginateOptions {
  /** Rows per request. Supabase caps at 1000, there is no reason to go lower. */
  pageSize?: number
  /** Retries per page on transient errors. 0 disables retry. */
  maxRetries?: number
  /** Base delay (ms) for exponential backoff between retries. */
  baseDelayMs?: number
}

/**
 * Paginated fetch with retry. Iterates `.range()` on the builder returned by
 * `buildQuery` until a page shorter than `pageSize` is received or an error
 * is raised that is not retryable.
 *
 * Always returns whatever rows were accumulated before an error, so callers
 * can choose between failing hard or degrading gracefully.
 */
export async function fetchAllPaginated<T = any>(
  buildQuery: () => any,
  options: PaginateOptions = {},
): Promise<{ data: T[]; error: any }> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS

  const rows: T[] = []
  let from = 0

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let page: T[] | null = null
    let lastError: any = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const { data, error } = await buildQuery().range(from, from + pageSize - 1)

        if (!error) {
          page = data as T[] | null
          lastError = null
          break
        }

        const msg = typeof error === "string" ? error : error?.message || ""
        if (!isRetryableError(msg) || attempt === maxRetries) {
          lastError = error
          break
        }

        await sleep(baseDelayMs * Math.pow(2, attempt))
      } catch (thrown: any) {
        // Supabase can THROW (not return) on non-JSON upstream responses
        // (e.g. "Too Many Requests" as plain text triggers a JSON.parse error
        // inside the client before {data, error} is constructed).
        const msg = thrown?.message || String(thrown)
        if (!isRetryableError(msg) || attempt === maxRetries) {
          lastError = thrown
          break
        }
        await sleep(baseDelayMs * Math.pow(2, attempt))
      }
    }

    if (lastError) return { data: rows, error: lastError }
    if (!page || page.length === 0) break
    rows.push(...page)
    if (page.length < pageSize) break // last page
    from += pageSize
  }

  return { data: rows, error: null }
}

/**
 * Convenience wrapper: returns `T[]` directly. Errors are logged to the
 * console (with the supplied `context` tag) but the partial result is still
 * returned so the caller can degrade gracefully.
 */
export async function fetchAllPaginatedOrLog<T = any>(
  buildQuery: () => any,
  context: string = "paginate",
  options?: PaginateOptions,
): Promise<T[]> {
  const { data, error } = await fetchAllPaginated<T>(buildQuery, options)
  if (error) {
    const msg = typeof error === "string" ? error : error?.message || JSON.stringify(error)
    console.error(`[paginate:${context}] returning ${data.length} partial rows after error:`, msg)
  }
  return data
}

export interface KeysetKey {
  /** Column name that participates in the ordering / cursor. */
  column: string
  /** Sort direction. Defaults to ascending. */
  ascending?: boolean
}

/**
 * KEYSET (cursor) pagination — the correct tool when a query can return tens of
 * thousands of rows.
 *
 * Why not `fetchAllPaginated` (OFFSET)?
 * -------------------------------------
 * OFFSET pagination (`.range(from, from+size)`) re-scans and re-fetches every
 * row before the offset on each page: page N pays for N*pageSize skipped rows.
 * On large result sets this is O(n²) and, combined with a heap fetch for the
 * selected columns, blows past Postgres `statement_timeout` (observed on
 * rate-trend-history: ~52k rows -> 14s+ per deep page -> timeout, only 20k
 * partial rows returned).
 *
 * Keyset pagination instead remembers the last row's key tuple and asks for
 * "the next rows AFTER this tuple". Each page is a fresh index range seek of
 * constant cost, so total work is O(n). It REQUIRES:
 *   1. A `keys` tuple that is UNIQUE and matches the query's ORDER BY (end the
 *      tuple with a unique column such as the primary key `id`).
 *   2. An index whose leading columns are the query's equality filters followed
 *      by the `keys` columns, so each seek stays fast and avoids a sort.
 *
 * The builder factory MUST return a fresh query WITHOUT `.order()` / `.range()`
 * (those are applied here per page).
 *
 * NOTE: key VALUES are interpolated into a PostgREST `or=(...)` filter, so this
 * helper is safe only for value types without commas/parentheses (uuid, date,
 * timestamp, number). That covers every intended callsite.
 */
export async function fetchAllKeyset<T = any>(
  buildQuery: () => any,
  keys: KeysetKey[],
  options: PaginateOptions = {},
): Promise<{ data: T[]; error: any }> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS

  if (keys.length === 0) {
    return { data: [], error: new Error("fetchAllKeyset requires at least one key column") }
  }

  const rows: T[] = []
  let cursor: Record<string, any> | null = null

  const applyOrder = (q: any) => {
    let out = q
    for (const k of keys) out = out.order(k.column, { ascending: k.ascending ?? true })
    return out
  }

  // Build the "strictly after the cursor" predicate as a PostgREST or-group.
  // For keys [a,b,c] ascending after (va,vb,vc):
  //   a>va OR (a=va AND b>vb) OR (a=va AND b=vb AND c>vc)
  const buildCursorFilter = (c: Record<string, any>): string => {
    const clauses: string[] = []
    for (let i = 0; i < keys.length; i++) {
      const eqPart = keys
        .slice(0, i)
        .map((k) => `${k.column}.eq.${c[k.column]}`)
      const k = keys[i]
      const cmp = (k.ascending ?? true) ? "gt" : "lt"
      const gtPart = `${k.column}.${cmp}.${c[k.column]}`
      const all = [...eqPart, gtPart]
      clauses.push(all.length === 1 ? all[0] : `and(${all.join(",")})`)
    }
    return clauses.join(",")
  }

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let page: T[] | null = null
    let lastError: any = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        let q = applyOrder(buildQuery()).limit(pageSize)
        if (cursor) {
          // SARGABILITY (critico): il predicato OR del cursore da solo viene
          // applicato da Postgres come Filter, ripartendo dall'inizio del range
          // -> re-scan O(n²) sulle pagine profonde. Aggiungiamo anche un bound
          // secco sulla PRIMA chiave (gte se asc, lte se desc): e' logicamente
          // implicito nel predicato OR (tutte le righe restituite hanno
          // firstKey >= cursore), quindi non esclude nulla, ma rende l'Index
          // Cond capace di fare SEEK diretto al cursore. Cosi' il Filter scarta
          // solo le poche righe gia' viste nel gruppo di confine, non tutte
          // quelle precedenti. Verificato su rate-trend: ~1.5k righe scartate e
          // ~550ms/pagina, costante a qualsiasi profondita'.
          const first = keys[0]
          const firstAsc = first.ascending ?? true
          q = firstAsc ? q.gte(first.column, cursor[first.column]) : q.lte(first.column, cursor[first.column])
          q = q.or(buildCursorFilter(cursor))
        }
        const { data, error } = await q

        if (!error) {
          page = data as T[] | null
          lastError = null
          break
        }
        const msg = typeof error === "string" ? error : error?.message || ""
        if (!isRetryableError(msg) || attempt === maxRetries) {
          lastError = error
          break
        }
        await sleep(baseDelayMs * Math.pow(2, attempt))
      } catch (thrown: any) {
        const msg = thrown?.message || String(thrown)
        if (!isRetryableError(msg) || attempt === maxRetries) {
          lastError = thrown
          break
        }
        await sleep(baseDelayMs * Math.pow(2, attempt))
      }
    }

    if (lastError) return { data: rows, error: lastError }
    if (!page || page.length === 0) break
    rows.push(...page)
    if (page.length < pageSize) break // last page

    const last = page[page.length - 1] as Record<string, any>
    cursor = {}
    for (const k of keys) cursor[k.column] = last[k.column]
  }

  return { data: rows, error: null }
}

/** Keyset variant of `fetchAllPaginatedOrLog`: returns T[], logs partial on error. */
export async function fetchAllKeysetOrLog<T = any>(
  buildQuery: () => any,
  keys: KeysetKey[],
  context: string = "keyset",
  options?: PaginateOptions,
): Promise<T[]> {
  const { data, error } = await fetchAllKeyset<T>(buildQuery, keys, options)
  if (error) {
    const msg = typeof error === "string" ? error : error?.message || JSON.stringify(error)
    console.error(`[keyset:${context}] returning ${data.length} partial rows after error:`, msg)
  }
  return data
}

/** Internal: classify error messages as retryable (transient) or not. */
function isRetryableError(msg: string): boolean {
  return (
    msg.includes("Too Many R") ||
    msg.includes("rate") ||
    msg.includes("429") ||
    msg.includes("timeout") ||
    msg.includes("ECONNRESET") ||
    msg.includes("SyntaxError") ||
    msg.includes("Unexpected token")
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
