import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const supabase = await createClient()

  // 1. Utente autenticato
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ redirect: "/auth/login" })
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (profileError || !profile) {
    return NextResponse.json({ redirect: "/dashboard" })
  }

  // SuperAdmin check: role must be "superadmin" or "super_admin"
  if (!["superadmin", "super_admin"].includes(profile.role)) {
    return NextResponse.json({ redirect: "/dashboard" })
  }

  // 3. DATI GLOBALI (solo per SuperAdmin)

  const { data: organizations } = await supabase
    .from("organizations")
    .select("*")
    .order("created_at", { ascending: false })

  const { data: hotels } = await supabase.from("hotels").select("*").order("created_at", { ascending: false })

  const { data: pmsIntegrations } = await supabase.from("pms_integrations").select("*")

  const hotelsWithRelations =
    hotels?.map((hotel) => ({
      ...hotel,
      organization: organizations?.find((o) => o.id === hotel.organization_id) || null,
      pms_integrations: pmsIntegrations?.filter((p) => p.hotel_id === hotel.id) || [],
    })) || []

  const { data: activeSubscriptions } = await supabase
    .from("accelerator_subscriptions")
    .select("*")
    .eq("is_active", true)

  const activeSubsWithHotels =
    activeSubscriptions?.map((sub) => ({
      ...sub,
      hotel: hotels?.find((h) => h.id === sub.hotel_id) || null,
    })) || []

  const { data: allSubscriptions } = await supabase
    .from("accelerator_subscriptions")
    .select("*")
    .order("created_at", { ascending: false })

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

  const { data: globalAlertRules } = await supabase
    .from("alert_rules")
    .select("*")
    .is("hotel_id", null)
    .is("organization_id", null)
    .order("created_at", { ascending: false })

  return NextResponse.json({
    organizations: organizations || [],
    hotels: hotelsWithRelations,
    activeSubscriptions: activeSubsWithHotels,
    allSubscriptions: allSubsWithRelations,
    globalAlertRules: globalAlertRules || [],
  })
}
