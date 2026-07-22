import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"
import { PageHeader } from "@/components/layout/page-header"
import { BackNavigation } from "@/components/superadmin/back-navigation"
import { SuperAdminHeader } from "@/components/superadmin/superadmin-header"
import { AppFooter } from "@/components/layout/app-footer"
import { ReviewSchedulesTable } from "@/components/superadmin/review-schedules-table"

export const dynamic = "force-dynamic"

export default async function ReviewSchedulesPage() {
  const isV0Preview = await isDevAuthAsync()
  const supabase = await createClient()

  if (!isV0Preview) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) redirect("/auth/login")
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()
    if (!profile || (profile.role !== "super_admin" && profile.role !== "superadmin")) {
      redirect("/dashboard")
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SuperAdminHeader />
      <BackNavigation />
      <PageHeader
        title="Cadenza sync recensioni"
        description="Schedule adattivo Apify per canale (hotel x piattaforma). La cadenza si auto-calibra sulla frequenza storica di nuove recensioni. Dopo 3 sync senza novita' il canale va dormiente."
      />
      <main className="container mx-auto p-6 flex-1">
        <ReviewSchedulesTable />
      </main>
      <AppFooter />
    </div>
  )
}
