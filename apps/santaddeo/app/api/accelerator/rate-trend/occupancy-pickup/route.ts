import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

interface PickupPoint {
  date: string // data in cui e' stata fatta/cancellata la prenotazione (booking_date)
  occupied: number // camere occupate per la data target, viste a quel momento
  occupancyPct: number | null
}

/**
 * GET /api/accelerator/rate-trend/occupancy-pickup
 *
 * Ricostruisce la CURVA DI PICKUP dell'occupazione per una singola data di
 * soggiorno (target), cioe' come e' cresciuta l'occupazione di quella data
 * man mano che arrivavano le prenotazioni nel tempo.
 *
 * NB: l'occupazione NON e' storicizzata (daily_availability tiene solo lo
 * stato corrente). La curva si RICOSTRUISCE dalla tabella bookings:
 *   - una prenotazione contribuisce all'occupazione della data target se
 *     copre quella notte: check_in_date <= target < check_out_date;
 *   - entra in curva al suo booking_date (quando e' stata fatta);
 *   - esce al cancellation_date se cancellata (se cancellata senza data nota
 *     la escludiamo, per restare coerenti con lo stato attuale).
 * Il valore finale della curva coincide con l'occupato attuale di
 * daily_availability (verificato).
 *
 * Query params: hotel_id, date (YYYY-MM-DD), room_type_id (opzionale: se
 * presente la curva e' per la singola tipologia, altrimenti di struttura).
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const hotelId = sp.get("hotel_id")
    const target = sp.get("date")
    const roomTypeId = sp.get("room_type_id") // opzionale

    if (!hotelId || !target) {
      return NextResponse.json({ error: "hotel_id, date required" }, { status: 400 })
    }

    const isV0Preview = await isDevAuthAsync()
    const supabase = isV0Preview ? await createServiceRoleClient() : await createClient()

    // 1. Capacita' (camere vendibili) per la data target da daily_availability.
    let availQuery = supabase
      .from("daily_availability")
      .select("room_type_id, total_rooms, rooms_out_of_service")
      .eq("hotel_id", hotelId)
      .eq("date", target)
    if (roomTypeId) availQuery = availQuery.eq("room_type_id", roomTypeId)
    const { data: availRows } = await availQuery

    let capacity = 0
    for (const r of availRows || []) {
      capacity += Math.max(0, (r.total_rooms || 0) - (r.rooms_out_of_service || 0))
    }

    // 2. Prenotazioni che coprono la notte target.
    let bkQuery = supabase
      .from("bookings")
      .select(
        "booking_date, check_in_date, check_out_date, is_cancelled, cancellation_date, number_of_rooms, is_room_booking",
      )
      .eq("hotel_id", hotelId)
      .lte("check_in_date", target)
      .gt("check_out_date", target)
    if (roomTypeId) bkQuery = bkQuery.eq("room_type_id", roomTypeId)
    const { data: bookings } = await bkQuery

    // 3. Eventi (+rooms al booking_date, -rooms al cancellation_date).
    const deltas = new Map<string, number>()
    for (const b of bookings || []) {
      if (b.is_room_booking === false) continue
      const rooms = b.number_of_rooms || 1
      const bookedOn = b.booking_date
      if (!bookedOn) continue
      // Cancellata ma senza data: la escludiamo per coerenza con lo stato attuale.
      if (b.is_cancelled && !b.cancellation_date) continue
      deltas.set(bookedOn, (deltas.get(bookedOn) || 0) + rooms)
      if (b.is_cancelled && b.cancellation_date) {
        deltas.set(b.cancellation_date, (deltas.get(b.cancellation_date) || 0) - rooms)
      }
    }

    // 4. Serie cumulativa ordinata per data evento.
    const eventDates = Array.from(deltas.keys()).sort()
    const series: PickupPoint[] = []
    let running = 0
    for (const d of eventDates) {
      running += deltas.get(d) || 0
      const occupied = Math.max(0, running)
      series.push({
        date: d,
        occupied,
        // clamp a 100%: l'occupazione non puo' superare il 100% (vedi nota Obiettivi 27/06/2026).
        occupancyPct: capacity > 0 ? Math.min(100, Math.round((occupied / capacity) * 1000) / 10) : null,
      })
    }

    const finalOccupied = series.length > 0 ? series[series.length - 1].occupied : 0

    return NextResponse.json({
      date: target,
      capacity,
      finalOccupied,
      finalOccupancyPct: capacity > 0 ? Math.min(100, Math.round((finalOccupied / capacity) * 1000) / 10) : null,
      scope: roomTypeId ? "room_type" : "hotel",
      series,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error("[v0] OCCUPANCY-PICKUP API error:", msg)
    return NextResponse.json({ error: "Internal server error", details: msg }, { status: 500 })
  }
}
