/**
 * Metrics Service
 * Extracts dashboard KPI computation logic from /api/dashboard/metrics.
 * All functions receive a Supabase client + parameters and return typed results.
 * Caching (cachedQuery) and auth (validateHotelAccess) remain in the route.
 */

import { getCapabilities } from "@/lib/capabilities/get-capabilities"
import { toVatConfig, netFromGross, resolveVatConfig, type VatDisplayConfig, type VatView } from "@/lib/utils/vat-display"

// ──────────────────────────────────────────────────
// Helper utilities (moved from route)
// ──────────────────────────────────────────────────

function isRetryableError(err: any): boolean {
  if (!err) return false
  const msg = typeof err === "string" ? err : err?.message || String(err)
  return (
    msg.includes("Too Many") ||
    msg.includes("429") ||
    msg.includes("Unexpected token") ||
    msg.includes("Failed to fetch") ||
    msg.includes("fetch failed") ||
    msg.includes("ECONNRESET") ||
    msg.includes("timeout") ||
    msg.includes("socket hang up") ||
    (err?.code === "429") ||
    (err?.status === 429)
  )
}

export async function fetchAllPaginated<T>(
  queryFn: (offset: number, limit: number) => Promise<{ data: T[] | null; error: any }>,
  pageSize = 1000,
  retries = 4,
  delayMs = 800
): Promise<{ data: T[]; error: any }> {
  const allRows: T[] = []
  let offset = 0
  let hasMore = true

  while (hasMore) {
    let result: { data: T[] | null; error: any } = { data: null, error: null }

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        result = await queryFn(offset, pageSize)
        if (result.error && isRetryableError(result.error)) {
          if (attempt < retries) {
            await new Promise(r => setTimeout(r, delayMs * Math.pow(2, attempt)))
            continue
          }
        }
        break
      } catch (thrown: any) {
        if (isRetryableError(thrown) && attempt < retries) {
          await new Promise(r => setTimeout(r, delayMs * Math.pow(2, attempt)))
          continue
        }
        result = { data: null, error: thrown }
        break
      }
    }

    if (result.error || !result.data) {
      return { data: allRows, error: result.error }
    }

    allRows.push(...result.data)
    hasMore = result.data.length === pageSize
    offset += pageSize
  }

  return { data: allRows, error: null }
}

export async function withRetry<T>(
  fn: () => Promise<{ data: T | null; error: any }>,
  retries = 4,
  delayMs = 800
): Promise<{ data: T | null; error: any }> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await fn()
      if (result.error && isRetryableError(result.error)) {
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, delayMs * Math.pow(2, attempt)))
          continue
        }
      }
      return result
    } catch (thrown: any) {
      if (isRetryableError(thrown) && attempt < retries) {
        await new Promise(r => setTimeout(r, delayMs * Math.pow(2, attempt)))
        continue
      }
      return { data: null, error: thrown }
    }
  }
  return { data: null, error: { message: "Max retries exceeded" } }
}

// ──────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────

export interface DashboardMetrics {
  totalRevenue: number
  directRevenue: number
  intermediatedRevenue: number
  channelRevenue: Record<string, number>
  roomNights: number
  revpar: number
  revpor: number
  adr: number
  occupancy: number
  bookingsCount: number
  cancelledRevenue: number
  cancelledNights: number
  cancellationsCount: number
  avgBookingPickup: number
  avgCancellationPickup: number
  lyBookingsCount: number
  lyCancellationsCount: number
  bookingsYoY: number
  cancellationsYoY: number
  period: string
  startDate: string
  endDate: string
  vatMode: "included" | "excluded"
  accommodationVatRate: number
}

export interface DateSelectorResult {
  bookings: any[]
  cancellations: any[]
}

// ──────────────────────────────────────────────────
// Occupancy computation
// ──────────────────────────────────────────────────

