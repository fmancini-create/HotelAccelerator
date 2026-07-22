import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"
import { hasAddon } from "@/lib/addons/has-addon"
import { fetchAllPaginatedOrLog } from "@/lib/supabase/paginate"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const median = (arr: number[]): number | null => {
  if (arr.length === 0) return null
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

interface RawRoom {
  name?: unknown
  price?: unknown
}

// GET: confronto per-tipologia. Per ogni tipologia monitorata confronta il
// NOSTRO prezzo (pricing_grid, quella room_type) con la camera equivalente
// mappata di ogni competitor (competitor_rates.raw_data.rooms).
export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("warm") === "1") {
    return NextResponse.json({ ok: true, warm: true })
  }
  try {
    const sp = request.nextUrl.searchParams
    const hotelId = sp.get("hotelId")
    if (!hotelId) return NextResponse.json({ error: "hotelId richiesto" }, { status: 400 })
    const occupancy = Number(sp.get("occupancy") || 2)

    const denied = await validateHotelAccess(hotelId)
    if (denied) return denied
    if (!(await hasAddon(hotelId, "rate_shopper"))) {
      return NextResponse.json({ error: "Addon non attivo", code: "ADDON_REQUIRED" }, { status: 403 })
    }

    const today = new Date().toISOString().slice(0, 10)
    const from = sp.get("from") || today
    const toDefault = new Date()
    toDefault.setDate(toDefault.getDate() + 30)
    const to = sp.get("to") || toDefault.toISOString().slice(0, 10)

    const supabase = await createServiceRoleClient()

    // 1) comp set attivo
    const { data: competitors } = await supabase
      .from("competitors")
      .select("id, name")
      .eq("hotel_id", hotelId)
      .eq("active", true)
      .order("created_at", { ascending: true })
    const compList = competitors ?? []

    // 2) tipologie monitorate (in ordine)
    const { data: monitored } = await supabase
      .from("rate_shopper_monitored_rooms")
      .select("room_type_id, display_order")
      .eq("hotel_id", hotelId)
      .order("display_order", { ascending: true })
    const monitoredIds = (monitored ?? []).map((m) => m.room_type_id)

    if (monitoredIds.length === 0) {
      return NextResponse.json({
        range: { from, to, occupancy },
        competitors: compList.map((c) => ({ id: c.id, name: c.name })),
        roomTypes: [],
        note: "Nessuna tipologia monitorata. Usa \u201cAssocia tipologie\u201d per sceglierne fino a 3.",
      })
    }

    const { data: roomTypeRows } = await supabase
      .from("room_types")
      .select("id, name")
      .in("id", monitoredIds)
    const roomTypeName = new Map((roomTypeRows ?? []).map((r) => [r.id, r.name]))

    // 3) mappature tipologia -> nome camera competitor
    const { data: mapRows } = await supabase
      .from("rate_shopper_room_map")
      .select("room_type_id, competitor_id, competitor_room_name")
      .eq("hotel_id", hotelId)
    // key `${roomTypeId}|${competitorId}` -> competitorRoomName
    const mapByKey = new Map<string, string>()
    for (const m of mapRows ?? []) {
      mapByKey.set(`${m.room_type_id}|${m.competitor_id}`, m.competitor_room_name)
    }

    // 4) nostri prezzi per (roomType, date) -> piu' basso all'occupanza
    const ourRows = await fetchAllPaginatedOrLog<{ date: string; price: number; room_type_id: string }>(
      () =>
        supabase
          .from("pricing_grid")
          .select("date, price, room_type_id")
          .eq("hotel_id", hotelId)
          .eq("occupancy", occupancy)
          .in("room_type_id", monitoredIds)
          .gte("date", from)
          .lte("date", to)
          .order("date", { ascending: true }),
      "rate-shopper-by-room-our",
    )
    // key `${roomTypeId}|${date}` -> price
    const ourPrice = new Map<string, number>()
    for (const r of ourRows) {
      if (r.price == null) continue
      const key = `${r.room_type_id}|${r.date}`
      const p = Number(r.price)
      const cur = ourPrice.get(key)
      if (cur == null || p < cur) ourPrice.set(key, p)
    }

    // 4b) Nostra disponibilita' per (tipologia, data). Sold out quando esiste la
    //     riga e rooms_available <= 0. Calcoliamo anche l'occupazione per tipologia
    //     = (vendibili - disponibili) / vendibili, vendibili = total - out_of_service.
    const availRows = await fetchAllPaginatedOrLog<{
      date: string
      room_type_id: string
      total_rooms: number | null
      rooms_out_of_service: number | null
      rooms_available: number | null
    }>(
      () =>
        supabase
          .from("daily_availability")
          .select("date, room_type_id, total_rooms, rooms_out_of_service, rooms_available")
          .eq("hotel_id", hotelId)
          .in("room_type_id", monitoredIds)
          .gte("date", from)
          .lte("date", to)
          .order("date", { ascending: true }),
      "rate-shopper-by-room-availability",
    )
    const availByKey = new Map<string, number>()
    const sellableByKey = new Map<string, number>()
    for (const r of availRows) {
      const key = `${r.room_type_id}|${r.date}`
      const sellable = Math.max(0, Number(r.total_rooms ?? 0) - Number(r.rooms_out_of_service ?? 0))
      const free = Math.max(0, Number(r.rooms_available ?? 0))
      availByKey.set(key, (availByKey.get(key) ?? 0) + free)
      sellableByKey.set(key, (sellableByKey.get(key) ?? 0) + sellable)
    }
    // occupazione % per (tipologia, data)
    const occByKey = new Map<string, number>()
    for (const [key, sellable] of sellableByKey) {
      if (sellable <= 0) continue
      const free = availByKey.get(key) ?? 0
      occByKey.set(key, Math.round(((sellable - free) / sellable) * 100))
    }

    // 5) catture competitor nel range (con raw_data.rooms) -> ultima per (competitor, stay_date)
    const rateRows = await fetchAllPaginatedOrLog<{
      competitor_id: string
      stay_date: string
      captured_at: string
      raw_data: { rooms?: RawRoom[] } | null
    }>(
      () =>
        supabase
          .from("competitor_rates")
          .select("competitor_id, stay_date, captured_at, raw_data")
          .eq("hotel_id", hotelId)
          .gte("stay_date", from)
          .lte("stay_date", to)
          .order("stay_date", { ascending: true })
          .order("captured_at", { ascending: true }),
      "rate-shopper-by-room-comp",
    )
    // key `${competitorId}|${stayDate}` -> { roomName -> price } (ultima cattura)
    const compRooms = new Map<string, { capturedAt: string; rooms: Map<string, number | null> }>()
    for (const r of rateRows) {
      const key = `${r.competitor_id}|${r.stay_date}`
      const prev = compRooms.get(key)
      if (prev && r.captured_at <= prev.capturedAt) continue
      const rooms = new Map<string, number | null>()
      const list = r.raw_data?.rooms
      if (Array.isArray(list)) {
        for (const room of list) {
          const name = typeof room?.name === "string" ? room.name.trim() : ""
          if (!name) continue
          const price = typeof room?.price === "number" ? room.price : null
          rooms.set(name, price)
        }
      }
      compRooms.set(key, { capturedAt: r.captured_at, rooms })
    }

    // 6) insieme delle date da considerare
    const dateSet = new Set<string>()
    for (const k of ourPrice.keys()) dateSet.add(k.split("|")[1])
    for (const k of compRooms.keys()) dateSet.add(k.split("|")[1])
    for (const k of availByKey.keys()) dateSet.add(k.split("|")[1])
    const dates = [...dateSet].filter((d) => d >= from && d <= to).sort()

    // 7) per ogni tipologia, costruisci la tabella per data
    const roomTypes = monitoredIds.map((rtId) => {
      const days = dates.map((date) => {
        const comps = compList.map((c) => {
          const mappedRoom = mapByKey.get(`${rtId}|${c.id}`) ?? null
          let price: number | null = null
          if (mappedRoom) {
            const cell = compRooms.get(`${c.id}|${date}`)
            price = cell?.rooms.get(mappedRoom) ?? null
          }
          return { competitorId: c.id, name: c.name, mappedRoom, price }
        })
        const prices = comps.map((c) => c.price).filter((p): p is number => p != null && p > 0)
        const our = ourPrice.get(`${rtId}|${date}`) ?? null
        const ourSoldOut = availByKey.has(`${rtId}|${date}`) && (availByKey.get(`${rtId}|${date}`) ?? 0) <= 0
        const min = prices.length ? Math.min(...prices) : null
        const max = prices.length ? Math.max(...prices) : null
        const med = median(prices)
        return {
          date,
          ourPrice: our,
          ourSoldOut,
          ourOccupancy: occByKey.get(`${rtId}|${date}`) ?? null,
          competitors: comps,
          market: { min, median: med, max, count: prices.length },
          diffVsMedianPct: our != null && med != null && med > 0 ? ((our - med) / med) * 100 : null,
        }
      })

      const withMarket = days.filter((d) => d.ourPrice != null && d.market.median != null)
      const avgDiff =
        withMarket.length > 0 ? withMarket.reduce((s, d) => s + (d.diffVsMedianPct ?? 0), 0) / withMarket.length : null
      const mapped = compList.filter((c) => mapByKey.has(`${rtId}|${c.id}`)).length

      return {
        roomTypeId: rtId,
        roomTypeName: roomTypeName.get(rtId) ?? "Tipologia",
        days: days.filter((d) => d.ourPrice != null || d.ourSoldOut || d.market.count > 0),
        summary: {
          daysCompared: withMarket.length,
          avgDiffVsMedianPct: avgDiff,
          mapped,
          competitorsTotal: compList.length,
        },
      }
    })

    return NextResponse.json({
      range: { from, to, occupancy },
      competitors: compList.map((c) => ({ id: c.id, name: c.name })),
      roomTypes,
    })
  } catch (error) {
    console.error("[rate-shopper:by-room] error", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}
