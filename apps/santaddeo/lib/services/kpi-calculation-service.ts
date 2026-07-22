/**
 * KPI Calculation Service
 *
 * Calcola i KPI (RevPAR, RevPOR, ADR, Occupancy%) quando non sono forniti dal PMS.
 * Se il PMS fornisce i dati mappati, vengono usati quelli; altrimenti si calcolano.
 */

import { createServiceRoleClient } from "@/lib/supabase/server"

export interface KPIData {
  date: string
  hotel_id: string

  // Occupancy
  rooms_available: number
  rooms_sold: number
  occupancy_rate: number // percentage

  // Revenue
  room_revenue: number
  total_revenue: number

  // KPIs
  adr: number // Average Daily Rate = Room Revenue / Rooms Sold
  revpar: number // Revenue Per Available Room = Room Revenue / Rooms Available
  revpor: number // Revenue Per Occupied Room = Total Revenue / Rooms Sold
  goppar?: number // Gross Operating Profit Per Available Room (if cost data available)

  // Source
  source: "pms" | "calculated"
}

export interface KPICalculationParams {
  hotelId: string
  startDate: string
  endDate: string
}

/**
 * Verifica se il PMS fornisce i KPI direttamente
 */
async function checkPMSKPIMappings(hotelId: string): Promise<{
  hasOccupancy: boolean
  hasRevenue: boolean
  hasADR: boolean
  hasRevPAR: boolean
  hasRevPOR: boolean
}> {
  const supabase = await createServiceRoleClient()

  const { data: mappings } = await supabase
    .from("pms_rms_mappings")
    .select("pms_entity_type, rms_code")
    .or(`hotel_id.eq.${hotelId},hotel_id.is.null`)

  const mappedCodes = new Set(mappings?.map((m) => m.rms_code) || [])

  return {
    hasOccupancy: mappedCodes.has("OCCUPANCY_RATE") || mappedCodes.has("ROOMS_SOLD"),
    hasRevenue: mappedCodes.has("ROOM_REVENUE") || mappedCodes.has("TOTAL_REVENUE"),
    hasADR: mappedCodes.has("ADR"),
    hasRevPAR: mappedCodes.has("REVPAR"),
    hasRevPOR: mappedCodes.has("REVPOR"),
  }
}

/**
 * Recupera i dati KPI dal PMS (se mappati)
 */
async function getKPIFromPMS(hotelId: string, startDate: string, endDate: string): Promise<KPIData[] | null> {
  const supabase = await createServiceRoleClient()

  // Check if fiscal_production data exists for this hotel
  const { data: fiscalData, error } = await supabase
    .schema("connectors")
    .from("scidoo_raw_fiscal_production")
    .select("*")
    .eq("hotel_id", hotelId)
    .gte("date", startDate)
    .lte("date", endDate)

  if (error || !fiscalData || fiscalData.length === 0) {
    return null
  }

  // If PMS provides KPI data directly, use it
  // This would be enhanced based on actual PMS data structure
  return null
}

/**
 * Calcola i KPI dalle prenotazioni e disponibilità
 * Usa le stesse fonti dati del dashboard per coerenza
 */