export function computeOccupancy(
  availabilityData: Array<{ date: string; rooms_available: number; total_rooms: number; rooms_out_of_service?: number }> | null,
  hotelTotalRooms: number,
  startDate: string,
  endDate: string,
  /** Opzionale: room nights vendute (da RMS o booking), usato per sanity check */
  soldRoomNights?: number
): { occupancy: number; totalRooms: number; occupiedRoomsTotal: number; totalRoomsFromAvailability: number; daysWithData: number; availableRoomNights: number } {
  let totalRoomsFromAvailability = 0
  let occupiedRoomsTotal = 0
  let oosRoomNights = 0
  let daysWithData = 0
  let maxDailyTotal = 0

  if (availabilityData && availabilityData.length > 0) {
    // FIX 18/06/2026 (camere "fuori servizio"/OOO): aggreghiamo anche
    // rooms_out_of_service per data. Le camere chiuse NON devono contare ne'
    // come vendute ne' come capacita' disponibile.
    const dateMap = new Map<string, { total: number; available: number; oos: number }>()
    for (const row of availabilityData) {
      const existing = dateMap.get(row.date) || { total: 0, available: 0, oos: 0 }
      dateMap.set(row.date, {
        total: existing.total + (row.total_rooms || 0),
        available: existing.available + (row.rooms_available || 0),
        oos: existing.oos + (row.rooms_out_of_service || 0),
      })
    }
    daysWithData = dateMap.size
    for (const [, dayData] of dateMap) {
      totalRoomsFromAvailability += dayData.total
      oosRoomNights += dayData.oos
      // Vendute = totale - disponibili - fuori servizio (clamp >= 0).
      occupiedRoomsTotal += Math.max(0, dayData.total - dayData.available - dayData.oos)
      if (dayData.total > maxDailyTotal) maxDailyTotal = dayData.total
    }
  }

  // FIX 02/05/2026 (RevPAR > RevPOR su Massabò, Rondini, Moriano):
  // Prima `totalRooms` veniva calcolato come media giornaliera della capacita'
  // osservata (`Math.round(totalRoomsFromAvailability / daysWithData)`), che
  // produceva valori MOLTO sotto la realta' quando in `daily_availability`
  // c'erano giorni con `total_rooms=0` o `=1` per dati legacy/sporchi (seed
  // pre go-live, restrizioni temporanee, periodi di chiusura ecc.). Esempio
  // Massabo' 2025: 3 giorni con total=1 -> avg=1, RevPAR = revenue/(1*122) =
  // €248 con RevPOR €126, impossibile per definizione (RevPAR <= RevPOR).
  //
  // Strategia corretta: la "capacita' fisica" usata come denominatore di
  // RevPAR e' una proprieta' dell'hotel (camere disponibili a inventory
  // pieno), non una media. La fonte di verita' e' `hotels.total_rooms`.
  // Se l'hotel non ha `total_rooms` valorizzato (caso raro), usiamo il MAX
  // della capacita' aggregata giornaliera, che almeno cattura un giorno con
  // tutte le camere mappate. La MEDIA non si usa mai perche' viene tirata
  // giu' dai giorni di chiusura/dati sporchi e produce numeri inverosimili.
  let totalRooms: number
  if (hotelTotalRooms && hotelTotalRooms > 0) {
    totalRooms = hotelTotalRooms
  } else if (maxDailyTotal > 0) {
    totalRooms = maxDailyTotal
  } else {
    totalRooms = 0
  }

  const daysInPeriod = Math.max(1, Math.ceil(
    (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)
  ) + 1)

  // FIX 03/05/2026 (RevPAR > RevPOR su Barronci YoY maggio 2025):
  // Quando non c'e' daily_availability per il periodo storico (tipico del
  // confronto YoY con anni pre-integrazione), il calcolo sopra produce
  // `availableRoomNights = hotelTotalRooms * daysInPeriod`. Ma se i dati RMS
  // o booking indicano che sono state vendute PIU' room nights di cosi'
  // (es. Barronci: 78 sold vs 72 available), il RevPAR risulta > RevPOR
  // che e' matematicamente impossibile (RevPAR = RevPOR * occupancy <= RevPOR).
  //
  // Sanity check: se abbiamo un numero di room nights vendute (soldRoomNights)
  // e questo eccede availableRoomNights, alziamo totalRooms al minimo
  // necessario per rendere soldRoomNights <= availableRoomNights. Questo

  // equivale a dire "se hai venduto 78 notti in 3 giorni, hai almeno 26 camere".
  // FIX 18/06/2026 (OOO): partiamo dalla capacita' fisica (camere*giorni) e
  // sottraiamo le notti-camera realmente chiuse (fuori servizio) rilevate da
  // daily_availability. Cosi' il RevPAR usa la capacita' NETTA vendibile senza
  // reintrodurre il bug "RevPAR>RevPOR" dei dati sporchi (che dipendeva dalla
  // media giornaliera, non dagli OOO).
  let availableRoomNights = Math.max(0, totalRooms * daysInPeriod - oosRoomNights)
  if (soldRoomNights && soldRoomNights > 0 && soldRoomNights > availableRoomNights) {
    // Alza totalRooms al minimo necessario
    const impliedTotalRooms = Math.ceil(soldRoomNights / daysInPeriod)
    if (impliedTotalRooms > totalRooms) {
      totalRooms = impliedTotalRooms
      availableRoomNights = Math.max(0, totalRooms * daysInPeriod - oosRoomNights)
    }
  }

  // Occupancy = vendute / capacita' netta (totale - fuori servizio).
  // clamp a 100%: l'occupazione non puo' superare il 100% (vedi nota Obiettivi
  // 27/06/2026: capacita' storica statica + numeratore da booking fuori capacita').
  const netCapacityFromAvailability = totalRoomsFromAvailability - oosRoomNights
  const occupancy = netCapacityFromAvailability > 0 ? Math.min(100, (occupiedRoomsTotal / netCapacityFromAvailability) * 100) : 0

  return { occupancy, totalRooms, occupiedRoomsTotal, totalRoomsFromAvailability, daysWithData, availableRoomNights }
}

