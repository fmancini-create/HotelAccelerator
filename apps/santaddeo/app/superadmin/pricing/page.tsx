import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"
import { PricingManager } from "@/components/superadmin/pricing-manager"
import { SuperAdminHeader } from "@/components/superadmin/superadmin-header"
import { BackNavigation } from "@/components/superadmin/back-navigation"
import { AppFooter } from "@/components/layout/app-footer"

export const dynamic = "force-dynamic"

export default async function SuperAdminPricingPage() {
  const isV0Preview = await isDevAuthAsync()
  const supabase = isV0Preview ? await createClient() : await createClient()

  if (!isV0Preview) {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      redirect("/auth/login")
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    const isSuperAdmin = profile?.role === "superadmin" || profile?.role === "super_admin"
    if (!profile || !isSuperAdmin) {
      redirect("/dashboard")
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <SuperAdminHeader />
      <BackNavigation />
      <div className="container mx-auto py-8 px-4">
        <PricingManager />
      </div>
      <AppFooter />
    </div>
  )
}
