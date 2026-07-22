/**
 * Production-only Supabase browser client
 * This file is ONLY imported in production builds (not v0 preview)
 * DO NOT import this file directly - use browser-client.ts instead
 */
import { createBrowserClient } from "@supabase/ssr"

const SUPABASE_URL = "https://aeynirkfixurikshxfov.supabase.co"
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFleW5pcmtmaXh1cmlrc2h4Zm92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0MTQyMDMsImV4cCI6MjA3Njk5MDIwM30.NhCFYvT7fvsuEwvhP7em7vDKifRa6RmnfdVYwUvKWp0"

let client: ReturnType<typeof createBrowserClient> | null = null

export function getProductionClient() {
  if (!client) {
    client = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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
