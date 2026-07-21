import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { fetchAllPaginatedOrLog } from "@/lib/supabase/paginate"
import { NextRequest, NextResponse } from "next/server"
import { RELIABLE_OPERATIONAL_SOURCE_KEYS } from "@/lib/services/production-metrics.service"
import { getHotelVatConfig, scorporoMonetaryDeep, resolveVatConfig, parseVatViewParam, grossFromNet } from "@/lib/utils/vat-display"

// v0 dev environment check - use service role to bypass RLS in dev
const isV0Dev = () => process.env.VERCEL_ENV === "development" || process.env.NODE_ENV === "development"

export const dynamic = "force-dynamic"
export const maxDuration = 60 // objectives API can be slow for large hotels

// Local alias that preserves the existing callsite API (15 calls below use
// `await fetchAll(() => q)` and expect T[] back). The shared helper logs
// errors and returns partial rows, matching the pre-migration behaviour.
const fetchAll = <T = any>(buildQuery: () => any) =>
  fetchAllPaginatedOrLog<T>(buildQuery, "objectives")

/**
 * GET /api/dati/objectives?hotel_id=...&year=2025
 * Returns monthly data: production, rooms sold/available, and saved objectives
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const hotelId = searchParams.get("hotel_id")
    const yearStr = searchParams.get("year")

    if (!hotelId || !yearStr) {
      return NextResponse.json({ error: "hotel_id and year required" }, { status: 400 })
    }

    const year = parseInt(yearStr)
    const filterAdOggi = searchParams.get("filter") === "ad_oggi"
    const statusesParam = searchParams.get("statuses") // comma-separated list of statuses to include
    
    // Use service-role client in dev to bypass RLS, cookie-bound client in prod
    const supabase = isV0Dev() ? await createServiceRoleClient() : await createClient()

    // Determine integration mode + PMS connector key (per UI / legenda).
    // pms_name è il nome canonico del PMS in pms_integrations:
    // 'scidoo' | 'brig' | 'bedzzle' | ... — usato dal frontend per scegliere
    // testi di legenda specifici per la sorgente dati.
    const { data: pmsConfig } = await supabase
      .from("pms_integrations")
      .select("integration_mode, pms_name")
      .eq("hotel_id", hotelId)
      .eq("is_active", true)
      .maybeSingle()
    // FIX 21/05/2026 — solo Scidoo legge da scidoo_raw_bookings.
    // Altri PMS (BRiG, ecc.) anche se in `integration_mode = "api"` devono
    // leggere dalla tabella unificata `public.bookings`. Vedi MEMORY.md:
    // "Dashboard /api/dashboard/production hardcoded a Scidoo".
    const connector: string = (pmsConfig?.pms_name?.toLowerCase() || "").trim() ||
      (pmsConfig?.integration_mode === "gsheets" ? "bedzzle" : "unknown")
    const isScidoo = connector === "scidoo"
    const isApiMode = isScidoo && pmsConfig?.integration_mode === "api"

    // 1. Get saved objectives for this hotel/year
    const { data: objectives, error: objError } = await supabase
      .from("revenue_objectives")
      .select("*")
      .eq("hotel_id", hotelId)
      .eq("year", year)

    if (objError) {
      console.error("Error fetching objectives:", objError)
    }

    // Build objectives map: { month: { obiettivo, percentuale_invenduto } }
    const objectivesMap: Record<number, { obiettivo_produzione: number; percentuale_invenduto_previsionale: number }> = {}
    for (const obj of objectives || []) {
      objectivesMap[obj.month] = {
        obiettivo_produzione: parseFloat(obj.obiettivo_produzione) || 0,
        percentuale_invenduto_previsionale: parseFloat(obj.percentuale_invenduto_previsionale) || 10,
      }
    }

    // 2. Get room types for this hotel.
    // FIX 01/05/2026 (post-incident "occupancy 2025 toppata su Barronci"):
    // Carichiamo TUTTI i room_types (anche `is_active=false`) e calcoliamo il
    // denominatore di occupancy come somma di tutte le camere FISICHE
    // (`total_rooms > 0`, indipendentemente da `is_active`).
    //
    // Motivazione: una room_type può essere disattivata oggi ma essere stata
    // attiva e vendibile in passato. Es. Villa I Barronci ha 9 room_types
    // attive (24 camere) + 2 appartamenti recentemente disattivati (1+1=2
    // camere) che nel 2025 hanno generato 171 night-stays. Quei 171 finivano
    // SEMPRE nel numeratore (i bookings raw non filtrano per is_active) ma
    // mai nel denominatore -> occupancy% gonfiata di ~10 pp.
    //
    // `activeRoomTypeIds`/`activeScidooIds` continuano a contenere solo le
    // attive: servono per le mappature di sync correnti, non per le metriche
    // storiche di capacity.
    const { data: roomTypes, error: rtError } = await supabase
      .from("room_types")
      .select("id, name, scidoo_room_type_id, total_rooms, is_active")
      .eq("hotel_id", hotelId)

    if (rtError) {
      console.error("Error fetching room types:", rtError)
    }

    const roomTypeIdToScidoo: Record<string, number> = {}
    const activeScidooIds = new Set<string>()
    const activeRoomTypeIds = new Set<string>()
    const physicalRoomTypeIds = new Set<string>()
    // Capacità giornaliera totale dell'hotel: somma di tutte le camere
    // fisiche (`total_rooms > 0`) anche se la room_type è oggi disattivata.
    let dailyCapacityFromRoomTypes = 0
    for (const rt of roomTypes || []) {
      const isActive = rt.is_active !== false
      const physicalRooms = Number(rt.total_rooms) || 0
      if (rt.scidoo_room_type_id && isActive) {
        roomTypeIdToScidoo[rt.id] = rt.scidoo_room_type_id
        activeScidooIds.add(String(rt.scidoo_room_type_id))
      }
      if (isActive) {
        activeRoomTypeIds.add(rt.id)
      }
      if (physicalRooms > 0) {
        physicalRoomTypeIds.add(rt.id)
        dailyCapacityFromRoomTypes += physicalRooms
      }
    }

    // 2b. Available booking statuses for Scidoo hotels (for the filter UI)
    // These are the standard Scidoo PMS statuses in lifecycle order.
    // NB: "confermata" è uno stato legacy che alcune strutture (es. I Barronci)
    // hanno in DB anche se non è nella legenda UI standard — lo includiamo nel
    // default ma non come pulsante UI separato.
    const allScidooStatuses = [
      "opzione",
      "attesa_pagamento",
      "confermata_manuale",
      "confermata_pagamento",
      "confermata_carta",
      "check_in",
      "saldo",
      "check_out",
    ]
    let availableStatuses: string[] = []
    if (isApiMode) {
      // Always show all standard Scidoo statuses for consistency across all hotels
      availableStatuses = allScidooStatuses
    }

    // Parse statuses filter - if provided, only include these statuses.
    //
    // DEFAULT: tutti gli stati Scidoo TRANNE "annullata".
    // È il comportamento del report Scidoo "Booking Manager x mese" (la fonte
    // di verità che l'utente vede su Scidoo) — il messaggio UI dice
    // testualmente "Deseleziona tutto per vedere tutti i non-annullati", ed è
    // questo che il default deve produrre.
    //
    // Verificato sul campo (28/04/2026, Villa I Barronci 2026):
    //   • Default precedente a 5 stati ⇒ −496 camere e −€78k vs Scidoo PDF.
    //   • Default a tutti i non-annullati ⇒ allineato al PDF Scidoo.
    //
    // Storia: in passato il default era ristretto a 5 stati per matchare il
    // report Scidoo "Produzione Camere I.I." (Moriano/Massabò/Rondini Blu, dove
    // statici e statuses combaciavano). Per Barronci però la "Produzione Camere
    // I.I." include anche confermata_pagamento e altri, e l'utente legge
    // direttamente il "Booking Manager x mese" — fonte unificata.
    // L'utente resta sempre libero di passare ?statuses= per vedere subset.
    // Status confermati (sempre contati)
    const CONFIRMED_STATUSES = [
      "attesa_pagamento",
      "confermata",
      "confermata_manuale",
      "confermata_pagamento",
      "confermata_carta",
      "check_in",
      "saldo",
      "check_out",
    ]
    const statusFilter = statusesParam
      ? new Set(statusesParam.split(",").map(s => s.trim()).filter(Boolean))
      : new Set(CONFIRMED_STATUSES)

    // 3. Fetch ALL data for the full year + prev year in bulk (avoid per-month queries / rate limits)
    const today = new Date()
    const todayStr = today.toISOString().split("T")[0]
    const todayMonth = today.getMonth() + 1 // 1-based
    const todayDay = today.getDate()

    const yearStart = `${year}-01-01`
    const yearEnd = `${year}-12-31`
    const prevYearStart = `${year - 1}-01-01`
    const prevYearEnd = `${year - 1}-12-31`
    
    // Helper per filtrare booking con Pernotto o daily_price
    const hasValidPriceData = (b: any) => {
      const statics: any[] = Array.isArray(b.raw_data?.statics) ? b.raw_data.statics : []
      const hasPernotto = statics.some((s) => s && s.category === "Pernotto")
      const dp = b.raw_data?.daily_price
      const hasDailyPrice = dp && typeof dp === "object" && !Array.isArray(dp) && Object.keys(dp).length > 0
      return hasPernotto || hasDailyPrice
    }

    // ANNO CORRENTE: usa scidoo_raw_bookings (dati CORRETTI dal PMS)
    // NOTA: daily_production contiene dati aggregati diversi da quelli reali di Scidoo.
    // Per Obiettivi serve la precisione dei booking singoli, non l'aggregato.
    let allBookings: any[]
    if (isApiMode) {
      // Query per booking confermati + opzioni con check-in futuro
      const [confirmedResult, optionsResult] = await Promise.all([
        fetchAll(() => {
          let q = supabase
            .from("scidoo_raw_bookings")
            .select("id, room_type_code, checkin_date, checkout_date, total_amount, raw_data, booking_date, status")
            .eq("hotel_id", hotelId)
            .lte("checkin_date", yearEnd)
            .gt("checkout_date", yearStart)
          if (statusFilter && statusFilter.size > 0) {
            q = q.in("status", Array.from(statusFilter))
          }
          return q
        }),
        // Opzioni con check-in >= oggi (potenziali prenotazioni future)
        fetchAll(() =>
          supabase
            .from("scidoo_raw_bookings")
            .select("id, room_type_code, checkin_date, checkout_date, total_amount, raw_data, booking_date, status")
            .eq("hotel_id", hotelId)
            .lte("checkin_date", yearEnd)
            .gt("checkout_date", yearStart)
            .eq("status", "opzione")
            .gte("checkin_date", todayStr)
        ),
      ])
      // Unisci e rimuovi duplicati (nel caso opzione sia già nel statusFilter)
      const seen = new Set<string>()
      const rawBookings = [...confirmedResult, ...optionsResult].filter((b: any) => {
        if (seen.has(b.id)) return false
        seen.add(b.id)
        return true
      })
      // Filtro: solo booking con statics Pernotto o daily_price (camere reali)
      allBookings = rawBookings.filter(hasValidPriceData)
    } else {
      const raw = await fetchAll(() =>
        supabase
          .from("bookings")
          .select("id, room_type_id, check_in_date, check_out_date, total_price, price_per_night, number_of_nights, extras_revenue, fb_revenue, spa_revenue, other_revenue, booking_date, created_at")
          .eq("hotel_id", hotelId)
          .eq("is_cancelled", false)
          .lte("check_in_date", yearEnd)
          .gt("check_out_date", yearStart)
      )
      allBookings = raw.map((b: any) => {
        let dp: Record<string, number> | null = null
        const nights = Number(b.number_of_nights) || 0
        const extrasTotal =
          (Number(b.extras_revenue) || 0) +
          (Number(b.fb_revenue) || 0) +
          (Number(b.spa_revenue) || 0) +
          (Number(b.other_revenue) || 0)
        const totalPrice = Number(b.total_price) || 0
        const roomOnlyTotal = Math.max(0, totalPrice - extrasTotal)
        const roomNightly = nights > 0 ? roomOnlyTotal / nights : Number(b.price_per_night) || 0
        if (roomNightly > 0 && b.check_in_date && b.check_out_date) {
          dp = {}
          const ci = new Date(b.check_in_date), co = new Date(b.check_out_date)
          for (let d = new Date(ci); d < co; d.setDate(d.getDate() + 1)) dp[d.toISOString().slice(0, 10)] = roomNightly
        }
        return { id: b.id, room_type_code: b.room_type_id || "unknown", checkin_date: b.check_in_date, checkout_date: b.check_out_date, total_amount: roomOnlyTotal, raw_data: { daily_price: dp }, booking_date: b.booking_date ?? null }
      })
    }

    let allAvailData = await fetchAll(() =>
      supabase
        .from("rms_availability_daily")
        .select("date, room_type_id, total_rooms, rooms_available, rooms_out_of_service")
        .eq("hotel_id", hotelId)
        .gte("date", yearStart)
        .lte("date", yearEnd)
        .order("date", { ascending: true })
        .order("room_type_id", { ascending: true })
    )

    // Fallback: if rms_availability_daily is empty, try daily_availability (GSheets sync)
    if (allAvailData.length === 0) {
      const daData = await fetchAll(() =>
        supabase
          .from("daily_availability")
          .select("date, room_type_id, total_rooms, rooms_available")
          .eq("hotel_id", hotelId)
          .gte("date", yearStart)
          .lte("date", yearEnd)
          .order("date", { ascending: true })
          .order("room_type_id", { ascending: true })
      )
      if (daData.length > 0) {
        allAvailData = daData.map((r: any) => ({
          ...r,
          rooms_out_of_service: 0,
        }))
      }
    }

    // Fallback 2: if still empty, synthesize from daily_production (has rooms_occupied, total_rooms)
    // FIX 13/05/2026 (source-safety): escludi righe fiscali (rooms_occupied=0 placeholder).
    // Vedi lib/services/production-metrics.service.ts.
    if (allAvailData.length === 0) {
      const dpAvail = await fetchAll(() =>
        supabase
          .from("daily_production")
          .select("date, total_rooms, rooms_occupied, source")
          .eq("hotel_id", hotelId)
          .gte("date", yearStart)
          .lte("date", yearEnd)
          .in("source", RELIABLE_OPERATIONAL_SOURCE_KEYS)
          .order("date", { ascending: true })
      )
      if (dpAvail.length > 0) {
        allAvailData = dpAvail.map((r: any) => ({
          date: r.date,
          room_type_id: (roomTypes || [])[0]?.id || "aggregate",
          total_rooms: r.total_rooms || dailyCapacityFromRoomTypes,
          rooms_available: Math.max(0, (r.total_rooms || dailyCapacityFromRoomTypes) - (r.rooms_occupied || 0)),
          rooms_out_of_service: 0,
        }))
      }
    }

    // Previous year data
    // FONTE DI VERITA': scidoo_raw_bookings (stessa logica dell'anno corrente)
    // daily_production contiene dati FISCALI diversi dai booking reali.
    let allPrevBookings: any[] = []
    // True quando il PY proviene SOLO da daily_production (nessun booking reale
    // ne' in scidoo_raw_bookings ne' nella tabella unificata `bookings`). In
    // quel caso le "camere vendute" PY vanno prese da rooms_occupied di
    // daily_production, non dalla disponibilita' derivata (vedi fix Cavallino).
    let prevBookingsFromDailyProduction = false
    {
      if (isApiMode) {
        // Scidoo API mode: usa scidoo_raw_bookings
        const rawPrev = await fetchAll(() => {
          let q = supabase
            .from("scidoo_raw_bookings")
            .select("id, room_type_code, checkin_date, checkout_date, total_amount, raw_data, booking_date, status")
            .eq("hotel_id", hotelId)
            .lte("checkin_date", prevYearEnd)
            .gt("checkout_date", prevYearStart)
          if (statusFilter && statusFilter.size > 0) {
            q = q.in("status", Array.from(statusFilter))
          }
          return q
        })
        // Filtro: solo booking con statics Pernotto o daily_price (camere reali)
        allPrevBookings = rawPrev.filter((b: any) => {
          const statics: any[] = Array.isArray(b.raw_data?.statics) ? b.raw_data.statics : []
          const hasPernotto = statics.some((s) => s && s.category === "Pernotto")
          const dp = b.raw_data?.daily_price
          const hasDailyPrice =
            dp && typeof dp === "object" && !Array.isArray(dp) && Object.keys(dp).length > 0
          return hasPernotto || hasDailyPrice
        })
      }
      
      // Fallback per PY: usa la tabella unificata `bookings`.
      // 23/05/2026 FIX (Tenuta Moriano - pagina Obiettivi, colonna B "prev"):
      // Prima questo fallback scattava SOLO per hotel non-API (`!isApiMode`).
      // Per gli hotel Scidoo onboardati di recente (es. Moriano), pero',
      // `scidoo_raw_bookings` copre solo il periodo da quando l'ETL Scidoo
      // e' attivo (2026 in poi), mentre la tabella unificata `bookings` ha
      // l'import storico completo (1411 prenotazioni 2024-2025 per Moriano).
      // Risultato pre-fix: PY revenue mostrava (prev: 0 €) o cifre molto
      // basse per i mesi futuri 2025, falsando Delta YoY e RevPor PY.
      // Ora se `scidoo_raw_bookings` PY torna vuoto, proviamo la tabella
      // `bookings` (anche per isApiMode) prima di cadere su daily_production.
      if (allPrevBookings.length === 0) {
        const raw = await fetchAll(() =>
          supabase
            .from("bookings")
            .select("id, room_type_id, check_in_date, check_out_date, total_price, price_per_night, number_of_nights, extras_revenue, fb_revenue, spa_revenue, other_revenue, booking_date, created_at")
            .eq("hotel_id", hotelId)
            .eq("is_cancelled", false)
            .lte("check_in_date", prevYearEnd)
            .gt("check_out_date", prevYearStart)
        )
        allPrevBookings = raw.map((b: any) => {
          let dp: Record<string, number> | null = null
          const nights = Number(b.number_of_nights) || 0
          const extrasTotal =
            (Number(b.extras_revenue) || 0) +
            (Number(b.fb_revenue) || 0) +
            (Number(b.spa_revenue) || 0) +
            (Number(b.other_revenue) || 0)
          const totalPrice = Number(b.total_price) || 0
          const roomOnlyTotal = Math.max(0, totalPrice - extrasTotal)
          const roomNightly = nights > 0 ? roomOnlyTotal / nights : Number(b.price_per_night) || 0
          if (roomNightly > 0 && b.check_in_date && b.check_out_date) {
            dp = {}
            const ci = new Date(b.check_in_date), co = new Date(b.check_out_date)
            for (let d = new Date(ci); d < co; d.setDate(d.getDate() + 1)) dp[d.toISOString().slice(0, 10)] = roomNightly
          }
          return { id: b.id, room_type_code: b.room_type_id || "unknown", checkin_date: b.check_in_date, checkout_date: b.check_out_date, total_amount: roomOnlyTotal, raw_data: { daily_price: dp }, booking_date: b.booking_date ?? null }
        })
      }

      // FIX 21/05/2026 — Fallback PY storico da `daily_production`.
      // Per gli hotel onboardati di recente i bookings 2025 sono vuoti, ma
      // possono esistere righe importate manualmente in `daily_production`
      // (source `manual_import_2025`). Ne deriviamo pseudo-booking giornalieri
      // (uno per giorno con revenue del giorno) cosi' la pagina Obiettivi
      // mostra il PY corretto e "Delta RevPor YoY" e' affidabile.
      if (allPrevBookings.length === 0) {
        const dpPrev = await fetchAll(() =>
          supabase
            .from("daily_production")
            .select("date, total_revenue, rooms_occupied, total_rooms")
            .eq("hotel_id", hotelId)
            .gte("date", prevYearStart)
            .lte("date", prevYearEnd)
            .order("date", { ascending: true })
        )
        if (dpPrev.length > 0) {
          prevBookingsFromDailyProduction = true
          allPrevBookings = dpPrev
            .filter((r: any) => Number(r.total_revenue || 0) > 0 || Number(r.rooms_occupied || 0) > 0)
            .map((r: any, idx: number) => {
              const date: string = r.date
              const rev = Number(r.total_revenue || 0)
              const occ = Number(r.rooms_occupied || 0)
              const dp: Record<string, number> = {}
              if (rev > 0) dp[date] = rev
              const nextDay = new Date(date)
              nextDay.setDate(nextDay.getDate() + 1)
              return {
                id: `dp-${idx}`,
                room_type_code: "aggregate",
                checkin_date: date,
                checkout_date: nextDay.toISOString().slice(0, 10),
                total_amount: rev,
                raw_data: { daily_price: dp, _from_daily_production: true, rooms_occupied: occ },
                // FIX 21/05/2026: usiamo la data della notte come proxy del
                // booking_date per gli pseudo-booking ricostruiti da
                // daily_production. Senza questo, nella sezione PY il filtro
                // "Ad Oggi" non aveva effetto (cutoff `!bookingDate || bookingDate
                // <= cutoff` includeva sempre tutto). Per hotel con storico
                // manual_import_2025 (es. Cavallino) il toggle "Ad Oggi" sembrava
                // rotto. Usare la data-notte come proxy e' conservativo
                // (lead-time 0) ma rende il filtro funzionante e coerente con
                // il senso "fotografia ad oggi di un anno fa".
                booking_date: date,
              }
            })
        }
      }
    }

    let allPrevAvailData = await fetchAll(() =>
      supabase
        .from("rms_availability_daily")
        .select("date, room_type_id, total_rooms, rooms_available, rooms_out_of_service")
        .eq("hotel_id", hotelId)
        .gte("date", prevYearStart)
        .lte("date", prevYearEnd)
        .order("date", { ascending: true })
        .order("room_type_id", { ascending: true })
    )

    // Fallback: daily_availability for prev year
    if (allPrevAvailData.length === 0) {
      const daPrev = await fetchAll(() =>
        supabase
          .from("daily_availability")
          .select("date, room_type_id, total_rooms, rooms_available")
          .eq("hotel_id", hotelId)
          .gte("date", prevYearStart)
          .lte("date", prevYearEnd)
          .order("date", { ascending: true })
          .order("room_type_id", { ascending: true })
      )
      if (daPrev.length > 0) {
        allPrevAvailData = daPrev.map((r: any) => ({
          ...r,
          rooms_out_of_service: 0,
        }))
      }
    }

    // Fallback 2: daily_production for prev year
    // FIX 13/05/2026 (source-safety): vedi nota sopra (esclude righe fiscali).
    if (allPrevAvailData.length === 0) {
      const dpPrev = await fetchAll(() =>
        supabase
          .from("daily_production")
          .select("date, total_rooms, rooms_occupied, source")
          .eq("hotel_id", hotelId)
          .gte("date", prevYearStart)
          .lte("date", prevYearEnd)
          .in("source", RELIABLE_OPERATIONAL_SOURCE_KEYS)
          .order("date", { ascending: true })
      )
      if (dpPrev.length > 0) {
        allPrevAvailData = dpPrev.map((r: any) => ({
          date: r.date,
          room_type_id: (roomTypes || [])[0]?.id || "aggregate",
          total_rooms: r.total_rooms || dailyCapacityFromRoomTypes,
          rooms_available: Math.max(0, (r.total_rooms || dailyCapacityFromRoomTypes) - (r.rooms_occupied || 0)),
          rooms_out_of_service: 0,
        }))
      }
    }

    // Also fetch scidoo_raw_availability for prev year as fallback (only if rms_availability has no prev year data)
    const hasPrevRmsData = allPrevAvailData.length > 0
    let allPrevRawAvail: any[] = []
    if (!hasPrevRmsData) {
      const prevActiveScidooIds = (roomTypes || [])
        .filter(rt => rt.scidoo_room_type_id)
        .map(rt => String(rt.scidoo_room_type_id))
      if (prevActiveScidooIds.length > 0) {
    allPrevRawAvail = await fetchAll(() =>
      supabase
        .from("scidoo_raw_availability")
        .select("date, scidoo_room_type_id, raw_data")
        .eq("hotel_id", hotelId)
        .gte("date", prevYearStart)
        .lte("date", prevYearEnd)
        .in("scidoo_room_type_id", prevActiveScidooIds)
        .order("date", { ascending: true })
        .order("scidoo_room_type_id", { ascending: true })
    )
      }
    }

    // ────────────────────────────────────────────────────────────────────
    // PY camere occupate AUTOREVOLI da daily_production (rooms_occupied).
    //
    // FIX 02/06/2026 (Hotel Cavallino, pagina Obiettivi — KPI anno scorso
    // mancanti): i PMS che DERIVANO la disponibilita' dalle prenotazioni
    // (es. BRiG/Cavallino) non hanno prenotazioni in archivio per l'anno
    // passato -> rms_availability_daily e daily_availability riportano
    // rooms_available = total_rooms (quindi "vendute" = 0) su TUTTO il 2025,
    // pur esistendo uno storico reale importato a mano in daily_production
    // (source manual_import_2025) con rooms_occupied valorizzato. Senza questo
    // la pagina mostrava PY Revenue (preso da daily_production) ma PY Camere
    // Vendute / Occupancy% / RevPOR a 0.
    //
    // Mappa per-mese di {data, rooms_occupied} dalle SOLE source affidabili.
    // Dedup per data (max tra piu' source) per non gonfiare i conteggi quando
    // coesistono piu' sorgenti per lo stesso giorno.
    const prevDpOccByMonth: Record<number, Array<{ date: string; occ: number }>> = {}
    for (let mm = 1; mm <= 12; mm++) prevDpOccByMonth[mm] = []
    if (prevBookingsFromDailyProduction) {
      const dpOccRows = await fetchAll(() =>
        supabase
          .from("daily_production")
          .select("date, rooms_occupied, source")
          .eq("hotel_id", hotelId)
          .gte("date", prevYearStart)
          .lte("date", prevYearEnd)
          .in("source", RELIABLE_OPERATIONAL_SOURCE_KEYS)
          .order("date", { ascending: true })
      )
      const occByDate = new Map<string, number>()
      for (const r of dpOccRows) {
        const date: string = (r as any).date
        if (!date || !date.startsWith(`${year - 1}-`)) continue
        const occ = Number((r as any).rooms_occupied) || 0
        occByDate.set(date, Math.max(occByDate.get(date) ?? 0, occ))
      }
      for (const [date, occ] of occByDate) {
        const mm = Number.parseInt(date.substring(5, 7), 10)
        if (mm >= 1 && mm <= 12) prevDpOccByMonth[mm].push({ date, occ })
      }
    }

    // Helper: extract daily entries from a booking.
    // SOURCE OF TRUTH per Scidoo: raw_data.statics[] dove category === "Pernotto".
    // Verificato al centesimo (Moriano 2026, 11/12 mesi esatti vs report "Produzione
    // Camere" di Scidoo). statics[] ha una riga per ogni notte con date_time + price,
    // ed esclude colazione/extra/tassa di soggiorno/sconti che Scidoo NON include
    // nella produzione camere.
    // Fallback (booking non-Scidoo o senza statics): daily_price o pro-rata da
    // total_amount/nights.
    function extractDailyPrices(booking: any): Array<{ date: string; price: number }> {
      const entries: Array<{ date: string; price: number }> = []
      const statics: any[] = Array.isArray(booking.raw_data?.statics) ? booking.raw_data.statics : []
      const pernottoEntries = statics.filter((s) => s && s.category === "Pernotto")
      if (pernottoEntries.length > 0) {
        for (const s of pernottoEntries) {
          const dt = String(s.date_time || "").slice(0, 10)
          if (!dt) continue
          const price = Number(s.price) || 0
          // Skip Scidoo placeholder values
          if (price === 999 || price === 9999) continue
          entries.push({ date: dt, price })
        }
        return entries
      }
      const rawDp = booking.raw_data?.daily_price
      // daily_price must be a non-empty plain object (not an array like [])
      const dailyPrice = (rawDp && typeof rawDp === 'object' && !Array.isArray(rawDp) && Object.keys(rawDp).length > 0)
        ? rawDp as Record<string, number>
        : null
      if (dailyPrice) {
        // Fallback per i booking che non hanno statics ma hanno daily_price.
        // Sottrae gli sconti negativi dagli extras (categorie "Sconti" e
        // "Servizio Nota") distribuendoli pro-rata per notte.
        const extras: any[] = Array.isArray(booking.raw_data?.extras) ? booking.raw_data.extras : []
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
        const dpTotal = Object.values(dailyPrice).reduce((s: number, v) => {
          const n = Number(v) || 0
          return s + (n > 0 && n !== 999 && n !== 9999 ? n : 0)
        }, 0)
        for (const [date, price] of Object.entries(dailyPrice)) {
          // Skip Scidoo placeholder values
          if (price === 999 || price === 9999) continue
          const grossPrice = price || 0
          const discountShare = dpTotal > 0 ? (grossPrice / dpTotal) * totalDiscount : 0
          entries.push({ date, price: grossPrice + discountShare })
        }
      } else if (booking.checkin_date && booking.checkout_date) {
        // Generate room nights from date range even if total_amount is 0/null
        // (the room night must be counted regardless of price)
        const checkin = new Date(booking.checkin_date)
        const checkout = new Date(booking.checkout_date)
        const nights = Math.ceil((checkout.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24))
        if (nights <= 0) return entries
        const totalAmount = booking.total_amount || 0
        const pricePerNight = totalAmount / nights
        // Skip placeholder prices but still count the room night
        const effectivePrice = (pricePerNight === 999 || pricePerNight === 9999) ? 0 : pricePerNight
        for (let d = new Date(checkin); d < checkout; d.setDate(d.getDate() + 1)) {
          entries.push({ date: d.toISOString().split("T")[0], price: effectivePrice })
        }
      }
      return entries
    }

    // Pre-index: expand all bookings into per-month buckets ONCE (avoids N*12 re-parsing)
    //
    // BUG FIX 30/04/2026 (Villa I Barronci "Camere disponibili alla vendita"
    // mostrava 4 invece di 1 il 30/04): aggiunto `lineIdx` alla entry.
    // Senza di esso il dedup `Set<"date|bookingId">` usato piu' avanti per
    // contare camere-notte considerava UN booking di gruppo (es. famiglia
    // che prenota 3 camere insieme: 1 record `bookings`, statics con N righe
    // Pernotto per notte una per camera, tutte con lo stesso `bk.id`) come
    // UNA sola camera-notte. Risultato: sottoconto sistematico delle camere
    // vendute per ogni hotel con prenotazioni di gruppo, che si propaga in
    // O (Camere Disponibili), K (Cam. Invendute), Occupancy %, RevPAR,
    // RevPOR, YoY rooms. L'anno precedente non aveva il bug perche' contava
    // con `prevYearRoomsSold++` direttamente, quindi anche YoY era falsato.
    // Il `lineIdx` distingue righe diverse della stessa (bookingId, date)
    // mantenendo comunque il dedup contro veri duplicati.
    type DailyEntry = {
      date: string
      price: number
      bookingId: string
      bookingDate: string
      lineIdx: number
    }
    const curByMonth: Record<number, DailyEntry[]> = {}
    const prevByMonth: Record<number, DailyEntry[]> = {}
    for (let m = 1; m <= 12; m++) { curByMonth[m] = []; prevByMonth[m] = [] }

    for (const bk of allBookings) {
      let i = 0
      for (const { date, price } of extractDailyPrices(bk)) {
        const m = Number.parseInt(date.substring(5, 7), 10)
        if (date.startsWith(`${year}-`) && m >= 1 && m <= 12) {
          curByMonth[m].push({ date, price, bookingId: bk.id, bookingDate: bk.booking_date ?? null, lineIdx: i })
        }
        i++
      }
    }
    for (const bk of allPrevBookings) {
      let i = 0
      for (const { date, price } of extractDailyPrices(bk)) {
        const m = Number.parseInt(date.substring(5, 7), 10)
        const py = year - 1
        if (date.startsWith(`${py}-`) && m >= 1 && m <= 12) {
          // IMPORTANT: use ONLY booking_date (when reservation was RECEIVED), never checkin_date.
          // If booking_date is null/missing we treat it as "unknown" → included by default (no cutoff).
          // Using checkin_date as fallback was WRONG: a booking for August with no booking_date
          // would get bookingDate="2025-08-15" which is > prevYearBookingCutoff="2025-02-26"
          // and would be incorrectly EXCLUDED from the ad-oggi filter.
          prevByMonth[m].push({ date, price, bookingId: bk.id, bookingDate: bk.booking_date ?? null, lineIdx: i })
        }
        i++
      }
    }

    // Room nights are now derived from daily_price (curByMonth / prevByMonth) as the
    // single authoritative source for both revenue and room nights.
    // Each entry in curByMonth[m] represents 1 room-night with its price.
    // This ensures nights and revenue are always consistent and match Scidoo exactly.

    // Pre-index availability by month too - FILTER BY YEAR to prevent mixing data from different years
    const curAvailByMonth: Record<number, typeof allAvailData> = {}
    const prevAvailByMonth: Record<number, typeof allPrevAvailData> = {}
    for (let m = 1; m <= 12; m++) { curAvailByMonth[m] = []; prevAvailByMonth[m] = [] }
    for (const a of allAvailData) {
      // Filter by year to prevent mixing data from different years
      if (!a.date.startsWith(`${year}-`)) continue
      const m = Number.parseInt(a.date.substring(5, 7), 10)
      if (m >= 1 && m <= 12) curAvailByMonth[m].push(a)
    }
    for (const a of allPrevAvailData) {
      // Filter by previous year
      if (!a.date.startsWith(`${year - 1}-`)) continue
      const m = Number.parseInt(a.date.substring(5, 7), 10)
      if (m >= 1 && m <= 12) prevAvailByMonth[m].push(a)
    }
    let prevRawByMonth: Record<number, any[]> = {}
    if (allPrevRawAvail.length > 0) {
      for (let m = 1; m <= 12; m++) prevRawByMonth[m] = []
      for (const r of allPrevRawAvail) {
        // Filter by previous year
        if (!r.date.startsWith(`${year - 1}-`)) continue
        const m = Number.parseInt(r.date.substring(5, 7), 10)
        if (m >= 1 && m <= 12) prevRawByMonth[m].push(r)
      }
    }

    // 4. Process each month using pre-indexed data
    const months: any[] = []

    for (let m = 1; m <= 12; m++) {
      const monthStart = `${year}-${String(m).padStart(2, "0")}-01`
      const lastDay = new Date(year, m, 0).getDate()
      const monthEnd = `${year}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`

      // Production cutoff for "ad oggi" (current year):
      // "Ad oggi" means "all production we have in the system as of today"
      // This includes ALL on-the-books for every month (past, current, future).
      // The cutoff is NOT applied to the current year — we show full OTB.
      // The cutoff is ONLY applied to the PREVIOUS year for YoY comparison.
      const productionCutoff = monthEnd

      // --- Current year bookings for this month (from pre-indexed data) ---
      // "Ad Oggi" per l'anno corrente = FOTOGRAFIA dell'OTB nel sistema oggi.
      // Include TUTTE le prenotazioni attualmente in casa, comprese quelle future.
      // Il filtro per data-notte (date <= todayStr) sarebbe SBAGLIATO perché
      // azzererebbe tutte le notti future, escludendo il pick-up su mesi futuri.
      // Il confronto YoY si fa applicando il cutoff booking_date SOLO sull'anno
      // precedente (vedi prevYearBookingCutoff più sotto).
      // Quindi per l'anno corrente: produzioneAdOggi === produzioneTotale.
      let monthProductionTotal = 0
      for (const { price } of curByMonth[m]) {
        monthProductionTotal += price
      }
      const monthProductionAdOggi = monthProductionTotal

      // Room nights: derived from daily_price (same source as revenue).
      // Anno corrente: stesso discorso della produzione — fotografia OTB,
      // nessun filtro per data-notte.
      // Dedup key include lineIdx per distinguere camere diverse dello stesso
      // booking di gruppo (vedi commento a DailyEntry sopra). Il Set protegge
      // comunque da entries veramente duplicate (stessa terna).
      const roomNightsAll = new Set<string>()
      for (const { date, bookingId, lineIdx } of curByMonth[m]) {
        roomNightsAll.add(`${date}|${bookingId}|${lineIdx}`)
      }
      const bookingRoomsSold = roomNightsAll.size

      // --- Current year availability (from pre-indexed data) ---
      // Always use the FULL month availability for rooms sold / capacity / occupancy.
      // "Ad Oggi" for the current year means "On The Books as of today" — i.e. the
      // complete OTB picture for every month, exactly like production (col B).
      // Truncating availability to only passed days would make rooms sold (col J)
      // and occupancy % (col I) inconsistent with production.
      // The "Ad Oggi" filter only affects the PREVIOUS year (booking_date cutoff).
      const monthAvail = curAvailByMonth[m]

      let totalRoomsSold = 0
      let totalRoomsAvailable = 0
      let totalRoomsCapacity = 0
      let remainingUnsold = 0

      // ──────────────────────────────────────────────────────────────────
      // BUG FIX 30/04/2026 — fonte di verita' per "vendute" e "disponibili"
      //
      // Lavorando dietro l'utente abbiamo confermato: la pagina
      // /accelerator/price (e l'API /api/accelerator/channel-production via
      // lib/services/pricing.service.ts) usa SEMPRE `rms_availability_daily`
      // come fonte di verita' per "occupate / disponibili / totali", con la
      // formula:
      //   sold      = total_rooms - rooms_available - rooms_out_of_service
      //   available = rooms_available
      // Questo matcha perfettamente quello che l'utente vede in Scidoo
      // perche' la tabella e' popolata dal sync RMS che riflette lo stato
      // del PMS. Ricalcolare le "vendute" dai booking (statics Pernotto +
      // daily_price) introduce N bug a cascata: room_type_id non mappato,
      // group bookings con stesso bk.id, prenotazioni riattivate con
      // raw_data.room_type_id="0", testate di gruppo, status non in
      // whitelist. La pagina Obiettivi divergeva dalla realta' di Scidoo
      // mentre la pagina /price restava corretta.
      //
      // Nuova policy: se `rms_availability_daily` ha dati per il mese, e'
      // la fonte di verita' per:
      //   - totalRoomsSold (camere notte vendute, col J)
      //   - remainingUnsold (camere disponibili alla vendita, col O)
      // Il revenue (col B "Produzione") resta sempre da statics/daily_price
      // perche' la RMS non porta importi.
      //
      // Fallback ai booking SOLO se la RMS e' completamente vuota per quel
      // mese (es. hotel gsheets, mesi futuri non ancora syncati).
      // ───────────────��─────────────���─────────────────────────────────��──

      // Aggrega RMS per mese: riga per riga, somma i tre campi sui room_type
      // attivi. "aggregate" e' il fallback synthesizzato da daily_production
      // quando la RMS reale e' vuota — lo accettiamo.
      let rmsSoldMonth = 0
      let rmsAvailableMonth = 0
      let rmsCapacityMonth = 0
      let rmsAvailableFromToday = 0
      let rmsHasRows = false
      const oosByDate = new Map<string, number>()
      let oosHasData = false

      for (const a of monthAvail) {
        const rtId = (a as { room_type_id?: string }).room_type_id
        // FIX 01/05/2026: includi anche le camere disattivate ma fisicamente
        // esistenti (physicalRoomTypeIds) per coerenza con il denominatore
        // ampliato `dailyCapacityFromRoomTypes`. Se filtrassimo solo per
        // activeRoomTypeIds, il numeratore ricalcolato da RMS scarterebbe
        // le vendite degli appartamenti disattivati mentre il denominatore
        // le include -> occupancy% sotto-stimata.
        if (rtId && rtId !== "aggregate" && !physicalRoomTypeIds.has(rtId)) continue
        const date = (a as { date?: string }).date
        if (!date) continue
        const totalR = Number((a as { total_rooms?: unknown }).total_rooms) || 0
        const availR = Number((a as { rooms_available?: unknown }).rooms_available) || 0
        const oosR = Number((a as { rooms_out_of_service?: unknown }).rooms_out_of_service) || 0
        if (totalR <= 0) continue
        rmsHasRows = true
        const effOos = Math.min(Math.max(0, oosR), totalR)
        const effAvail = Math.min(Math.max(0, availR), Math.max(0, totalR - effOos))
        const sold = Math.max(0, totalR - effAvail - effOos)
        rmsSoldMonth += sold
        rmsAvailableMonth += effAvail
        rmsCapacityMonth += totalR
        if (date >= todayStr) rmsAvailableFromToday += effAvail
        oosByDate.set(date, (oosByDate.get(date) ?? 0) + effOos)
        oosHasData = true
      }

      // Capacita' teorica come fallback / sanity check.
      const theoreticalCapacity = dailyCapacityFromRoomTypes * lastDay
      let totalMonthOos = 0
      for (const v of oosByDate.values()) totalMonthOos += v

      if (rmsHasRows) {
        // RMS-driven: matcha esattamente la pagina /accelerator/price.
        totalRoomsSold = rmsSoldMonth
        // 23/05/2026 BUG FIX (capacita' "Notti Disponibili" per la pagina
        // Obiettivi): prima usavamo solo `theoreticalCapacity`
        // (= dailyCapacityFromRoomTypes * lastDay), ignorando le notti OOS.
        // Risultato: in mesi con stop-vendita lunghi (es. Tenuta Moriano
        // 23/11 - 1/12, 9 giorni di chiusura per gruppo di trilocali),
        // l'occupancy% e il "venduto su disponibili" risultavano sbagliati
        // perche' i giorni OOS finivano nel denominatore come "vendibili".
        // Ora la capacita' e' al netto delle notti effettivamente fuori
        // servizio del mese. Il fallback legacy applicava gia' questa
        // sottrazione (vedi `effectiveCapacity` nel ramo non-RMS sotto): qui
        // usiamo `totalMonthOos` per allineare il ramo principale.
        totalRoomsCapacity = Math.max(0, theoreticalCapacity - totalMonthOos)
        totalRoomsAvailable = Math.max(0, totalRoomsCapacity - totalRoomsSold)

        if (monthEnd < todayStr) {
          // Mese passato: nulla piu' da vendere.
          remainingUnsold = 0
        } else if (monthStart > todayStr) {
          // Mese futuro: somma rooms_available di tutte le date del mese.
          // Coerente con la pagina /price che mostra esattamente questo.
          remainingUnsold = rmsAvailableMonth
        } else {
          // Mese corrente: somma rooms_available solo per date >= today.
          remainingUnsold = rmsAvailableFromToday
        }
      } else {
        // Fallback legacy: nessuna riga RMS per il mese. Usa booking come
        // proxy. Mantiene comportamento storico per hotel/mesi senza RMS.
        totalRoomsSold = bookingRoomsSold
        totalRoomsCapacity = theoreticalCapacity
        totalRoomsAvailable = Math.max(0, totalRoomsCapacity - totalRoomsSold)

        const effectiveCapacity = oosHasData
          ? Math.max(0, totalRoomsCapacity - totalMonthOos)
          : totalRoomsCapacity

        if (monthEnd < todayStr) {
          remainingUnsold = 0
        } else if (monthStart > todayStr) {
          remainingUnsold = Math.max(0, effectiveCapacity - totalRoomsSold)
        } else {
          let oosRemaining = 0
          for (const [date, oos] of oosByDate.entries()) {
            if (date >= todayStr) oosRemaining += oos
          }
          const daysRemaining = Math.max(0, Math.ceil((new Date(monthEnd).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) + 1)
          const capacityRemaining = daysRemaining * dailyCapacityFromRoomTypes
          const effectiveCapacityRemaining = oosHasData
            ? Math.max(0, capacityRemaining - oosRemaining)
            : capacityRemaining
          const soldFromToday = new Set<string>()
          for (const { date, bookingId, lineIdx } of curByMonth[m]) {
            if (date >= todayStr) {
              soldFromToday.add(`${date}|${bookingId}|${lineIdx}`)
            }
          }
          remainingUnsold = Math.max(0, effectiveCapacityRemaining - soldFromToday.size)
        }
      }

      // --- Previous year ---
      const prevMStart = `${year - 1}-${String(m).padStart(2, "0")}-01`
      const prevMLastDay = new Date(year - 1, m, 0).getDate()
      const prevMEndFull = `${year - 1}-${String(m).padStart(2, "0")}-${String(prevMLastDay).padStart(2, "0")}`

      // Ad oggi: prev year filter
      // "Ad oggi" = fotografia di quello che c'era di prenotazioni un anno fa, alla stessa data di oggi.
      // Si filtra l'ANNO PRECEDENTE per booking_date (data in cui la prenotazione è stata RICEVUTA),
      // NON per checkin_date (quando il cliente arriva fisicamente).
      //   - Includi solo prenotazioni il cui booking_date <= data di oggi trasposta all'anno precedente
      //   - Esempio: se oggi �� 26 feb 2026 → includi solo le prenotazioni dell'anno prec. ricevute entro il 26 feb 2025
      //   - Anno corrente: mostra TUTTO l'OTB as-is (nessun filtro sull'anno corrente)
      //   - Questo vale sia che si stia guardando l'anno corrente SIA l'anno precedente
      const prevYearBookingCutoff = `${year - 1}-${String(todayMonth).padStart(2, "0")}-${String(todayDay).padStart(2, "0")}`

      // Previous year production: apply booking_date filter for "Ad Oggi"
      let prevYearProduction = 0
      for (const { price, bookingDate } of prevByMonth[m]) {
        if (filterAdOggi) {
          if (!bookingDate || bookingDate <= prevYearBookingCutoff) {
            prevYearProduction += price
          }
        } else {
          prevYearProduction += price
        }
      }

      // Prev year room nights: derived from daily_price (same source as revenue)
      let prevYearRoomsSold = 0
      for (const { bookingDate } of prevByMonth[m]) {
        if (filterAdOggi) {
          if (!bookingDate || bookingDate <= prevYearBookingCutoff) {
            prevYearRoomsSold++
          }
        } else {
          prevYearRoomsSold++
        }
      }

      // Prev year: stessa policy del current year. Quando rms_availability_daily
      // ha dati per il mese precedente, e' la fonte di verita' per le vendute
      // (matcha la pagina /accelerator/price). Fallback ai booking se vuota.
      // L'unica differenza vs current year: il filtro "Ad Oggi" non si applica
      // alla RMS (non abbiamo storico booking_date sui record RMS). Per
      // coerenza con la produzione filtrata, quando filterAdOggi e' attivo
      // restiamo sul booking-based che SA filtrare per booking_date.
      const prevMonthAvail = prevAvailByMonth[m]
      let prevRmsSold = 0
      let prevRmsHasRows = false
      for (const a of prevMonthAvail) {
        const rtId = (a as { room_type_id?: string }).room_type_id
        // Per LY: NON filtrare per physicalRoomTypeIds attuali!
        // L'hotel potrebbe aver avuto room_types diverse l'anno scorso
        // Salta solo "aggregate" che è una riga sommario
        if (rtId === "aggregate") continue
        const totalR = Number((a as { total_rooms?: unknown }).total_rooms) || 0
        const availR = Number((a as { rooms_available?: unknown }).rooms_available) || 0
        const oosR = Number((a as { rooms_out_of_service?: unknown }).rooms_out_of_service) || 0
        if (totalR <= 0) continue
        prevRmsHasRows = true
        const effOos = Math.min(Math.max(0, oosR), totalR)
        const effAvail = Math.min(Math.max(0, availR), Math.max(0, totalR - effOos))
        prevRmsSold += Math.max(0, totalR - effAvail - effOos)
      }
      
      // Se filterAdOggi e' attivo: per matchare la produzione (filtrata per
      // booking_date) usiamo le vendute filtrate dai booking. Altrimenti
      // (totale mese) usiamo RMS quando disponibile.
      // IMPORTANTE: se i dati RMS sono troppo pochi (< 50% dei giorni del mese),
      // sono dati sparsi/incompleti e NON vanno usati come fonte di verità.
      // In quel caso usiamo i booking come fallback.
      const prevMonthDates = new Set(prevMonthAvail.map((a: any) => a.date))
      const prevRmsHasSufficientData = prevRmsHasRows && prevMonthDates.size >= (prevMLastDay * 0.5)

      // Camere occupate PY da daily_production (rooms_occupied). In modalita'
      // "Ad Oggi" applichiamo lo stesso cutoff usato per produzione/booking, sulla
      // data-notte come proxy (coerente con gli pseudo-booking costruiti da
      // daily_production). prevDpOccByMonth e' popolata SOLO quando il PY proviene
      // da daily_production, quindi questo blocco e' inerte per gli hotel con
      // prenotazioni reali (Scidoo).
      let prevDpRoomsOccupied = 0
      for (const { date, occ } of prevDpOccByMonth[m]) {
        if (filterAdOggi && !(date <= prevYearBookingCutoff)) continue
        prevDpRoomsOccupied += occ
      }

      // Priorita' "camere vendute" PY (fonte CERTA, indipendente dal toggle):
      //   1. RMS/availability-derived SOLO se > 0 (esistono prenotazioni reali)
      //   2. daily_production.rooms_occupied quando il PY viene da daily_production
      //      e la disponibilita' derivata e' vuota (BRiG/Cavallino: nessuna
      //      prenotazione PY in archivio -> RMS "vendute" = 0 su tutto l'anno)
      //   3. conteggio pseudo-booking come ultimo fallback
      const prevYearSoldCertain =
        prevRmsHasSufficientData && prevRmsSold > 0
          ? prevRmsSold
          : prevBookingsFromDailyProduction && prevDpRoomsOccupied > 0
            ? prevDpRoomsOccupied
            : prevYearRoomsSold

      // FIX 21/07/2026 — anno precedente in modalita' "Ad Oggi".
      // Prima "Ad Oggi" usava SEMPRE il conteggio booking (prevYearRoomsSold /
      // prevDpRoomsOccupied) mentre "Totale" usava la RMS. Per un mese dell'anno
      // scorso GIA' INTERAMENTE TRASCORSO rispetto alla fotografia "di un anno fa
      // alla stessa data di oggi" il cutoff booking_date non taglia NULLA
      // (verificato: rn_totali == rn_entro_cutoff), quindi lo snapshot coincide
      // col mese realizzato: la fonte corretta e' la RMS certa, non il conteggio
      // booking (inaffidabile: sovraconta con gruppi/tipologie non mappate, es.
      // Barronci gen-2025 766 vs 702; sotto-conta se l'archivio booking e'
      // incompleto, es. feb-2025 191 vs 657 reali). Risultato del bug: i mesi
      // passati cambiavano vendute/occupancy/RevPor cambiando toggle, cosa
      // impossibile per un mese chiuso. Il cutoff booking_date resta significativo
      // SOLO per i mesi dell'anno scorso NON ancora trascorsi a quella data
      // (es. ago-dic 2025 rispetto al 21/07/2025): li' e' un vero pace snapshot e
      // la RMS (mese pieno realizzato) sovrastimerebbe, quindi si tiene il
      // conteggio booking filtrato. prevMEndFull e' l'ultimo giorno del mese PY;
      // prevYearBookingCutoff e' "oggi" trasposto all'anno precedente.
      const prevMonthFullyElapsedAtCutoff = prevMEndFull <= prevYearBookingCutoff
      const prevYearTotalSold = filterAdOggi
        ? prevMonthFullyElapsedAtCutoff
          ? prevYearSoldCertain
          : prevBookingsFromDailyProduction && prevDpRoomsOccupied > 0
            ? prevDpRoomsOccupied
            : prevYearRoomsSold
        : prevYearSoldCertain
      
      // Capacita' anno precedente: usa RMS solo se ha dati sufficienti (>= 50% giorni del mese)
      // Se i dati sono sparsi/incompleti, usa la capacita' attuale.
      // 23/05/2026 BUG FIX: anche qui sottrai le notti OOS storiche, cosi'
      // l'occupancy% PY e il "Delta RevPor YoY" non vengono falsati da
      // chiusure programmate dell'anno scorso (es. ristrutturazioni).
      let prevYearTotalCapacity = 0
      let prevYearTotalOos = 0
      // Capacita' FISICA del mese (stessa base usata per l'anno corrente):
      // somma di TUTTE le camere fisiche * giorni del mese.
      const physicalCapacityPrevMonth = dailyCapacityFromRoomTypes * prevMLastDay
      if (prevRmsHasSufficientData) {
        const prevDailyCapacity = new Map<string, number>()
        for (const a of prevMonthAvail) {
          const rtId = (a as { room_type_id?: string }).room_type_id
          if (rtId === "aggregate") continue
          const totalR = Number((a as { total_rooms?: unknown }).total_rooms) || 0
          if (totalR <= 0) continue
          const dateStr = (a as { date?: string }).date || ""
          prevDailyCapacity.set(dateStr, (prevDailyCapacity.get(dateStr) || 0) + totalR)
          const oosR = Number((a as { rooms_out_of_service?: unknown }).rooms_out_of_service) || 0
          prevYearTotalOos += Math.min(Math.max(0, oosR), totalR)
        }
        const rmsGrossCapacity = Array.from(prevDailyCapacity.values()).reduce((sum, v) => sum + v, 0)
        // 27/06/2026 FIX (occupancy PY >100%): il numeratore "camere vendute" e'
        // derivato dai booking SENZA filtro per room_type (include le tipologie
        // oggi disattivate ma vendute l'anno scorso). Il denominatore RMS invece
        // copre solo le tipologie tracciate in rms_availability_daily, che per lo
        // storico spesso e' un SOTTOINSIEME (es. Villa I Barronci gen-2025: RMS
        // 9 tipologie / 24 camere vs 12 tipologie / 27 camere fisiche) -> vendute
        // > capacita' -> occupancy oltre il 100%. Le camere fisiche sono il
        // tetto CERTO delle notti vendibili (27 camere non possono vendere piu'
        // di 27 notti/giorno), quindi usiamo la capacita' fisica come base
        // quando l'RMS storico sotto-conta, preservando comunque l'OOS reale.
        const grossCapacity = Math.max(rmsGrossCapacity, physicalCapacityPrevMonth)
        prevYearTotalCapacity = Math.max(0, grossCapacity - prevYearTotalOos)
      }
      // Fallback: se non ci sono dati RMS sufficienti, usa la capacita' fisica.
      if (prevYearTotalCapacity === 0) {
        prevYearTotalCapacity = physicalCapacityPrevMonth
      }
      
      const prevYearTotalUnsold = Math.max(0, prevYearTotalCapacity - prevYearTotalSold)

      // --- Compute KPIs ---
      const prevYearPercInvenduto = prevYearTotalCapacity > 0
        ? Math.round((prevYearTotalUnsold / prevYearTotalCapacity) * 10000) / 100
        : 0

      // Use the appropriate production figure based on filter mode.
      // Per l'anno corrente, Ad Oggi e Totale coincidono (entrambi = OTB intero).
      const produzioneRiferimento = filterAdOggi ? monthProductionAdOggi : monthProductionTotal
      // FIX 21/07/2026 — le "camere vendute" dell'ANNO CORRENTE NON devono
      // dipendere dal toggle Ad Oggi / Totale Mese. Prima era
      //   filterAdOggi ? bookingRoomsSoldAdOggi : totalRoomsSold
      // cioe' due FONTI DIVERSE per lo stesso mese: RMS
      // (rms_availability_daily -> totalRoomsSold) in "Totale Mese" vs conteggio
      // room-night dai booking (bookingRoomsSoldAdOggi) in "Ad Oggi". Su un mese
      // gia' CHIUSO le due fonti divergono (es. Barronci gen-2026: RMS 610 vs
      // booking 640) -> le camere vendute/occupancy/RevPor cambiavano al variare
      // del toggle, cosa priva di senso: un mese passato e' immutabile. Per
      // l'anno corrente Ad Oggi e Totale coincidono (stessa fotografia OTB), come
      // gia' avviene per la produzione (monthProductionAdOggi === Totale). Usiamo
      // quindi SEMPRE totalRoomsSold, che e' la fonte di verita' RMS documentata
      // (matcha Scidoo e /accelerator/price) con fallback ai booking se la RMS e'
      // vuota. Il toggle continua a incidere SOLO sull'anno precedente (cutoff
      // booking_date), come da specifica.
      const roomsSoldRiferimento = totalRoomsSold
      // Capacità di riferimento: sempre la capacità PIENA del mese, anche con
      // filtro "Ad Oggi" sull'anno corrente. La fotografia OTB si legge
      // confrontando prenotazioni del mese intero vs capacità del mese intero.
      // La capacità ridotta "solo fino a oggi" viene invece usata correttamente
      // in remainingUnsold (colonna "Camere Disponibili alla Vendita") sopra.
      const capacityRiferimento = totalRoomsCapacity

      // 27/06/2026: clamp a 100% (patch interim). La capacita' storica 2025 e'
      // una costante statica (24 camere/giorno dalla config room_types attive)
      // mentre le "camere vendute" derivano dai booking che includono tipologie
      // fuori capacita' (appartamenti disattivati + tipo "OVER" a 0 camere) ->
      // vendute > capacita' -> occupancy oltre il 100%. L'occupazione non puo'
      // superare il 100%, quindi la limitiamo finche' non importiamo la
      // disponibilita' reale variabile dal report Scidoo (fonte certa).
      const occupancyPct = capacityRiferimento > 0
        ? Math.min(100, Math.round((roomsSoldRiferimento / capacityRiferimento) * 10000) / 100)
        : 0

      const obiettivo = objectivesMap[m]?.obiettivo_produzione || 0
      const hasSavedPerc = objectivesMap[m] !== undefined
      const percInvenduto = hasSavedPerc
        ? objectivesMap[m].percentuale_invenduto_previsionale
        : (prevYearPercInvenduto > 0 ? prevYearPercInvenduto : 10)
      const delta = obiettivo - produzioneRiferimento

      const revpar = capacityRiferimento > 0 ? produzioneRiferimento / capacityRiferimento : 0
      const revpor = roomsSoldRiferimento > 0 ? produzioneRiferimento / roomsSoldRiferimento : 0
      const prevRevpor = prevYearTotalSold > 0 ? prevYearProduction / prevYearTotalSold : 0
      const deltaRevpor = revpor - prevRevpor
      const coefficienteRevenue = revpar > 0 ? revpor / revpar : 0

      const roomsExpectedToSell = Math.round(remainingUnsold * (1 - percInvenduto / 100))
      const revporTarget = roomsExpectedToSell > 0 ? delta / roomsExpectedToSell : 0

      // 27/06/2026: clamp a 100% (vedi nota su occupancyPct). E' la colonna
      // che mostrava i valori >100% (es. apr 107%, mag 105%) sullo storico 2025.
      const prevYearOccupancyPct = prevYearTotalCapacity > 0
        ? Math.min(100, Math.round((prevYearTotalSold / prevYearTotalCapacity) * 10000) / 100)
        : 0

      months.push({
        month: m,
        monthLabel: new Date(year, m - 1, 1).toLocaleString("it-IT", { month: "long" }),
        produzioneAdOggi: Math.round(monthProductionAdOggi * 100) / 100,
        produzioneTotale: Math.round(monthProductionTotal * 100) / 100,
        prevYearProduction: Math.round(prevYearProduction * 100) / 100,
        obiettivo,
        delta: Math.round(delta * 100) / 100,
        revpar: Math.round(revpar * 100) / 100,
        revpor: Math.round(revpor * 100) / 100,
        prevYearRevpor: Math.round(prevRevpor * 100) / 100,
        deltaRevpor: Math.round(deltaRevpor * 100) / 100,
        coefficienteRevenue: Math.round(coefficienteRevenue * 100) / 100,
        occupancyPct,
        prevYearOccupancyPct,
        camereVendute: roomsSoldRiferimento,
        // Cam. Invendute (K): capacita' effettiva (capacita' teorica meno
        // camere fuori servizio) meno camere vendute. effectiveCapacity e'
        // ricalcolata qui inline per non dipendere dallo scope dei branch
        // RMS/legacy sopra.
        camereInvendute: Math.max(
          0,
          (oosHasData ? Math.max(0, theoreticalCapacity - totalMonthOos) : theoreticalCapacity) -
            roomsSoldRiferimento,
        ),
        camereDisponibili: capacityRiferimento,
        prevYearCamereVendute: prevYearTotalSold,
        prevYearCamereDisponibili: prevYearTotalCapacity,
        remainingUnsold,
        percentualeInvendutoPrevisionale: percInvenduto,
        prevYearPercInvenduto,
        revporTarget: Math.round(revporTarget * 100) / 100,
        roomsExpectedToSell,
      })
    }

    // Visualizzazione IVA tenant: scorporo lineare con aliquota alloggio sui
    // campi monetari (room-based). Anche obiettivo/delta vengono scalati per
    // mantenere la coerenza interna (delta = obiettivo - produzione). I rapporti
    // (coefficienteRevenue), conteggi camere e percentuali NON sono toccati.
    const vatCfg = resolveVatConfig(await getHotelVatConfig(supabase, hotelId), parseVatViewParam(searchParams))
    const payload = scorporoMonetaryDeep(
      { year, months, filterAdOggi, availableStatuses, connector },
      [
        "produzioneAdOggi",
        "produzioneTotale",
        "prevYearProduction",
        "obiettivo",
        "delta",
        "revpar",
        "revpor",
        "prevYearRevpor",
        "deltaRevpor",
        "revporTarget",
      ],
      vatCfg,
    )
    return NextResponse.json({
      ...payload,
      vatMode: vatCfg.mode,
      accommodationVatRate: vatCfg.accommodationRate,
    })
  } catch (error: any) {
    console.error("Objectives API error:", error?.message || error)
    return NextResponse.json({ error: "Internal server error", details: error?.message }, { status: 500 })
  }
}

/**
 * PUT /api/dati/objectives
 * Body: { hotel_id, year, months: [{ month, obiettivo_produzione, percentuale_invenduto_previsionale }] }
 * Also supports legacy single: { hotel_id, year, month, obiettivo_produzione, percentuale_invenduto_previsionale }
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { hotel_id, year } = body

    if (!hotel_id || !year) {
      return NextResponse.json({ error: "hotel_id and year required" }, { status: 400 })
    }

    // Use service-role client in dev to bypass RLS, cookie-bound client in prod
    const supabase = isV0Dev() ? await createServiceRoleClient() : await createClient()

    // VAT round-trip safety: l'`obiettivo_produzione` è memorizzato LORDO (IVA
    // inclusa), come tutti i valori monetari (vedi vat-display.ts). Se l'utente
    // edita in vista NETTO (vatView='net'), l'input mostra valori scorporati
    // (lordo/(1+aliquota)); vanno RI-LORDATI prima di salvare, altrimenti ad
    // ogni salvataggio il valore si riduce del fattore IVA (bug 22/06/2026).
    const vatView = body.vatView === "gross" || body.vatView === "net" ? body.vatView : null
    const vatCfg = resolveVatConfig(await getHotelVatConfig(supabase, hotel_id), vatView)
    const toStoredGross = (displayed: number): number => {
      const v = Number(displayed) || 0
      if (vatCfg.mode !== "excluded") return v // vista Lordo: già lordo
      // vista Netto -> ri-lordo e arrotondo a euro interi (budget = euro tondi)
      return Math.round(grossFromNet(v, vatCfg.accommodationRate))
    }

    // Support bulk save (array of months) or single month
    const monthsToSave: Array<{ month: number; obiettivo_produzione: number; percentuale_invenduto_previsionale: number }> = []

    if (body.months && Array.isArray(body.months)) {
      for (const m of body.months) {
        monthsToSave.push({
          month: m.month,
          obiettivo_produzione: toStoredGross(m.obiettivo_produzione || 0),
          percentuale_invenduto_previsionale: m.percentuale_invenduto_previsionale ?? 10,
        })
      }
    } else if (body.month) {
      monthsToSave.push({
        month: body.month,
        obiettivo_produzione: toStoredGross(body.obiettivo_produzione || 0),
        percentuale_invenduto_previsionale: body.percentuale_invenduto_previsionale ?? 10,
      })
    } else {
      return NextResponse.json({ error: "month or months[] required" }, { status: 400 })
    }

    const upsertRows = monthsToSave.map(m => ({
      hotel_id,
      year,
      month: m.month,
      obiettivo_produzione: m.obiettivo_produzione,
      percentuale_invenduto_previsionale: m.percentuale_invenduto_previsionale,
      updated_at: new Date().toISOString(),
    }))

    const { data, error } = await supabase
      .from("revenue_objectives")
      .upsert(upsertRows, { onConflict: "hotel_id,year,month" })
      .select()

    if (error) {
      console.error("Error upserting objectives:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data, count: data?.length || 0 })
  } catch (error: any) {
    console.error("Objectives PUT error:", error?.message || error)
    return NextResponse.json({ error: "Internal server error", details: error?.message }, { status: 500 })
  }
}
