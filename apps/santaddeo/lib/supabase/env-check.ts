/**
 * Supabase environment consistency guard.
 *
 * Verifies that the Supabase URL and JWT keys belong to the same project
 * by comparing the "ref" in the URL subdomain with the "ref" claim inside
 * the JWT payload.  If they don't match the app logs a clear error and throws.
 *
 * Call once at module level (top of lib/supabase/server.ts) so the mismatch
 * is caught at the very first import, not after a mysterious 401.
 */

function extractRefFromUrl(url: string): string | null {
  try {
    const hostname = new URL(url).hostname // "aeynirkfixurikshxfov.supabase.co"
    const ref = hostname.split(".")[0]
    return ref || null
  } catch {
    return null
  }
}

function extractRefFromJwt(jwt: string): string | null {
  try {
    const parts = jwt.split(".")
    if (parts.length < 2) return null
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/")
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4)
    const payload = JSON.parse(atob(padded))
    return payload.ref || null
  } catch {
    return null
  }
}

export function assertSupabaseEnv(url: string, anonKey: string, serviceRoleKey?: string): void {
  // Skip validation during build time when env vars might not be available
  // This is safe because runtime will still have proper env vars
  const isBuildTime = process.env.NEXT_PHASE === "phase-production-build" || 
                      (!anonKey && process.env.NODE_ENV === "production")
  
  if (isBuildTime) {
    console.log("[supabase] Skipping env validation during build phase")
    return
  }

  const urlRef = extractRefFromUrl(url)

  if (!urlRef) {
    console.error("[SUPABASE CONFIG ERROR] Cannot extract project ref from URL:", url)
    throw new Error("Supabase URL is malformed -- cannot extract project ref")
  }

  // Check anon key - warn but don't throw if empty (might be intentional in some envs)
  if (!anonKey) {
    console.warn("[SUPABASE CONFIG WARNING] Anon key is empty - some features may not work")
    return
  }

  const anonRef = extractRefFromJwt(anonKey)
  if (!anonRef) {
    console.error("[SUPABASE CONFIG ERROR] Cannot decode anon key JWT")
    throw new Error("Supabase anon key is not a valid JWT")
  }

  if (urlRef !== anonRef) {
    console.error(
      `[SUPABASE CONFIG ERROR] URL/KEY MISMATCH!\n` +
      `  URL project ref:      ${urlRef}\n` +
      `  Anon key project ref: ${anonRef}\n` +
      `  These must be the same Supabase project.`
    )
    throw new Error(`Supabase URL and ANON KEY belong to different projects: URL=${urlRef}, KEY=${anonRef}`)
  }

  // Check service role key (if provided)
  if (serviceRoleKey) {
    const serviceRef = extractRefFromJwt(serviceRoleKey)
    if (!serviceRef) {
      console.error("[SUPABASE CONFIG ERROR] Cannot decode service_role key JWT")
      throw new Error("Supabase service_role key is not a valid JWT")
    }

    if (urlRef !== serviceRef) {
      console.error(
        `[SUPABASE CONFIG ERROR] URL/SERVICE_ROLE KEY MISMATCH!\n` +
        `  URL project ref:              ${urlRef}\n` +
        `  Service role key project ref: ${serviceRef}\n` +
        `  These must be the same Supabase project.`
      )
      throw new Error(`Supabase URL and SERVICE_ROLE KEY belong to different projects: URL=${urlRef}, KEY=${serviceRef}`)
    }
  }
}
