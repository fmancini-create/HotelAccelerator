import { createClient } from "@/lib/supabase/server"
import { fetchAllPaginatedOrLog } from "@/lib/supabase/paginate"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * Calendario Prenotazioni API
 * 
 * Per ogni data dell'anno fornisce:
 * - Prenotazioni attive il cui soggiorno copre quella data
 * - Cancellazioni il cui soggiorno copriva quella data
 * - Ultima prenotazione ricevuta (booking_date) per quella data di soggiorno
 * - Disponibilita' residua (da daily_availability)
 * 
 * La logica "data ferma" e' calcolata client-side usando:
 * - last_booking_received: data dell'ultima prenotazione RICEVUTA per quella data di soggiorno
 * - availability: camere disponibili in quella data
 * - distanza dalla data e soglie KPI del tenant
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const hotelId = searchParams.get("hotelId")
  const year = parseInt(searchParams.get("year") || new Date().getFullYear().toString())

  if (!hotelId) {
    return NextResponse.json({ error: "hotelId required" }, { status: 400 })
  }

  const yearStart = `${year}-01-01`
  const yearEnd = `${year}-12-31`

  let supabase
  try {
    supabase = await createClient()
  } catch (error) {
    console.error("[v0] Failed to create Supabase client:", error)
    return NextResponse.json({ error: "Database connection failed" }, { status: 500 })
  }

  try {
    // 1. Tutte le prenotazioni il cui soggiorno si sovrappone all'anno
    const { data: bookings, error: bError } = await supabase
      .from("bookings")
      .select(
        "id, pms_booking_id, check_in_date, check_out_date, total_price, guest_name, channel, number_of_guests, room_type_id, is_cancelled, cancellation_date, booking_date, created_at, updated_at, number_of_nights"
      )
      .eq("hotel_id", hotelId)
      .lte("check_in_date", yearEnd)
      .gte("check_out_date", yearStart)
      .order("booking_date", { ascending: false })

    if (bError) {
      console.error("Error fetching bookings:", bError)
      return NextResponse.json({ error: bError.message }, { status: 500 })
    }

    // 2. Disponibilita' giornaliera per l'anno
    // daily_availability e' per room_type, aggrega per data
    // FIX 21/05/2026 — paginazione: per hotel multi-room_type (Barronci ha 14 RT
    // x 365 giorni = ~5k righe/anno) il limit default Supabase di 1000 troncava
    // i dati e l'aggregazione availMap restava incompleta. Con righe mancanti,
    // info.avail cadeva su -1 e il client interpretava la data come "ha
    // disponibilita'" anche quando l'hotel era pieno -> falso positivo "data
    // ferma" (pallino rosso) su date sold-out.
    const availability = await fetchAllPaginatedOrLog<{ date: string; total_rooms: number | null; rooms_available: number | null }>(
      () => supabase
        .from("daily_availability")
        .select("date, total_rooms, rooms_available")
        .eq("hotel_id", hotelId)
        .gte("date", yearStart)
        .lte("date", yearEnd),
      "calendario:daily_availability",
    )

    const availMap: Record<string, { inventory: number; available: number }> = {}
    for (const a of availability || []) {
      if (!availMap[a.date]) {
        availMap[a.date] = { inventory: 0, available: 0 }
      }
      availMap[a.date].inventory += (a.total_rooms || 0)
      availMap[a.date].available += (a.rooms_available || 0)
    }

    // 3. Room types
    const { data: roomTypes } = await supabase
      .from("room_types")
      .select("id, name, total_rooms")
      .eq("hotel_id", hotelId)

    const totalRooms = (roomTypes || []).reduce((s, r) => s + (r.total_rooms || 0), 0)
    const roomTypeMap: Record<string, string> = {}
    for (const rt of roomTypes || []) {
      roomTypeMap[rt.id] = rt.name
    }

    // 4. KPI thresholds per "data ferma" (pickup_booking_days)
    // Prima cerca custom per hotel, poi fallback a globali
    const { data: hotelKpi } = await supabase
      .from("kpi_thresholds")
      .select("metric_key, green_min, orange_min, red_min")
      .eq("hotel_id", hotelId)
      .eq("metric_key", "pickup_booking_days")
      .limit(1)
      .maybeSingle()

    const { data: globalKpi } = await supabase
      .from("kpi_thresholds")
      .select("metric_key, green_min, orange_min, red_min")
      .is("hotel_id", null)
      .eq("metric_key", "pickup_booking_days")
      .limit(1)
      .maybeSingle()

    const pickupKpi = hotelKpi || globalKpi

    // 5. Aggregazione per data di soggiorno
    interface BookingRow {
      id: string
      pms_booking_id: string | null
      check_in_date: string
      check_out_date: string
      total_price: string | number | null
      guest_name: string | null
      channel: string | null
      number_of_guests: number | null
      room_type_id: string | null
      is_cancelled: boolean
      cancellation_date: string | null
      booking_date: string | null
      created_at: string
      updated_at: string
      number_of_nights: number | null
    }

    interface DateBucket {
      activeBookings: BookingRow[]
      cancellations: BookingRow[]
      // Data piu' recente in cui e' stata RICEVUTA una prenotazione per questa data di soggiorno
      // (usa booking_date, non updated_at)
      last_booking_received: string | null
      last_cancellation_date: string | null
    }

    const dateMap: Record<string, DateBucket> = {}

    const initDate = (d: string) => {
      if (!dateMap[d]) {
        dateMap[d] = {
          activeBookings: [],
          cancellations: [],
          last_booking_received: null,
          last_cancellation_date: null,
        }
      }
    }

    for (const b of (bookings || []) as BookingRow[]) {
      const ci = new Date(b.check_in_date + "T12:00:00")
      const co = new Date(b.check_out_date + "T12:00:00")
      const rStart = new Date(Math.max(ci.getTime(), new Date(yearStart + "T00:00:00").getTime()))
      const rEnd = new Date(Math.min(co.getTime(), new Date(yearEnd + "T23:59:59").getTime()))

      const nights = b.number_of_nights || Math.max(1, Math.round((co.getTime() - ci.getTime()) / 86400000))

      for (let dt = new Date(rStart); dt < rEnd; dt.setDate(dt.getDate() + 1)) {
        const ds = dt.toISOString().slice(0, 10)
        initDate(ds)

        if (b.is_cancelled) {
          dateMap[ds].cancellations.push(b)
          // Traccia data cancellazione
          const cdt = b.cancellation_date || b.updated_at
          if (!dateMap[ds].last_cancellation_date || (cdt && cdt > dateMap[ds].last_cancellation_date!)) {
            dateMap[ds].last_cancellation_date = cdt
          }
        } else {
          dateMap[ds].activeBookings.push(b)
        }

        // Traccia ultima prenotazione RICEVUTA per questa data di soggiorno
        // (anche le cancellate contano -- erano prenotazioni prima di essere cancellate)
        const bkDate = b.booking_date || b.created_at?.slice(0, 10)
        if (bkDate) {
          if (!dateMap[ds].last_booking_received || bkDate > dateMap[ds].last_booking_received!) {
            dateMap[ds].last_booking_received = bkDate
          }
        }
      }
    }

    // Helper: calcola notti e prezzo per notte
    const calcBookingInfo = (b: BookingRow) => {
      const ci = new Date(b.check_in_date + "T12:00:00")
      const co = new Date(b.check_out_date + "T12:00:00")
      const nights = b.number_of_nights || Math.max(1, Math.round((co.getTime() - ci.getTime()) / 86400000))
      const totalAmt = Number(b.total_price) || 0
      const ppn = nights > 0 ? Math.round((totalAmt / nights) * 100) / 100 : 0
      const leadDays = Math.max(0, Math.round((ci.getTime() - new Date(b.booking_date || b.created_at).getTime()) / 86400000))
      return { nights, totalAmt, ppn, leadDays }
    }

    // 6. Build summary
    const summary: Record<string, {
      bc: number           // active bookings count
      cc: number           // cancellations count
      rn: number           // room nights (active)
      rev: number          // revenue (nightly portion, active)
      lbr: string | null   // last_booking_received (data dell'ultima prenotazione ricevuta)
      lcd: string | null   // last_cancellation_date
      avail: number        // camere disponibili in questa data
      inv: number          // inventario totale in questa data
      items: {
        g: string          // guest
        n: number          // nights
        t: number          // total amount
        ppn: number        // price per night
        ld: number         // lead days
        ch: string         // channel
        rt: string         // room type
        cx: boolean        // cancelled
        bd: string         // booking_date (quando e' stata ricevuta)
      }[]
    }> = {}

    for (const [date, info] of Object.entries(dateMap)) {
      const rn = info.activeBookings.length
      const rev = info.activeBookings.reduce((s, b) => {
        const { ppn } = calcBookingInfo(b)
        return s + ppn
      }, 0)

      const av = availMap[date]
      // Cancellazioni prima, poi attive -- cosi' il popover le mostra sempre
      const allItems = [...info.cancellations, ...info.activeBookings]

      summary[date] = {
        bc: info.activeBookings.length,
        cc: info.cancellations.length,
        rn,
        rev: Math.round(rev * 100) / 100,
        lbr: info.last_booking_received,
        lcd: info.last_cancellation_date,
        avail: av?.available ?? -1, // -1 = dato non disponibile
        inv: av?.inventory ?? totalRooms,
        items: allItems.slice(0, 15).map((b) => {
          const { nights, totalAmt, ppn, leadDays } = calcBookingInfo(b)
          return {
            g: b.guest_name || "-",
            n: nights,
            t: totalAmt,
            ppn,
            ld: leadDays,
            ch: b.channel || "-",
            rt: b.room_type_id ? (roomTypeMap[b.room_type_id] || "-") : "-",
            cx: b.is_cancelled,
            bd: b.booking_date || b.created_at?.slice(0, 10) || "-",
          }
        }),
      }
    }

    return NextResponse.json({
      year,
      hotelId,
      totalRooms,
      dates: summary,
      // KPI thresholds per "data ferma" -- il client li usa per il calcolo
      pickupThreshold: pickupKpi ? {
        green: Number(pickupKpi.green_min) || 30,
        orange: Number(pickupKpi.orange_min) || 14,
        red: Number(pickupKpi.red_min) || 0,
      } : { green: 30, orange: 14, red: 0 },
    })
  } catch (error) {
    console.error("Error in calendario API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
