"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import AdminLoginForm from "@/components/admin-login-form"

export default function AdminPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      const hostname = window.location.hostname
      const isDevOrPreview =
        hostname.includes("vercel.run") ||
        hostname.includes("localhost") ||
        hostname.includes("127.0.0.1") ||
        hostname.includes("vusercontent.net")

      if (isDevOrPreview) {
        router.replace("/admin/dashboard")
        return
      }

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
            router.replace("/admin/dashboard")
            return
          }
        }
      } catch (err) {
        console.error("Auth check error:", err)
      }

      setChecking(false)
    }

    checkAuth()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md p-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Admin Login</h1>
          <p className="text-sm text-muted-foreground mt-1">Accedi al pannello di amministrazione</p>
        </div>
        <AdminLoginForm />
      </div>
    </div>
  )
}


