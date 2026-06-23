"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import AdminLoginForm from "@/components/admin-login-form"

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

        // User is authenticated in Supabase — verify they are registered as admin
        const { data: adminData } = await supabase
          .from("admin_users")
          .select("id")
          .eq("id", user.id)
          .single()

        if (adminData) {
          window.location.replace("/admin/dashboard")
          return
        }

        // Authenticated user but NOT in admin_users → sign out and show login
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

  // Guest → show the login form
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Admin Login
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Accedi al pannello di amministrazione
          </p>
        </div>
        <AdminLoginForm />
      </div>
    </div>
  )
}
