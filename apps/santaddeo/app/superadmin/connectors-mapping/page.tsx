import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"
import { PageHeader } from "@/components/layout/page-header"
import { ConnectorsMappingWrapper } from "@/components/superadmin/connectors-mapping-wrapper"
import { BackNavigation } from "@/components/superadmin/back-navigation"
import { SuperAdminHeader } from "@/components/superadmin/superadmin-header"
import { AppFooter } from "@/components/layout/app-footer"
import Link from "next/link"
import { HeartPulse } from "lucide-react"
import { Button } from "@/components/ui/button"

export const dynamic = "force-dynamic"

export default async function ConnectorsMappingPage() {
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
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
    if (!profile || (profile.role !== "superadmin" && profile.role !== "super_admin")) {
      redirect("/dashboard")
    }
  }

  // Fetch mappings
  const { data: mappings } = await supabase
    .from("pms_rms_mappings")
    .select("*")
    .order("created_at", { ascending: false })

  // Fetch hotels
  const { data: hotels } = await supabase.from("hotels").select("id, name").order("name")

  // Fetch PMS providers
  const { data: pmsProviders } = await supabase.from("pms_providers").select("*").order("name")

  // Fetch RMS canonical codes
  const { data: rmsCanonicalCodes } = await supabase.from("rms_canonical_codes").select("*").order("entity_type, code")

  return (
    <div className="min-h-screen bg-background">
      <SuperAdminHeader />
      <BackNavigation />
      <div className="flex items-center justify-between">
        <PageHeader
          title="Mappatura Connettori PMS → RMS"
          description="Configurazione VINCOLANTE per la mappatura dei codici PMS ai codici RMS interni di Santaddeo"
        />
        <div className="container mx-auto px-6">
          <Link href="/superadmin/connectors-health">
            <Button variant="outline" className="gap-2">
              <HeartPulse className="h-4 w-4" />
              Health Monitor
            </Button>
          </Link>
        </div>
      </div>

      <div className="container mx-auto p-6">
        <ConnectorsMappingWrapper
          initialMappings={mappings || []}
          hotels={hotels || []}
          pmsData={null}
          rmsCanonicalCodes={rmsCanonicalCodes || []}
          pmsProviders={pmsProviders || []}
        />
      </div>
      <AppFooter />
    </div>
  )
}
