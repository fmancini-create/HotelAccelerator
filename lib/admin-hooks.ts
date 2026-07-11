"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

export interface AdminUser {
  id?: string
  email: string
  name: string
  role: "super_admin" | "admin" | "editor"
  can_upload: boolean
  can_delete: boolean
  can_move: boolean
  can_manage_users: boolean
  can_manage_categories?: boolean
  property_id?: string
  created_at?: string
  updated_at?: string
}

export function useAdminAuth() {
  const [isLoading, setIsLoading] = useState(true)
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null)
  const router = useRouter()

  useEffect(() => {
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

        const supabase = createClient()

        // Check if user is logged in with Supabase
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          // Not logged in - don't redirect (pages handle their own auth guards)
          setIsLoading(false)
          return
        }

        // User is logged in - fetch admin data from database
        const { data: adminData, error } = await supabase.from("admin_users").select("*").eq("id", user.id).single()

        if (error || !adminData) {
          // User not in admin_users table - sign out but don't redirect
          await supabase.auth.signOut()
          setIsLoading(false)
          return
        }

        setAdminUser(adminData as AdminUser)
        setIsLoading(false)
      } catch (error) {
        console.error("[v0] Auth error:", error)
        setIsLoading(false)
      }
    }

    checkAuth()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
