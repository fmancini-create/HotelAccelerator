import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { cookies } from "next/headers"

// Security: uses cookie-based auth client (respects RLS)
// Note: no auth.admin calls needed here -- all queries go through RLS
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ redirect: "/auth/login" })
    }

    const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single()

    const isSuperAdmin = profile?.role === "super_admin"

    // SuperAdmin can access without organization_id
    if (!isSuperAdmin && !profile?.organization_id) {
      return NextResponse.json({ redirect: "/onboarding" })
    }

    // Read impersonation cookie for superadmin
    const cookieStore = await cookies()
    const impersonatedHotelId = cookieStore.get("impersonated_hotel_id")?.value

    let hotels: any[] = []
    let selectedHotel = null
    let organizationId = profile?.organization_id

    if (isSuperAdmin) {
      // SuperAdmin sees all hotels
      const { data: hotelsData } = await supabase
        .from("hotels")
        .select("*")
        .order("created_at", { ascending: true })
      
      hotels = hotelsData || []

      // Use impersonated hotel if cookie is set
      if (impersonatedHotelId) {
        selectedHotel = hotels.find((h: any) => h.id === impersonatedHotelId) || null
      }
      if (!selectedHotel && hotels.length > 0) {
        selectedHotel = hotels[0]
      }
      organizationId = selectedHotel?.organization_id
    } else {
      const { data: hotelsData } = await supabase
        .from("hotels")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .order("created_at", { ascending: true })

      hotels = hotelsData || []
      selectedHotel = hotels.length > 0 ? hotels[0] : null
    }

    if (!selectedHotel) {
      return NextResponse.json({ redirect: isSuperAdmin ? "/superadmin" : "/onboarding" })
    }

    const canManageTeam = profile.role === "property_admin" || profile.role === "super_admin"

    const { data: subscription } = await supabase
      .from("accelerator_subscriptions")
      .select("*")
      .eq("hotel_id", selectedHotel.id)
      .eq("is_active", true)
      .maybeSingle()

    const isBasicPlan = subscription?.plan_type === "basic" || !subscription

    // Get team members: profiles in same org + users with property_map access to our hotels
    let teamMembers: any[] = []
    if (organizationId) {
      const { data: teamMembersData } = await supabase
        .from("profiles")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: true })
      teamMembers = teamMembersData || []

      // Also include users who have user_property_map entries for our hotels
      // but whose organization_id might not match (e.g. invited users with missing org)
      if (hotels && hotels.length > 0) {
        const hotelIds = hotels.map((h: any) => h.id)
        const { data: propertyMapUsers } = await supabase
          .from("user_property_map")
          .select("user_id")
          .in("hotel_id", hotelIds)

        if (propertyMapUsers && propertyMapUsers.length > 0) {
          const existingIds = new Set(teamMembers.map((m: any) => m.id))
          const missingUserIds = propertyMapUsers
            .map((pm: any) => pm.user_id)
            .filter((uid: string) => !existingIds.has(uid))

          if (missingUserIds.length > 0) {
            const { data: extraMembers } = await supabase
              .from("profiles")
              .select("*")
              .in("id", missingUserIds)
              .order("created_at", { ascending: true })

            if (extraMembers) {
              teamMembers = [...teamMembers, ...extraMembers]
            }
          }
        }
      }
    }

    let invitations: any[] = []
    let invitationsTableMissing = false
    let invitationsSchemaError = false

    try {
      const { data: invitationsData, error: invError } = await supabase
        .from("user_invitations")
        .select("*")
        .in("hotel_id", hotels?.map((h) => h.id) || [])
        .is("accepted_at", null)
        .order("created_at", { ascending: false })

      if (invError) {
        if (
          invError.code === "42P01" ||
          (invError.message?.includes("relation") && invError.message?.includes("does not exist"))
        ) {
          invitationsTableMissing = true
        } else if (
          invError.code === "42703" ||
          (invError.message?.includes("column") && invError.message?.includes("does not exist"))
        ) {
          invitationsSchemaError = true
        }
      } else {
        invitations = invitationsData || []
      }
    } catch {
      invitationsTableMissing = true
    }

    return NextResponse.json({
      user,
      profile,
      selectedHotel,
      hotels,
      canManageTeam,
      isBasicPlan,
      teamMembers,
      invitations,
      invitationsTableMissing,
      invitationsSchemaError,
      isSuperAdmin,
    })
  } catch (error) {
    console.error("Error in GET request:", error)
    return NextResponse.json({ error: "An error occurred while fetching data." }, { status: 500 })
  }
}
