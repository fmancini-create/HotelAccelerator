import { createServiceRoleClient } from "@/lib/supabase/server"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * GET /api/accelerator/room-types-list?hotel_id=...
 *
 * Ritorna la lista delle tipologie camera ATTIVE per un hotel, con il range
 * di occupazione (min/max). Serve al dialog "Invia range" (autopilot-controls)
 * per permettere all'utente di restringere l'invio a una o piu' camere e a
 * specifiche occupazioni, oltre che per tariffa.
 *
 * Stesso pattern di /api/accelerator/rates-list (20/07/2026): l'accesso e' gia'
 * validato da validateHotelAccess, poi la SELECT usa il SERVICE client per non
 * essere svuotata dalla RLS quando un super_admin apre un hotel non suo.
 */
export async function GET(request: NextRequest) {
  try {
    const hotelId = request.nextUrl.searchParams.get("hotel_id")
    if (!hotelId) {
      return NextResponse.json({ error: "hotel_id required" }, { status: 400 })
    }

    // BUG FIX 21/07/2026: getAuthUserOrDev() ritorna { user, supabase }, NON lo
    // user. Con `const user = ...` il check 401 non scattava mai e
    // validateHotelAccess riceveva l'oggetto wrapper -> `.id` undefined -> in
    // PROD fetch `profiles?id=eq.undefined` su colonna uuid -> PostgREST 400 ->
    // 500 ("Errore caricamento camere"). In DEV il bypass mascherava il bug.
    const { user } = await getAuthUserOrDev()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const denied = await validateHotelAccess(hotelId, user as any, { allowSeller: "full" })
    if (denied) return denied

    const supabase = await createServiceRoleClient()

    const { data, error } = await supabase
      .from("room_types")
      .select("id, name, min_occupancy, max_occupancy")
      .eq("hotel_id", hotelId)
      .eq("is_active", true)
      .order("name", { ascending: true })

    if (error) {
      console.error("[v0] [room-types-list] error", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const roomTypes = (data || []).map((r) => ({
      id: r.id,
      name: r.name,
      // Default prudenti se il dato non e' configurato: 1..2 (singola/doppia).
      minOccupancy: typeof r.min_occupancy === "number" && r.min_occupancy > 0 ? r.min_occupancy : 1,
      maxOccupancy: typeof r.max_occupancy === "number" && r.max_occupancy > 0 ? r.max_occupancy : 2,
    }))

    return NextResponse.json({ roomTypes })
  } catch (e: any) {
    console.error("[v0] [room-types-list] exception", e)
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 })
  }
}
