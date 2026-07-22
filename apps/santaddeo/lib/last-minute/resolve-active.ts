import "server-only"

/**
 * Determina se per un hotel c'e' un'offerta Last Minute REALMENTE ATTIVA oggi,
 * e con quali numeri (sconto, camere libere, range di date). Serve al banner
 * pubblico embeddabile.
 *
 * REGOLA DATI CERTI: questo helper NON inventa nulla e NON ricalcola i prezzi.
 * Replica fedelmente la sola logica di ATTIVAZIONE del last-minute del motore
 * (vedi lib/pricing/calculate-suggested-price.ts, step 5):
 *
 *   1. Per ogni data nella finestra, leggi gli algo params `last_minute_days`
 *      e `last_minute_level_id` (cio' che il revenue manager ha impostato).
 *   2. La data e' "in finestra" se 0 <= daysUntil <= last_minute_days
 *      (daysUntil calcolato in UTC midnight, come nel motore).
 *   3. Lo sconto dipende dalle CAMERE LIBERE totali dell'hotel quel giorno
 *      (somma rooms_available su daily_availability) confrontate con le
 *      shared_bands del livello (min_rooms..max_rooms). Prima banda che matcha.
 *   4. Fallback allo sconto principale del livello se nessuna banda matcha.
 *
 * Se manca anche solo un dato certo (niente config, niente disponibilita',
 * sconto 0), la data NON e' considerata attiva: il banner non appare.
 */

import { createServiceRoleClient } from "@/lib/supabase/server"

export interface ActiveLastMinute {
  active: boolean
  /** Sconto massimo (%) tra le date attive — quello da "vendere". */
  maxDiscountPct: number
  /** Camere libere totali nella prima notte attiva (urgenza reale). */
  roomsLeft: number
  /** Prima e ultima notte attiva (YYYY-MM-DD). */
  dateFrom: string | null
  dateTo: string | null
  /** Numero di notti attive nella finestra. */
  nights: number
}

const INACTIVE: ActiveLastMinute = {
  active: false,
  maxDiscountPct: 0,
  roomsLeft: 0,
  dateFrom: null,
  dateTo: null,
  nights: 0,
}

interface SharedBand {
  min_rooms: number
  max_rooms: number
  sort_order: number
  discount_pct: number
  discount_eur: number | null
  discount_mode: string
}

/** Quanti giorni in avanti scandagliare (orizzonte ragionevole per un LM). */
const HORIZON_DAYS = 45

function utcDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function resolveActiveLastMinute(hotelId: string): Promise<ActiveLastMinute> {
  const supabase = await createServiceRoleClient()

  const now = new Date()
  const todayUtcMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const dateStart = utcDateStr(new Date(todayUtcMs))
  const dateEnd = utcDateStr(new Date(todayUtcMs + HORIZON_DAYS * 86400000))

  // --- Carica in parallelo solo cio' che serve all'attivazione LM ---
  const [algoParamsRes, availRes, levelsRes, hotelBandsRes, discountsRes] = await Promise.all([
    supabase
      .from("pricing_algo_params")
      .select("param_key, param_value, date")
      .eq("hotel_id", hotelId)
      .gte("date", dateStart)
      .lte("date", dateEnd)
      .in("param_key", ["last_minute_days", "last_minute_level_id"]),
    supabase
      .from("daily_availability")
      .select("date, rooms_available")
      .eq("hotel_id", hotelId)
      .gte("date", dateStart)
      .lte("date", dateEnd),
    supabase
      .from("last_minute_levels")
      .select("*")
      .eq("hotel_id", hotelId),
    supabase
      .from("hotel_occupancy_bands")
      .select("*")
      .eq("hotel_id", hotelId)
      .order("sort_order", { ascending: true }),
    supabase.from("last_minute_level_discounts").select("*"),
  ])

  const algoParams = algoParamsRes.data || []
  const availability = availRes.data || []
  const levels = levelsRes.data || []
  const hotelBands = hotelBandsRes.data || []
  const discounts = discountsRes.data || []

  // Senza config LM completa non c'e' nulla di certo da mostrare.
  if (levels.length === 0 || hotelBands.length === 0 || discounts.length === 0) {
    return INACTIVE
  }

  // --- Indicizza algo params per data ---
  const paramsByDate: Record<string, Record<string, string>> = {}
  for (const p of algoParams) {
    if (!p.date) continue
    if (!paramsByDate[p.date]) paramsByDate[p.date] = {}
    paramsByDate[p.date][p.param_key] = p.param_value
  }

  // --- Camere libere totali per data (somma su room types) ---
  const roomsByDate: Record<string, number> = {}
  for (const row of availability) {
    roomsByDate[row.date] = (roomsByDate[row.date] || 0) + (row.rooms_available ?? 0)
  }

  // --- shared_bands per livello (come nel loader del motore) ---
  function bandsForLevel(levelId: string): SharedBand[] {
    const discForLevel = discounts.filter((d: any) => d.level_id === levelId)
    return hotelBands
      .map((band: any) => {
        const disc = discForLevel.find((d: any) => d.band_id === band.id)
        return {
          min_rooms: band.min_rooms,
          max_rooms: band.max_rooms,
          sort_order: band.sort_order,
          discount_pct: disc ? Number(disc.discount_pct) : 0,
          discount_eur: disc?.discount_eur ? Number(disc.discount_eur) : null,
          discount_mode: disc?.discount_mode || "pct",
        }
      })
      .sort((a, b) => a.sort_order - b.sort_order)
  }

  const levelById: Record<string, any> = {}
  for (const l of levels) levelById[l.id] = l

  let maxDiscountPct = 0
  let firstDate: string | null = null
  let lastDate: string | null = null
  let firstRoomsLeft = 0
  let nights = 0

  // --- Scandaglia ogni notte della finestra ---
  for (let i = 0; i <= HORIZON_DAYS; i++) {
    const dateStr = utcDateStr(new Date(todayUtcMs + i * 86400000))
    const params = paramsByDate[dateStr]
    if (!params) continue

    const lmDaysStr = params["last_minute_days"]
    const lmLevelId = params["last_minute_level_id"]
    if (!lmDaysStr || !lmLevelId) continue

    const lmDays = Number(lmDaysStr)
    if (isNaN(lmDays) || lmDays <= 0) continue

    const level = levelById[lmLevelId]
    if (!level) continue

    // Finestra temporale (identica al motore)
    const checkInUtcMs = new Date(dateStr + "T00:00:00Z").getTime()
    const daysUntil = Math.floor((checkInUtcMs - todayUtcMs) / 86400000)
    if (daysUntil < 0 || daysUntil > lmDays) continue

    // Camere libere -> banda -> sconto
    const availableRooms = roomsByDate[dateStr] ?? 0
    if (availableRooms <= 0) continue // niente da vendere: nessun LM reale

    let discountPct = 0
    const bands = bandsForLevel(lmLevelId)
    let matched = false
    for (const band of bands) {
      if (availableRooms >= band.min_rooms && availableRooms <= band.max_rooms) {
        if ((band.discount_mode === "eur" ? "eur" : "pct") === "pct" && band.discount_pct > 0) {
          discountPct = band.discount_pct
        }
        // (sconto in EUR non si traduce in % "da vetrina": lo ignoriamo per la
        // label, ma la notte resta attiva se c'e' uno sconto reale)
        if (band.discount_mode === "eur" && (band.discount_eur ?? 0) > 0) {
          discountPct = Math.max(discountPct, 0)
        }
        matched = (band.discount_pct > 0) || ((band.discount_eur ?? 0) > 0)
        break
      }
    }

    // Fallback sconto principale del livello
    if (!matched) {
      if ((level.discount_mode === "eur" ? "eur" : "pct") === "pct" && (level.discount_pct ?? 0) > 0) {
        discountPct = Number(level.discount_pct)
        matched = true
      } else if (level.discount_mode === "eur" && (level.discount_eur ?? 0) > 0) {
        matched = true
      }
    }

    if (!matched) continue // nessuno sconto reale per questa notte

    // Notte attiva
    nights++
    if (!firstDate) {
      firstDate = dateStr
      firstRoomsLeft = availableRooms
    }
    lastDate = dateStr
    if (discountPct > maxDiscountPct) maxDiscountPct = discountPct
  }

  if (nights === 0) return INACTIVE

  return {
    active: true,
    maxDiscountPct: Math.round(maxDiscountPct),
    roomsLeft: firstRoomsLeft,
    dateFrom: firstDate,
    dateTo: lastDate,
    nights,
  }
}
