import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"
import { PageHeader } from "@/components/layout/page-header"
import { BackNavigation } from "@/components/superadmin/back-navigation"
import { SuperAdminHeader } from "@/components/superadmin/superadmin-header"
import { AppFooter } from "@/components/layout/app-footer"
import { OnboardingTracker } from "@/components/superadmin/onboarding-tracker"

export const dynamic = "force-dynamic"

export default async function SuperadminOnboardingPage() {
  const isV0Preview = await isDevAuthAsync()
  const supabase = await createClient()

  if (!isV0Preview) {
    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !authUser) {
      redirect("/auth/login")
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", authUser.id)
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
        title="Onboarding hotel"
        description="Avanzamento di ogni hotel verso il go-live: step calcolati dai dati reali, con note e forzature manuali."
      />
      <main className="container mx-auto p-6 flex-1">
        <OnboardingTracker />
      </main>
      <AppFooter />
    </div>
  )
}
