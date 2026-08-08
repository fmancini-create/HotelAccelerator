/**
 * Production-only Supabase browser client
 * This file is ONLY imported in production builds (not v0 preview)
 * DO NOT import this file directly - use browser-client.ts instead
 */
import { createBrowserClient } from "@supabase/ssr"
import { getPublicSupabaseConfig } from "@/lib/supabase/config"

let client: ReturnType<typeof createBrowserClient> | null = null

export function getProductionClient() {
  if (!client) {
    const { url, publishableKey } = getPublicSupabaseConfig()
    client = createBrowserClient(url, publishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
        storageKey: "sb-santaddeo-auth",
      },
    })
  }
  return client
}
