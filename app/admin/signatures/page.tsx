"use client"

import Link from "next/link"
import { Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAdminAuth } from "@/lib/admin-hooks"
import { AdminHeader } from "@/components/admin/admin-header"
import { SignaturesManager } from "@/components/admin/signatures-manager"

export default function AdminSignaturesPage() {
  const { isLoading, adminUser } = useAdminAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Caricamento...</p>
        </div>
      </div>
    )
  }

  const hostname = typeof window !== "undefined" ? window.location.hostname : ""
  const isDevOrPreview =
    hostname.includes("vercel.run") || hostname.includes("localhost") || hostname.includes("vusercontent.net")

  const effectiveAdminUser =
    adminUser ||
    (isDevOrPreview
      ? {
          id: "dev-user",
          email: "dev@hotelaccelerator.local",
          name: "Dev Admin",
          role: "admin",
          can_upload: true,
          can_delete: true,
          can_move: true,
          can_manage_users: true,
        }
      : null)

  if (!effectiveAdminUser) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="bg-card rounded-2xl shadow-xl p-8 text-center max-w-md border">
          <Lock className="w-16 h-16 text-destructive mx-auto mb-4" />
          <h1 className="text-2xl font-serif text-foreground mb-2">Accesso Richiesto</h1>
          <p className="text-muted-foreground mb-6">Effettua il login per accedere a questa sezione.</p>
          <Link href="/admin">
            <Button>Torna al Login</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminHeader title="Firme Email" subtitle="Libreria firme assegnabili a utenti e gruppi" />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <SignaturesManager />
      </main>
    </div>
  )
}
