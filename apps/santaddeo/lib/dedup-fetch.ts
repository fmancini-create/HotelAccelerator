/**
 * Deduplicating fetch: if the same GET URL is requested multiple times within
 * a short window, only one actual HTTP request is made. All callers share
 * the cached JSON result. This prevents Supabase 429 "Too Many Requests"
 * caused by multiple dashboard components fetching the same API in parallel.
 */

const DEDUP_WINDOW_MS = 3000

interface CacheEntry {
  promise: Promise<any>
  ts: number
}

const _cache = new Map<string, CacheEntry>()

/**
 * Fetches a URL and returns parsed JSON, deduplicating identical GET requests
 * within a 3-second window. Non-GET or failed requests are not cached.
 *
 * Usage: `const data = await dedupFetchJson<MyType>(url)`
 */
export async function dedupFetchJson<T = any>(url: string, init?: RequestInit): Promise<T> {
  const method = init?.method?.toUpperCase() || "GET"

  // Only dedup GET requests
  if (method !== "GET") {
    const res = await fetch(url, init)
    return res.json()
  }

  const existing = _cache.get(url)
  if (existing && Date.now() - existing.ts < DEDUP_WINDOW_MS) {
    return existing.promise as Promise<T>
  }

  const promise = fetch(url, init)
    .then(async (res) => {
      if (!res.ok) {
        // Don't cache errors
        _cache.delete(url)
        return {} as T
      }
      return res.json() as Promise<T>
    })
    .catch(() => {
      _cache.delete(url)
      return {} as T
    })

  _cache.set(url, { promise, ts: Date.now() })

  // Auto-cleanup
  setTimeout(() => {
    const entry = _cache.get(url)
    if (entry && Date.now() - entry.ts >= DEDUP_WINDOW_MS) {
      _cache.delete(url)
    }
  }, DEDUP_WINDOW_MS + 100)

  return promise as Promise<T>
}
