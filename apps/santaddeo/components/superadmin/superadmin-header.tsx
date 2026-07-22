"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PageNavigation } from "@/components/layout/page-navigation"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { Users, LogOut } from "lucide-react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/browser-client"

export function SuperAdminHeader() {
  const router = useRouter()

  const handleStopImpersonation = async () => {
    try {
      await fetch("/api/superadmin/impersonate", { method: "DELETE" })
      router.refresh()
    } catch (error) {
      console.error("Error stopping impersonation:", error)
    }
  }

  const handleLogout = async () => {
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
      window.location.href = "/auth/login"
    } catch {
      window.location.href = "/auth/login"
    }
  }

  return (
    <header className="border-b bg-white">
      <div className="container mx-auto flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-6">
          <PageNavigation />
          <div className="flex items-center gap-3">
            <img src="/logo-santaddeo.png" alt="SANTADDEO" width={140} height={40} className="h-10 w-auto" />
            <Badge className="bg-red-600 text-white">SuperAdmin</Badge>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <NotificationBell />
          <Button variant="outline" size="sm" onClick={handleStopImpersonation}>
            <Users className="h-4 w-4 mr-2" />
            Esci da Impersonazione
          </Button>
          <Button variant="destructive" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Esci
          </Button>
          <Badge variant="outline">Sistema v1.0</Badge>
        </div>
      </div>
    </header>
  )
}
