import { notFound, redirect } from "next/navigation"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"
import { OnboardingChecklistManager } from "@/components/superadmin/onboarding-checklist-manager"
import { SuperAdminHeader } from "@/components/superadmin/superadmin-header"

export const dynamic = "force-dynamic"

export default async function SuperAdminOnboardingPage({
  params,
}: {
  params: Promise<{ subscriptionId: string }>
}) {
  const { subscriptionId } = await params

  const isDev = await isDevAuthAsync()
  if (!isDev) {
    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) redirect("/auth/login")
    const { data: profile } = await sb.from("profiles").select("role").eq("id", user.id).single()
    if (!profile || (profile.role !== "super_admin" && profile.role !== "superadmin")) {
      redirect("/dashboard")
    }
  }

  const supabase = await createServiceRoleClient()
  const { data: sub } = await supabase
    .from("accelerator_subscriptions")
    .select("*, hotel:hotels(id, name, total_rooms, city)")
    .eq("id", subscriptionId)
    .maybeSingle()

  if (!sub) notFound()

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <SuperAdminHeader />
      <main className="container mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Onboarding post-firma
          </h1>
          <p className="text-muted-foreground">
            <span className="font-medium">{sub.hotel?.name}</span>
            {sub.hotel?.city ? <span> &middot; {sub.hotel.city}</span> : null}
            {sub.plan_type ? <span> &middot; piano {sub.plan_type}</span> : null}
          </p>
        </div>
        <OnboardingChecklistManager
          subscriptionId={subscriptionId}
          hotelId={sub.hotel_id}
          isSuperAdmin
        />
      </main>
    </div>
  )
}
