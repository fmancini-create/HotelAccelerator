import type React from "react"
import Image from "next/image"
import Link from "next/link"
import { redirect } from "next/navigation"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { Badge } from "@/components/ui/badge"
import { SuperAdminNav } from "@/components/superadmin/superadmin-nav"

export const dynamic = "force-dynamic"

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  // In dev (sandbox/localhost) cookies don't propagate, so we use the dev auth helper
  // which returns a stable fake super_admin. In production it does the real cookie-based check.
  const { user, supabase } = await getAuthUserOrDev()

  if (!user) {
    redirect("/auth/login")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "super_admin") {
    redirect("/dashboard")
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto max-w-7xl px-6 py-3 flex flex-wrap items-center justify-between gap-y-3">
          <Link href="/superadmin" className="flex items-center gap-3">
            <Image
              src="/logo-santaddeo.png"
              alt="Santaddeo"
              width={140}
              height={40}
              className="h-8 w-auto"
              priority
            />
            <Badge variant="destructive">Super Admin</Badge>
          </Link>
          <Link
            href="/superadmin"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Torna alla dashboard
          </Link>
          {/* Navigazione principale unica, organizzata per aree. */}
          <div className="w-full border-t border-border pt-3">
            <SuperAdminNav />
          </div>
        </div>
      </header>
      <main className="container mx-auto max-w-7xl px-6 py-8">
        {children}
      </main>
    </div>
  )
}
