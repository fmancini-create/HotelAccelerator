"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import UnifiedLoginForm from "@/components/auth/unified-login-form"
import { authorizeUser } from "@/lib/auth/authorize-user"

type GateState = "checking" | "authenticated" | "guest"

export default function AdminPage() {
  const [state, setState] = useState<GateState>("checking")

  useEffect(() => {
    const checkAuth = async () => {
      // DEV BYPASS: skip auth SOLO in sviluppo locale (NODE_ENV=development su
      // host localhost/127.0.0.1, match esatto). Mai su preview pubbliche o
      // produzione (host raggiungibili da terzi).
      const hostname =
        typeof window !== "undefined" ? window.location.hostname.split(":")[0].trim().toLowerCase() : ""
      const isLocalDevBypass =
        process.env.NODE_ENV === "development" && (hostname === "localhost" || hostname === "127.0.0.1")

      if (isLocalDevBypass) {
        window.location.replace("/admin/dashboard")
        return
      }

      try {
        const supabase = createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          setState("guest")
          return
        }

        // User already authenticated: route by role (admin -> dashboard,
        // super_admin -> /super-admin) with the same shared gate used at login.
        const result = await authorizeUser(supabase, user)

        if (result.authorized) {
          window.location.replace(result.destination)
          return
        }

        // Authenticated user but not authorized → sign out and show login
        await supabase.auth.signOut()
        setState("guest")
      } catch (err) {
        console.error("[v0] /admin auth check failed:", err)
        setState("guest")
      }
    }

    checkAuth()
  }, [])

  if (state === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary" />
      </div>
    )
  }

  if (state === "authenticated") {
    return null
  }

  // Guest → show the unified login form (stessa UI per tutti i ruoli)
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground text-balance">HotelAccelerator</h1>
          <p className="mt-1 text-sm text-muted-foreground">Accedi alla piattaforma</p>
        </div>
        <UnifiedLoginForm />
      </div>
    </main>
  )
}
