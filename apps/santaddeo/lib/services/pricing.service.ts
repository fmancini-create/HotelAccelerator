/**
 * Pricing Service
 * Extracts channel-production grid logic from /api/accelerator/channel-production.
 * Uses raw fetch to Supabase REST API (same pattern as the route).
 * Caching and auth remain in the route.
 *
 * NOTE: triggerRecalculation is NOT moved here -- it lives in
 * lib/pricing/auto-trigger.ts and is called by the ETL orchestrator,
 * not by the channel-production route. Re-exporting for convenience.
 */

export { triggerPriceRecalculation as triggerRecalculation } from "@/lib/pricing/auto-trigger"

// ──────────────────────────────────────────────────
// Raw Supabase REST query helper
// ──────────────────────────────────────────────────

const PROD_URL = "https://aeynirkfixurikshxfov.supabase.co"

function getServiceKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SANTADDEO_SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY non configurata")
  return key
}

async function prodQuery(table: string, params: Record<string, string>): Promise<any[]> {
  const parts: string[] = []
  for (const [k, v] of Object.entries(params)) {
    if (v.includes("&")) {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v.split("&")[0])}`)
      const extra = v.split("&").slice(1)
      for (const seg of extra) parts.push(seg)
    } else {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    }
  }
  const url = `${PROD_URL}/rest/v1/${table}?${parts.join("&")}`
  const res = await fetch(url, {
    headers: {
      apikey: getServiceKey(),
      Authorization: `Bearer ${getServiceKey()}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      "Range-Unit": "items",
      Range: "0-9999",
    },
    cache: "no-store",
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    console.error(`[pricing.service] prodQuery error: ${res.status} ${res.statusText} table=${table} body=${body.slice(0, 200)}`)
    return []
  }
  return res.json()
}

// ──────────────────────────────────────────────────
// Shared helper
// ──────────────────────────────────────────────────

function dateRange(start: string, end: string): string[] {
  const dates: string[] = []
  let d = new Date(start)
  const endD = new Date(end)
  while (d < endD) {
    dates.push(d.toISOString().split("T")[0])
    d.setDate(d.getDate() + 1)
  }
  return dates
}

// ──────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────

export interface PricingGridResult {
  roomTypes: any[]
  rates: any[]
  channels: string[]
  dailyPrices: Record<string, Record<string, number>>
  dailyCounts: Record<string, Record<string, number>>
  dailyPricesByRate: Record<string, Record<string, Record<string, number>>>
  dailyRevenueByDate: Record<string, number>
  occupancy: Record<string, Record<string, { occupied: number; total: number; available: number }>>
  prevYear: Record<string, { total_revenue: number; rooms_occupied: number; adr: number; occupancy_rate: number }>
  bookingsCount: number
  etlRowsCount: number
}

// ──────────────────────────────────────────────────
// getPricingGrid — main function
// ──────────────────────────────────────────────────

