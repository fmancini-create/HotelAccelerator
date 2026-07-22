/**
 * Bookings Service
 * Extracts revenue and cancellation logic used by /api/dati/production.
 * Uses raw fetch to Supabase REST API (same pattern as the route).
 * Caching and auth remain in the route.
 */

const PROD_URL = "https://aeynirkfixurikshxfov.supabase.co"

function getServiceKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SANTADDEO_SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY non configurata")
  return key
}

function getHeaders(rangeStart = 0, rangeEnd = 9999): Record<string, string> {
  const k = getServiceKey()
  return {
    apikey: k,
    Authorization: `Bearer ${k}`,
    "Content-Type": "application/json",
    Range: `${rangeStart}-${rangeEnd}`,
    Prefer: "count=exact",
  }
}

/**
 * Paginated query: fetches ALL rows from Supabase REST API.
 * Default Supabase limit is 1000 rows; Range header extends this but
 * for large datasets (e.g. 18k+ raw bookings) we must paginate.
 */
async function q(table: string, qs: string): Promise<any[]> {
  const PAGE_SIZE = 5000
  const allRows: any[] = []
  let offset = 0

  while (true) {
    const rangeEnd = offset + PAGE_SIZE - 1
    const url = `${PROD_URL}/rest/v1/${table}?${qs}`
    const res = await fetch(url, {
      headers: getHeaders(offset, rangeEnd),
      cache: "no-store",
    })

    if (!res.ok) {
      console.error(`[bookings.service] q error ${res.status} ${table}?${qs.slice(0, 120)}`)
      break
    }

    const data = await res.json()
    if (!data || data.length === 0) break

    allRows.push(...data)

    // If we got fewer rows than page size, we've reached the end
    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return allRows
}

async function qSingle(table: string, qs: string): Promise<any | null> {
  const rows = await q(table, qs)
  return rows?.[0] ?? null
}

// ──────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────

export interface ProductionResult {
  roomTypes: any[]
  dailyPrices: Record<string, Record<string, number>>
  isApiMode: boolean
}

// ──────────────────────────────────────────────────
// getRevenue — room-level daily prices by room type for a period
// Handles both API mode (scidoo_raw_bookings) and non-API mode (rms_daily_room_revenue)
// ──────────────────────────────────────────────────

export async function getRevenue(
  hotelId: string,
  monthStart: string,
  monthEnd: string
): Promise<ProductionResult> {
  // Fetch ACTIVE room types and PMS config in parallel
  const [roomTypes, pmsConfig] = await Promise.all([
    q(
      "room_types",
      `select=id,name,scidoo_room_type_id,pms_room_type_id,display_order,is_active&hotel_id=eq.${hotelId}&is_active=eq.true&order=display_order.asc.nullslast,name.asc`
    ),
    qSingle(
      "pms_integrations",
      `select=integration_mode,pms_name&hotel_id=eq.${hotelId}&is_active=eq.true`
    ),
  ])

  // FIX 21/05/2026 — Il branching deve dipendere dal PROVIDER, non dalla
  // modalita' di integrazione. `integration_mode = "api"` e' impostato anche
  // per BRiG/Beddy/altri PMS, ma SOLO Scidoo popola `scidoo_raw_bookings`.
  // Prima si guardava `integration_mode === "api"` -> qualsiasi PMS API che
  // non fosse Scidoo (es. BRiG su Cavallino) entrava in un branch che leggeva
  // da una tabella vuota, e tutta la pagina Produzione/Disponibilita'/
  // Obiettivi mostrava 0. Ora il branch Scidoo si attiva solo per pms_name
  // "scidoo"; tutti gli altri leggono da `public.bookings` (universale).
  const pmsName = String(pmsConfig?.pms_name || "").toLowerCase()
  const isScidoo = pmsName === "scidoo"
  const isApiMode = isScidoo && pmsConfig?.integration_mode === "api"

  // STEP A: Build lookup scidoo_room_type_id -> room_types UUID
  const scidooIdToUuid: Record<string, string> = {}
  const uuidToName: Record<string, string> = {}
  for (const rt of roomTypes || []) {
    if (rt.scidoo_room_type_id) {
      scidooIdToUuid[String(rt.scidoo_room_type_id)] = rt.id
    }
    uuidToName[rt.id] = rt.name
  }

  // Aggregate revenue by room_type UUID (not by name)
  const revenueByRoomTypeId: Record<string, Record<string, number>> = {}

  if (isApiMode) {
    // API mode: read from scidoo_raw_bookings.raw_data.daily_price
    const rawBookings = await q(
      "scidoo_raw_bookings",
      `select=scidoo_booking_id,room_type_name,room_type_code,checkin_date,checkout_date,status,raw_data&hotel_id=eq.${hotelId}&status=neq.annullata&checkin_date=lte.${monthEnd}&checkout_date=gte.${monthStart}`
    )

    for (const bk of rawBookings) {
      // STEP B: Resolve scidoo_room_type_id -> UUID
      // Priority: room_type_code (our corrected column) > raw_data.room_type_id
      // raw_data.room_type_id can be "0" for reactivated bookings -- treat 0 as missing
      const rawRtId = bk.raw_data?.room_type_id
      const rawRtIdStr = rawRtId && String(rawRtId) !== "0" ? String(rawRtId) : null
      const colRtCode = bk.room_type_code && bk.room_type_code !== "0" ? bk.room_type_code : null
      const scidooRtId = colRtCode || rawRtIdStr || ""
      const roomTypeUuid = scidooIdToUuid[scidooRtId] || null

      // If no valid UUID mapping, put under "_unmapped" (never skip)
      const aggregateKey = roomTypeUuid || "_unmapped"

      // STEP C: Extract daily prices and aggregate by UUID
      // FIX 2 (2026-04): Subtract discount extras from daily_price revenue.
      // Scidoo daily_price is GROSS of discounts. Subtract extras with negative
      // price from categories "Sconti" and "Servizio Nota / Addebito Libero"
      // to align with the PDF Pernottamento figure (which is net of discounts).
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

      // Pro-rata discount per night (weighted by each night's gross price)
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

        if (!revenueByRoomTypeId[aggregateKey]) revenueByRoomTypeId[aggregateKey] = {}
        revenueByRoomTypeId[aggregateKey][dateStr] = (revenueByRoomTypeId[aggregateKey][dateStr] || 0) + rev
      }
    }
  } else {
    // Non-API mode (gsheets/Bedzzle): read directly from bookings table.
    // The legacy view rms_daily_room_revenue reads from scidoo_raw_bookings and
    // returns 0 rows for non-Scidoo PMS. We distribute price_per_night uniformly
    // over each night of the booking, matching the canonical migration view.
    const activeBookings = await q(
      "bookings",
      `select=check_in_date,check_out_date,price_per_night,total_price,number_of_nights,room_type_id,nightly_prices&hotel_id=eq.${hotelId}&is_cancelled=eq.false&is_room_booking=eq.true&check_in_date=lte.${monthEnd}&check_out_date=gte.${monthStart}`
    )

    // Build lookup: room_type_id (UUID) -> name, but only for active room types
    const activeRtIdToName: Record<string, string> = {}
    for (const rt of roomTypes || []) {
      activeRtIdToName[rt.id] = rt.name
    }

    for (const bk of activeBookings || []) {
      const rtName = bk.room_type_id ? activeRtIdToName[bk.room_type_id] : null
      if (!rtName) continue // skip bookings without an active room_type mapping

      // Produzione GIORNALIERA ESATTA: se la prenotazione espone il breakdown
      // per-notte reale (`nightly_prices` da amountDetail BRiG), usiamo il
      // prezzo specifico di OGNI notte. Altrimenti ricadiamo sul per-notte
      // uniforme (price_per_night, fallback total/nights). Questo evita che la
      // produzione di un giorno sia una media spalmata su soggiorni a tariffa
      // variabile (weekend/pricing dinamico).
      const nightly =
        bk.nightly_prices && typeof bk.nightly_prices === "object"
          ? (bk.nightly_prices as Record<string, number>)
          : null

      let perNight = Number(bk.price_per_night) || 0
      if (perNight <= 0) {
        const nights = Number(bk.number_of_nights) || 0
        const total = Number(bk.total_price) || 0
        if (nights > 0 && total > 0) perNight = total / nights
      }
      if (perNight <= 0 && !nightly) continue

      // Iterate each night of the booking [check_in, check_out)
      const ci = new Date(bk.check_in_date)
      const co = new Date(bk.check_out_date)
      for (let d = new Date(ci); d < co; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().slice(0, 10)
        if (dateStr < monthStart || dateStr > monthEnd) continue
        // Prezzo reale della notte se disponibile, altrimenti uniforme.
        const nightRev =
          nightly && Number.isFinite(nightly[dateStr]) ? Number(nightly[dateStr]) : perNight
        if (nightRev <= 0) continue
        if (!revenueByRoomTypeId[rtName]) revenueByRoomTypeId[rtName] = {}
        revenueByRoomTypeId[rtName][dateStr] = (revenueByRoomTypeId[rtName][dateStr] || 0) + nightRev
      }
    }

    // Non-API mode already uses names as keys, return directly
    return { roomTypes: roomTypes || [], dailyPrices: revenueByRoomTypeId, isApiMode }
  }

  // STEP D (API mode only): Convert UUID keys -> room type names for the UI
  // Skip _unmapped bookings (inactive/unknown room types) -- their revenue is
  // already included in the hotel-level totals from daily_production.
  const dailyPricesByName: Record<string, Record<string, number>> = {}
  for (const [key, dates] of Object.entries(revenueByRoomTypeId)) {
    if (key === "_unmapped") continue
    const displayName = uuidToName[key]
    if (!displayName) continue // unknown UUID, skip
    if (!dailyPricesByName[displayName]) dailyPricesByName[displayName] = {}
    for (const [date, rev] of Object.entries(dates)) {
      dailyPricesByName[displayName][date] = (dailyPricesByName[displayName][date] || 0) + rev
    }
  }

  // Log: final revenue summary
  console.log("[REVENUE] REVENUE BY ROOM_TYPE_ID", JSON.stringify(
    Object.fromEntries(
      Object.entries(revenueByRoomTypeId).map(([id, dates]) => [
        `${uuidToName[id] || id} (${id.slice(0, 8)})`,
        Object.values(dates).reduce((s, v) => s + v, 0).toFixed(2)
      ])
    )
  ))

  return { roomTypes: roomTypes || [], dailyPrices: dailyPricesByName, isApiMode }
}

// ───��──────────────────────────────────────────────
// getCancellations — cancellation count and lost revenue for a period
// Uses Supabase JS client RPC (same as metrics route)
// ──────────────────────────────────────────���───────

export interface CancellationResult {
  cancellationsCount: number
  cancelledRevenue: number
  cancelledNights: number
  avgPickupDays: number
}

export async function getCancellations(
  supabase: any,
  hotelId: string,
  startDate: string,
  endDate: string
): Promise<CancellationResult> {
  const { data } = await supabase.rpc("get_cancellation_aggregates", {
    p_hotel_id: hotelId,
    p_start_date: startDate,
    p_end_date: endDate,
  })

  const agg = (data || [])[0] || {
    cancellation_count: 0,
    cancelled_revenue: 0,
    cancelled_nights: 0,
    pickup_days_sum: 0,
  }

  const count = Number(agg.cancellation_count || 0)
  return {
    cancellationsCount: count,
    cancelledRevenue: Number(agg.cancelled_revenue || 0),
    cancelledNights: Number(agg.cancelled_nights || 0),
    avgPickupDays: count > 0 ? Number(agg.pickup_days_sum || 0) / count : 0,
  }
}
