import { redirect } from "next/navigation"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"
import { SuperAdminHeader } from "@/components/superadmin/superadmin-header"
import { AppFooter } from "@/components/layout/app-footer"
import { BackNavigation } from "@/components/superadmin/back-navigation"
import { ProgressiveSandboxClient } from "@/components/superadmin/progressive-sandbox-client"

export const dynamic = "force-dynamic"

export default async function ProgressiveSandboxPage() {
  const isV0Preview = await isDevAuthAsync()
  const supabase = await createClient()

  if (!isV0Preview) {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      redirect("/auth/login")
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()
    if (!profile || profile.role !== "super_admin") {
      redirect("/dashboard")
    }
  }

  const sb = await createServiceRoleClient()
  const { data: hotels } = await sb
    .from("hotels")
    .select("id, name")
    .is("deleted_at", null)
    .eq("is_active", true)
    .order("name", { ascending: true })

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SuperAdminHeader />
      <main className="flex-1 container mx-auto py-6 px-4 max-w-6xl">
        <BackNavigation />
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Sandbox Modello Progressive</h1>
          <p className="text-muted-foreground mt-2 text-pretty">
            Simulatore del terzo algoritmo di pricing in sperimentazione.
            Calcola la curva P(X) = ((PMAX - PI)·A^(X-1) + PI·A^(N-1) - PMAX) / (A^(N-1) - 1).
            Nessuna scrittura su DB, nessun impatto su pricing_grid o PMS.
          </p>
        </div>
        <ProgressiveSandboxClient hotels={hotels || []} />
      </main>
      <AppFooter />
    </div>
  )
}
