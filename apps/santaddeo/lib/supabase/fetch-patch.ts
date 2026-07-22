// This file MUST be imported first in the root layout to patch globalThis.fetch
// before any Supabase modules are loaded

if (typeof window !== "undefined") {
  const envValue = process.env.NEXT_PUBLIC_BYPASS_AUTH
  const bypassAuth = envValue === "true" || envValue === true

  if (!bypassAuth) {
    console.log("[v0] Fetch patch - Bypass auth is false, skipping fetch wrapper")
  } else {
    console.log("[v0] Fetch patch - Initializing global fetch wrapper")

    // Store the original fetch
    const originalFetch = globalThis.fetch

    // Create a wrapper that handles Supabase calls gracefully
    const wrappedFetch: typeof fetch = async (input, init?) => {
      const url = typeof input === "string" ? input : input.url

      console.log("[v0] Fetch patch - Intercepting fetch call:", url)

      // Check if this is a Supabase auth call
      if (url.includes("supabase.co") && (url.includes("/auth/") || url.includes("/rest/"))) {
        console.log("[v0] Fetch patch - Detected Supabase call, returning mock response")

        // Return a mock successful response for Supabase calls
        return new Response(
          JSON.stringify({
            data: { session: null, user: null },
            error: null,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        )
      }

      // For non-Supabase calls, use the original fetch
      try {
        return await originalFetch(input, init)
      } catch (error) {
        console.error("[v0] Fetch patch - Fetch failed:", error)
        throw error
      }
    }

    // Replace globalThis.fetch with our wrapper
    Object.defineProperty(globalThis, "fetch", {
      value: wrappedFetch,
      writable: true,
      configurable: true,
    })

    console.log("[v0] Fetch patch - Global fetch wrapper installed")
  }
}
