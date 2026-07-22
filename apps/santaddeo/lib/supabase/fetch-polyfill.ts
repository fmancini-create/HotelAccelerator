"use client"

// This must run BEFORE any Supabase client is created
if (typeof window !== "undefined") {
  const originalFetch = window.fetch

  function createXHRFetch(): typeof fetch {
    return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
        const method = init?.method || "GET"

        console.log("[v0] XHR Polyfill - Making request:", method, url)

        xhr.open(method, url)

        // Set headers
        if (init?.headers) {
          const headers = new Headers(init.headers)
          headers.forEach((value, key) => {
            xhr.setRequestHeader(key, value)
          })
        }

        // Handle response
        xhr.onload = () => {
          console.log("[v0] XHR Polyfill - Response received:", xhr.status)

          const headers = new Headers()
          xhr
            .getAllResponseHeaders()
            .split("\r\n")
            .forEach((line) => {
              const parts = line.split(": ")
              if (parts.length === 2) {
                headers.append(parts[0], parts[1])
              }
            })

          const response = new Response(xhr.responseText, {
            status: xhr.status,
            statusText: xhr.statusText,
            headers,
          })

          resolve(response)
        }

        xhr.onerror = () => {
          console.error("[v0] XHR Polyfill - Request failed")
          reject(new TypeError("Network request failed"))
        }

        xhr.ontimeout = () => {
          console.error("[v0] XHR Polyfill - Request timeout")
          reject(new TypeError("Network request timeout"))
        }

        // Send request
        if (init?.body) {
          xhr.send(init.body as XMLHttpRequestBodyInit)
        } else {
          xhr.send()
        }
      })
    }
  }

  const envValue = process.env.NEXT_PUBLIC_BYPASS_AUTH
  const bypassAuth = envValue === "true" || envValue === true

  // Check if we're in v0 environment
  const isV0Environment =
    (window as any).__v0__ ||
    window.location?.hostname?.includes("vusercontent.net") ||
    window.location?.hostname?.includes("v0.app")

  console.log(
    "[v0] Fetch Polyfill - raw env:",
    envValue,
    "| bypassAuth:",
    bypassAuth,
    "| isV0Environment:",
    isV0Environment,
  )

  // If not bypassing auth and in v0 environment, replace fetch with XHR
  if (!bypassAuth && isV0Environment) {
    console.log("[v0] Fetch Polyfill - Replacing globalThis.fetch with XHR-based fetch")
    window.fetch = createXHRFetch() as any
    ;(globalThis as any).fetch = window.fetch
  }
}

// Export empty object to make this a valid module
export {}
