"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

// NOTE: NO top-level import of @/lib/supabase/client
// This prevents v0 bundler from pre-loading @supabase/auth-js which causes GoTrueClient._getUser() side effects

/**
 * Handles Supabase implicit auth flow (hash fragment tokens).
 * DISABLED in v0 preview: onAuthStateChange() triggers GoTrueClient._getUser()
 * which fails in the v0 sandbox. In preview, all auth is server-side via /api/auth/*.
 */
export function AuthHashHandler() {
  const router = useRouter()

  useEffect(() => {
    // Check if we're in v0 preview FIRST, before loading any Supabase code
    const isV0Preview = typeof window !== "undefined" && (
      window.location.hostname.includes("vusercontent.net") ||
      window.location.hostname.includes("v0.dev") ||
      window.location.hostname.startsWith("preview-")
    )

    if (isV0Preview) {
      // NEVER load Supabase in v0 preview - prevents GoTrueClient._getUser()
      return
    }

    const hash = window.location.hash
    if (!hash || !hash.includes("access_token")) return

    console.log("[AuthHashHandler] Detected access_token in hash, loading Supabase client...")

    // Dynamic import: only loads @supabase/auth-js in PRODUCTION when needed
    import("@/lib/supabase/client").then(({ createClient }) => {
      const supabase = createClient()

      // Parse the hash to check for type before it gets cleaned
      const params = new URLSearchParams(hash.substring(1))
      const type = params.get("type")

      // Listen for auth state change - Supabase client will process the hash
      // fragment and emit SIGNED_IN when the session is established.
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (event, session) => {
          if (event === "SIGNED_IN" && session?.user) {
            console.log("[AuthHashHandler] Session established via onAuthStateChange")

            // Clean the hash from the URL
            window.history.replaceState(null, "", window.location.pathname)

            if (type === "signup") {
              router.push("/onboarding")
            } else {
              router.push("/dashboard")
            }
          }
        }
      )

      // Timeout: if no auth state change within 10s, redirect to login
      const timeout = setTimeout(() => {
        console.error("[AuthHashHandler] Timeout waiting for auth state change")
        subscription.unsubscribe()
        window.location.href = "/auth/login?error=hash_auth_timeout"
      }, 10000)
    }).catch((err) => {
      console.error("[AuthHashHandler] Failed to load Supabase client:", err)
    })

    // Outer cleanup - nothing to clean since subscription is inside the promise
    return () => {}
  }, [router])

  return null
}
