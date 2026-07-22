import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"
import { hasAddon } from "@/lib/addons/has-addon"
import { fetchAllPaginatedOrLog } from "@/lib/supabase/paginate"

export const dynamic = "force-dynamic"

interface RawRoom {
  name?: unknown
  numGuests?: unknown
  price?: unknown
}

// GET: nomi camera rilevati per ogni competitor (da competitor_rates.raw_data.rooms)
// + mappature salvate.
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

    const { data: competitors } = await supabase
      .from("competitors")
      .select("id, name")
      .eq("hotel_id", hotelId)
      .eq("active", true)
      .order("created_at", { ascending: true })

    // ultimi 60 giorni di catture per estrarre i nomi camera distinti.
    const since = new Date()
    since.setDate(since.getDate() - 60)
    const rateRows = await fetchAllPaginatedOrLog<{
      competitor_id: string
      captured_at: string
      price: number | null
      raw_data: { rooms?: RawRoom[] } | null
    }>(
      () =>
        supabase
          .from("competitor_rates")
          .select("competitor_id, captured_at, price, raw_data")
          .eq("hotel_id", hotelId)
          .gte("captured_at", since.toISOString())
          .order("captured_at", { ascending: false }),
      "rate-shopper-room-map-raw",
    )

    // per competitor: quante catture totali e quante con prezzo non nullo.
    // Serve a distinguere "competitor senza prezzi su Google" (catture presenti
    // ma sempre price=null -> mai estraibili tipologie) da "competitor non
    // ancora aggiornato" (zero catture).
    const rateCount = new Map<string, number>()
    const priceCount = new Map<string, number>()
    for (const r of rateRows) {
      rateCount.set(r.competitor_id, (rateCount.get(r.competitor_id) ?? 0) + 1)
      if (typeof r.price === "number") priceCount.set(r.competitor_id, (priceCount.get(r.competitor_id) ?? 0) + 1)
    }

    // per competitor: nome camera -> { numGuests, lastPrice (cattura piu' recente) }
    const perComp = new Map<string, Map<string, { numGuests: number | null; lastPrice: number | null }>>()
    for (const r of rateRows) {
      const rooms = r.raw_data?.rooms
      if (!Array.isArray(rooms)) continue
      let map = perComp.get(r.competitor_id)
      if (!map) {
        map = new Map()
        perComp.set(r.competitor_id, map)
      }
      for (const room of rooms) {
        const name = typeof room?.name === "string" ? room.name.trim() : ""
        if (!name) continue
        if (map.has(name)) continue // righe sono desc per captured_at: la prima e' la piu' recente
        const numGuests = typeof room?.numGuests === "number" ? room.numGuests : null
        const price = typeof room?.price === "number" ? room.price : null
        map.set(name, { numGuests, lastPrice: price })
      }
    }

    const observed = (competitors ?? []).map((c) => {
      const map = perComp.get(c.id) ?? new Map()
      const rooms = Array.from(map.entries())
        .map(([name, v]) => ({ name, numGuests: v.numGuests, lastPrice: v.lastPrice }))
        .sort((a, b) => (a.lastPrice ?? Infinity) - (b.lastPrice ?? Infinity))
      const captures = rateCount.get(c.id) ?? 0
      const withPrice = priceCount.get(c.id) ?? 0
      // status:
      //  - "ok"        -> ha tipologie di camera rilevate
      //  - "no_prices" -> interrogato ma Google non espone alcun prezzo
      //                   (aggiornare NON aiuta)
      //  - "no_rooms"  -> interrogato, ha prezzi aggregati ma Google NON espone
      //                   il dettaglio per tipologia di camera (aggiornare NON aiuta)
      //  - "pending"   -> mai interrogato: serve un aggiornamento prezzi
      const status: "ok" | "no_prices" | "no_rooms" | "pending" =
        rooms.length > 0
          ? "ok"
          : captures === 0
            ? "pending"
            : withPrice === 0
              ? "no_prices"
              : "no_rooms"
      return { competitorId: c.id, name: c.name, rooms, status, captures, withPrice }
    })

    const { data: mappings } = await supabase
      .from("rate_shopper_room_map")
      .select("room_type_id, competitor_id, competitor_room_name")
      .eq("hotel_id", hotelId)

    return NextResponse.json({
      observed,
      mappings: (mappings ?? []).map((m) => ({
        roomTypeId: m.room_type_id,
        competitorId: m.competitor_id,
        competitorRoomName: m.competitor_room_name,
      })),
    })
  } catch (error) {
    console.error("[rate-shopper:room-map] GET error", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}

// PUT: salva le associazioni (replace completo).
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const hotelId: string | undefined = body?.hotelId
    const mappings: Array<{ roomTypeId: string; competitorId: string; competitorRoomName: string }> = Array.isArray(
      body?.mappings,
    )
      ? body.mappings
      : []
    if (!hotelId) return NextResponse.json({ error: "hotelId richiesto" }, { status: 400 })

    const denied = await validateHotelAccess(hotelId)
    if (denied) return denied
    if (!(await hasAddon(hotelId, "rate_shopper"))) {
      return NextResponse.json({ error: "Addon non attivo", code: "ADDON_REQUIRED" }, { status: 403 })
    }

    const supabase = await createServiceRoleClient()

    await supabase.from("rate_shopper_room_map").delete().eq("hotel_id", hotelId)

    const rows = mappings
      .filter((m) => m.roomTypeId && m.competitorId && m.competitorRoomName)
      .map((m) => ({
        hotel_id: hotelId,
        room_type_id: m.roomTypeId,
        competitor_id: m.competitorId,
        competitor_room_name: m.competitorRoomName,
      }))

    if (rows.length > 0) {
      const { error } = await supabase.from("rate_shopper_room_map").insert(rows)
      if (error) {
        console.error("[rate-shopper:room-map] insert error", error)
        return NextResponse.json({ error: "Errore salvataggio" }, { status: 500 })
      }
    }

    return NextResponse.json({ ok: true, count: rows.length })
  } catch (error) {
    console.error("[rate-shopper:room-map] PUT error", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}