// ──────────────────────────────────────────────────
// ADR and RevPAR
// ──────────────────────────────────────────────────

export function computeADR(totalRevenue: number, roomNights: number): number {
  return roomNights > 0 ? totalRevenue / roomNights : 0
}

export function computeRevPAR(totalRevenue: number, availableRoomNights: number): number {
  return availableRoomNights > 0 ? totalRevenue / availableRoomNights : 0
}

// ──────────────────────────────────────────────────
// Revenue from RMS daily room revenue
// ──────────────────────────────────────────────────

export function computeRevenueFromRMS(rmsData: Array<{ date: string; room_revenue: number }> | null): { totalRevenue: number; roomNights: number } {
  let totalRevenue = 0
  let roomNights = 0
  for (const row of rmsData || []) {
    const rev = Number(row.room_revenue || 0)
    totalRevenue += rev
    if (rev > 0) roomNights++
  }
  return { totalRevenue, roomNights }
}

// ───────���──────────────────────────────────────────
// Channel breakdown from DB-aggregated results
// ──────────────────────────────────────────────────

export function computeChannelBreakdown(
  channelRows: Array<{ channel: string | null; channel_revenue: number; booking_count: number; pickup_days_sum: number; is_ota: boolean }>,
  totalRevenue: number
): {
  bookingsDirectRevenue: number
  bookingsTotalRevenue: number
  totalBookingsCount: number
  totalBookingPickupDays: number
  channelRevenue: Record<string, number>
  directRevenue: number
  intermediatedRevenue: number
} {
  let bookingsDirectRevenue = 0
  let bookingsTotalRevenue = 0
  let totalBookingsCount = 0
  let totalBookingPickupDays = 0
  const channelRevenue: Record<string, number> = {}

  for (const row of channelRows) {
    const rev = Number(row.channel_revenue || 0)
    const count = Number(row.booking_count || 0)
    bookingsTotalRevenue += rev
    totalBookingsCount += count
    totalBookingPickupDays += Number(row.pickup_days_sum || 0)
    if (row.is_ota) {
      channelRevenue[row.channel || "Altro"] = rev
    } else {
      bookingsDirectRevenue += rev
    }
  }

  const directRatio = bookingsTotalRevenue > 0 ? bookingsDirectRevenue / bookingsTotalRevenue : 0.5
  const directRevenue = totalRevenue * directRatio
  const intermediatedRevenue = totalRevenue - directRevenue

  return {
    bookingsDirectRevenue,
    bookingsTotalRevenue,
    totalBookingsCount,
    totalBookingPickupDays,
    channelRevenue,
    directRevenue,
    intermediatedRevenue,
  }
}

