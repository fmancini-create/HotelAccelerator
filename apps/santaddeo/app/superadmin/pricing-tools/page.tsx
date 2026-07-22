import { redirect } from "next/navigation"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"
import { PageHeader } from "@/components/layout/page-header"
import { BackNavigation } from "@/components/superadmin/back-navigation"
import { SuperAdminHeader } from "@/components/superadmin/superadmin-header"
import { AppFooter } from "@/components/layout/app-footer"
import { PricingDrainPanel } from "@/components/superadmin/pricing-drain-panel"

export const dynamic = "force-dynamic"

export default async function PricingToolsPage() {
  const isV0Preview = await isDevAuthAsync()
  const supabase = await createClient()

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

  if (!isV0Preview) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || profile.role !== "super_admin") {
      redirect("/dashboard")
    }
  }

  // Carica gli hotel con autopilot mode notify/autopilot e i loro counter pending
  const sb = await createServiceRoleClient()
  const { data: configs } = await sb
    .from("autopilot_configs")
    .select("hotel_id, mode, notify_emails, last_notification_at, last_push_at, hotels:hotel_id (name)")
    .in("mode", ["notify", "autopilot"])

  // Per ogni hotel, conta righe pending (action_taken='none' con old_price)
  const hotels = await Promise.all(
    (configs ?? []).map(async (c: any) => {
      const { count: pendingReal } = await sb
        .from("price_change_log")
        .select("id", { count: "exact", head: true })
        .eq("hotel_id", c.hotel_id)
        .eq("action_taken", "none")
        .not("old_price", "is", null)

      const { count: pendingGreenfield } = await sb
        .from("price_change_log")
        .select("id", { count: "exact", head: true })
        .eq("hotel_id", c.hotel_id)
        .eq("action_taken", "none")
        .is("old_price", null)

      return {
        hotelId: c.hotel_id,
        hotelName: c.hotels?.name ?? "(senza nome)",
        mode: c.mode,
        notifyEmails: c.notify_emails ?? [],
        lastNotificationAt: c.last_notification_at,
        lastPushAt: c.last_push_at,
        pendingReal: pendingReal ?? 0,
        pendingGreenfield: pendingGreenfield ?? 0,
      }
    }),
  )

  hotels.sort((a, b) => b.pendingReal - a.pendingReal)

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SuperAdminHeader />
      <BackNavigation />
      <PageHeader
        title="Strumenti pricing"
        description="Trigger manuali per drenare backlog email/push pricing quando il cron non smaltisce"
      />

      <main className="container mx-auto p-6 flex-1 space-y-4">
        <PricingDrainPanel hotels={hotels} />
      </main>

      <AppFooter />
    </div>
  )
}
