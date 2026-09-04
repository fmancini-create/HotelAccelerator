"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"

import { AutoLogoutWatchdog } from "@/components/admin/auto-logout-watchdog"
import { ClientToaster } from "@/components/admin/client-toaster"
import { PlatformShell } from "@/components/platform/platform-shell"
import { createClient } from "@/lib/supabase/client"

/**
 * Guardia e cornice dell'area PIATTAFORMA.
 *
 * `/super-admin/*` non condivide piu' navigazione, tenant switcher o licenza
 * con `/admin/*`. Condivide soltanto il contenitore tecnico (scroll/footer),
 * mentre `scope="platform"` monta il menu Super Admin dedicato.
 */
export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      if (pathname === "/super-admin/login") {
        setIsChecking(false)
        return
      }

      try {
        const supabase = createClient()
        const hostname = typeof window !== "undefined" ? window.location.hostname : ""
        const isLocalDevHost =
          process.env.NODE_ENV === "development" && (hostname === "localhost" || hostname === "127.0.0.1")

        if (isLocalDevHost) {
          setIsChecking(false)
          return
        }

        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser()
        if (authError || !user) {
          router.push("/admin")
          return
        }

        const { data: collaborator, error: collaboratorError } = await supabase
          .from("platform_collaborators")
          .select("role, is_active, email")
          .eq("email", user.email)
          .maybeSingle()

        if (collaboratorError || !collaborator) {
          router.push("/admin")
          return
        }

        if (collaborator.role !== "super_admin" || !collaborator.is_active) {
          await supabase.auth.signOut()
          router.push("/admin")
          return
        }

        setIsChecking(false)
      } catch {
        router.push("/admin")
      }
    }

    checkAuth()
  }, [pathname, router])

  if (pathname === "/super-admin/login") return <>{children}</>

  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <span className="w-8 h-8 border-4 border-border border-t-foreground rounded-full animate-spin" aria-hidden />
          <p className="text-sm text-muted-foreground">Verifico i permessi Super Admin...</p>
        </div>
      </div>
    )
  }

  return (
    <PlatformShell scope="platform">
      {children}
      <ClientToaster />
      <AutoLogoutWatchdog />
    </PlatformShell>
  )
}
