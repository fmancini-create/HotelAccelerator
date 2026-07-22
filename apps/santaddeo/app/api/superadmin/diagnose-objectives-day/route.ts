import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { requireSuperAdmin } from "@/lib/auth/requireSuperAdmin"

export const dynamic = "force-dynamic"
export const maxDuration = 30

/**
 * GET /api/superadmin/diagnose-objectives-day?hotelId=...&date=YYYY-MM-DD
 *
 * Strumento diagnostico per investigare discrepanze nella colonna O
 * (Camere Disponibili alla Vendita) della pagina /dati/obiettivi.
 *
 * Mostra TUTTO quello che la pagina obiettivi vede per una data specifica:
 * tutti i bookings Scidoo che hanno una notte in `date`, con status,
 * room_type_id, checkin/checkout, e le righe `Pernotto` rilevanti.
 * Replica esattamente i filtri della pagina obiettivi (status whitelist
 * + room_type attivo) e categorizza ogni booking come "INCLUSO" o
 * "ESCLUSO" con il motivo, cosi' si capisce subito perche' un booking
 * fisicamente in casa non viene contato.
 *
 * Esempio chiamata:
 *   /api/superadmin/diagnose-objectives-day?hotelId=<UUID>&date=2026-04-30
 *
 * Output JSON include:
 *   - capacity: { totalRooms, dailyCapacity, oosOnDate }
 *   - filters: { defaultStatuses, statusFilter, activeScidooIds }
 *   - bookings: array con dettagli + verdict
 *   - summary: { included, excludedByStatus, excludedByRoomType, excludedByNoPernotto }
 */
