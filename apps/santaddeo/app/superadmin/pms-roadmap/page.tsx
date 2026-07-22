import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"
import type { Metadata } from "next"
import { PmsRoadmapTable } from "@/components/superadmin/pms-roadmap-table"
import { PmsPublicCatalogManager } from "@/components/superadmin/pms-public-catalog-manager"
import { BackNavigation } from "@/components/superadmin/back-navigation"
import { SuperAdminHeader } from "@/components/superadmin/superadmin-header"
import { AppFooter } from "@/components/layout/app-footer"

export const metadata: Metadata = {
  title: "PMS Roadmap | Superadmin",
  description: "Piano di integrazione PMS per Santaddeo",
}

export const dynamic = "force-dynamic"

export default async function PmsRoadmapPage() {
  const isV0Preview = await isDevAuthAsync()
  const supabase = isV0Preview ? await createClient() : await createClient()

  let user: any = null
  if (isV0Preview) {
    user = { id: "5de43b7b-e661-4e4e-8177-7943df06470c", email: "f.mancini@4bid.it" }
  } else {
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
    if (authError || !authUser) {
      redirect("/auth/login")
    }
    user = authUser

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
    if (!profile || (profile.role !== "superadmin" && profile.role !== "super_admin")) {
      redirect("/dashboard")
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <SuperAdminHeader />
      <BackNavigation />
      <div className="container mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">PMS Integration Roadmap</h1>
          <p className="text-muted-foreground mt-2">Piano di azione per integrare i PMS in Santaddeo</p>
        </div>
        <PmsRoadmapTable />

        <div className="mt-12">
          <div className="mb-4">
            <h2 className="text-2xl font-bold text-foreground">Vetrina pubblica</h2>
            <p className="text-muted-foreground mt-1">
              Gestisci l&apos;elenco dei gestionali mostrato su /integrazioni e nella dashboard venditori.
            </p>
          </div>
          <PmsPublicCatalogManager />
        </div>
      </div>
      <AppFooter />
    </div>
  )
}