// ──────────────────────────────────────────────────
// YoY comparison
// ──────────────────────────────────────────────────

export function computeYoY(currentCount: number, lastYearCount: number): number {
  if (lastYearCount > 0) return ((currentCount - lastYearCount) / lastYearCount) * 100
  return currentCount > 0 ? 100 : 0
}

// ──────────────────────────────────────────────────
// getDashboardMetrics — the main orchestrator
// ──────────────────────────────────────────────────

export async function getDashboardMetrics(
  supabase: any,
  hotelId: string,
  period: string,
  startDate: string,
  endDate: string,
  vatView: VatView | null = null
): Promise<DashboardMetrics> {
  // Calculate YoY dates
  const lastYearStartDate = new Date(startDate)
  lastYearStartDate.setFullYear(lastYearStartDate.getFullYear() - 1)
  const lastYearEndDate = new Date(endDate)
  lastYearEndDate.setFullYear(lastYearEndDate.getFullYear() - 1)
  const lyStartStr = lastYearStartDate.toISOString().split("T")[0]
  const lyEndStr = lastYearEndDate.toISOString().split("T")[0]

  // PERF 03/05/2026: sostituite due query "pesanti" con RPC server-side
  // aggregate, per abbattere il p95 di /api/dashboard/metrics.
  //   1) `rms_daily_room_revenue` aveva ~10.668 righe in 365gg per Barronci.
  //      `fetchAllPaginated` faceva 11 round-trip seriali (~700-1100ms) solo
  //      per calcolare 2 numeri (SUM revenue, COUNT room_nights). Ora `get_rms_revenue_summary`
  //      ritorna direttamente {total_revenue, room_nights} in 1 round-trip (~50ms).
  //   2) `daily_availability` aveva ~5135 righe in 30gg per Barronci (giorni ×
  //      room_types). Il client poi le aggregava in `computeOccupancy` con un
  //      Map per data. Ora `get_daily_availability_summary` aggrega lato Postgres
  //      e ritorna ~30 righe (riduzione payload ~99%).
  // Le RPC sono SECURITY INVOKER → rispettano RLS dell'utente che chiama, stesso
  // contratto di sicurezza delle vecchie SELECT.
  const [
    pmsConfigResult,
    hotelInfoResult,
    channelBreakdownResult,
    cancellationAggResult,
    availabilityResult,
    rmsRevenueResult,
    lyBookingsCountResult,
    lyCancellationsCountResult,
  ] = await Promise.all([
    supabase
      .from("pms_integrations")
      .select("integration_mode, pms_name, config, api_key")
      .eq("hotel_id", hotelId)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("hotels")
      .select("total_rooms, accommodation_type, revenue_vat_mode, accommodation_vat_rate")
      .eq("id", hotelId)
      .maybeSingle(),
    supabase.rpc("get_bookings_channel_breakdown", {
      p_hotel_id: hotelId,
      p_start_date: startDate,
      p_end_date: endDate,
    }),
    supabase.rpc("get_cancellation_aggregates", {
      p_hotel_id: hotelId,
      p_start_date: startDate,
      p_end_date: endDate,
    }),
    withRetry(() =>
      supabase.rpc("get_daily_availability_summary", {
        p_hotel_id: hotelId,
        p_start_date: startDate,
        p_end_date: endDate,
      })
    ),
    withRetry(() =>
      supabase.rpc("get_rms_revenue_summary", {
        p_hotel_id: hotelId,
        p_start_date: startDate,
        p_end_date: endDate,
      })
    ),
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("hotel_id", hotelId)
      .eq("is_cancelled", false)
      .lte("check_in_date", lyEndStr)
      .gt("check_out_date", lyStartStr),
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("hotel_id", hotelId)
      .eq("is_cancelled", true)
      .lte("check_in_date", lyEndStr)
      .gt("check_out_date", lyStartStr),
  ])

  const pmsConfig = pmsConfigResult.data
  const caps = getCapabilities(pmsConfig)
  const isApiMode = caps.has_availability && !!pmsConfig?.api_key
  const hotelInfo = hotelInfoResult.data
  const hotelTotalRooms = hotelInfo?.total_rooms || 25

  // RMS revenue: la nuova RPC ritorna un'unica riga {total_revenue, room_nights}.
  // Per compatibilita' con il flag `useFallback` piu' sotto (che si basa sul
  // fatto che esistano "righe" RMS), considero rmsHasData = room_nights > 0.
  const rmsSummaryRows = (rmsRevenueResult.data ?? []) as Array<{
    total_revenue: number | string
    room_nights: number | string
  }>
  const rmsSummary = rmsSummaryRows[0]
  const rmsTotalRevenue = Number(rmsSummary?.total_revenue ?? 0)
  const rmsRoomNights = Number(rmsSummary?.room_nights ?? 0)
  const rmsHasData = rmsRoomNights > 0 || rmsTotalRevenue > 0

  // Channel breakdown
  const channelRows = channelBreakdownResult.data || []
  // We pass rmsTotalRevenue first to compute the direct/intermediated split ratio
  // from booking channels, then we'll re-apply the ratio to the chosen revenue source.
  const channelTmp = computeChannelBreakdown(channelRows, rmsTotalRevenue)

  // FIX 21/05/2026 — Fallback storico da `daily_production`.
  // Per il PY (Confronto Anno) gli hotel onboardati di recente non hanno
  // bookings nel 2025 ne' rms_daily_room_revenue, ma possono avere righe
  // import storico in `daily_production` (source `manual_import_2025`,
  // `manual_import_*` ecc.). Senza questo fallback la dashboard mostra
  // "Maggio 2025: 0" anche con dati storici importati. Vedi MEMORY.md
  // "Dashboard hardcoded a Scidoo".
  let dpFallbackRevenue = 0
  let dpFallbackRoomNights = 0
  let dpFallbackAvailable = 0
  if (!rmsHasData && channelTmp.bookingsTotalRevenue === 0) {
    const { data: dpRows } = await supabase
      .from("daily_production")
      .select("total_revenue, rooms_occupied, rooms_available, total_rooms, direct_revenue, intermediated_revenue")
      .eq("hotel_id", hotelId)
      .gte("date", startDate)
      .lte("date", endDate)
    for (const r of dpRows || []) {
      dpFallbackRevenue += Number(r.total_revenue || 0)
      dpFallbackRoomNights += Number(r.rooms_occupied || 0)
      dpFallbackAvailable += Number(r.total_rooms || ((Number(r.rooms_available) || 0) + (Number(r.rooms_occupied) || 0)))
    }
  }

  // Fallback: alcuni PMS (es. gsheets/Bedzzle) non popolano rms_daily_room_revenue.
  // In quel caso usiamo la revenue aggregata dai booking (bookingsTotalRevenue) e
  // le room-nights dall'availability (occ.occupiedRoomsTotal). I dati sono già
  // disponibili dalle query parallele sopra.
  // PERF 03/05/2026: prima il check era `rmsRows.length === 0`, ora che la RPC
  // ritorna un summary scalare uso `!rmsHasData` (= room_nights==0 && revenue==0).
  const useFallback = !rmsHasData && channelTmp.bookingsTotalRevenue > 0
  const useDpFallback = !rmsHasData && channelTmp.bookingsTotalRevenue === 0 && dpFallbackRevenue > 0
  const totalRevenue = useDpFallback
    ? dpFallbackRevenue
    : useFallback
      ? channelTmp.bookingsTotalRevenue
      : rmsTotalRevenue
  const roomNights = useDpFallback ? dpFallbackRoomNights : rmsRoomNights
  // Recompute the channel split using the chosen total revenue so direct/intermediated
  // are consistent with the box "Revenue Totale".
  const channel = computeChannelBreakdown(channelRows, totalRevenue)

  // Cancellation data
  const cancellationAgg = (cancellationAggResult.data || [])[0] || {
    cancellation_count: 0,
    cancelled_revenue: 0,
    cancelled_nights: 0,
    pickup_days_sum: 0,
  }
  const cancellationsCount = Number(cancellationAgg.cancellation_count || 0)
  const cancelledRevenue = Number(cancellationAgg.cancelled_revenue || 0)
  const cancelledNights = Number(cancellationAgg.cancelled_nights || 0)

  // Occupancy — passiamo anche le room nights vendute per il sanity check
  // che previene RevPAR > RevPOR quando mancano dati daily_availability
  // per periodi storici (es. confronto YoY).
  const { data: availabilityData } = availabilityResult
  const soldRoomNightsForCheck = rmsRoomNights > 0 ? rmsRoomNights : channelTmp.totalBookingsCount
  const occ = computeOccupancy(
    availabilityData as Array<{ date: string; rooms_available: number; total_rooms: number; rooms_out_of_service?: number }> | null,
    hotelTotalRooms,
    startDate,
    endDate,
    soldRoomNightsForCheck
  )

  // Room/Nights: preferiamo (1) il conteggio "righe RMS con revenue>0" se disponibile,
  // (2) altrimenti l'occupazione effettiva dalla daily_availability (vale per qualsiasi
  // PMS che la popoli, non solo API). Se entrambi assenti, resta a 0.
  // FIX 21/05/2026 — terzo livello: il fallback storico `daily_production`
  // (`dpFallbackRoomNights`) per gli hotel con import manuali del 2025.
  const actualRoomNights = roomNights > 0
    ? roomNights
    : (occ.occupiedRoomsTotal > 0
        ? occ.occupiedRoomsTotal
        : (useDpFallback ? dpFallbackRoomNights : 0))

  // KPIs (usiamo actualRoomNights per RevPOR/ADR così il fallback dei PMS senza
  // rms_daily_room_revenue continua a produrre valori sensati).
  // FIX 21/05/2026 — denominatore RevPAR: se `daily_availability` non ha
  // dati per il periodo (PY storico), usiamo il totale camere×giorni dal
  // fallback `daily_production` (dpFallbackAvailable), altrimenti
  // `occ.availableRoomNights`.
  const availableRoomNightsForRevPar = occ.availableRoomNights > 0
    ? occ.availableRoomNights
    : (useDpFallback ? dpFallbackAvailable : 0)
  const revpar = computeRevPAR(totalRevenue, availableRoomNightsForRevPar)
  const adr = computeADR(totalRevenue, actualRoomNights)

  // Pick Up Times
  const avgBookingPickup = channel.totalBookingsCount > 0
    ? channel.totalBookingPickupDays / channel.totalBookingsCount
    : 0
  const avgCancellationPickup = cancellationsCount > 0
    ? Number(cancellationAgg.pickup_days_sum || 0) / cancellationsCount
    : 0

  // YoY
  const lyBookingsCount = lyBookingsCountResult.count || 0
  const lyCancellationsCount = lyCancellationsCountResult.count || 0
  const bookingsYoY = computeYoY(channel.totalBookingsCount, lyBookingsCount)
  const cancellationsYoY = computeYoY(cancellationsCount, lyCancellationsCount)

  // Visualizzazione IVA (preferenza tenant). Gli importi sono memorizzati LORDI;
  // se mode==='excluded' scorporiamo a netto SOLO i KPI camera con l'aliquota
  // alloggio (sono già "solo camera"). Occupancy/roomNights/conteggi invariati.
  const vatCfg: VatDisplayConfig = resolveVatConfig(
    toVatConfig(hotelInfo?.revenue_vat_mode, hotelInfo?.accommodation_vat_rate),
    vatView,
  )
  const vatNet = (v: number) => (vatCfg.mode === "excluded" ? netFromGross(v, vatCfg.accommodationRate) : v)
  const channelRevenueOut: Record<string, number> = {}
  for (const [k, v] of Object.entries(channel.channelRevenue)) {
    channelRevenueOut[k] = vatNet(Number(v) || 0)
  }

  return {
    totalRevenue: vatNet(totalRevenue),
    directRevenue: vatNet(channel.directRevenue),
    intermediatedRevenue: vatNet(channel.intermediatedRevenue),
    channelRevenue: channelRevenueOut,
    roomNights: actualRoomNights,
    revpar: vatNet(revpar),
    revpor: vatNet(adr),
    adr: vatNet(adr),
    occupancy: occ.occupancy,
    bookingsCount: channel.totalBookingsCount,
    cancelledRevenue: vatNet(cancelledRevenue),
    vatMode: vatCfg.mode,
    accommodationVatRate: vatCfg.accommodationRate,
    cancelledNights,
    cancellationsCount,
    avgBookingPickup,
    avgCancellationPickup,
    lyBookingsCount,
    lyCancellationsCount,
    bookingsYoY,
    cancellationsYoY,
    period,
    startDate,
    endDate,
  }
}

