/**
 * Analytics API - Read-only aggregated data for analytics dashboard
 * 
 * AGNOSTIC: Uses the same RPC functions as the main dashboard.
 * These RPCs aggregate data from all PMS types consistently.
 */

import { NextRequest, NextResponse } from "next/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"
import { measureRoute } from "@/lib/performance/with-perf"
import { fetchAllPaginatedOrLog } from "@/lib/supabase/paginate"
import { RELIABLE_OPERATIONAL_SOURCE_KEYS } from "@/lib/services/production-metrics.service"
import { getHotelVatConfig, scorporoMonetaryDeep, resolveVatConfig, parseVatViewParam } from "@/lib/utils/vat-display"

// Pagination helper (same as Obiettivi)
const fetchAll = <T = any>(buildQuery: () => any) =>
  fetchAllPaginatedOrLog<T>(buildQuery, "analytics")

export const dynamic = "force-dynamic"

interface MonthlyData {
  month: string
  monthLabel: string
  revenue: number
  roomNights: number
  lyRevenue: number
  lyRoomNights: number
}

interface DayOfWeekData {
  day: string
  dayLabel: string
  revenue: number
  lyRevenue: number
  bookings: number
  lyBookings: number
}

// Production by day of week (based on actual night date, not check-in)
interface ProductionDayOfWeekData {
  day: string
  dayLabel: string
  revenue: number
  lyRevenue: number
  roomNights: number
  lyRoomNights: number
}

// Day of week with YoY comparison
interface DayOfWeekDataWithYoY {
  day: string
  dayLabel: string
  revenue: number
  lyRevenue: number
  bookings: number
  lyBookings: number
}

// RevPAR by day of week
interface RevParDayOfWeekData {
  day: string
  dayLabel: string
  revpar: number
  lyRevpar: number
  daysCount: number
  lyDaysCount: number
}

interface BookingStatusData {
  status: string
  label: string
  count: number
  revenue: number
  roomNights: number
}

// Booking window (lead time): con quanto anticipo gli ospiti prenotano.
// Stessa formula del calendario attivita': lead = check_in - (booking_date || created_at).
interface BookingWindowBucket {
  key: string
  label: string
  count: number
  lyCount: number
  pct: number
  lyPct: number
}

interface BookingWindowData {
  avgLeadTime: number
  lyAvgLeadTime: number
  medianLeadTime: number
  lyMedianLeadTime: number
  sampleSize: number
  lySampleSize: number
  buckets: BookingWindowBucket[]
}

interface AnalyticsKPIs {
  totalRevenue: number
  lyTotalRevenue: number
  revenueYoY: number
  totalRoomNights: number
  lyTotalRoomNights: number
  roomNightsYoY: number
  adr: number
  lyAdr: number
  adrYoY: number
  occupancy: number
  lyOccupancy: number
  occupancyYoY: number
  revpar: number
  lyRevpar: number
  revparYoY: number
}

const MONTH_LABELS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"]

// Fasce di anticipo (lead time) in giorni. min incluso, max incluso.
const BOOKING_WINDOW_BANDS: { key: string; label: string; min: number; max: number }[] = [
  { key: "0-7", label: "0-7 gg", min: 0, max: 7 },
  { key: "8-14", label: "8-14 gg", min: 8, max: 14 },
  { key: "15-30", label: "15-30 gg", min: 15, max: 30 },
  { key: "31-60", label: "31-60 gg", min: 31, max: 60 },
  { key: "61-90", label: "61-90 gg", min: 61, max: 90 },
  { key: "90+", label: "Oltre 90 gg", min: 91, max: Infinity },
]

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/**
 * Calcola la finestra di prenotazione (lead time): con quanto anticipo gli
 * ospiti prenotano il soggiorno, confrontando anno corrente vs anno precedente.
 *
 * Legge dalla tabella unificata `public.bookings` (tutti i PMS), filtrando per
 * check-in nel periodo selezionato e escludendo le cancellate. Per ogni
 * prenotazione: lead = max(0, check_in - (booking_date || created_at)) — STESSA
 * formula del calendario attivita' (`/api/dati/calendario`) per coerenza, cosi'
 * l'utente puo' tarare le soglie "Data ferma" su questi numeri reali.
 * Vedi memoria santaddeo-bookings-date-semantics: booking_date = data PMS,
 * created_at = data download (usato solo come fallback se booking_date manca).
 */
async function computeBookingWindow(
  supabase: any,
  hotelId: string,
  cyStart: string,
  cyEnd: string,
  lyStart: string,
  lyEnd: string,
): Promise<BookingWindowData> {
  const selectCols = "check_in_date, booking_date, created_at"
  const [cyRes, lyRes] = await Promise.all([
    fetchAll(() =>
      supabase
        .from("bookings")
        .select(selectCols)
        .eq("hotel_id", hotelId)
        .eq("is_cancelled", false)
        .gte("check_in_date", cyStart)
        .lte("check_in_date", cyEnd),
    ),
    fetchAll(() =>
      supabase
        .from("bookings")
        .select(selectCols)
        .eq("hotel_id", hotelId)
        .eq("is_cancelled", false)
        .gte("check_in_date", lyStart)
        .lte("check_in_date", lyEnd),
    ),
  ])

  const leadDaysOf = (rows: any[]): number[] => {
    const out: number[] = []
    for (const b of rows) {
      const ref = b.booking_date || (b.created_at ? String(b.created_at).slice(0, 10) : null)
      if (!ref || !b.check_in_date) continue
      const ci = new Date(b.check_in_date + "T12:00:00").getTime()
      const bk = new Date(String(ref).slice(0, 10) + "T12:00:00").getTime()
      if (Number.isNaN(ci) || Number.isNaN(bk)) continue
      out.push(Math.max(0, Math.round((ci - bk) / 86400000)))
    }
    return out
  }

  const cyLeads = leadDaysOf(cyRes as any[])
  const lyLeads = leadDaysOf(lyRes as any[])

  const bucketize = (leads: number[]): number[] =>
    BOOKING_WINDOW_BANDS.map((band) => leads.filter((l) => l >= band.min && l <= band.max).length)

  const cyCounts = bucketize(cyLeads)
  const lyCounts = bucketize(lyLeads)
  const cyTotal = cyLeads.length
  const lyTotal = lyLeads.length

  const avg = (arr: number[]) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0)

  const buckets: BookingWindowBucket[] = BOOKING_WINDOW_BANDS.map((band, i) => ({
    key: band.key,
    label: band.label,
    count: cyCounts[i],
    lyCount: lyCounts[i],
    pct: cyTotal > 0 ? (cyCounts[i] / cyTotal) * 100 : 0,
    lyPct: lyTotal > 0 ? (lyCounts[i] / lyTotal) * 100 : 0,
  }))

  return {
    avgLeadTime: avg(cyLeads),
    lyAvgLeadTime: avg(lyLeads),
    medianLeadTime: median(cyLeads),
    lyMedianLeadTime: median(lyLeads),
    sampleSize: cyTotal,
    lySampleSize: lyTotal,
    buckets,
  }
}

