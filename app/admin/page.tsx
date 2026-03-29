"use client"

import { useEffect } from "react"
import { createClient } from "@/lib/supabase/client"

export default function AdminPage() {
  useEffect(() => {
    const checkAndRedirect = async () => {
      const hostname = window.location.hostname
      const isDevOrPreview =
        hostname.includes("vercel.run") ||
        hostname.includes("localhost") ||
        hostname.includes("127.0.0.1") ||
        hostname.includes("vusercontent.net")

      if (isDevOrPreview) {
        window.location.replace("/admin/dashboard")
        return
      }

      // In production, check auth first to avoid redirect loop
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (user) {
          const { data: adminData } = await supabase
            .from("admin_users")
            .select("id")
            .eq("id", user.id)
            .single()

          if (adminData) {
            window.location.replace("/admin/dashboard")
            return
          }
        }
      } catch (err) {
        console.error("Auth check error:", err)
      }

      // Not authenticated in production - redirect to setup page (which has login)
      window.location.replace("/admin/setup")
    }

    checkAndRedirect()
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary" />
    </div>
  )
}


