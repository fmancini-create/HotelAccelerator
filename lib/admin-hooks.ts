"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { adminUserFromPlatformMe, type AdminUser, type PlatformMePayload } from "@/lib/auth/admin-user-view"
import { createClient } from "@/lib/supabase/client"

export type { AdminUser } from "@/lib/auth/admin-user-view"

export function useAdminAuth() {
  const [isLoading, setIsLoading] = useState(true)
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null)
  const router = useRouter()

  useEffect(() => {
    let cancelled = false

    const checkAuth = async () => {
      try {
        // Only check auth on admin pages, but skip if we're already redirecting
        const isAdminPage = window.location.pathname.startsWith("/admin")
        if (!isAdminPage) {
          setIsLoading(false)
          return
        }

        // DEV BYPASS: auto-login UI consentito SOLO in sviluppo locale
        // (NODE_ENV=development su host localhost/127.0.0.1). Mai su preview
        // pubbliche o produzione (host raggiungibili da terzi).
        const hostname = typeof window !== "undefined" ? window.location.hostname.split(":")[0].trim().toLowerCase() : ""
        const isLocalDevHost =
          process.env.NODE_ENV === "development" && (hostname === "localhost" || hostname === "127.0.0.1")

        if (isLocalDevHost) {
          setAdminUser({
            id: "dev-user",
            email: "dev@hotelaccelerator.local",
            name: "Dev Admin",
            role: "admin",
            property_id: "c16ad260-2c34-4544-9909-5cd444773986",
            can_upload: true,
            can_delete: true,
            can_move: true,
            can_manage_users: true,
          } as any)
          setIsLoading(false)
          return
        }

        const response = await fetch("/api/platform/me", {
          credentials: "include",
          cache: "no-store",
        })
        if (cancelled) return

        if (response.status === 401) {
          setAdminUser(null)
          setIsLoading(false)
          return
        }
        if (!response.ok) throw new Error(`PLATFORM_ME_${response.status}`)

        const identity = (await response.json()) as PlatformMePayload
        if (cancelled) return
        setAdminUser(adminUserFromPlatformMe(identity))
        setIsLoading(false)
      } catch (error) {
        console.error("[v0] Auth error:", error)
        if (!cancelled) setIsLoading(false)
      }
    }

    void checkAuth()
    return () => {
      cancelled = true
    }
  }, [])

  const logout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/admin")
  }

  return {
    isLoading,
    user: null,
    adminUser,
    logout,
    isAuthenticated: !!adminUser,
  }
}

export function getRoleLabel(role: string): string {
  switch (role) {
    case "super_admin":
      return "Super Admin"
    case "admin":
      return "Amministratore"
    case "editor":
      return "Editor"
    default:
      return role
  }
}
