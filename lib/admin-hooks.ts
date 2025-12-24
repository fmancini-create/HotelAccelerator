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
        const isAdminPage = window.location.pathname.startsWith("/admin")

        if (!isAdminPage) {
          // On public pages, just set loading to false without checking auth
          setIsLoading(false)
          return
        }

        const supabase = createClient()

        // Check if user is logged in with Supabase
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          // Not logged in - redirect to login page if not already there
          if (window.location.pathname !== "/admin" && window.location.pathname !== "/admin/setup") {
            router.push("/admin")
          }
          setIsLoading(false)
          return
        }

        // User is logged in - fetch admin data from database
        const { data: adminData, error } = await supabase.from("admin_users").select("*").eq("id", user.id).single()

        if (error || !adminData) {
          // User not in admin_users table - sign out and redirect
          await supabase.auth.signOut()
          router.push("/admin")
          setIsLoading(false)
          return
        }

        setAdminUser(adminData as AdminUser)
        setIsLoading(false)
      } catch (error) {
        console.error("[v0] Auth error:", error)
        if (window.location.pathname !== "/admin") {
          router.push("/admin")
        }
        setIsLoading(false)
      }
    }

    checkAuth()
  }, [router])

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
