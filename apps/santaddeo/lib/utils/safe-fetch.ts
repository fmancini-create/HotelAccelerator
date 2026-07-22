/**
 * Safe fetch utility that handles HTML error responses gracefully
 * instead of throwing JSON parse errors
 */
export async function safeFetch<T>(
  url: string,
  options?: RequestInit,
): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(url, options)

    // Check if response is OK
    if (!res.ok) {
      // Try to get error message from response
      const contentType = res.headers.get("content-type") || ""
      if (contentType.includes("application/json")) {
        try {
          const errorData = await res.json()
          return { data: null, error: errorData.error || errorData.message || `HTTP ${res.status}` }
        } catch {
          return { data: null, error: `HTTP ${res.status}: ${res.statusText}` }
        }
      }
      return { data: null, error: `HTTP ${res.status}: ${res.statusText}` }
    }

    // Verify content type is JSON
    const contentType = res.headers.get("content-type") || ""
    if (!contentType.includes("application/json")) {
      console.error(`[safeFetch] Expected JSON but got ${contentType} from ${url}`)
      return { data: null, error: `Invalid response type: ${contentType}` }
    }

    // Parse JSON
    const data = await res.json()
    return { data, error: null }
  } catch (error) {
    console.error(`[safeFetch] Error fetching ${url}:`, error)
    return { data: null, error: error instanceof Error ? error.message : "Network error" }
  }
}

/**
 * Safe JSON fetch that returns null on error instead of throwing
 */
export async function fetchJson<T>(url: string, options?: RequestInit): Promise<T | null> {
  const { data } = await safeFetch<T>(url, options)
  return data
}