async function calculateKPIFromBookings(hotelId: string, startDate: string, endDate: string): Promise<KPIData[]> {
  const supabase = await createServiceRoleClient()
  const results: KPIData[] = []

  // Get room types count for this hotel
  const { data: roomTypes } = await supabase
    .from("room_types")
    .select("id, total_rooms")
    .eq("hotel_id", hotelId)
    .eq("is_active", true)

  const totalRoomsAvailable = roomTypes?.reduce((sum, rt) => sum + (rt.total_rooms || 1), 0) || 0

  // Try to get revenue from daily_production (same source as dashboard)
  // Columns: total_revenue, rooms_occupied, adr, revpar, occupancy_rate
  const { data: dailyProduction } = await supabase
    .from("daily_production")
    .select("date, total_revenue, rooms_occupied, adr, revpar, occupancy_rate")
    .eq("hotel_id", hotelId)
    .gte("date", startDate)
    .lte("date", endDate)

  // Fallback: Try rms_daily_room_revenue if daily_production is empty
  // This table has per-booking rows (room_revenue, booking_id, status) - needs aggregation
  let rmsRevenueAggregated: { date: string; revenue: number; roomsSold: number }[] = []
  if (!dailyProduction || dailyProduction.length === 0) {
    const { data: rmsData } = await supabase
      .from("rms_daily_room_revenue")
      .select("date, room_revenue, booking_id")
      .eq("hotel_id", hotelId)
      .gte("date", startDate)
      .lte("date", endDate)

    // Aggregate per-booking rows by date
    const byDate = new Map<string, { revenue: number; bookings: Set<string> }>()
    for (const row of rmsData || []) {
      const existing = byDate.get(row.date) || { revenue: 0, bookings: new Set<string>() }
      existing.revenue += Number(row.room_revenue) || 0
      if (row.booking_id) existing.bookings.add(row.booking_id)
      byDate.set(row.date, existing)
    }
    for (const [date, data] of byDate) {
      rmsRevenueAggregated.push({ date, revenue: data.revenue, roomsSold: data.bookings.size })
    }
  }

  // Build revenue map from production data
  // daily_production has pre-calculated KPIs (adr, revpar, occupancy_rate) that are more reliable
  // than rooms_occupied which can be 0 even when occupancy is 100%
  const revenueMap = new Map<string, { revenue: number; roomsSold: number; pmsAdr?: number; pmsRevpar?: number; pmsOccupancy?: number }>()
  if (dailyProduction && dailyProduction.length > 0) {
    for (const prod of dailyProduction) {
      const pmsOccupancy = Number(prod.occupancy_rate) || 0
      const pmsAdr = Number(prod.adr) || 0
      const pmsRevpar = Number(prod.revpar) || 0
      // Derive rooms_sold from occupancy_rate if rooms_occupied is 0
      const roomsOccupied = Number(prod.rooms_occupied) || 0
      const derivedRoomsSold = roomsOccupied > 0 
        ? roomsOccupied 
        : Math.round(totalRoomsAvailable * pmsOccupancy / 100)

      revenueMap.set(prod.date, {
        revenue: Number(prod.total_revenue) || 0,
        roomsSold: derivedRoomsSold,
        pmsAdr,
        pmsRevpar,
        pmsOccupancy,
      })
    }
  } else {
    for (const agg of rmsRevenueAggregated) {
      revenueMap.set(agg.date, {
        revenue: agg.revenue,
        roomsSold: agg.roomsSold,
      })
    }
  }

  // Get availability from rms_availability_daily (used by dashboard)
  // Columns: total_rooms, rooms_available (NO rooms_sold - must be calculated)
  const { data: rmsAvailability } = await supabase
    .from("rms_availability_daily")
    .select("date, rooms_available, total_rooms")
    .eq("hotel_id", hotelId)
    .gte("date", startDate)
    .lte("date", endDate)

  // Fallback to daily_availability if rms_availability_daily is empty
  let availability: any[] = rmsAvailability || []
  if (availability.length === 0) {
    const { data: dailyAvail } = await supabase
      .from("daily_availability")
      .select("date, room_type_id, total_rooms, rooms_available")
      .eq("hotel_id", hotelId)
      .gte("date", startDate)
      .lte("date", endDate)
    availability = dailyAvail || []
  }

  // Build availability map (rooms_sold = total_rooms - rooms_available)
  const availabilityMap = new Map<string, { totalRooms: number; roomsSold: number }>()
  for (const a of availability) {
    const date = a.date
    const totalRooms = a.total_rooms || 0
    const roomsAvailable = a.rooms_available || 0
    const roomsSold = totalRooms - roomsAvailable

    const existing = availabilityMap.get(date) || { totalRooms: 0, roomsSold: 0 }
    availabilityMap.set(date, {
      totalRooms: existing.totalRooms + totalRooms,
      roomsSold: existing.roomsSold + Math.max(0, roomsSold),
    })
  }

  // Calculate daily KPIs
  // IMPORTANT: Use pre-calculated KPIs from daily_production (adr, revpar, occupancy_rate)
  // when available, as they come directly from the PMS and are more reliable than
  // recalculating from rooms_occupied/total_revenue (which can be incomplete)
  const dateRange = getDateRange(startDate, endDate)

  for (const date of dateRange) {
    const dayAvail = availabilityMap.get(date)
    const dayRevenue = revenueMap.get(date)

    // Use real availability data if present, otherwise fallback to room_types total
    const roomsAvailableTotal = dayAvail?.totalRooms || totalRoomsAvailable
    const roomsSold = dayRevenue?.roomsSold || dayAvail?.roomsSold || 0
    const roomRevenue = dayRevenue?.revenue || 0
    const totalRevenue = roomRevenue

    // Prefer PMS pre-calculated KPIs over recalculated values
    const hasPmsKPIs = dayRevenue?.pmsAdr !== undefined && dayRevenue?.pmsOccupancy !== undefined
    
    const occupancyRate = hasPmsKPIs && dayRevenue!.pmsOccupancy! > 0
      ? dayRevenue!.pmsOccupancy!
      : roomsAvailableTotal > 0 ? (roomsSold / roomsAvailableTotal) * 100 : 0

    const adr = hasPmsKPIs && dayRevenue!.pmsAdr! > 0
      ? dayRevenue!.pmsAdr!
      : roomsSold > 0 ? roomRevenue / roomsSold : 0

    const revpar = hasPmsKPIs && dayRevenue!.pmsRevpar! > 0
      ? dayRevenue!.pmsRevpar!
      : roomsAvailableTotal > 0 ? roomRevenue / roomsAvailableTotal : 0

    const revpor = roomsSold > 0 ? totalRevenue / roomsSold : 0

    results.push({
      date,
      hotel_id: hotelId,
      rooms_available: roomsAvailableTotal,
      rooms_sold: roomsSold,
      // clamp a 100%: l'occupazione non puo' superare il 100% (vedi nota Obiettivi 27/06/2026).
      occupancy_rate: Math.min(100, Math.round(occupancyRate * 100) / 100),
      room_revenue: Math.round(roomRevenue * 100) / 100,
      total_revenue: Math.round(totalRevenue * 100) / 100,
      adr: Math.round(adr * 100) / 100,
      revpar: Math.round(revpar * 100) / 100,
      revpor: Math.round(revpor * 100) / 100,
      source: hasPmsKPIs ? "pms" : "calculated",
    })
  }

  return results
}

