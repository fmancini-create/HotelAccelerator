import { NextResponse, type NextRequest } from "next/server"
import { cookies } from "next/headers"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"

// Force dynamic execution: this route depends on cookies + querystring and
// must never be cached, otherwise the super-admin tenant switcher returns
// stale data after a hotel change.
export const dynamic = "force-dynamic"

// Returns the currently selected hotel following the same logic as
// dashboard-content.tsx and app/dati/calendario/page.tsx:
//   priority: ?hotel= query param (super-admin only) > cookie > default.
// Security: uses cookie-based auth client (respects RLS); the ?hotel=
// override is honored only for super_admin or for hotels of the user's org.
export async function GET(req: NextRequest) {
  try {
    const { user, supabase } = await getAuthUserOrDev()
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    // Fetch profile - only select needed fields
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role, organization_id")
      .eq("id", user.id)
      .maybeSingle()

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const isSuperAdmin = profile.role === "super_admin"

    // Read impersonation cookie + ?hotel= query param.
    // FIX 30/04/2026 (post-incident "tenant switcher non cambia su /dati/bookings"):
    // Prima si leggeva SOLO il cookie. Quando il super-admin cambiava hotel,
    // app-header.tsx scriveva document.cookie + navigava a ?hotel=NEW_ID, ma
    // se il cookie non si propagava in tempo (race con il browser store) o
    // veniva sovrascritto da un'altra tab, l'API restituiva sempre lo stesso
    // hotel. Ora il searchParam prevale sul cookie quando presente.
    const cookieStore = await cookies()
    const cookieHotelId = cookieStore.get("impersonated_hotel_id")?.value
    const queryHotelId = req.nextUrl.searchParams.get("hotel") || undefined
    const requestedHotelId = queryHotelId || cookieHotelId

    // Build optimized hotel query based on context - only select needed fields
    let hotelQuery = supabase
      .from("hotels")
      .select("id, name, organization_id, total_rooms, accommodation_type, revenue_vat_mode, accommodation_vat_rate")
      .limit(1)

    let isImpersonating = false

    if (requestedHotelId) {
      // Authorize the explicit hotel selection:
      //  - super_admin: free choice
      //  - regular user: hotel della propria organization OPPURE hotel
      //    assegnato esplicitamente via user_property_map (multi-struttura).
      hotelQuery = hotelQuery.eq("id", requestedHotelId)
      if (!isSuperAdmin) {
        // L'hotel e' tra quelli assegnati all'utente nel dialog "Gestisci
        // strutture"? In tal caso e' consentito anche fuori dalla sua org.
        const { data: mapped } = await supabase
          .from("user_property_map")
          .select("hotel_id")
          .eq("user_id", user.id)
          .eq("hotel_id", requestedHotelId)
          .limit(1)
        const isMapped = (mapped?.length ?? 0) > 0
        if (!isMapped) {
          if (profile.organization_id) {
            hotelQuery = hotelQuery.eq("organization_id", profile.organization_id)
          } else {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 })
          }
        }
      }
      isImpersonating = isSuperAdmin
    } else if (isSuperAdmin) {
      hotelQuery = hotelQuery.order("created_at", { ascending: true })
    } else if (profile.organization_id) {
      hotelQuery = hotelQuery
        .eq("organization_id", profile.organization_id)
        .order("created_at", { ascending: true })
    } else {
      return NextResponse.json({ error: "No hotel found" }, { status: 404 })
    }

    const { data: hotelsData } = await hotelQuery

    const selectedHotel = hotelsData?.[0]
    if (!selectedHotel) {
      // If the override hotel id is invalid (e.g. user no longer has access),
      // fall back to the default hotel for the user instead of erroring out.
      if (requestedHotelId) {
        let fallbackQuery = supabase
          .from("hotels")
          .select("id, name, organization_id, total_rooms, accommodation_type, revenue_vat_mode, accommodation_vat_rate")
          .limit(1)
        if (isSuperAdmin) {
          fallbackQuery = fallbackQuery.order("created_at", { ascending: true })
        } else if (profile.organization_id) {
          fallbackQuery = fallbackQuery
            .eq("organization_id", profile.organization_id)
            .order("created_at", { ascending: true })
        } else {
          return NextResponse.json({ error: "No hotel found" }, { status: 404 })
        }
        const { data: fallbackData } = await fallbackQuery
        const fallbackHotel = fallbackData?.[0]
        if (!fallbackHotel) {
          return NextResponse.json({ error: "No hotel found" }, { status: 404 })
        }
        return NextResponse.json({
          hotel: fallbackHotel,
          isImpersonating: false,
          isSuperAdmin,
        })
      }
      return NextResponse.json({ error: "No hotel found" }, { status: 404 })
    }

    return NextResponse.json({
      hotel: selectedHotel,
      isImpersonating,
      isSuperAdmin,
    })
  } catch (error) {
    console.error("[v0] Error in /api/ui/selected-hotel:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
