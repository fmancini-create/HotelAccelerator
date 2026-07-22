import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"
import { TenantCostDashboard } from "@/components/superadmin/tenant-cost-dashboard"
import { BackNavigation } from "@/components/superadmin/back-navigation"
import { SuperAdminHeader } from "@/components/superadmin/superadmin-header"
import { AppFooter } from "@/components/layout/app-footer"

export const metadata = {
  title: "Costi Tenant | SANTADDEO SuperAdmin",
  description: "Monitoraggio costi e consumo risorse per struttura affiliata",
}

export const dynamic = "force-dynamic"

export default async function TenantCostsPage() {
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
      <TenantCostDashboard />
      <AppFooter />
    </div>
  )
}