/**
 * Main function: Get KPIs - from PMS if mapped, otherwise calculate
 */
export async function getKPIs(params: KPICalculationParams): Promise<KPIData[]> {
  const { hotelId, startDate, endDate } = params

  // First, check if PMS provides KPIs directly
  const pmsKPIs = await getKPIFromPMS(hotelId, startDate, endDate)

  if (pmsKPIs && pmsKPIs.length > 0) {
    return pmsKPIs
  }

  // Otherwise, calculate from bookings and availability
  return calculateKPIFromBookings(hotelId, startDate, endDate)
}

/**
 * Get aggregated KPIs for a period
 */
export async function getAggregatedKPIs(params: KPICalculationParams): Promise<{
  period: { start: string; end: string }
  totals: {
    rooms_available: number
    rooms_sold: number
    room_revenue: number
    total_revenue: number
  }
  averages: {
    occupancy_rate: number
    adr: number
    revpar: number
    revpor: number
  }
  source: "pms" | "calculated"
}> {
  const dailyKPIs = await getKPIs(params)

  if (dailyKPIs.length === 0) {
    return {
      period: { start: params.startDate, end: params.endDate },
      totals: { rooms_available: 0, rooms_sold: 0, room_revenue: 0, total_revenue: 0 },
      averages: { occupancy_rate: 0, adr: 0, revpar: 0, revpor: 0 },
      source: "calculated",
    }
  }

  const totals = dailyKPIs.reduce(
    (acc, kpi) => ({
      rooms_available: acc.rooms_available + kpi.rooms_available,
      rooms_sold: acc.rooms_sold + kpi.rooms_sold,
      room_revenue: acc.room_revenue + kpi.room_revenue,
      total_revenue: acc.total_revenue + kpi.total_revenue,
    }),
    { rooms_available: 0, rooms_sold: 0, room_revenue: 0, total_revenue: 0 },
  )

  const days = dailyKPIs.length
  const avgOccupancy = totals.rooms_available > 0 ? (totals.rooms_sold / totals.rooms_available) * 100 : 0
  const avgADR = totals.rooms_sold > 0 ? totals.room_revenue / totals.rooms_sold : 0
  const avgRevPAR = totals.rooms_available > 0 ? totals.room_revenue / totals.rooms_available : 0
  const avgRevPOR = totals.rooms_sold > 0 ? totals.total_revenue / totals.rooms_sold : 0

  return {
    period: { start: params.startDate, end: params.endDate },
    totals,
    averages: {
      occupancy_rate: Math.round(avgOccupancy * 100) / 100,
      adr: Math.round(avgADR * 100) / 100,
      revpar: Math.round(avgRevPAR * 100) / 100,
      revpor: Math.round(avgRevPOR * 100) / 100,
    },
    source: dailyKPIs[0]?.source || "calculated",
  }
}

// Helper functions
function getDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = []
  const current = new Date(startDate)
  const end = new Date(endDate)

  while (current <= end) {
    dates.push(current.toISOString().split("T")[0])
    current.setDate(current.getDate() + 1)
  }

  return dates
}

function daysBetween(date1: string, date2: string): number {
  const d1 = new Date(date1)
  const d2 = new Date(date2)
  const diffTime = Math.abs(d2.getTime() - d1.getTime())
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}
