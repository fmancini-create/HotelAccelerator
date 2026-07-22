import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const isV0Preview = await isDevAuthAsync()
    
    // Use service role client for data queries (bypasses RLS)
    const supabase = await createServiceRoleClient()

    if (!isV0Preview) {
      const authClient = await createClient()
      const {
        data: { user },
        error: authError,
      } = await authClient.auth.getUser()

      if (authError || !user) {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
      }

      // Check if user is super_admin
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()

      if (!profile || profile.role !== "super_admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    // Fetch all data for superadmin
    const { data: organizations } = await supabase
      .from("organizations")
      .select("*")
      .order("created_at", { ascending: false })

    const { data: hotels } = await supabase.from("hotels").select("*").order("created_at", { ascending: false })

    const { data: pmsIntegrations } = await supabase.from("pms_integrations").select("*")

    const { data: activeSubscriptions } = await supabase
      .from("accelerator_subscriptions")
      .select("*")
      .eq("is_active", true)

    const { data: allSubscriptions } = await supabase
      .from("accelerator_subscriptions")
      .select("*")
      .order("created_at", { ascending: false })

    const { data: globalAlertRules } = await supabase
      .from("alert_rules")
      .select("*")
      .is("hotel_id", null)
      .is("organization_id", null)
      .order("created_at", { ascending: false })

    // Build relationships
    const hotelsWithRelations =
      hotels?.map((hotel) => ({
        ...hotel,
        organization: organizations?.find((o) => o.id === hotel.organization_id) || null,
        pms_integrations: pmsIntegrations?.filter((p) => p.hotel_id === hotel.id) || [],
      })) || []

    const activeSubsWithHotels =
      activeSubscriptions?.map((sub) => ({
        ...sub,
        hotel: hotels?.find((h) => h.id === sub.hotel_id) || null,
      })) || []

    const allSubsWithRelations =
      allSubscriptions?.map((sub) => {
        const hotel = hotels?.find((h) => h.id === sub.hotel_id)
        return {
          ...sub,
          hotel: hotel
            ? {
                ...hotel,
                organization: organizations?.find((o) => o.id === hotel.organization_id) || null,
              }
            : null,
        }
      }) || []

    return NextResponse.json({
      organizations: organizations || [],
      hotels: hotelsWithRelations,
      activeSubscriptions: activeSubsWithHotels,
      allSubscriptions: allSubsWithRelations,
      globalAlertRules: globalAlertRules || [],
    })
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
