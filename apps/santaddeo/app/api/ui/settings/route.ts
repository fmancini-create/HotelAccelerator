import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { cookies } from "next/headers"

// Security: uses cookie-based auth client (respects RLS)
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

    const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle()

    const isSuperAdmin = profile?.role === "super_admin"

    // SuperAdmin can access settings even without organization
    if (!isSuperAdmin && !profile?.organization_id) {
      return NextResponse.json({ redirect: "/onboarding" })
    }

    // Read the impersonation cookie for superadmin
    const cookieStore = await cookies()
    const impersonatedHotelId = cookieStore.get("impersonated_hotel_id")?.value
    let organization = null
    let hotels: any[] = []
    let selectedHotel = null

    if (isSuperAdmin) {
      // SuperAdmin sees all hotels
      const { data: hotelsData } = await supabase
        .from("hotels")
        .select("*")
        .order("created_at", { ascending: true })
      
      hotels = hotelsData || []
      // Use impersonated hotel if the cookie is set
      if (impersonatedHotelId) {
        selectedHotel = hotels.find((h: any) => h.id === impersonatedHotelId) || null
      }
      // Fallback to first hotel if no impersonation
      if (!selectedHotel && hotels.length > 0) {
        selectedHotel = hotels[0]
      }
      
      if (selectedHotel) {
        const { data: orgData } = await supabase
          .from("organizations")
          .select("*")
          .eq("id", selectedHotel.organization_id)
          .single()
        organization = orgData
      }
    } else {
      if (profile.organization_id) {
        const { data: orgData } = await supabase
          .from("organizations")
          .select("*")
          .eq("id", profile.organization_id)
          .single()
        organization = orgData

        const { data: hotelsData } = await supabase
          .from("hotels")
          .select("*")
          .eq("organization_id", profile.organization_id)
          .order("created_at", { ascending: true })
        
        hotels = hotelsData || []
      }

      // Also include hotels the user has access to via user_property_map
      const { data: propertyMapHotels } = await supabase
        .from("user_property_map")
        .select("hotel_id")
        .eq("user_id", user.id)

      if (propertyMapHotels && propertyMapHotels.length > 0) {
        const existingHotelIds = new Set(hotels.map((h: any) => h.id))
        const extraHotelIds = propertyMapHotels
          .map((pm: any) => pm.hotel_id)
          .filter((hid: string) => !existingHotelIds.has(hid))

        if (extraHotelIds.length > 0) {
          const { data: extraHotels } = await supabase
            .from("hotels")
            .select("*")
            .in("id", extraHotelIds)
            .order("created_at", { ascending: true })

          if (extraHotels) {
            hotels = [...hotels, ...extraHotels]
          }
        }
      }

      selectedHotel = hotels.length > 0 ? hotels[0] : null
    }

    return NextResponse.json({
      profile,
      organization,
      hotels,
      selectedHotel,
      isSuperAdmin,
    })
  } catch (error) {
    console.error("Error fetching settings:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
