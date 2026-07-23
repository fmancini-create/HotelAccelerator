import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Replica FEDELE delle formule KPI della dashboard Santaddeo V1.
 *
 * Fonte di verità: apps/santaddeo/lib/services/metrics.service.ts
 * (getDashboardMetrics + computeOccupancy/computeADR/computeRevPAR) e
 * apps/santaddeo/lib/utils/vat-display.ts. Questo file NON inventa formule:
 * porta qui la stessa pipeline, usando le STESSE RPC del DB Santaddeo
 * (get_rms_revenue_summary, get_daily_availability_summary,
 * get_bookings_channel_breakdown) così i numeri combaciano con la dashboard V1.
 *
 * REGOLE: solo SELECT/RPC read-only; scoping esplicito su hotel_id in ogni
 * chiamata; nessun dato → null (mai 0 spacciato per dato certo).
 */

export interface SantaddeoKpiResult {
  /** Revenue camere del periodo (lordo o netto secondo preferenza IVA hotel, come V1). */
  revenueMonth: number | null
  /** Occupazione % (vendute / capacità netta, clamp 100) — come computeOccupancy V1. */
  occupancyAvg: number | null
  /** ADR = revenue / room nights vendute — come computeADR V1. */
  adr: number | null
  /** RevPAR = revenue / room nights disponibili nette — come computeRevPAR V1. */
  revpar: number | null
  /** Room nights vendute nel periodo (actualRoomNights V1). */
  roomsSold: number | null
  /** Room nights disponibili nette nel periodo (availableRoomNights V1). */
  roomsAvailable: number | null
  /** Capacità fisica hotel (hotels.total_rooms, o max giornaliero come V1). */
  hotelTotalRooms: number | null
  /** Ultima data con dati di produzione/availability nel periodo. */
  lastDataDate: string | null
  /** Nome hotel dal DB Santaddeo (verifica mapping). */
  hotelName: string | null
  /** Fonte revenue usata, per trasparenza in validazione. */
  revenueSource: "rms" | "bookings" | "daily_production" | "none"
  /** Modalità IVA applicata (preferenza tenant, come dashboard V1). */
  vatMode: "included" | "excluded"
}

/** netFromGross — identica a apps/santaddeo/lib/utils/vat-display.ts */
function netFromGross(gross: number, ratePct: number): number {
  if (!Number.isFinite(gross)) return gross
  const r = Number(ratePct)
  if (!Number.isFinite(r) || r <= 0) return gross
  return gross / (1 + r / 100)
}

interface AvailabilityRow {
  date: string
  rooms_available: number
  total_rooms: number
  rooms_out_of_service?: number
}

/**
 * computeOccupancy — port fedele da metrics.service.ts (fix 02/05, 03/05,
 * 18/06/2026): vendute = total - available - oos per data; capacità fisica da
 * hotels.total_rooms (fallback MAX giornaliero, mai la media); capacità netta
 * = camere × giorni - notti OOS, con sanity check sold<=available; occupancy
 * = vendute / capacità netta osservata, clamp 100%.
 */
function computeOccupancy(
  availabilityData: AvailabilityRow[] | null,
  hotelTotalRooms: number,
  startDate: string,
  endDate: string,
  soldRoomNights?: number,
): {
  occupancy: number
  totalRooms: number
  occupiedRoomsTotal: number
  totalRoomsFromAvailability: number
  daysWithData: number
  availableRoomNights: number
} {
  let totalRoomsFromAvailability = 0
  let occupiedRoomsTotal = 0
  let oosRoomNights = 0
  let daysWithData = 0
  let maxDailyTotal = 0

  if (availabilityData && availabilityData.length > 0) {
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
      occupiedRoomsTotal += Math.max(0, dayData.total - dayData.available - dayData.oos)
      if (dayData.total > maxDailyTotal) maxDailyTotal = dayData.total
    }
  }

  let totalRooms: number
  if (hotelTotalRooms && hotelTotalRooms > 0) {
    totalRooms = hotelTotalRooms
  } else if (maxDailyTotal > 0) {
    totalRooms = maxDailyTotal
  } else {
    totalRooms = 0
  }

  const daysInPeriod = Math.max(
    1,
    Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1,
  )

  let availableRoomNights = Math.max(0, totalRooms * daysInPeriod - oosRoomNights)
  if (soldRoomNights && soldRoomNights > 0 && soldRoomNights > availableRoomNights) {
    const impliedTotalRooms = Math.ceil(soldRoomNights / daysInPeriod)
    if (impliedTotalRooms > totalRooms) {
      totalRooms = impliedTotalRooms
      availableRoomNights = Math.max(0, totalRooms * daysInPeriod - oosRoomNights)
    }
  }

  const netCapacityFromAvailability = totalRoomsFromAvailability - oosRoomNights
  const occupancy =
    netCapacityFromAvailability > 0 ? Math.min(100, (occupiedRoomsTotal / netCapacityFromAvailability) * 100) : 0

  return { occupancy, totalRooms, occupiedRoomsTotal, totalRoomsFromAvailability, daysWithData, availableRoomNights }
}