async function computeAnalytics(
  supabase: any,
  hotelId: string,
  year: number,
  filterYtd: boolean // "Ad Oggi" filter
): Promise<{
  kpis: AnalyticsKPIs
  monthlyData: MonthlyData[]
  dayOfWeekData: DayOfWeekData[]
  productionDayOfWeekData: ProductionDayOfWeekData[]
  bookingStatusData: BookingStatusData[]
  bookingWindow: BookingWindowData
}> {
  const today = new Date()
  const todayStr = today.toISOString().split("T")[0]
  
  // If YTD filter active: from Jan 1 to today (or same day last year)
  // Otherwise: full year
  const startDate = `${year}-01-01`
  const endDate = filterYtd && year === today.getFullYear() 
    ? todayStr 
    : `${year}-12-31`
  
  // Last year comparison: same period
  const lyStartDate = `${year - 1}-01-01`
  const lyEndDate = filterYtd 
    ? `${year - 1}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
    : `${year - 1}-12-31`

  // PERF FIX 13/06/2026: hotel info e config PMS sono indipendenti -> in
  // parallelo. La config PMS (con integration_mode) viene RIUSATA piu' sotto per
  // le cancellazioni, eliminando una seconda query identica a pms_integrations.
  // Inoltre computeBookingWindow (2 fetch paginati di bookings) dipende solo da
  // hotelId+date: lo avviamo SUBITO in parallelo e lo attendiamo a fine funzione,
  // cosi' si sovrappone all'intera elaborazione invece di girare in coda.
  const bookingWindowPromise = computeBookingWindow(
    supabase,
    hotelId,
    startDate,
    endDate,
    lyStartDate,
    lyEndDate,
  )

  const [hotelInfoRes, pmsCfgRes] = await Promise.all([
    supabase.from("hotels").select("total_rooms").eq("id", hotelId).maybeSingle(),
    // FIX 21/05/2026 — branching PMS-aware (vedi MEMORY.md "Dashboard hardcoded
    // a Scidoo"): solo Scidoo legge da scidoo_raw_bookings. Altri PMS (BRiG…)
    // usano la tabella unificata public.bookings.
    supabase
      .from("pms_integrations")
      .select("pms_name, integration_mode")
      .eq("hotel_id", hotelId)
      .eq("is_active", true)
      .maybeSingle(),
  ])

  const totalRooms = hotelInfoRes.data?.total_rooms || 25
  const pmsCfgForBookings = pmsCfgRes.data
  const isScidooBookings =
    String(pmsCfgForBookings?.pms_name || "").toLowerCase() === "scidoo"

  // Fetch booking data with pagination (same as Obiettivi/Produzione)
  // Filter: checkin <= endDate AND checkout > startDate, hasPernotto OR hasDailyPrice
  //
  // STATI: allineato a objectives/route.ts -> contiamo SOLO gli stati confermati
  // (NO "opzione" passate, NO "annullata"), così Analytics e Obiettivi combaciano
  // per tutti gli hotel Scidoo. Le "opzione" si contano solo se il check-in è
  // futuro (potenziale produzione), e solo per l'anno corrente.
  const SCIDOO_CONFIRMED_STATUSES = [
    "attesa_pagamento",
    "confermata",
    "confermata_manuale",
    "confermata_pagamento",
    "confermata_carta",
    "check_in",
    "saldo",
    "check_out",
  ]
  const todayStrAnalytics = new Date().toISOString().split("T")[0]
  const [cyBookings, lyBookings] = isScidooBookings
    ? await Promise.all([
        // Anno corrente: confermati + opzioni con check-in futuro
        (async () => {
          const [confirmed, futureOptions] = await Promise.all([
            fetchAll(() =>
              supabase
                .from("scidoo_raw_bookings")
                .select("raw_data, status")
                .eq("hotel_id", hotelId)
                .in("status", SCIDOO_CONFIRMED_STATUSES)
                .lte("checkin_date", endDate)
                .gt("checkout_date", startDate)
            ),
            fetchAll(() =>
              supabase
                .from("scidoo_raw_bookings")
                .select("raw_data, status")
                .eq("hotel_id", hotelId)
                .eq("status", "opzione")
                .gte("checkin_date", todayStrAnalytics)
                .lte("checkin_date", endDate)
                .gt("checkout_date", startDate)
            ),
          ])
          // Nessun overlap: "opzione" non è tra i confermati, quindi concat sicuro.
          return [...confirmed, ...futureOptions]
        })(),
        // Anno precedente: solo confermati (le opzioni passate non contano).
        fetchAll(() =>
          supabase
            .from("scidoo_raw_bookings")
            .select("raw_data, status")
            .eq("hotel_id", hotelId)
            .in("status", SCIDOO_CONFIRMED_STATUSES)
            .lte("checkin_date", lyEndDate)
            .gt("checkout_date", lyStartDate)
        ),
      ])
    : await (async () => {
        // Non-Scidoo: legge da public.bookings e sintetizza raw_data.daily_price
        // pro-rata (total_price - extras) / nights, come fa objectives/route.ts.
        const mapBooking = (b: any) => {
          const nights = Number(b.number_of_nights) || 0
          const extrasTotal =
            (Number(b.extras_revenue) || 0) +
            (Number(b.fb_revenue) || 0) +
            (Number(b.spa_revenue) || 0) +
            (Number(b.other_revenue) || 0)
          const totalPrice = Number(b.total_price) || 0
          const roomOnlyTotal = Math.max(0, totalPrice - extrasTotal)
          const roomNightly = nights > 0 ? roomOnlyTotal / nights : 0
          let dp: Record<string, number> | null = null
          if (roomNightly > 0 && b.check_in_date && b.check_out_date) {
            dp = {}
            const ci = new Date(b.check_in_date)
            const co = new Date(b.check_out_date)
            for (let d = new Date(ci); d < co; d.setDate(d.getDate() + 1)) {
              dp[d.toISOString().slice(0, 10)] = roomNightly
            }
          }
          return { raw_data: { daily_price: dp }, status: b.is_cancelled ? "annullata" : "confermata" }
        }
        const [cy, ly] = await Promise.all([
          fetchAll(() =>
            supabase
              .from("bookings")
              .select("id, check_in_date, check_out_date, total_price, number_of_nights, extras_revenue, fb_revenue, spa_revenue, other_revenue, is_cancelled")
              .eq("hotel_id", hotelId)
              .eq("is_cancelled", false)
              .lte("check_in_date", endDate)
              .gt("check_out_date", startDate)
          ),
          fetchAll(() =>
            supabase
              .from("bookings")
              .select("id, check_in_date, check_out_date, total_price, number_of_nights, extras_revenue, fb_revenue, spa_revenue, other_revenue, is_cancelled")
              .eq("hotel_id", hotelId)
              .eq("is_cancelled", false)
              .lte("check_in_date", lyEndDate)
              .gt("check_out_date", lyStartDate)
          ),
        ])
        return [cy.map(mapBooking), ly.map(mapBooking)]
      })()

  // Fetch other data in parallel
  const [
    cyDpResult,
    lyDpResult,
    cyAvailabilityResult,
    lyAvailabilityResult,
    cyCancellationResult,
    channelBreakdownResult,
  ] = await Promise.all([
    // FIX 13/05/2026 (source-safety): filtra source operative per non mescolare
    // rows fiscali (rooms_occupied=0 placeholder) con rows operative reali.
    // Vedi lib/services/production-metrics.service.ts.
    supabase
      .from("daily_production")
      .select("date, total_revenue, rooms_occupied, source")
      .eq("hotel_id", hotelId)
      .gte("date", startDate)
      .lte("date", endDate)
      .in("source", RELIABLE_OPERATIONAL_SOURCE_KEYS),
    supabase
      .from("daily_production")
      .select("date, total_revenue, rooms_occupied, source")
      .eq("hotel_id", hotelId)
      .gte("date", lyStartDate)
      .lte("date", lyEndDate)
      .in("source", RELIABLE_OPERATIONAL_SOURCE_KEYS),
    supabase.rpc("get_daily_availability_summary", {
      p_hotel_id: hotelId,
      p_start_date: startDate,
      p_end_date: endDate,
    }),
    supabase.rpc("get_daily_availability_summary", {
      p_hotel_id: hotelId,
      p_start_date: lyStartDate,
      p_end_date: lyEndDate,
    }),
    supabase.rpc("get_cancellation_aggregates", {
      p_hotel_id: hotelId,
      p_start_date: startDate,
      p_end_date: endDate,
    }),
    supabase.rpc("get_bookings_channel_breakdown", {
      p_hotel_id: hotelId,
      p_start_date: startDate,
      p_end_date: endDate,
    }),
  ])

  // extractDailyPrices: SAME LOGIC AS OBIETTIVI
  // SOURCE OF TRUTH for Scidoo: raw_data.statics[] where category === "Pernotto"
  // This excludes breakfast/extras/tourist tax - matches Scidoo "Produzione Camere"
  function extractDailyPrices(booking: any): Array<{ date: string; price: number }> {
    const entries: Array<{ date: string; price: number }> = []
    const statics: any[] = Array.isArray(booking.raw_data?.statics) ? booking.raw_data.statics : []
    const pernottoEntries = statics.filter((s: any) => s && s.category === "Pernotto")
    if (pernottoEntries.length > 0) {
      for (const s of pernottoEntries) {
        const dt = String(s.date_time || "").slice(0, 10)
        if (!dt) continue
        const price = Number(s.price) || 0
        if (price === 999 || price === 9999) continue // Skip placeholders
        entries.push({ date: dt, price })
      }
      return entries
    }
    // Fallback to daily_price with discount deduction
    const rawDp = booking.raw_data?.daily_price
    const dailyPrice = (rawDp && typeof rawDp === 'object' && !Array.isArray(rawDp) && Object.keys(rawDp).length > 0)
      ? rawDp as Record<string, number>
      : null
    if (dailyPrice) {
      const extras: any[] = Array.isArray(booking.raw_data?.extras) ? booking.raw_data.extras : []
      const totalDiscount = extras.reduce((sum: number, ex: any) => {
        const price = Number(ex.price) || 0
        if (price >= 0) return sum
        const cat = String(ex.category || "").toLowerCase()
        const desc = String(ex.description || "").toLowerCase()
        const isDiscount = cat.includes("sconti") || cat.includes("servizio nota") || 
                          desc.includes("sconto") || desc.includes("addebito libero")
        return isDiscount ? sum + price : sum
      }, 0)
      const dpTotal = Object.values(dailyPrice).reduce((s: number, v) => {
        const n = Number(v) || 0
        return s + (n > 0 && n !== 999 && n !== 9999 ? n : 0)
      }, 0)
      for (const [date, price] of Object.entries(dailyPrice)) {
        if (price === 999 || price === 9999) continue
        const grossPrice = Number(price) || 0
        const discountShare = dpTotal > 0 ? (grossPrice / dpTotal) * totalDiscount : 0
        entries.push({ date, price: grossPrice + discountShare })
      }
    }
    return entries
  }

  // Calculate revenue using extractDailyPrices (same as Obiettivi)
  let cyRevenue = 0
  let cyRoomNights = 0
  let lyRevenue = 0
  let lyRoomNights = 0

  for (const b of cyBookings) {
    const raw = (b.raw_data || {}) as Record<string, unknown>
    const statics: any[] = Array.isArray(raw.statics) ? raw.statics : []
    const hasPernotto = statics.some((s: any) => s && s.category === "Pernotto")
    const dp = raw.daily_price
    const hasDailyPrice = dp && typeof dp === "object" && !Array.isArray(dp) && Object.keys(dp as object).length > 0
    if (!hasPernotto && !hasDailyPrice) continue
    
    for (const { date: dateStr, price } of extractDailyPrices(b)) {
      if (dateStr >= startDate && dateStr <= endDate) {
        cyRevenue += price
        cyRoomNights++
      }
    }
  }

  for (const b of lyBookings) {
    const raw = (b.raw_data || {}) as Record<string, unknown>
    const statics: any[] = Array.isArray(raw.statics) ? raw.statics : []
    const hasPernotto = statics.some((s: any) => s && s.category === "Pernotto")
    const dp = raw.daily_price
    const hasDailyPrice = dp && typeof dp === "object" && !Array.isArray(dp) && Object.keys(dp as object).length > 0
    if (!hasPernotto && !hasDailyPrice) continue
    
    for (const { date: dateStr, price } of extractDailyPrices(b)) {
      if (dateStr >= lyStartDate && dateStr <= lyEndDate) {
        lyRevenue += price
        lyRoomNights++
      }
    }
  }

  // FIX 21/05/2026 — Fallback PY storico da `daily_production`.
  // Hotel onboardati di recente non hanno bookings 2025 ma possono avere
  // import storici in `daily_production` (source `manual_import_2025`).
  // Senza questo fallback la pagina Analytics mostra "AP: 0" su tutti i
  // KPI anche con storico disponibile. Vedi MEMORY.md "Dashboard
  // hardcoded a Scidoo".
  if (lyRevenue === 0 && lyRoomNights === 0 && lyDpResult && !lyDpResult.error) {
    for (const r of lyDpResult.data || []) {
      const rev = Number(r.total_revenue || 0)
      const occ = Number(r.rooms_occupied || 0)
      lyRevenue += rev
      lyRoomNights += occ
    }
  }

  // Occupancy / RevPAR calculation from availability.
  // FIX 18/06/2026 (camere "fuori servizio" / OOO Scidoo): il denominatore deve
  // essere la CAPACITA' NETTA = total_rooms - rooms_out_of_service, NON la
  // capacita' lorda. Prima: occupancy = (total-available)/total e revpar usava
  // totalRooms*giorni -> i giorni in cui le camere erano chiuse (es. Tenuta
  // Moriano 23-30/11) gonfiavano l'occupancy e abbassavano artificialmente il
  // RevPAR. Ora usiamo la capacita' netta come denominatore unico e le notti
  // vendute (cyRoomNights, dai booking) come numeratore, cosi' i KPI sono
  // internamente coerenti: RevPAR = occupancy * ADR.
  const cyAvailability = cyAvailabilityResult.data || []
  const lyAvailability = lyAvailabilityResult.data || []

  const sumNetCapacity = (rows: any[]) =>
    rows.reduce(
      (sum: number, row: any) =>
        sum + Math.max(0, Number(row.total_rooms || 0) - Number(row.rooms_out_of_service || 0)),
      0
    )

  // Capacita' netta dalla tabella disponibilita' (esclude le camere OOO).
  const cyNetCapacityFromAvail = sumNetCapacity(cyAvailability)
  const lyNetCapacityFromAvail = sumNetCapacity(lyAvailability)

  // Calculate KPIs
  const daysInPeriod = filterYtd 
    ? Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1
    : (year % 4 === 0 ? 366 : 365)
  const lyDaysInPeriod = filterYtd 
    ? Math.ceil((new Date(lyEndDate).getTime() - new Date(lyStartDate).getTime()) / (1000 * 60 * 60 * 24)) + 1
    : ((year - 1) % 4 === 0 ? 366 : 365)

  // Capacita' di riferimento: netta da availability se disponibile, altrimenti
  // fallback alla capacita' lorda (camere di config * giorni) quando la tabella
  // disponibilita' e' vuota.
  const cyNetCapacity = cyNetCapacityFromAvail > 0 ? cyNetCapacityFromAvail : totalRooms * daysInPeriod
  const lyNetCapacity = lyNetCapacityFromAvail > 0 ? lyNetCapacityFromAvail : totalRooms * lyDaysInPeriod

  // Occupancy = notti vendute / capacita' netta. clamp a 100%: l'occupazione non
  // puo' superare il 100% (vedi nota Obiettivi 27/06/2026: capacita' storica
  // statica + numeratore da booking che include tipologie fuori capacita').
  const occupancy = cyNetCapacity > 0 ? Math.min(100, (cyRoomNights / cyNetCapacity) * 100) : 0
  const lyOccupancy = lyNetCapacity > 0 ? Math.min(100, (lyRoomNights / lyNetCapacity) * 100) : 0
  const adr = cyRoomNights > 0 ? cyRevenue / cyRoomNights : 0
  const lyAdr = lyRoomNights > 0 ? lyRevenue / lyRoomNights : 0
  // RevPAR = ricavo / capacita' netta (= occupancy * ADR).
  const revpar = cyNetCapacity > 0 ? cyRevenue / cyNetCapacity : 0
  const lyRevpar = lyNetCapacity > 0 ? lyRevenue / lyNetCapacity : 0

  const yoy = (current: number, last: number) =>
    last > 0 ? ((current - last) / last) * 100 : current > 0 ? 100 : 0

  const kpis: AnalyticsKPIs = {
    totalRevenue: cyRevenue,
    lyTotalRevenue: lyRevenue,
    revenueYoY: yoy(cyRevenue, lyRevenue),
    totalRoomNights: cyRoomNights,
    lyTotalRoomNights: lyRoomNights,
    roomNightsYoY: yoy(cyRoomNights, lyRoomNights),
    adr,
    lyAdr,
    adrYoY: yoy(adr, lyAdr),
    occupancy,
    lyOccupancy,
    occupancyYoY: yoy(occupancy, lyOccupancy),
    revpar,
    lyRevpar,
    revparYoY: yoy(revpar, lyRevpar),
  }

  // Monthly breakdown.
  // PERF FIX 01/06/2026: prima questo loop faceva 24 RPC get_rms_revenue_summary
  // (2 per mese x 12 mesi) -> ~24 round-trip HTTP a Supabase per ogni richiesta,
  // causa principale dei ~3s di latenza di /api/dati/analytics. Ora una sola RPC
  // get_rms_revenue_monthly per anno (CY + LY) restituisce i 12 mesi raggruppati.
  // I range continui startDate..endDate / lyStartDate..lyEndDate sono GLI STESSI
  // usati dalle card KPI: la somma del vecchio loop coincide (verificata parita'
  // CY e LY) e il grafico mensile resta cosi' coerente con i KPI.
  const [cyMonthlyRpc, lyMonthlyRpc] = await Promise.all([
    supabase.rpc("get_rms_revenue_monthly", {
      p_hotel_id: hotelId,
      p_start_date: startDate,
      p_end_date: endDate,
    }),
    supabase.rpc("get_rms_revenue_monthly", {
      p_hotel_id: hotelId,
      p_start_date: lyStartDate,
      p_end_date: lyEndDate,
    }),
  ])

  // Indicizza per mese (1-12) le righe restituite dalla RPC aggregata.
  const cyByMonthRpc = new Map<number, { total_revenue: number; room_nights: number }>()
  for (const r of cyMonthlyRpc.data || []) {
    cyByMonthRpc.set(Number(r.month), {
      total_revenue: Number(r.total_revenue || 0),
      room_nights: Number(r.room_nights || 0),
    })
  }
  const lyByMonthRpc = new Map<number, { total_revenue: number; room_nights: number }>()
  for (const r of lyMonthlyRpc.data || []) {
    lyByMonthRpc.set(Number(r.month), {
      total_revenue: Number(r.total_revenue || 0),
      room_nights: Number(r.room_nights || 0),
    })
  }

  // Ricostruisce la stessa forma del vecchio loop: 12 entry [cy, ly], ognuna
  // { data: [{ total_revenue, room_nights }] }, cosi' il codice a valle resta invariato.
  const monthlyResults = Array.from({ length: 12 }, (_, idx) => {
    const m = idx + 1
    const cy = cyByMonthRpc.get(m)
    const ly = lyByMonthRpc.get(m)
    return [
      { data: cy ? [cy] : [] },
      { data: ly ? [ly] : [] },
    ] as const
  })

  // Check if RPC data is empty - if so, use daily_production fallback
  const rpcHasData = monthlyResults.some(([cy, ly]) => {
    const cyData = (cy.data || [])[0] || {}
    const lyData = (ly.data || [])[0] || {}
    return Number(cyData.total_revenue || 0) > 0 || Number(lyData.total_revenue || 0) > 0
  })

  let monthlyData: MonthlyData[]

  if (rpcHasData) {
    // Use RPC data
    monthlyData = monthlyResults.map((results, idx) => {
      const [cy, ly] = results
      const cyData = (cy.data || [])[0] || {}
      const lyData = (ly.data || [])[0] || {}
      return {
        month: String(idx + 1).padStart(2, "0"),
        monthLabel: MONTH_LABELS[idx],
        revenue: Number(cyData.total_revenue || 0),
        roomNights: Number(cyData.room_nights || 0),
        lyRevenue: Number(lyData.total_revenue || 0),
        lyRoomNights: Number(lyData.room_nights || 0),
      }
    })
  } else {
    // Fallback: use daily_production aggregated by month
    // FIX 13/05/2026 (source-safety): vedi sopra (esclude fiscali per evitare
    // SUM(rooms_occupied) inquinato da placeholder).
    const [cyDpMonthly, lyDpMonthly] = await Promise.all([
      supabase
        .from("daily_production")
        .select("date, total_revenue, rooms_occupied, source")
        .eq("hotel_id", hotelId)
        .gte("date", startDate)
        .lte("date", endDate)
        .in("source", RELIABLE_OPERATIONAL_SOURCE_KEYS),
      supabase
        .from("daily_production")
        .select("date, total_revenue, rooms_occupied, source")
        .eq("hotel_id", hotelId)
        .gte("date", lyStartDate)
        .lte("date", lyEndDate)
        .in("source", RELIABLE_OPERATIONAL_SOURCE_KEYS),
    ])

    // Aggregate by month
    const cyByMonth: Record<string, { revenue: number; roomNights: number }> = {}
    const lyByMonth: Record<string, { revenue: number; roomNights: number }> = {}

    for (const row of cyDpMonthly.data || []) {
      const month = row.date?.slice(5, 7) || "01"
      if (!cyByMonth[month]) cyByMonth[month] = { revenue: 0, roomNights: 0 }
      cyByMonth[month].revenue += Number(row.total_revenue || 0)
      cyByMonth[month].roomNights += Number(row.rooms_occupied || 0)
    }

    for (const row of lyDpMonthly.data || []) {
      const month = row.date?.slice(5, 7) || "01"
      if (!lyByMonth[month]) lyByMonth[month] = { revenue: 0, roomNights: 0 }
      lyByMonth[month].revenue += Number(row.total_revenue || 0)
      lyByMonth[month].roomNights += Number(row.rooms_occupied || 0)
    }

    monthlyData = MONTH_LABELS.map((label, idx) => {
      const mm = String(idx + 1).padStart(2, "0")
      return {
        month: mm,
        monthLabel: label,
        revenue: cyByMonth[mm]?.revenue || 0,
        roomNights: cyByMonth[mm]?.roomNights || 0,
        lyRevenue: lyByMonth[mm]?.revenue || 0,
        lyRoomNights: lyByMonth[mm]?.roomNights || 0,
      }
    })
  }

  // FIX 21/05/2026 — Fallback finale per il chart mensile.
  // Se sia il RPC che daily_production sono vuoti per il CY (caso Hotel
  // Cavallino 2026: niente daily_production, niente RPC monthly, ma 3000+
  // bookings reali), il chart "Revenue anno corrente vs anno precedente"
  // mostra tutte le barre CY a 0 anche se le KPI in alto sono popolate (le
  // KPI usano cyBookings direttamente, vedi cyRevenue sopra).
  // Ricostruiamo i mensili dai bookings gia' in memoria con extractDailyPrices.
  const cyMonthlyHasData = monthlyData.some(m => m.revenue > 0 || m.roomNights > 0)
  const lyMonthlyHasData = monthlyData.some(m => m.lyRevenue > 0 || m.lyRoomNights > 0)

  // ALLINEAMENTO ANALYTICS == OBIETTIVI (18/06/2026).
  // Per gli hotel Scidoo il grafico mensile DEVE usare la stessa estrazione
  // per-notte (extractDailyPrices su cyBookings) usata sia dalle card KPI qui
  // sopra sia dalla pagina Obiettivi. La RPC get_rms_revenue_monthly usa una
  // definizione di revenue diversa (es. Moriano giugno 41.979 vs 39.836) e
  // disallineava il grafico dai KPI e da Obiettivi. Quando isScidooBookings
  // forziamo il ricalcolo per-notte e lo rendiamo AUTOREVOLE (niente fallback
  // alla RPC): i mesi senza notti restano a 0.
  const forceScidooMonthly = isScidooBookings

  if ((forceScidooMonthly || !cyMonthlyHasData) && cyRevenue > 0) {
    const cyByMonthFromBookings: Record<string, { revenue: number; roomNights: number }> = {}
    for (const b of cyBookings) {
      for (const { date, price } of extractDailyPrices(b)) {
        if (date < startDate || date > endDate) continue
        const mm = date.slice(5, 7)
        if (!cyByMonthFromBookings[mm]) cyByMonthFromBookings[mm] = { revenue: 0, roomNights: 0 }
        cyByMonthFromBookings[mm].revenue += price
        cyByMonthFromBookings[mm].roomNights += 1
      }
    }
    monthlyData = monthlyData.map(m => ({
      ...m,
      revenue: forceScidooMonthly
        ? (cyByMonthFromBookings[m.month]?.revenue ?? 0)
        : (cyByMonthFromBookings[m.month]?.revenue || m.revenue),
      roomNights: forceScidooMonthly
        ? (cyByMonthFromBookings[m.month]?.roomNights ?? 0)
        : (cyByMonthFromBookings[m.month]?.roomNights || m.roomNights),
    }))
  }

  if ((forceScidooMonthly || !lyMonthlyHasData) && lyRevenue > 0) {
    const lyByMonthFromBookings: Record<string, { revenue: number; roomNights: number }> = {}
    // Bookings PY (extractDailyPrices)
    for (const b of lyBookings) {
      for (const { date, price } of extractDailyPrices(b)) {
        if (date < lyStartDate || date > lyEndDate) continue
        const mm = date.slice(5, 7)
        if (!lyByMonthFromBookings[mm]) lyByMonthFromBookings[mm] = { revenue: 0, roomNights: 0 }
        lyByMonthFromBookings[mm].revenue += price
        lyByMonthFromBookings[mm].roomNights += 1
      }
    }
    // Fallback storico da lyDpResult (manual_import_2025) se i bookings PY
    // sono vuoti ma il PY KPI e' stato ricostruito da daily_production sopra.
    if (Object.keys(lyByMonthFromBookings).length === 0 && lyDpResult && !lyDpResult.error) {
      for (const r of lyDpResult.data || []) {
        const date = String(r.date || "")
        if (date < lyStartDate || date > lyEndDate) continue
        const mm = date.slice(5, 7)
        if (!lyByMonthFromBookings[mm]) lyByMonthFromBookings[mm] = { revenue: 0, roomNights: 0 }
        lyByMonthFromBookings[mm].revenue += Number(r.total_revenue || 0)
        lyByMonthFromBookings[mm].roomNights += Number(r.rooms_occupied || 0)
      }
    }
    monthlyData = monthlyData.map(m => ({
      ...m,
      lyRevenue: forceScidooMonthly
        ? (lyByMonthFromBookings[m.month]?.revenue ?? 0)
        : (lyByMonthFromBookings[m.month]?.revenue || m.lyRevenue),
      lyRoomNights: forceScidooMonthly
        ? (lyByMonthFromBookings[m.month]?.roomNights ?? 0)
        : (lyByMonthFromBookings[m.month]?.roomNights || m.lyRoomNights),
    }))
  }

  // Day of week breakdown - USE daily_production FOR ALL HOTELS
  // This ensures consistency with KPIs which also use daily_production/RPC
  const dayLabels = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"]
  const dayOfWeekData: DayOfWeekData[] = dayLabels.map((label, idx) => ({
    day: String(idx),
    dayLabel: label,
    revenue: 0,
    lyRevenue: 0,
    bookings: 0,
    lyBookings: 0,
  }))

  // Production by day of week (based on actual night date)
  const productionDayOfWeekData: ProductionDayOfWeekData[] = dayLabels.map((label, idx) => ({
    day: String(idx),
    dayLabel: label,
    revenue: 0,
    lyRevenue: 0,
    roomNights: 0,
    lyRoomNights: 0,
  }))

  // RevPAR by day of week - track revenue per day
  const revparDayOfWeekData: { revenue: number; lyRevenue: number; daysCount: number; lyDaysCount: number }[] = 
    dayLabels.map(() => ({ revenue: 0, lyRevenue: 0, daysCount: 0, lyDaysCount: 0 }))

  // Count days of week in each period for RevPAR calculation
  const countDaysInPeriod = (start: string, end: string): number[] => {
    const counts = [0, 0, 0, 0, 0, 0, 0] // Lun-Dom
    const s = new Date(start)
    const e = new Date(end)
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay()
      const idx = dow === 0 ? 6 : dow - 1
      counts[idx]++
    }
    return counts
  }

  const cyDayCounts = countDaysInPeriod(startDate, endDate)
  const lyDayCounts = countDaysInPeriod(lyStartDate, lyEndDate)

  // Process daily_production data for day-of-week charts (reuse cyDpResult/lyDpResult from KPI section)
  //
  // FIX 01/06/2026 (i due box "Revenue per giorno settimana" e "Produzione per
  // giorno settimana" mostravano valori identici): daily_production e' indicizzato
  // per DATA-NOTTE, non per data-prenotazione. Qui popoliamo SOLO la Produzione
  // (per giorno della notte) e il RevPAR. Il chart "Revenue per giorno della
  // PRENOTAZIONE" (dayOfWeekData) NON puo' derivare da daily_production perche'
  // quella tabella non contiene la booking_date: lo calcoliamo sempre dai bookings
  // reali piu' sotto (accumulateBookingRevenueByDate). Prima invece questo loop
  // scriveva anche su dayOfWeekData usando il dow della notte -> i due grafici
  // finivano identici per gli hotel con daily_production (es. Scidoo/Barronci).
  const processDailyProduction = (data: any[], isLastYear: boolean) => {
    for (const dp of data) {
      if (!dp.date) continue
      const dow = new Date(dp.date).getDay()
      const idx = dow === 0 ? 6 : dow - 1
      const revenue = Number(dp.total_revenue) || 0
      const roomNights = Number(dp.rooms_occupied) || 0

      if (isLastYear) {
        productionDayOfWeekData[idx].lyRevenue += revenue
        productionDayOfWeekData[idx].lyRoomNights += roomNights
        revparDayOfWeekData[idx].lyRevenue += revenue
      } else {
        productionDayOfWeekData[idx].revenue += revenue
        productionDayOfWeekData[idx].roomNights += roomNights
        revparDayOfWeekData[idx].revenue += revenue
      }
    }
  }

  if (!cyDpResult.error && cyDpResult.data) {
    processDailyProduction(cyDpResult.data, false)
  }
  if (!lyDpResult.error && lyDpResult.data) {
    processDailyProduction(lyDpResult.data, true)
  }

  // Revenue per giorno della PRENOTAZIONE (dayOfWeekData): suddivide il
  // fatturato per il giorno della settimana in cui la prenotazione e' stata
  // effettuata (booking_date). Questa informazione vive SOLO nei bookings
  // reali (daily_production e' per data-notte), quindi la calcoliamo SEMPRE
  // dai bookings, indipendentemente dalla presenza di daily_production.
  // Vedi FIX 01/06/2026 nel commento di processDailyProduction.
  const accumulateBookingRevenueByDate = (
    bookings: any[],
    rangeStart: string,
    rangeEnd: string,
    isLastYear: boolean,
  ) => {
    for (const b of bookings) {
      const prices = extractDailyPrices(b)
      // Giorno-settimana della data prenotazione. Fallback: created_at, poi
      // data della prima notte se booking_date/created_at mancano.
      const bookingDateStr =
        (b.booking_date as string | null) ||
        (b.created_at ? String(b.created_at).slice(0, 10) : null) ||
        prices[0]?.date ||
        null
      // Sommiamo il revenue delle notti che cadono nel range selezionato,
      // poi lo attribuiamo al bucket del giorno-prenotazione (1 booking).
      let bookingRevenueInRange = 0
      let bookingNightsInRange = 0
      for (const { date, price } of prices) {
        if (date < rangeStart || date > rangeEnd) continue
        bookingRevenueInRange += price
        bookingNightsInRange += 1
      }
      if (bookingDateStr && bookingNightsInRange > 0) {
        const dow = new Date(bookingDateStr).getDay()
        const idx = dow === 0 ? 6 : dow - 1
        if (isLastYear) {
          dayOfWeekData[idx].lyRevenue += bookingRevenueInRange
          dayOfWeekData[idx].lyBookings += 1
        } else {
          dayOfWeekData[idx].revenue += bookingRevenueInRange
          dayOfWeekData[idx].bookings += 1
        }
      }
    }
  }

  // Sempre attivo (anche con daily_production): e' l'unica fonte corretta per
  // il chart Revenue-per-giorno-prenotazione.
  if (cyBookings.length > 0) {
    accumulateBookingRevenueByDate(cyBookings, startDate, endDate, false)
  }
  if (lyBookings.length > 0) {
    accumulateBookingRevenueByDate(lyBookings, lyStartDate, lyEndDate, true)
  }

  // FIX 21/05/2026 — Fallback PRODUZIONE/RevPAR dai bookings reali.
  // Se daily_production e' vuoto per il CY/PY ma esistono bookings (hotel BRiG
  // / nuovi connector senza daily_production), ricostruiamo Produzione e RevPAR
  // per giorno-NOTTE usando extractDailyPrices (stessa fonte delle KPI). Senza
  // questo i chart Produzione/RevPAR/RevPOR resterebbero a zero. Il flag e'
  // basato SOLO su productionDayOfWeekData perche' dayOfWeekData ormai viene
  // sempre popolato dai bookings sopra.
  const cyDowHasData = productionDayOfWeekData.some(d => d.revenue > 0)
  const lyDowHasData = productionDayOfWeekData.some(d => d.lyRevenue > 0)

  const accumulateProductionFromBookings = (
    bookings: any[],
    rangeStart: string,
    rangeEnd: string,
    isLastYear: boolean,
  ) => {
    for (const b of bookings) {
      for (const { date, price } of extractDailyPrices(b)) {
        if (date < rangeStart || date > rangeEnd) continue
        const dow = new Date(date).getDay()
        const idx = dow === 0 ? 6 : dow - 1
        if (isLastYear) {
          productionDayOfWeekData[idx].lyRevenue += price
          productionDayOfWeekData[idx].lyRoomNights += 1
          revparDayOfWeekData[idx].lyRevenue += price
        } else {
          productionDayOfWeekData[idx].revenue += price
          productionDayOfWeekData[idx].roomNights += 1
          revparDayOfWeekData[idx].revenue += price
        }
      }
    }
  }

  if (!cyDowHasData && cyRevenue > 0 && cyBookings.length > 0) {
    accumulateProductionFromBookings(cyBookings, startDate, endDate, false)
  }
  if (!lyDowHasData && lyRevenue > 0 && lyBookings.length > 0) {
    accumulateProductionFromBookings(lyBookings, lyStartDate, lyEndDate, true)
  }

  // Booking status data from cancellation aggregates and channel breakdown
  // NOTE: RPC returns an ARRAY, not an object - access [0]
  const cancellationDataArr = cyCancellationResult.data || []
  const cancellationData = cancellationDataArr[0] || {}
  const channelData = channelBreakdownResult.data || []

  let totalBookings = channelData.reduce((sum: number, row: any) => sum + (row.booking_count || 0), 0)
  let totalBookingRevenue = channelData.reduce((sum: number, row: any) => sum + (row.channel_revenue || 0), 0)
  let totalRoomNights = 0
  // Field name is cancellation_count (not cancellations_count)
  let cancelledCount = Number(cancellationData.cancellation_count || 0)
  let cancelledRevenue = Number(cancellationData.cancelled_revenue || 0)
  let cancelledRoomNights = 0

  // For non-API hotels, ALWAYS use bookings table directly
  // (RPC data may be incomplete or from wrong source).
  // PERF FIX 13/06/2026: riusa pmsCfgForBookings (gia' caricato in parallelo a
  // inizio funzione) invece di ri-interrogare pms_integrations.
  // FIX 21/05/2026 — solo Scidoo legge da scidoo_raw_bookings.
  // Altri PMS (BRiG, ecc.) leggono dalla tabella unificata `public.bookings`,
  // anche quando `integration_mode = "api"`.
  const isScidooForCancellations =
    String(pmsCfgForBookings?.pms_name || "").toLowerCase() === "scidoo"
  const isApiModeForCancellations =
    isScidooForCancellations && pmsCfgForBookings?.integration_mode === "api"

  if (!isApiModeForCancellations) {
    // Non-API: query bookings table directly for accurate counts
    const [cancelledResult, confirmedResult] = await Promise.all([
      supabase
        .from("bookings")
        .select("id, total_price, number_of_nights")
        .eq("hotel_id", hotelId)
        .eq("is_cancelled", true)
        .gte("check_in_date", startDate)
        .lte("check_in_date", endDate),
      supabase
        .from("bookings")
        .select("id, total_price, number_of_nights")
        .eq("hotel_id", hotelId)
        .eq("is_cancelled", false)
        .gte("check_in_date", startDate)
        .lte("check_in_date", endDate),
    ])

    if (cancelledResult.data) {
      cancelledCount = cancelledResult.data.length
      cancelledRevenue = cancelledResult.data.reduce((sum, b) => sum + Number(b.total_price || 0), 0)
      cancelledRoomNights = cancelledResult.data.reduce((sum, b) => sum + Number(b.number_of_nights || 0), 0)
    }
    if (confirmedResult.data) {
      const confirmedCount = confirmedResult.data.length
      const confirmedRevenue = confirmedResult.data.reduce((sum, b) => sum + Number(b.total_price || 0), 0)
      const confirmedRoomNights = confirmedResult.data.reduce((sum, b) => sum + Number(b.number_of_nights || 0), 0)
      totalBookings = confirmedCount + cancelledCount
      totalBookingRevenue = confirmedRevenue + cancelledRevenue
      totalRoomNights = confirmedRoomNights
    }
  } else {
    // API mode (Scidoo): use daily_production for confirmed room nights
    totalRoomNights = cyRoomNights
    
    // Query scidoo_raw_bookings for cancelled bookings room nights
    const cancelledScidooResult = await supabase
      .from("scidoo_raw_bookings")
      .select("raw_data, status")
      .eq("hotel_id", hotelId)
      .eq("status", "annullata")
      .gte("checkin_date", startDate)
      .lte("checkin_date", endDate)
    
    if (cancelledScidooResult.data) {
      cancelledCount = cancelledScidooResult.data.length
      for (const b of cancelledScidooResult.data) {
        const raw = (b.raw_data || {}) as Record<string, unknown>
        const dailyPrice = (raw.daily_price || {}) as Record<string, number>
        const nights = Object.keys(dailyPrice).length
        const revenue = Object.values(dailyPrice).reduce((sum, v) => sum + (Number(v) || 0), 0)
        cancelledRoomNights += nights
        cancelledRevenue += revenue
      }
    }
  }

  const bookingStatusData: BookingStatusData[] = [
    {
      status: "confirmed",
      label: "Confermate",
      count: totalBookings,
      revenue: totalBookingRevenue,
      roomNights: totalRoomNights,
    },
    {
      status: "cancelled",
      label: "Cancellate",
      count: cancelledCount,
      revenue: cancelledRevenue,
      roomNights: cancelledRoomNights,
    },
  ]

  // Calculate RevPAR by day of week
  // RevPAR = Revenue / (Total Rooms * Days in period)
  const revparDayOfWeekResult: RevParDayOfWeekData[] = dayLabels.map((label, idx) => {
    const availableRoomDays = totalRooms * cyDayCounts[idx]
    const lyAvailableRoomDays = totalRooms * lyDayCounts[idx]
    return {
      day: String(idx),
      dayLabel: label,
      revpar: availableRoomDays > 0 ? revparDayOfWeekData[idx].revenue / availableRoomDays : 0,
      lyRevpar: lyAvailableRoomDays > 0 ? revparDayOfWeekData[idx].lyRevenue / lyAvailableRoomDays : 0,
      daysCount: cyDayCounts[idx],
      lyDaysCount: lyDayCounts[idx],
    }
  })

  // Finestra di prenotazione (lead time) CY vs PY: la promise e' stata avviata
  // a inizio funzione e si e' sovrapposta a tutta l'elaborazione. Qui attendiamo.
  const bookingWindow = await bookingWindowPromise

  return { kpis, monthlyData, dayOfWeekData, productionDayOfWeekData, revparDayOfWeekData: revparDayOfWeekResult, bookingStatusData, bookingWindow }
}

async function _GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  // Keep-warm short-circuit (cron /api/cron/keep-warm).
  // Quando la lambda viene invocata con ?warm=1 esce SUBITO, prima di auth e DB:
  // a quel punto il cold start (boot del processo + import dei moduli) e' gia'
  // stato pagato dal cron, quindi la successiva richiesta utente trova la lambda
  // calda. Nessun accesso a dati, nessun side effect.
  if (searchParams.get("warm") === "1") {
    return NextResponse.json({ warm: true, at: new Date().toISOString() })
  }

  const { user, supabase } = await getAuthUserOrDev()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const hotelId = searchParams.get("hotel_id")
  const yearParam = searchParams.get("year")
  const filterYtd = searchParams.get("filter") === "ytd"

  if (!hotelId) {
    return NextResponse.json({ error: "hotel_id required" }, { status: 400 })
  }

  const denied = await validateHotelAccess(hotelId, user, { allowSeller: "metrics" })
  if (denied) return denied

  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear()

  try {
    const result = await computeAnalytics(supabase, hotelId, year, filterYtd)
    // Visualizzazione IVA del tenant. Analytics è interamente room-based:
    // scorporo lineare con l'aliquota alloggio su tutti i campi monetari
    // (gli YoY sono rapporti -> invarianti). Default 'included' = nessuna modifica.
    const vatCfg = resolveVatConfig(await getHotelVatConfig(supabase, hotelId), parseVatViewParam(searchParams))
    const scorporato = scorporoMonetaryDeep(
      result,
      ["revenue", "lyRevenue", "totalRevenue", "lyTotalRevenue", "adr", "lyAdr", "revpar", "lyRevpar"],
      vatCfg,
    )
    return NextResponse.json({
      ...scorporato,
      vatMode: vatCfg.mode,
      accommodationVatRate: vatCfg.accommodationRate,
    })
  } catch (error: any) {
    console.error("Analytics API error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export const GET = measureRoute("/api/dati/analytics", _GET)
