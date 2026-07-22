import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"
import { fetchAllPaginatedOrLog, fetchAllKeysetOrLog } from "@/lib/supabase/paginate"
import { getHotelVatConfig, scorporoMonetaryDeep, resolveVatConfig, parseVatViewParam } from "@/lib/utils/vat-display"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

interface EvolutionPoint {
  timestamp: string
  price: number
}

interface DayTrend {
  date: string
  currentPrice: number | null
  startingPrice: number | null
  changeCount: number
  evolutionSeries: EvolutionPoint[]
  lastUpdated: string | null
  // Occupazione tipologia camera (da daily_availability)
  roomsSold: number | null
  roomTypeTotalRooms: number | null
  // Occupazione struttura (da daily_production)
  hotelRoomsOccupied: number | null
  hotelTotalRooms: number | null
  occupancyPct: number | null
  // Ricavo camere realizzato del giorno e RevPor (ricavo / camere occupate)
  roomRevenue: number | null
  revpor: number | null
}

/**
 * GET /api/accelerator/rate-trend
 *
 * Versione "a range" di /api/accelerator/price-history: invece di una singola
 * cella restituisce, per OGNI data nell'intervallo richiesto, lo storico
 * evolutivo della tariffa (gli stessi dati del tooltip della griglia pricing)
 * piu' l'occupazione. Alimenta la pagina "Trend Tariffe & Occupazione".
 *
 * Query params: hotel_id, room_type_id, rate_id, occupancy, from, to (YYYY-MM-DD)
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const hotelId = sp.get("hotel_id")
    const roomTypeId = sp.get("room_type_id")
    const rateId = sp.get("rate_id")
    const occupancy = sp.get("occupancy")
    const from = sp.get("from")
    const to = sp.get("to")

    if (!hotelId || !roomTypeId || !rateId || !occupancy || !from || !to) {
      return NextResponse.json(
        { error: "hotel_id, room_type_id, rate_id, occupancy, from, to required" },
        { status: 400 },
      )
    }

    const occ = Number(occupancy)

    // "__all__" = intera struttura: aggrega tutte le tipologie camera.
    // Tariffa = media per data (e media evolutiva nel tempo), occupazione =
    // occupazione di struttura (gia' calcolata su tutte le tipologie).
    const allRoomTypes = roomTypeId === "__all__"

    // In preview (v0 chat / localhost) non esiste sessione Supabase: il client
    // cookie-based con RLS tornerebbe 0 righe. Usiamo il service role client
    // per leggere i dati anche in anteprima (pattern consolidato Santaddeo).
    const isV0Preview = await isDevAuthAsync()
    const supabase = isV0Preview ? await createServiceRoleClient() : await createClient()

    // 1. Prezzi correnti per ogni data del range (pricing_grid).
    // Paginato: su tutta la struttura (allRoomTypes) le righe sono giorni ×
    // tipologie e su range ampi superano il cap PostgREST di 1000 (altrimenti
    // prezzo corrente e changeCount risultano troncati sulle date lontane).
    const gridRows = await fetchAllPaginatedOrLog<{
      date: string
      price: number
      updated_at: string | null
      room_type_id: string
    }>(() => {
      let q = supabase
        .from("pricing_grid")
        .select("date, price, updated_at, room_type_id")
        .eq("hotel_id", hotelId)
        .eq("rate_id", rateId)
        .eq("occupancy", occ)
        .gte("date", from)
        .lte("date", to)
        .order("date", { ascending: true })
      if (!allRoomTypes) q = q.eq("room_type_id", roomTypeId)
      return q
    }, "rate-trend-grid")

    // 2. Tutte le variazioni storicizzate del range (price_change_log).
    // IMPORTANTE: PostgREST tronca SILENZIOSAMENTE a 1000 righe per request, e
    // una struttura in autopilot accumula DECINE DI MIGLIAIA di variazioni per
    // un solo mese (es. Barronci ~52k su 31 giorni). Serve quindi paginare, MA
    // con KEYSET, non con OFFSET: la vecchia paginazione .range() ri-scansionava
    // le righe saltate a ogni pagina -> ~14s per pagina profonda -> statement
    // timeout (l'errore "returning 20000 partial rows"). Vedi memoria
    // santaddeo-rate-trend-timeout. Il cursore (target_date, changed_at, id)
    // combacia con l'indice idx_price_change_log_trend
    // (hotel_id, rate_id, occupancy, target_date, changed_at, id): ogni pagina e'
    // un seek ~200ms, niente sort su disco. L'ordinamento per (target_date,
    // changed_at) e' sufficiente: a valle raggruppiamo per data e, per la vista
    // "tutte le tipologie", riordiniamo comunque in memoria.
    const historyRows = await fetchAllKeysetOrLog<{
      id: string
      target_date: string
      room_type_id: string
      old_price: number | null
      new_price: number
      changed_at: string
      source: string | null
      action_taken: string | null
    }>(
      () => {
        let q = supabase
          .from("price_change_log")
          .select("id, target_date, room_type_id, old_price, new_price, changed_at, source, action_taken")
          .eq("hotel_id", hotelId)
          .eq("rate_id", rateId)
          .eq("occupancy", occ)
          .gte("target_date", from)
          .lte("target_date", to)
        if (!allRoomTypes) q = q.eq("room_type_id", roomTypeId)
        return q
      },
      [{ column: "target_date" }, { column: "changed_at" }, { column: "id" }],
      "rate-trend-history",
    )

    // 3. Occupazione per tipologia camera selezionata (daily_availability).
    // NB: l'occupato si DERIVA: total_rooms - rooms_out_of_service - rooms_available.
    const { data: availRows } = await supabase
      .from("daily_availability")
      .select("date, rooms_available, rooms_out_of_service, total_rooms")
      .eq("hotel_id", hotelId)
      .eq("room_type_id", roomTypeId)
      .gte("date", from)
      .lte("date", to)

    // 3b. Occupazione STRUTTURA da daily_availability (TUTTE le tipologie).
    // Questa e' la fonte primaria dell'occupazione % perche' coperta per
    // l'intero range (passato + futuro). FIX 30/05/2026: prima leggevamo
    // l'occupazione da daily_production.rooms_occupied, ma per i giorni
    // passati/odierni quel dato arriva da 'scidoo_fiscal' con rooms_occupied=0
    // (l'occupazione reale e' solo nelle righe future 'scidoo_raw_bookings').
    // Risultato: barre a 0 nel passato. daily_availability ha invece il dato
    // corretto per ogni data, da cui deriviamo l'occupazione di struttura.
    // Paginato: giorni × tipologie supera il cap di 1000 su range ampi
    // (senza, l'occupazione di struttura risultava a 0 sulle date lontane).
    const hotelAvailRows = await fetchAllPaginatedOrLog<{
      date: string
      rooms_available: number | null
      rooms_out_of_service: number | null
      total_rooms: number | null
    }>(
      () =>
        supabase
          .from("daily_availability")
          .select("date, rooms_available, rooms_out_of_service, total_rooms")
          .eq("hotel_id", hotelId)
          .gte("date", from)
          .lte("date", to)
          .order("date", { ascending: true }),
      "rate-trend-hotel-avail",
    )

    // 4. Occupazione struttura (daily_production) - usata SOLO come fallback
    // quando daily_availability non ha righe per quella data.
    const { data: prodRows } = await supabase
      .from("daily_production")
      .select("date, rooms_occupied, total_rooms")
      .eq("hotel_id", hotelId)
      .gte("date", from)
      .lte("date", to)

    // 5. Ricavo camere REALIZZATO per data, per calcolare il RevPor giornaliero.
    // Fonte = raw_data.daily_price di scidoo_raw_bookings (sconti redistribuiti
    // pro-rata), la STESSA usata da /accelerator/price (pricing.service) e dalla
    // pagina Obiettivi. NON usare daily_production.total_revenue: per i giorni
    // passati (source 'scidoo_fiscal') quel campo non e' il ricavo camere e
    // produce un RevPor falsato (~45€ invece di ~222€ su Barronci maggio 2026).
    // VERIFICATO: somma mese = Produzione Obiettivi, RevPor mese = 222,60 €.
    const { data: roomTypeRows } = await supabase
      .from("room_types")
      .select("id, name, is_active, scidoo_room_type_id, pms_room_type_id")
      .eq("hotel_id", hotelId)
    const activeRtNames = new Set<string>()
    const pmsIdToName = new Map<string, string>()
    for (const rt of roomTypeRows || []) {
      if (rt.is_active !== false) activeRtNames.add(rt.name)
      if (rt.pms_room_type_id) pmsIdToName.set(String(rt.pms_room_type_id), rt.name)
      if (rt.scidoo_room_type_id) pmsIdToName.set(String(rt.scidoo_room_type_id), rt.name)
    }

    // Paginato: una struttura con molte prenotazioni nel range supera il cap
    // di 1000 -> ricavo (e quindi RevPor) troncato sulle date lontane.
    const etlBookings = await fetchAllPaginatedOrLog<{
      room_type_name: string | null
      status: string | null
      raw_data: any
    }>(
      () =>
        supabase
          .from("scidoo_raw_bookings")
          .select("room_type_name, status, raw_data")
          .eq("hotel_id", hotelId)
          .neq("status", "annullata")
          .lte("checkin_date", to)
          .gte("checkout_date", from)
          .order("checkin_date", { ascending: true }),
      "rate-trend-etl-bookings",
    )

    const revenueByDate = new Map<string, number>()
    for (const bk of etlBookings || []) {
      let rtName: string = bk.room_type_name || "Sconosciuto"
      if (rtName === "Sconosciuto" && bk.raw_data?.room_type_id) {
        rtName = pmsIdToName.get(String(bk.raw_data.room_type_id)) || "Sconosciuto"
      }
      if (activeRtNames.size > 0 && !activeRtNames.has(rtName)) continue
      const dailyPrice: Record<string, string | number> = bk.raw_data?.daily_price || {}
      const extras: any[] = Array.isArray(bk.raw_data?.extras) ? bk.raw_data.extras : []
      const totalDiscount = extras.reduce((sum: number, ex: any) => {
        const price = Number(ex.price) || 0
        if (price >= 0) return sum
        const cat = String(ex.category || "").toLowerCase()
        const desc = String(ex.description || "").toLowerCase()
        const isDiscount =
          cat.includes("sconti") ||
          cat.includes("servizio nota") ||
          desc.includes("sconto") ||
          desc.includes("addebito libero")
        return isDiscount ? sum + price : sum
      }, 0)
      const dpTotal = Object.values(dailyPrice).reduce<number>((s, v) => {
        const n = Number(v) || 0
        return s + (n > 0 && n !== 999 && n !== 9999 ? n : 0)
      }, 0)
      for (const [dateKey, val] of Object.entries(dailyPrice)) {
        const gross = Number(val) || 0
        if (gross <= 0 || gross === 999 || gross === 9999) continue
        const dateStr = dateKey.includes("/") ? dateKey.split("/").reverse().join("-") : dateKey
        if (dateStr < from || dateStr > to) continue
        const share = dpTotal > 0 ? (gross / dpTotal) * totalDiscount : 0
        revenueByDate.set(dateStr, (revenueByDate.get(dateStr) || 0) + gross + share)
      }
    }

    // Fallback hotel non-Scidoo (es. BRiG/Cavallino): nessuna riga ETL -> usa la
    // tabella legacy `bookings` (total_price / notti, spalmato per notte).
    if (revenueByDate.size === 0) {
      // Paginato: stesso rischio cap 1000 della query ETL.
      const legacyBookings = await fetchAllPaginatedOrLog<{
        check_in_date: string
        check_out_date: string
        total_price: number | null
        number_of_nights: number | null
      }>(
        () =>
          supabase
            .from("bookings")
            .select("check_in_date, check_out_date, total_price, number_of_nights")
            .eq("hotel_id", hotelId)
            .eq("is_cancelled", false)
            .lte("check_in_date", to)
            .gt("check_out_date", from)
            .order("check_in_date", { ascending: true }),
        "rate-trend-legacy-bookings",
      )
      for (const bk of legacyBookings || []) {
        const checkin = bk.check_in_date?.split("T")[0]
        const checkout = bk.check_out_date?.split("T")[0]
        if (!checkin || !checkout) continue
        let nights = bk.number_of_nights || 0
        if (!nights) nights = Math.ceil((new Date(checkout).getTime() - new Date(checkin).getTime()) / 86400000)
        if (nights <= 0) continue
        const perNight = (Number(bk.total_price) || 0) / nights
        for (let d = new Date(checkin); d < new Date(checkout); d.setDate(d.getDate() + 1)) {
          const ds = d.toISOString().slice(0, 10)
          if (ds < from || ds > to) continue
          revenueByDate.set(ds, (revenueByDate.get(ds) || 0) + perNight)
        }
      }
    }

    // ---- Indicizzazione per data ----
    // Per tipologia: Map<date, Map<roomTypeId, {price, updated_at}>>. Cosi'
    // supportiamo sia il singolo (una sola tipologia) sia "intera struttura"
    // (media delle tipologie) con la stessa struttura dati.
    const gridByDateRT = new Map<string, Map<string, { price: number; updated_at: string | null }>>()
    for (const r of gridRows || []) {
      const m = gridByDateRT.get(r.date) || new Map()
      m.set(r.room_type_id, { price: Number(r.price), updated_at: r.updated_at || null })
      gridByDateRT.set(r.date, m)
    }

    type HistEvent = { old_price: number | null; new_price: number; changed_at: string }
    const historyByDateRT = new Map<string, Map<string, HistEvent[]>>()
    for (const r of historyRows || []) {
      const m = historyByDateRT.get(r.target_date) || new Map<string, HistEvent[]>()
      const list = m.get(r.room_type_id) || []
      list.push({
        old_price: r.old_price != null ? Number(r.old_price) : null,
        new_price: Number(r.new_price),
        changed_at: r.changed_at,
      })
      m.set(r.room_type_id, list)
      historyByDateRT.set(r.target_date, m)
    }

    // Tipologia camera selezionata: occupato derivato (tot - oos - avail)
    const availByDate = new Map<
      string,
      { rooms_available: number | null; rooms_out_of_service: number | null; total_rooms: number | null }
    >()
    for (const r of availRows || []) {
      availByDate.set(r.date, {
        rooms_available: r.rooms_available,
        rooms_out_of_service: r.rooms_out_of_service,
        total_rooms: r.total_rooms,
      })
    }

    // Struttura (tutte le tipologie): somma per data, occupato = tot - oos - avail.
    // capacity netta = total_rooms - rooms_out_of_service (camere realmente vendibili).
    const hotelAvailByDate = new Map<string, { occupied: number; capacity: number; total: number }>()
    for (const r of hotelAvailRows || []) {
      const x = hotelAvailByDate.get(r.date) || { occupied: 0, capacity: 0, total: 0 }
      const tot = r.total_rooms || 0
      const oos = r.rooms_out_of_service || 0
      const avail = r.rooms_available || 0
      x.occupied += Math.max(0, tot - oos - avail)
      x.capacity += Math.max(0, tot - oos)
      x.total += tot
      hotelAvailByDate.set(r.date, x)
    }

    const prodByDate = new Map<string, { rooms_occupied: number | null; total_rooms: number | null }>()
    for (const r of prodRows || []) {
      prodByDate.set(r.date, { rooms_occupied: r.rooms_occupied, total_rooms: r.total_rooms })
    }

    // ---- Costruzione elenco date del range ----
    const days: DayTrend[] = []
    const start = new Date(from + "T00:00:00")
    const end = new Date(to + "T00:00:00")
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10)

      const gridMap = gridByDateRT.get(dateStr) || new Map<string, { price: number; updated_at: string | null }>()
      const histMap = historyByDateRT.get(dateStr) || new Map<string, HistEvent[]>()

      const evolutionSeries: EvolutionPoint[] = []
      let startingPrice: number | null = null
      let currentPrice: number | null = null
      let changeCount = 0
      let lastUpdated: string | null = null

      const avgOf = (vals: number[]): number | null =>
        vals.length === 0 ? null : Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100

      if (!allRoomTypes) {
        // --- Singola tipologia (comportamento storico, come il tooltip) ---
        const grid = gridMap.get(roomTypeId) || null
        const hist = histMap.get(roomTypeId) || []
        changeCount = hist.length
        if (hist.length > 0) {
          const first = hist[0]
          startingPrice = first.old_price != null ? first.old_price : first.new_price
          if (first.old_price != null) {
            const startTs = new Date(new Date(first.changed_at).getTime() - 1000).toISOString()
            evolutionSeries.push({ timestamp: startTs, price: first.old_price })
          }
          for (const h of hist) evolutionSeries.push({ timestamp: h.changed_at, price: h.new_price })
        } else {
          startingPrice = grid ? grid.price : null
        }
        currentPrice = grid ? grid.price : hist.length > 0 ? hist[hist.length - 1].new_price : null
        lastUpdated = grid?.updated_at || null
        if (!lastUpdated && hist.length > 0) lastUpdated = hist[hist.length - 1].changed_at
      } else {
        // --- Intera struttura: media tra le tipologie + curva media nel tempo ---
        const rtSet = new Set<string>([...gridMap.keys(), ...histMap.keys()])
        const currentByRT = new Map<string, number>()
        const initialByRT = new Map<string, number>()
        for (const rt of rtSet) {
          const grid = gridMap.get(rt) || null
          const hist = histMap.get(rt) || []
          changeCount += hist.length
          const cur = grid ? grid.price : hist.length > 0 ? hist[hist.length - 1].new_price : null
          if (cur != null) currentByRT.set(rt, cur)
          let init: number | null = null
          if (hist.length > 0) {
            const f = hist[0]
            init = f.old_price != null ? f.old_price : f.new_price
          } else if (grid) {
            init = grid.price
          }
          if (init != null) initialByRT.set(rt, init)
          const upd = grid?.updated_at || (hist.length > 0 ? hist[hist.length - 1].changed_at : null)
          if (upd && (!lastUpdated || upd > lastUpdated)) lastUpdated = upd
        }
        startingPrice = avgOf([...initialByRT.values()])
        currentPrice = avgOf([...currentByRT.values()])

        // Replay cronologico di tutti gli eventi: aggiorno il prezzo della
        // tipologia e ricalcolo la media struttura ad ogni variazione.
        const events: { rt: string; changed_at: string; new_price: number }[] = []
        for (const [rt, hist] of histMap) {
          for (const h of hist) events.push({ rt, changed_at: h.changed_at, new_price: h.new_price })
        }
        events.sort((a, b) => (a.changed_at < b.changed_at ? -1 : a.changed_at > b.changed_at ? 1 : 0))
        if (events.length > 0) {
          const work = new Map(initialByRT)
          const startTs = new Date(new Date(events[0].changed_at).getTime() - 1000).toISOString()
          const startAvg = avgOf([...work.values()])
          if (startAvg != null) evolutionSeries.push({ timestamp: startTs, price: startAvg })
          for (const e of events) {
            work.set(e.rt, e.new_price)
            const a = avgOf([...work.values()])
            if (a != null) evolutionSeries.push({ timestamp: e.changed_at, price: a })
          }
        }
      }

      // Occupazione struttura: PRIMARIA da daily_availability (tutte le
      // tipologie), perche' coperta su tutto il range. Fallback su
      // daily_production.rooms_occupied solo se manca la availability.
      const hotelAvail = hotelAvailByDate.get(dateStr)
      const prod = prodByDate.get(dateStr)

      let hotelRoomsOccupied: number | null = null
      let hotelTotalRooms: number | null = null
      let occupancyPct: number | null = null

      // clamp a 100%: l'occupazione non puo' superare il 100% (vedi nota Obiettivi 27/06/2026).
      if (hotelAvail && hotelAvail.capacity > 0) {
        hotelRoomsOccupied = hotelAvail.occupied
        hotelTotalRooms = hotelAvail.total
        occupancyPct = Math.min(100, Math.round((hotelAvail.occupied / hotelAvail.capacity) * 1000) / 10)
      } else if (prod && prod.total_rooms && prod.total_rooms > 0 && prod.rooms_occupied != null) {
        hotelRoomsOccupied = prod.rooms_occupied
        hotelTotalRooms = prod.total_rooms
        occupancyPct = Math.min(100, Math.round((prod.rooms_occupied / prod.total_rooms) * 1000) / 10)
      }

      // Colonna "camere vendute" della riga: per singola tipologia mostra la
      // tipologia; per intera struttura mostra l'occupato di struttura.
      let roomsSold: number | null
      let roomTypeTotalRooms: number | null
      if (allRoomTypes) {
        roomsSold = hotelRoomsOccupied
        roomTypeTotalRooms = hotelTotalRooms
      } else {
        const avail = availByDate.get(dateStr)
        roomTypeTotalRooms = avail?.total_rooms ?? null
        roomsSold =
          roomTypeTotalRooms != null
            ? Math.max(0, roomTypeTotalRooms - (avail?.rooms_out_of_service ?? 0) - (avail?.rooms_available ?? 0))
            : null
      }

      // RevPor giornaliero = ricavo camere realizzato / camere occupate di
      // struttura (occupato da daily_availability, fonte primaria coerente).
      const dayRevenue = revenueByDate.has(dateStr) ? revenueByDate.get(dateStr)! : null
      let revpor: number | null = null
      if (dayRevenue != null && hotelRoomsOccupied != null && hotelRoomsOccupied > 0) {
        revpor = Math.round((dayRevenue / hotelRoomsOccupied) * 100) / 100
      }

      days.push({
        date: dateStr,
        currentPrice,
        startingPrice,
        changeCount,
        evolutionSeries,
        lastUpdated,
        roomsSold,
        roomTypeTotalRooms,
        hotelRoomsOccupied,
        hotelTotalRooms,
        occupancyPct,
        roomRevenue: dayRevenue != null ? Math.round(dayRevenue * 100) / 100 : null,
        revpor,
      })
    }

    // Visualizzazione IVA tenant: scorporiamo SOLO i KPI realizzati
    // (roomRevenue, revpor). Le tariffe pubblicate (currentPrice/startingPrice/
    // evolutionSeries) restano LORDE: sono i prezzi esposti sui canali, non KPI.
    const vatCfg = resolveVatConfig(await getHotelVatConfig(supabase, hotelId), parseVatViewParam(sp))
    const daysOut = scorporoMonetaryDeep(days, ["roomRevenue", "revpor"], vatCfg)
    return NextResponse.json({
      days: daysOut,
      vatMode: vatCfg.mode,
      accommodationVatRate: vatCfg.accommodationRate,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error("[v0] RATE-TREND API error:", msg)
    return NextResponse.json({ error: "Internal server error", details: msg }, { status: 500 })
  }
}
