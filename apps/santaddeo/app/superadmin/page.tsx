import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"
import { SuperAdminDashboardWrapper } from "@/components/superadmin/dashboard-wrapper"

// Force dynamic rendering for this page
export const dynamic = "force-dynamic"

export default async function SuperAdminPage() {
  const isV0Preview = await isDevAuthAsync()
  
  // In v0 preview, use service role client to bypass RLS
  const supabase = isV0Preview ? await createClient() : await createClient()

  // Check authentication
  let user: any = null
  if (isV0Preview) {
    // In v0 preview, use demo superadmin user
    user = {
      id: "5de43b7b-e661-4e4e-8177-7943df06470c",
      email: "f.mancini@4bid.it",
    }
  } else {
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
    if (authError || !authUser) {
      redirect("/auth/login")
    }
    user = authUser
  }

  // Check if user is superadmin
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()

  const isSuperAdmin = profile?.role === "superadmin" || profile?.role === "super_admin"

  if (!isV0Preview && (!profile || !isSuperAdmin)) {
    redirect("/dashboard")
  }

  // Fetch all data in parallel
  const [organizationsResult, hotelsResult, subscriptionsResult, alertRulesResult, commissionRequestsResult] = await Promise.all([
    supabase.from("organizations").select("*").order("created_at", { ascending: false }),
    supabase.from("hotels").select("*, pms_integrations(*), organization:organizations(id, name, type)").order("created_at", { ascending: false }),
    supabase
      .from("accelerator_subscriptions")
      .select("*, hotel:hotels(id, name, total_rooms, city, organization_id)")
      .order("created_at", { ascending: false }),
    supabase.from("alert_rules").select("*").is("hotel_id", null).order("created_at", { ascending: false }),
    supabase
      .from("commission_plan_requests")
      .select(`
        *,
        hotel:hotels(id, name, total_rooms, city),
        profile:profiles!commission_plan_requests_user_id_fkey(email, first_name, full_name),
        organization:organizations(name, company_name)
      `)
      .order("requested_at", { ascending: false }),
  ])

  // Extract data with fallbacks
  const organizations = organizationsResult.data || []
  const hotels = hotelsResult.data || []
  const allSubscriptions = subscriptionsResult.data || []
  // Use is_active (boolean) -- the table has NO "status" column
  const activeSubscriptions = allSubscriptions.filter((s: { is_active?: boolean }) => s.is_active === true)
  const globalAlertRules = alertRulesResult.data || []
  const commissionRequests = commissionRequestsResult.data || []

  return (
    <SuperAdminDashboardWrapper
      organizations={organizations}
      hotels={hotels}
      activeSubscriptions={activeSubscriptions}
      allSubscriptions={allSubscriptions}
      globalAlertRules={globalAlertRules}
      commissionRequests={commissionRequests}
    />
  )
}