export async function GET(request: NextRequest) {
  const denied = await requireSuperAdmin()
  if (denied) return denied

  const searchParams = request.nextUrl.searchParams
  const hotelId = searchParams.get("hotelId")
  const date = searchParams.get("date")

  if (!hotelId || !date) {
    return NextResponse.json(
      { error: "hotelId e date (YYYY-MM-DD) richiesti" },
      { status: 400 },
    )
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "date deve essere in formato YYYY-MM-DD" },
      { status: 400 },
    )
  }

  const supabase = await createServiceRoleClient()

  // ---- 1. Hotel + room types attivi (stessa logica di objectives/route.ts) ----
  const { data: hotel } = await supabase
    .from("hotels")
    .select("id, name")
    .eq("id", hotelId)
    .maybeSingle()

  if (!hotel) {
    return NextResponse.json({ error: "Hotel non trovato" }, { status: 404 })
  }

  const { data: roomTypes } = await supabase
    .from("room_types")
    .select("id, name, scidoo_room_type_id, total_rooms")
    .eq("hotel_id", hotelId)
    .eq("is_active", true)

  const activeScidooIds = new Set<string>()
  const scidooIdToName = new Map<string, string>()
  let dailyCapacity = 0
  for (const rt of roomTypes || []) {
    if (rt.scidoo_room_type_id) {
      const sid = String(rt.scidoo_room_type_id)
      activeScidooIds.add(sid)
      scidooIdToName.set(sid, (rt.name as string) || "—")
    }
    dailyCapacity += (rt.total_rooms || 0)
  }

  // ---- 2. OOS per la data ----
  const { data: oosRows } = await supabase
    .from("rms_availability_daily")
    .select("date, total_rooms, rooms_out_of_service")
    .eq("hotel_id", hotelId)
    .eq("date", date)

  let oosOnDate = 0
  for (const r of oosRows || []) {
    const totalR = Number(r.total_rooms) || 0
    const oos = Number(r.rooms_out_of_service) || 0
    if (totalR > 0) {
      oosOnDate += Math.min(Math.max(0, oos), totalR)
    }
  }

  // ---- 3. Default statuses (copiato da objectives/route.ts) ----
  const DEFAULT_PRODUCTION_STATUSES = [
    "opzione",
    "attesa_pagamento",
    "confermata",
    "confermata_manuale",
    "confermata_pagamento",
    "confermata_carta",
    "check_in",
    "saldo",
    "check_out",
  ]
  const statusFilter = new Set(DEFAULT_PRODUCTION_STATUSES)

  // ---- 4. Bookings che CONTENGONO la data (checkin <= date AND checkout > date) ----
  // Pagina obiettivi paginata: simulo paginazione qui per evitare cap 1000.
  const PAGE = 1000
  const all: any[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from("scidoo_raw_bookings")
      .select(
        "id, status, room_type_code, checkin_date, checkout_date, total_amount, raw_data, booking_date",
      )
      .eq("hotel_id", hotelId)
      .lte("checkin_date", date)
      .gt("checkout_date", date)
      .range(from, from + PAGE - 1)

    if (error) {
      return NextResponse.json(
        { error: `Query error: ${error.message}` },
        { status: 500 },
      )
    }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }

  // ---- 5. Per ogni booking: applica filtri e classifica ----
  const summary = {
    total: all.length,
    included: 0,
    excludedByStatus: 0,
    excludedByRoomType: 0,
    excludedByNoPernotto: 0,
  }

  const bookings = all.map((b) => {
    const status = b.status as string | null
    const rtId = b.raw_data?.room_type_id ? String(b.raw_data.room_type_id) : null
    const rtName = rtId ? scidooIdToName.get(rtId) ?? "(non attivo)" : "(senza room_type)"

    // Statics filter: solo Pernotto per la data richiesta
    const statics: any[] = Array.isArray(b.raw_data?.statics) ? b.raw_data.statics : []
    const pernottoOnDate = statics.filter(
      (s) =>
        s &&
        s.category === "Pernotto" &&
        String(s.date_time || "").slice(0, 10) === date,
    )
    const pernottoPrice =
      pernottoOnDate.reduce((sum, s) => sum + (Number(s.price) || 0), 0)

    // Verdict (in ordine come in objectives/route.ts)
    let verdict: string
    let reason: string

    if (!statusFilter.has(status || "")) {
      verdict = "ESCLUSO"
      reason = `status='${status}' non in DEFAULT_PRODUCTION_STATUSES`
      summary.excludedByStatus++
    } else if (!rtId) {
      verdict = "ESCLUSO"
      reason = "room_type_id mancante (es. 'Senza Soggiorno')"
      summary.excludedByRoomType++
    } else if (!activeScidooIds.has(rtId)) {
      verdict = "ESCLUSO"
      reason = `room_type_id=${rtId} non in activeScidooIds (camera non attiva o non mappata)`
      summary.excludedByRoomType++
    } else if (pernottoOnDate.length === 0) {
      // Anche se status+roomType OK, se non c'e' Pernotto sulla data
      // l'entry non viene generata da extractDailyPrices
      verdict = "ESCLUSO"
      reason = `nessuna riga statics 'Pernotto' con date_time=${date} (gli statics potrebbero essere su altre date, oppure la categoria non e' esattamente 'Pernotto')`
      summary.excludedByNoPernotto++
    } else {
      verdict = "INCLUSO"
      reason = `status=${status}, room_type=${rtName}, ${pernottoOnDate.length} riga(e) Pernotto, prezzo €${pernottoPrice.toFixed(2)}`
      summary.included++
    }

    return {
      id: b.id,
      status,
      room_type_id: rtId,
      room_type_name: rtName,
      checkin_date: b.checkin_date,
      checkout_date: b.checkout_date,
      booking_date: b.booking_date,
      total_amount: b.total_amount,
      verdict,
      reason,
      pernottoOnDate,
      // Categorie statics presenti, utile per individuare typo o variazioni di "Pernotto"
      static_categories: Array.from(
        new Set(statics.map((s) => s?.category).filter(Boolean)),
      ),
      // Campioni raw per ispezione (max 3 per non far esplodere la response)
      raw_data_sample: {
        type: b.raw_data?.type,
        guest_name: b.raw_data?.guest_name,
        cancelled: b.raw_data?.cancelled,
        is_room_booking: b.raw_data?.is_room_booking,
        statics_count: statics.length,
        statics_first_3: statics.slice(0, 3),
      },
    }
  })

  return NextResponse.json({
    hotel: { id: hotel.id, name: hotel.name },
    date,
    capacity: {
      dailyCapacityFromRoomTypes: dailyCapacity,
      oosOnDate,
      effectiveCapacityOnDate: Math.max(0, dailyCapacity - oosOnDate),
    },
    filters: {
      defaultStatuses: DEFAULT_PRODUCTION_STATUSES,
      activeScidooIds: Array.from(activeScidooIds),
      activeRoomTypes: Array.from(scidooIdToName.entries()).map(
        ([sid, name]) => ({ scidoo_id: sid, name }),
      ),
    },
    summary,
    expected: {
      // Quello che la pagina obiettivi calcola per remainingUnsold del 30/04 quando
      // la data e' "oggi" e il mese finisce oggi:
      //   capacityRemaining = effectiveCapacityOnDate (1 giorno solo)
      //   soldFromToday = summary.included
      //   remainingUnsold = capacityRemaining - soldFromToday
      capacityRemaining: Math.max(0, dailyCapacity - oosOnDate),
      soldOnDate: summary.included,
      remainingUnsold: Math.max(
        0,
        Math.max(0, dailyCapacity - oosOnDate) - summary.included,
      ),
    },
    bookings,
  })
}
