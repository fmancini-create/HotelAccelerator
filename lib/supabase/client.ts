import { createBrowserClient } from "@supabase/ssr"

let client: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  if (typeof window === "undefined") {
    return null as unknown as ReturnType<typeof createBrowserClient>
  }

  // Client-side: use singleton
  if (client) {
    return client
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    console.error("[v0] Supabase env vars not available")
    return null as unknown as ReturnType<typeof createBrowserClient>
  }

  client = createBrowserClient(url, key)
  return client
}

export { createClient as createBrowserClient }