/** computeADR — identica a V1. */
function computeADR(totalRevenue: number, roomNights: number): number {
  return roomNights > 0 ? totalRevenue / roomNights : 0
}

/** computeRevPAR — identica a V1. */
function computeRevPAR(totalRevenue: number, availableRoomNights: number): number {
  return availableRoomNights > 0 ? totalRevenue / availableRoomNights : 0
}

/**
 * Calcola i KPI del periodo replicando la pipeline getDashboardMetrics di V1
 * (limitata ai KPI della card). Ogni query/RPC è scopata su hotelId.
 */
export async function getSantaddeoKpis(
  santaddeo: SupabaseClient,
  hotelId: string,
  startDate: string,
  endDate: string,
): Promise<SantaddeoKpiResult> {
  // Query parallele — stesse fonti dell'orchestratore V1.
  const [hotelRes, rmsRes, availRes, channelRes] = await Promise.all([
    santaddeo
      .from("hotels")
      .select("name, total_rooms, revenue_vat_mode, accommodation_vat_rate")
      .eq("id", hotelId)
      .maybeSingle(),
    santaddeo.rpc("get_rms_revenue_summary", {
      p_hotel_id: hotelId,
      p_start_date: startDate,
      p_end_date: endDate,
    }),
    santaddeo.rpc("get_daily_availability_summary", {
      p_hotel_id: hotelId,
      p_start_date: startDate,
      p_end_date: endDate,
    }),
    santaddeo.rpc("get_bookings_channel_breakdown", {
      p_hotel_id: hotelId,
      p_start_date: startDate,
      p_end_date: endDate,
    }),
  ])

  const hotelInfo = hotelRes.data as {
    name?: string
    total_rooms?: number
    revenue_vat_mode?: string
    accommodation_vat_rate?: number
  } | null
  // V1 usa `|| 25` come default; qui NO: senza dato certo lasciamo 0 e
  // computeOccupancy usa il MAX giornaliero osservato (fallback V1 successivo).
  const hotelTotalRooms = Number(hotelInfo?.total_rooms) || 0

  // 1) Revenue primaria: RPC get_rms_revenue_summary → {total_revenue, room_nights}
  const rmsRows = (rmsRes.data ?? []) as Array<{ total_revenue: number | string; room_nights: number | string }>
  const rmsSummary = rmsRows[0]
  const rmsTotalRevenue = Number(rmsSummary?.total_revenue ?? 0)
  const rmsRoomNights = Number(rmsSummary?.room_nights ?? 0)
  const rmsHasData = rmsRoomNights > 0 || rmsTotalRevenue > 0

  // 2) Fallback bookings (come V1: somma channel_revenue del breakdown).
  const channelRows = (channelRes.data ?? []) as Array<{ channel_revenue: number | string; booking_count: number | string }>
  let bookingsTotalRevenue = 0
  for (const row of channelRows) bookingsTotalRevenue += Number(row.channel_revenue || 0)

  // 3) Fallback storico daily_production (fix V1 21/05/2026) — solo se serve.
  let dpFallbackRevenue = 0
  let dpFallbackRoomNights = 0
  let dpFallbackAvailable = 0
  let dpLastDate: string | null = null
  if (!rmsHasData && bookingsTotalRevenue === 0) {
    const { data: dpRows } = await santaddeo
      .from("daily_production")
      .select("date, total_revenue, rooms_occupied, rooms_available, total_rooms")
      .eq("hotel_id", hotelId)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: true })
    for (const r of dpRows || []) {
      dpFallbackRevenue += Number(r.total_revenue || 0)
      dpFallbackRoomNights += Number(r.rooms_occupied || 0)
      dpFallbackAvailable += Number(r.total_rooms || (Number(r.rooms_available) || 0) + (Number(r.rooms_occupied) || 0))
      dpLastDate = String(r.date)
    }
  }

  const useFallback = !rmsHasData && bookingsTotalRevenue > 0
  const useDpFallback = !rmsHasData && bookingsTotalRevenue === 0 && dpFallbackRevenue > 0
  const revenueSource: SantaddeoKpiResult["revenueSource"] = rmsHasData
    ? "rms"
    : useFallback
      ? "bookings"
      : useDpFallback
        ? "daily_production"
        : "none"

  const totalRevenue = useDpFallback ? dpFallbackRevenue : useFallback ? bookingsTotalRevenue : rmsTotalRevenue
  const roomNights = useDpFallback ? dpFallbackRoomNights : rmsRoomNights

  // Occupancy — stesso sanity check V1 (sold nights per prevenire RevPAR>RevPOR).
  const availabilityData = (availRes.data ?? []) as AvailabilityRow[]
  const totalBookingsCount = channelRows.reduce((s, r) => s + Number(r.booking_count || 0), 0)
  const soldRoomNightsForCheck = rmsRoomNights > 0 ? rmsRoomNights : totalBookingsCount
  const occ = computeOccupancy(availabilityData, hotelTotalRooms, startDate, endDate, soldRoomNightsForCheck)

  // actualRoomNights — cascata V1: RMS → availability → daily_production.
  const actualRoomNights =
    roomNights > 0 ? roomNights : occ.occupiedRoomsTotal > 0 ? occ.occupiedRoomsTotal : useDpFallback ? dpFallbackRoomNights : 0

  // Denominatore RevPAR — cascata V1.
  const availableRoomNightsForRevPar =
    occ.availableRoomNights > 0 ? occ.availableRoomNights : useDpFallback ? dpFallbackAvailable : 0

  const revparGross = computeRevPAR(totalRevenue, availableRoomNightsForRevPar)
  const adrGross = computeADR(totalRevenue, actualRoomNights)

  // IVA — stessa preferenza tenant della dashboard V1 (default: lordo).
  const vatMode: "included" | "excluded" = hotelInfo?.revenue_vat_mode === "excluded" ? "excluded" : "included"
  const rate = Number(hotelInfo?.accommodation_vat_rate)
  const vatRate = Number.isFinite(rate) && rate >= 0 && rate < 100 ? rate : 10
  const vatNet = (v: number) => (vatMode === "excluded" ? netFromGross(v, vatRate) : v)

  // Ultima data con dati (per "aggiornato al").
  let lastDataDate: string | null = dpLastDate
  for (const row of availabilityData) {
    if (!lastDataDate || row.date > lastDataDate) lastDataDate = row.date
  }

  // Regola dati certi: se NESSUNA fonte ha dati, tutto null (mai 0 finto).
  const hasAnyData = revenueSource !== "none" || availabilityData.length > 0
  if (!hasAnyData) {
    return {
      revenueMonth: null,
      occupancyAvg: null,
      adr: null,
      revpar: null,
      roomsSold: null,
      roomsAvailable: null,
      hotelTotalRooms: hotelTotalRooms > 0 ? hotelTotalRooms : null,
      lastDataDate: null,
      hotelName: hotelInfo?.name ?? null,
      revenueSource,
      vatMode,
    }
  }

  const round2 = (v: number) => Math.round(v * 100) / 100

  return {
    revenueMonth: revenueSource !== "none" ? round2(vatNet(totalRevenue)) : null,
    occupancyAvg: availabilityData.length > 0 ? round2(occ.occupancy) : null,
    adr: actualRoomNights > 0 && revenueSource !== "none" ? round2(vatNet(adrGross)) : null,
    revpar: availableRoomNightsForRevPar > 0 && revenueSource !== "none" ? round2(vatNet(revparGross)) : null,
    roomsSold: actualRoomNights > 0 ? actualRoomNights : availabilityData.length > 0 ? occ.occupiedRoomsTotal : null,
    roomsAvailable: availableRoomNightsForRevPar > 0 ? availableRoomNightsForRevPar : null,
    hotelTotalRooms: occ.totalRooms > 0 ? occ.totalRooms : null,
    lastDataDate,
    hotelName: hotelInfo?.name ?? null,
    revenueSource,
    vatMode,
  }
}