// ──────────────────────────────────────────────────
// Date selector handler
// ──────────────────────────────────────────────────

export async function getDateSelectorData(
  supabase: any,
  hotelId: string,
  date: string
): Promise<DateSelectorResult> {
  const [bookingsResult, cancellationsResult] = await Promise.all([
    supabase
      .from("bookings")
      .select("pms_booking_id, check_in_date, check_out_date, total_price, number_of_nights, booking_date, channel")
      .eq("hotel_id", hotelId)
      .eq("is_cancelled", false)
      .gte("booking_date", date)
      .lte("booking_date", date),
    supabase
      .from("bookings")
      .select("pms_booking_id, check_in_date, check_out_date, total_price, number_of_nights, cancellation_date, channel")
      .eq("hotel_id", hotelId)
      .eq("is_cancelled", true)
      .gte("cancellation_date", date)
      .lte("cancellation_date", date),
  ])

  const bookings = (bookingsResult.data || []).map((b: any) => ({
    ...b,
    checkin_date: b.check_in_date,
    checkout_date: b.check_out_date,
    total_amount: Number(b.total_price || 0),
    num_nights: Number(b.number_of_nights || 1),
    scidoo_booking_id: b.pms_booking_id,
  }))

  const cancellations = (cancellationsResult.data || []).map((c: any) => ({
    ...c,
    checkin_date: c.check_in_date,
    checkout_date: c.check_out_date,
    lost_revenue: Number(c.total_price || 0),
    lost_room_nights: Number(c.number_of_nights || 1),
    scidoo_booking_id: c.pms_booking_id,
  }))

  return { bookings, cancellations }
}