export async function getPricingGrid(
  hotelId: string,
  monthStart: string,
  monthEnd: string,
  prevMonthStart: string,
  prevMonthEnd: string
): Promise<PricingGridResult> {
  const [roomTypes, rates, currentBookings, availability, prevYearAvailability, etlRevenue, prevYearEtlRevenue, prevYearDailyProduction] = await Promise.all([
    prodQuery("room_types", {
      select: "id,name,scidoo_room_type_id,pms_room_type_id,display_order,is_active,total_rooms",
      hotel_id: `eq.${hotelId}`,
      order: "display_order.asc.nullslast,name.asc",
    }),
    prodQuery("rates", { select: "*", hotel_id: `eq.${hotelId}` }),
    prodQuery("bookings", {
      select: "id,room_type_id,check_in_date,check_out_date,total_price,price_per_night,number_of_nights,channel,is_cancelled",
      hotel_id: `eq.${hotelId}`,
      is_cancelled: "eq.false",
      check_in_date: `lte.${monthEnd}`,
      check_out_date: `gt.${monthStart}`,
    }),
    prodQuery("rms_availability_daily", {
      select: "date,room_type_id,total_rooms,rooms_available,rooms_out_of_service",
      hotel_id: `eq.${hotelId}`,
      date: `gte.${monthStart}&date=lte.${monthEnd}`,
    }),
    prodQuery("rms_availability_daily", {
      select: "date,room_type_id,total_rooms,rooms_available,rooms_out_of_service",
      hotel_id: `eq.${hotelId}`,
      date: `gte.${prevMonthStart}&date=lte.${prevMonthEnd}`,
    }),
    prodQuery("scidoo_raw_bookings", {
      select: "scidoo_booking_id,room_type_name,channel,checkin_date,checkout_date,status,raw_data",
      hotel_id: `eq.${hotelId}`,
      status: "neq.annullata",
      checkin_date: `lte.${monthEnd}`,
      checkout_date: `gte.${monthStart}`,
    }),
    // Previous year: use scidoo_raw_bookings as the source of truth, identical
    // to the current-year ETL path. The legacy "bookings" table is skewed
    // (~2x revenue, ~2x nights vs Scidoo) so we must NOT use it for YoY.
    prodQuery("scidoo_raw_bookings", {
      select: "scidoo_booking_id,room_type_name,channel,checkin_date,checkout_date,status,raw_data",
      hotel_id: `eq.${hotelId}`,
      status: "neq.annullata",
      checkin_date: `lte.${prevMonthEnd}`,
      checkout_date: `gte.${prevMonthStart}`,
    }),
    // FIX 21/05/2026: per gli hotel non-Scidoo (es. Cavallino su BRiG) lo
    // storico anno precedente vive in `daily_production` (source =
    // manual_import_2025). scidoo_raw_bookings e public.bookings sono
    // entrambi vuoti per il 2025, quindi prevYearMap restava vuoto e la UI
    // del pricing mostrava "—" su Produzione/Camere/RevPOR di un anno fa.
    // Fallback hotel-level (non per room_type, sufficiente per i totali
    // mostrati nelle 3 righe summary del pricing).
    prodQuery("daily_production", {
      select: "date,total_revenue,rooms_occupied,total_rooms,adr,occupancy_rate",
      hotel_id: `eq.${hotelId}`,
      date: `gte.${prevMonthStart}&date=lte.${prevMonthEnd}`,
    }),
  ])

  // Filter inactive room types
  const activeRoomTypes = (roomTypes || []).filter((rt: any) => rt.is_active !== false)

  // --- Channel breakdown from bookings ---
  const dailyPricesByRoomTypeAndChannel: Record<string, Record<string, Record<string, number>>> = {}
  const channels = new Set<string>()

  for (const booking of currentBookings || []) {
    const rtId = booking.room_type_id
    if (!rtId) continue
    const channelKey = (booking.channel && String(booking.channel).trim()) || "Non specificato"
    channels.add(channelKey)
    const checkinStr = booking.check_in_date?.split("T")[0]
    const checkoutStr = booking.check_out_date?.split("T")[0]
    const totalPrice = Number(booking.net_price) || Number(booking.total_price) || 0
    if (!checkinStr || !checkoutStr) continue
    let nights = booking.number_of_nights || 0
    if (!nights) {
      const [cy, cm, cd] = checkinStr.split("-").map(Number)
      const [oy, om, od] = checkoutStr.split("-").map(Number)
      nights = Math.ceil((Date.UTC(oy, om - 1, od) - Date.UTC(cy, cm - 1, cd)) / 86400000)
    }
    if (nights <= 0) continue
    if (!dailyPricesByRoomTypeAndChannel[rtId]) dailyPricesByRoomTypeAndChannel[rtId] = {}
    if (!dailyPricesByRoomTypeAndChannel[rtId][channelKey]) dailyPricesByRoomTypeAndChannel[rtId][channelKey] = {}
    const pricePerNight = totalPrice / nights
    for (const dateStr of dateRange(checkinStr, checkoutStr)) {
      if (dateStr >= monthStart && dateStr <= monthEnd) {
        dailyPricesByRoomTypeAndChannel[rtId][channelKey][dateStr] =
          (dailyPricesByRoomTypeAndChannel[rtId][channelKey][dateStr] || 0) + pricePerNight
      }
    }
  }

  // --- Occupancy map ---
  const occupancyMap: Record<string, Record<string, { occupied: number; total: number; available: number }>> = {}
  for (const av of availability || []) {
    const rtId = av.room_type_id
    const dateStr = av.date?.split("T")[0]
    if (!rtId || !dateStr) continue
    if (!occupancyMap[rtId]) occupancyMap[rtId] = {}
    const total = Number(av.total_rooms) || 0
    const avail = Number(av.rooms_available) || 0
    const oos = Number(av.rooms_out_of_service) || 0
    const sold = Math.max(0, total - avail - oos)
    occupancyMap[rtId][dateStr] = { occupied: sold, total, available: avail }
  }

  // --- Aggregate daily totals per room type ---
  const aggPrices: Record<string, Record<string, number>> = {}
  const aggCounts: Record<string, Record<string, number>> = {}
  for (const booking of currentBookings || []) {
    const rtId = booking.room_type_id
    if (!rtId) continue
    const checkinStr = booking.check_in_date?.split("T")[0]
    const checkoutStr = booking.check_out_date?.split("T")[0]
    const totalPrice = Number(booking.total_price) || 0
    if (!checkinStr || !checkoutStr) continue
    let nights = booking.number_of_nights || 0
    if (!nights) {
      const [cy, cm, cd] = checkinStr.split("-").map(Number)
      const [oy, om, od] = checkoutStr.split("-").map(Number)
      nights = Math.ceil((Date.UTC(oy, om - 1, od) - Date.UTC(cy, cm - 1, cd)) / 86400000)
    }
    if (nights <= 0) continue
    const pricePerNight = totalPrice / nights
    if (!aggPrices[rtId]) aggPrices[rtId] = {}
    if (!aggCounts[rtId]) aggCounts[rtId] = {}
    for (const dateStr of dateRange(checkinStr, checkoutStr)) {
      if (dateStr >= monthStart && dateStr <= monthEnd) {
        aggPrices[rtId][dateStr] = (aggPrices[rtId][dateStr] || 0) + pricePerNight
        aggCounts[rtId][dateStr] = (aggCounts[rtId][dateStr] || 0) + 1
      }
    }
  }

  // --- ETL mappings (needed by both current and previous year loops) ---
  const activeRtNames = new Set(activeRoomTypes.map((rt: any) => rt.name as string))
  const rtNameToId: Record<string, string> = {}
  const pmsIdToName: Record<string, string> = {}
  for (const rt of activeRoomTypes) {
    rtNameToId[rt.name] = rt.id
    if (rt.pms_room_type_id) pmsIdToName[String(rt.pms_room_type_id)] = rt.name
    if (rt.scidoo_room_type_id) pmsIdToName[String(rt.scidoo_room_type_id)] = rt.name
  }
  const totalHotelRooms = activeRoomTypes.reduce((sum: number, rt: any) => sum + (Number(rt.total_rooms) || 0), 0)

  // --- Previous year map — from scidoo_raw_bookings (source of truth) ---
  // Same logic as the current-year ETL block below: daily_price per-night
  // with pro-rata discount redistribution. Using the legacy "bookings" table
  // here would skew YoY by ~2x (revenue and room-nights both).
  const prevYearMap: Record<string, { total_revenue: number; rooms_occupied: number; adr: number; occupancy_rate: number }> = {}
  const prevYearEtlRows = Array.isArray(prevYearEtlRevenue) ? prevYearEtlRevenue : []
  for (const bk of prevYearEtlRows) {
    let rtName: string = bk.room_type_name || "Sconosciuto"
    if (rtName === "Sconosciuto" && bk.raw_data?.room_type_id) {
      rtName = pmsIdToName[String(bk.raw_data.room_type_id)] || "Sconosciuto"
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
    const dpTotal: number = Object.values(dailyPrice).reduce<number>((s, v) => {
      const n = Number(v) || 0
      return s + (n > 0 && n !== 999 && n !== 9999 ? n : 0)
    }, 0)

    for (const [dateKey, val] of Object.entries(dailyPrice)) {
      const grossRev = Number(val) || 0
      if (grossRev <= 0 || grossRev === 999 || grossRev === 9999) continue
      const dateStr = dateKey.includes("/") ? dateKey.split("/").reverse().join("-") : dateKey
      if (dateStr < prevMonthStart || dateStr > prevMonthEnd) continue
      const discountShare = dpTotal > 0 ? (grossRev / dpTotal) * totalDiscount : 0
      const rev = grossRev + discountShare // discountShare <= 0
      const mmdd = dateStr.slice(5)
      if (!prevYearMap[mmdd]) prevYearMap[mmdd] = { total_revenue: 0, rooms_occupied: 0, adr: 0, occupancy_rate: 0 }
      prevYearMap[mmdd].total_revenue += rev
      prevYearMap[mmdd].rooms_occupied += 1
    }
  }

  // Availability override (only if the ETL table rms_availability_daily has
  // rows for the previous-year period — today it's empty for 2025, so this
  // branch is a no-op and the daily_price-derived rooms_occupied wins).
  const prevAvailRows = Array.isArray(prevYearAvailability) ? prevYearAvailability : []
  if (prevAvailRows.length > 0) {
    const availByDay: Record<string, number> = {}
    for (const row of prevAvailRows) {
      const dateStr = row.date?.split("T")[0]
      if (!dateStr) continue
      const mmdd = dateStr.slice(5)
      const total = Number(row.total_rooms) || 0
      const avail = Number(row.rooms_available) || 0
      const oos = Number(row.rooms_out_of_service) || 0
      const sold = Math.max(0, total - avail - oos)
      availByDay[mmdd] = (availByDay[mmdd] || 0) + sold
    }
    for (const [mmdd, sold] of Object.entries(availByDay)) {
      if (sold > 0) {
        if (!prevYearMap[mmdd]) prevYearMap[mmdd] = { total_revenue: 0, rooms_occupied: 0, adr: 0, occupancy_rate: 0 }
        prevYearMap[mmdd].rooms_occupied = sold
      }
    }
  }

  // FIX 21/05/2026: fallback finale per hotel non-Scidoo senza storico nei
  // due passaggi sopra (scidoo_raw_bookings + rms_availability_daily). Per
  // questi (es. Cavallino/BRiG) lo storico 2025 vive in `daily_production`
  // (source = manual_import_2025) a livello hotel-day. Lo usiamo SOLO per
  // i mmdd ancora vuoti, lasciando intatti i giorni gia' popolati.
  const prevDpRows = Array.isArray(prevYearDailyProduction) ? prevYearDailyProduction : []
  if (prevDpRows.length > 0) {
    for (const row of prevDpRows) {
      const dateStr = row.date?.split("T")[0]
      if (!dateStr) continue
      const mmdd = dateStr.slice(5)
      const existing = prevYearMap[mmdd]
      const hasRevenue = existing && existing.total_revenue > 0
      const hasRoomsOcc = existing && existing.rooms_occupied > 0
      if (hasRevenue && hasRoomsOcc) continue
      const rev = Number(row.total_revenue) || 0
      const occ = Number(row.rooms_occupied) || 0
      if (rev <= 0 && occ <= 0) continue
      if (!prevYearMap[mmdd]) prevYearMap[mmdd] = { total_revenue: 0, rooms_occupied: 0, adr: 0, occupancy_rate: 0 }
      if (!hasRevenue && rev > 0) prevYearMap[mmdd].total_revenue = rev
      if (!hasRoomsOcc && occ > 0) prevYearMap[mmdd].rooms_occupied = occ
    }
  }

  if (totalHotelRooms > 0) {
    for (const mmdd of Object.keys(prevYearMap)) {
      const d = prevYearMap[mmdd]
      // clamp a 1.0 (=100%): l'occupazione non puo' superare il 100% (vedi nota Obiettivi 27/06/2026).
      d.occupancy_rate = Math.min(1, d.rooms_occupied / totalHotelRooms)
      d.adr = d.rooms_occupied > 0 ? d.total_revenue / d.rooms_occupied : 0
    }
  }

  // --- ETL revenue from scidoo_raw_bookings (current year) ---

  const etlRows = Array.isArray(etlRevenue) ? etlRevenue : []
  const etlRevenueByDate: Record<string, number> = {}
  const etlRevenueByRoomType: Record<string, Record<string, number>> = {}
  // FIX (2026-04-22): room-nights counter derived from the SAME source as revenue
  // (scidoo_raw_bookings.raw_data.daily_price). Previously dailyCounts was built
  // only from the legacy "bookings" table, which is inflated by import duplicates
  // and yielded ADR values 3x-16x lower than reality on pricing.page.tsx
  // ("Prod. media" row). Each valid daily_price entry = 1 room-night sold.
  const etlCountsByRoomType: Record<string, Record<string, number>> = {}
  const etlChannelBreakdown: Record<string, Record<string, Record<string, number>>> = {}
  const etlChannels = new Set<string>()

  for (const bk of etlRows) {
    let rtName: string = bk.room_type_name || "Sconosciuto"
    if (rtName === "Sconosciuto" && bk.raw_data?.room_type_id) {
      rtName = pmsIdToName[String(bk.raw_data.room_type_id)] || "Sconosciuto"
    }
    if (activeRtNames.size > 0 && !activeRtNames.has(rtName)) continue
    const rtId = rtNameToId[rtName]
    const channelKey = bk.raw_data?.agency?.name || bk.channel || "Direct"
    etlChannels.add(channelKey)
    // FIX 2 (2026-04): Subtract discount extras from daily_price.
    // Scidoo daily_price is GROSS. Categories to subtract:
    //   "Sconti", "Servizio Nota / Addebito Libero" (negative price extras).
    // Discount is distributed pro-rata by each night's weight.
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
    const dpTotal = Object.values(dailyPrice).reduce((s, v) => {
      const n = Number(v) || 0
      return s + (n > 0 && n !== 999 && n !== 9999 ? n : 0)
    }, 0)

    for (const [dateKey, val] of Object.entries(dailyPrice)) {
      const grossRev = Number(val) || 0
      if (grossRev <= 0 || grossRev === 999 || grossRev === 9999) continue
      const dateStr = dateKey.includes("/") ? dateKey.split("/").reverse().join("-") : dateKey
      if (dateStr < monthStart || dateStr > monthEnd) continue
      const discountShare = dpTotal > 0 ? (grossRev / dpTotal) * totalDiscount : 0
      const rev = grossRev + discountShare // discountShare is <= 0
      etlRevenueByDate[dateStr] = (etlRevenueByDate[dateStr] || 0) + rev
      if (!etlRevenueByRoomType[rtName]) etlRevenueByRoomType[rtName] = {}
      etlRevenueByRoomType[rtName][dateStr] = (etlRevenueByRoomType[rtName][dateStr] || 0) + rev
      // Count one room-night per valid daily_price entry (same scope as revenue above)
      if (!etlCountsByRoomType[rtName]) etlCountsByRoomType[rtName] = {}
      etlCountsByRoomType[rtName][dateStr] = (etlCountsByRoomType[rtName][dateStr] || 0) + 1
      if (rtId) {
        if (!etlChannelBreakdown[rtId]) etlChannelBreakdown[rtId] = {}
        if (!etlChannelBreakdown[rtId][channelKey]) etlChannelBreakdown[rtId][channelKey] = {}
        etlChannelBreakdown[rtId][channelKey][dateStr] =
          (etlChannelBreakdown[rtId][channelKey][dateStr] || 0) + rev
      }
    }
  }

  const etlAggPrices: Record<string, Record<string, number>> = {}
  for (const [rtName, byDate] of Object.entries(etlRevenueByRoomType)) {
    const rtId = rtNameToId[rtName]
    if (rtId) etlAggPrices[rtId] = byDate
  }

  const etlAggCounts: Record<string, Record<string, number>> = {}
  for (const [rtName, byDate] of Object.entries(etlCountsByRoomType)) {
    const rtId = rtNameToId[rtName]
    if (rtId) etlAggCounts[rtId] = byDate
  }

  // When ETL data is available, use it for BOTH numerator (revenue) AND
  // denominator (room-nights) so the ratio stays coherent. Mixing sources
  // (ETL revenue / legacy bookings counts) produces wildly wrong ADRs.
  const useEtl = Object.keys(etlAggPrices).length > 0
  const finalAggPrices = useEtl ? etlAggPrices : aggPrices
  const finalAggCounts = useEtl ? etlAggCounts : aggCounts
  const finalChannelBreakdown = Object.keys(etlChannelBreakdown).length > 0 ? etlChannelBreakdown : dailyPricesByRoomTypeAndChannel
  const finalChannels = etlChannels.size > 0 ? etlChannels : channels

  return {
    roomTypes: activeRoomTypes,
    rates: rates || [],
    channels: Array.from(finalChannels).sort(),
    dailyPrices: finalAggPrices,
    dailyCounts: finalAggCounts,
    dailyPricesByRate: finalChannelBreakdown,
    dailyRevenueByDate: etlRevenueByDate,
    occupancy: occupancyMap,
    prevYear: prevYearMap,
    bookingsCount: (currentBookings || []).length,
    etlRowsCount: etlRows.length,
  }
}
