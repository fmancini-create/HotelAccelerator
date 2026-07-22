import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"
import { PageHeader } from "@/components/layout/page-header"
import { BackNavigation } from "@/components/superadmin/back-navigation"
import { SuperAdminHeader } from "@/components/superadmin/superadmin-header"
import { AppFooter } from "@/components/layout/app-footer"
import { ConnectorsHealthTable } from "@/components/superadmin/connectors-health-table"
import { ConnectorEndpointTester } from "@/components/superadmin/connector-endpoint-tester"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Stethoscope } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function ConnectorsHealthPage() {
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
  }

  // Check if user is superadmin (skip in v0 preview)
  if (!isV0Preview) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || (profile.role !== "superadmin" && profile.role !== "super_admin")) {
      redirect("/dashboard")
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SuperAdminHeader />
      <BackNavigation />
      <PageHeader
        title="Connectors Health Monitor"
        description="Monitoraggio della salute dei connettori PMS - Confronto tra dati RAW e dati normalizzati RMS"
      />

      <main className="container mx-auto p-6 flex-1 space-y-4">
        <div className="flex justify-end">
          <Button asChild variant="outline" size="sm">
            <Link href="/superadmin/connectors-health/diagnose">
              <Stethoscope className="h-4 w-4 mr-2" />
              Diagnostica avanzata
            </Link>
          </Button>
        </div>
        <ConnectorsHealthTable />
        <ConnectorEndpointTester />
      </main>

      <AppFooter />
    </div>
  )
}
