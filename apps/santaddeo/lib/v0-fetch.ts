/**
 * Fetch wrapper for v0 preview environment.
 * In v0 preview, cookies don't work properly between requests.
 * This wrapper automatically adds the Authorization header with the JWT token
 * stored in localStorage after login.
 */
export function v0Fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const isV0Preview = typeof window !== "undefined" && (
    window.location.hostname.includes("vusercontent.net") ||
    window.location.hostname.includes("v0.app") ||
    window.location.hostname.includes("v0.dev")
  )

  if (!isV0Preview) {
    // In production, use regular fetch
    return fetch(input, init)
  }

  // In v0 preview, add Authorization header if we have a token
  const token = localStorage.getItem("sb-santaddeo-auth-token")
  
  if (!token) {
    return fetch(input, init)
  }

  const headers = new Headers(init?.headers)
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`)
  }

  return fetch(input, {
    ...init,
    headers,
  })
}

/**
 * Check if user is authenticated in v0 preview (via localStorage token)
 */
export function isV0Authenticated(): boolean {
  if (typeof window === "undefined") return false
  return !!localStorage.getItem("sb-santaddeo-auth-token")
}

/**
 * Clear v0 auth token (for logout)
 */
export function clearV0Auth(): void {
  if (typeof window === "undefined") return
  localStorage.removeItem("sb-santaddeo-auth-token")
}
