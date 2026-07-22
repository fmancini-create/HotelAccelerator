import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"
import { hasAddon } from "@/lib/addons/has-addon"

export const dynamic = "force-dynamic"

const MAX_MONITORED = 3

// GET: tutte le nostre room_types + quali sono monitorate (max 3).
export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("warm") === "1") {
    return NextResponse.json({ ok: true, warm: true })
  }
  try {
    const hotelId = request.nextUrl.searchParams.get("hotelId")
    if (!hotelId) return NextResponse.json({ error: "hotelId richiesto" }, { status: 400 })

    const denied = await validateHotelAccess(hotelId)
    if (denied) return denied
    if (!(await hasAddon(hotelId, "rate_shopper"))) {
      return NextResponse.json({ error: "Addon non attivo", code: "ADDON_REQUIRED" }, { status: 403 })
    }

    const supabase = await createServiceRoleClient()

    const { data: roomTypes } = await supabase
      .from("room_types")
      .select("id, name, capacity, max_occupancy")
      .eq("hotel_id", hotelId)
      .order("name", { ascending: true })

    const { data: monitored } = await supabase
      .from("rate_shopper_monitored_rooms")
      .select("room_type_id, display_order")
      .eq("hotel_id", hotelId)
      .order("display_order", { ascending: true })

    return NextResponse.json({
      max: MAX_MONITORED,
      roomTypes: roomTypes ?? [],
      monitored: (monitored ?? []).map((m) => m.room_type_id),
    })
  } catch (error) {
    console.error("[rate-shopper:monitored-rooms] GET error", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}

// PUT: imposta le tipologie monitorate (replace completo, max 3).
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const hotelId: string | undefined = body?.hotelId
    const roomTypeIds: string[] = Array.isArray(body?.roomTypeIds) ? body.roomTypeIds : []
    if (!hotelId) return NextResponse.json({ error: "hotelId richiesto" }, { status: 400 })

    const denied = await validateHotelAccess(hotelId)
    if (denied) return denied
    if (!(await hasAddon(hotelId, "rate_shopper"))) {
      return NextResponse.json({ error: "Addon non attivo", code: "ADDON_REQUIRED" }, { status: 403 })
    }

    // guardrail: max 3 tipologie, dedup
    const unique = Array.from(new Set(roomTypeIds)).slice(0, MAX_MONITORED)

    const supabase = await createServiceRoleClient()

    // replace: cancella tutto e reinserisci con display_order
    await supabase.from("rate_shopper_monitored_rooms").delete().eq("hotel_id", hotelId)

    if (unique.length > 0) {
      const rows = unique.map((roomTypeId, i) => ({
        hotel_id: hotelId,
        room_type_id: roomTypeId,
        display_order: i,
      }))
      const { error } = await supabase.from("rate_shopper_monitored_rooms").insert(rows)
      if (error) {
        console.error("[rate-shopper:monitored-rooms] insert error", error)
        return NextResponse.json({ error: "Errore salvataggio" }, { status: 500 })
      }
    }

    return NextResponse.json({ ok: true, monitored: unique })
  } catch (error) {
    console.error("[rate-shopper:monitored-rooms] PUT error", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}
