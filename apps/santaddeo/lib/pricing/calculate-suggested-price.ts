/**
 * Server-side pricing engine - EXACT replica of frontend calculateSuggestedPrice
 *
 * Formula:
 *   1. Start with base_rate for the day (= reference room type, base occupancy)
 *   2. Apply occupancy band increment (hotel-level occupancy for that day)
 *   3. Apply room type adjustment (relative to reference room type)
 *   4. Apply market demand weight as global multiplier
 *   5. Apply last-minute discount if within window
 *   6. Apply occupancy-camera chain adjustment (per-pax pricing)
 *   6b. Apply rate plan adjustment
 *   7. Clamp to [bottom_rate, rack_rate]
 *
 * Occupancy camera is CHAIN-BASED:
 *   base (e.g. doppia) = refPrice
 *   tripla = doppia + occ_adj_3
 *   quadrupla = tripla + occ_adj_4
 *   singola = doppia - |occ_adj_1|
 */

import { resolveKIntensity, type KIntensityRule } from "./k-intensity"

// -----------------------------------------------------------------------
// Types (mirror frontend interfaces)
// -----------------------------------------------------------------------

export interface OccupancyBand {
  id?: string
  group_id?: string
  band_index: number
  min_pct: number
  max_pct: number
  min_num?: number
  max_num?: number
  label: string
  increment_pct: number
  increment_eur?: number
  increment_mode?: "pct" | "eur"
  occupancy_mode?: "pct" | "num"
}

export interface BandGroup {
  id: string
  name: string
  sort_order: number
  bands: OccupancyBand[]
}

export interface LastMinuteOccupancyBand {
  id: string
  level_id: string
  sort_order: number
  min_occupancy_pct: number
  max_occupancy_pct: number
  min_occupancy_num: number
  max_occupancy_num: number
  occupancy_mode: "pct" | "num"
  discount_pct: number
  discount_eur?: number
  discount_mode?: "pct" | "eur"
}

export interface LastMinuteLevel {
  id: string
  name: string
  sort_order: number
  color: string
  discount_pct: number
  discount_eur?: number
  discount_mode?: "pct" | "eur"
  min_occupancy_pct: number
  max_occupancy_pct: number
  occupancy_mode: "pct" | "num"
  min_occupancy_num: number
  max_occupancy_num: number
  // Nested occupancy bands for modulated discounts
  occupancy_bands?: LastMinuteOccupancyBand[]
}

export interface RateLimitData {
  room_type_id: string
  room_type_name: string
  bottom_rate: number
  rack_rate: number
}

export interface RoomType {
  id: string
  name: string
  code: string
  total_rooms: number
  scidoo_room_type_id?: string | null
  is_active?: boolean
}

export interface OccupancyEntry {
  available: number
  total: number
}

export interface PrevYearEntry {
  rooms_occupied?: number
  adr?: number
}

export interface PricingVariable {
  id: string
  variable_key: string
  label: string
  description?: string | null
  category: string
  default_weight: number
  is_active: boolean
  sort_order: number
  weight_min?: number
  weight_max?: number
  /**
   * 13/05/2026: mappa opzionale dateStr -> peso effettivo per QUESTA variabile.
   * Popolata dal bridge (recalculate-queued-prices) leggendo gli override da
   * `pricing_variable_weight_overrides`. Se assente o vuota per una data, il
   * motore usa `default_weight` come prima. Stessa formula, stesso K_INTENSITY,
   * solo input arricchito (zero modifica algoritmica).
   */
  weight_by_date?: Record<string, number>
}

export interface PricingContext {
  roomTypes: RoomType[]
  referenceRoomTypeIndex: number
  referenceRateId: string
  adjustmentUnit: "%" | "EUR"
  baseOccupancy: number
  bandGroups: BandGroup[]
  lastMinuteLevels: LastMinuteLevel[]
  rateLimits: RateLimitData[]
  algoParams: Record<string, Record<string, string>>
  occupancyData: Record<string, Record<string, OccupancyEntry>>
  // Logica Madre - scenario storico
  occThresholdLow?: number
  occThresholdHigh?: number
  prevYearData?: Record<string, PrevYearEntry>
  // Variabili K-driven
  pricingVariables?: PricingVariable[]
  /**
   * FIX 12/05/2026 (Architettura Ufficiale Santaddeo - consolidamento):
   * Modalita' ufficiale del motore prezzi per questo hotel.
   * - "basic"    → MODALITA BASE: ignora scenarioModifier e K (kCoeff forzato a 0)
   * - "advanced" → MODALITA K-DRIVEN: applica scenarioModifier e K come modulatori
   *
   * IMPORTANTE: il gate viene applicato SEMPRE allo stesso modo in UI, server e
   * replay debugger. Prima del fix, la UI applicava il gate ma il server NO →
   * drift latente che si sarebbe manifestato il primo giorno con K-driven attivo.
   *
   * Default: "basic" (modalita' BASE deterministica, comportamento storico).
   */
  algorithmType?: "basic" | "advanced"
  /**
   * INTENSIFICATORE K (30/06/2026): regole di intensita' per-hotel/periodo/giorno.
   * Se assente/vuoto, il resolver applica il fallback globale (incremento 0.3,
   * base 0) => comportamento storico identico. Vedi lib/pricing/k-intensity.ts.
   */
  kIntensityRules?: KIntensityRule[]
}

// -----------------------------------------------------------------------
// Coefficiente K - media pesata normalizzata variabili pressione
// -----------------------------------------------------------------------
// NB (30/06/2026): l'ex costante `K_INTENSITY = 0.3` e' ora risolta per-data
// dall'intensificatore (lib/pricing/k-intensity.ts). Il fallback globale del
// resolver vale 0.3, quindi senza regole il comportamento e' identico.

function calculateK(
  pricingVariables: PricingVariable[] | undefined,
  algoParams: Record<string, Record<string, string>>,
  dateStr: string
): number {
  if (!pricingVariables || pricingVariables.length === 0) return 0
  const activeVars = pricingVariables.filter(v => v.is_active !== false)
  if (activeVars.length === 0) return 0

  let sumWeighted = 0
  let sumWeightsMax = 0

  for (const v of activeVars) {
    const paramVal = algoParams[`var_${v.variable_key}`]?.[dateStr] ?? ""
    const value = paramVal !== "" ? Number(paramVal) : (v.default_weight ?? 5)
    // 13/05/2026: weight per-data se esiste un override stagionale/spot per
    // questa data, altrimenti default_weight. Stessa formula a valle.
    const overrideWeight = v.weight_by_date?.[dateStr]
    const weight = overrideWeight !== undefined ? overrideWeight : (v.default_weight ?? 5)
    if (isNaN(value) || weight <= 0) continue
    sumWeighted += value * weight
    sumWeightsMax += 10 * weight
  }

  if (sumWeightsMax === 0) return 0
  const kRaw = sumWeighted / sumWeightsMax // [0, 1]
  const kNorm = (kRaw - 0.5) * 2 // [-1, +1]
  return Math.max(-1, Math.min(1, kNorm))
}

// -----------------------------------------------------------------------
// Core calculation function
// -----------------------------------------------------------------------

export function calculateSuggestedPrice(
  ctx: PricingContext,
  roomTypeId: string,
  dateStr: string,
  forOccupancy?: number,
  forRateId?: string
): number | null {
  const {
    roomTypes,
    referenceRoomTypeIndex,
    referenceRateId,
    adjustmentUnit,
    baseOccupancy,
    bandGroups,
    lastMinuteLevels,
    rateLimits,
    algoParams,
    occupancyData,
  } = ctx

  // In production (server-side), only suggest prices for today or future dates
  const today = new Date().toISOString().split("T")[0]
  if (dateStr < today) return null

  // Helper: get algo param value
  const getAlgoParam = (paramKey: string, date: string): string => {
    return algoParams[paramKey]?.[date] ?? ""
  }

  // Helper: resolve per-row unit
  // Each param row (occ_adj_*, room_type_adj_*, rate_adj_*) can have its own unit.
  // If not explicitly set, occ_adj defaults to EUR (fixed supplement),
  // all others fall back to the global adjustmentUnit.
  const getRowUnit = (paramKey: string): "EUR" | "%" => {
    const u = getAlgoParam(`unit_${paramKey}`, dateStr)
    if (u === "EUR" || u === "%") return u
    // Default: occ_adj uses EUR (fixed per-guest supplement/discount)
    if (paramKey.startsWith("occ_adj_")) return "EUR"
    return adjustmentUnit
  }

  // Helper: find rate limit for room type
  const getRateLimit = (rtId: string) =>
    rateLimits.find((rl) => rl.room_type_id === rtId)

  // 1. Base rate
  const baseRateStr = getAlgoParam("base_rate", dateStr)
  if (!baseRateStr || isNaN(Number(baseRateStr))) return null
  const baseRate = Number(baseRateStr)
  if (baseRate <= 0) return null

  let price = baseRate

  // K e intensita' risolti UNA volta per questa data (riusati su tutti i canali).
  // isAdvanced gate: in modalita' BASE kCoeff=0 => tutti i moltiplicatori K = no-op.
  const isAdvanced = ctx.algorithmType === "advanced"
  const kCoeff = isAdvanced ? calculateK(ctx.pricingVariables, algoParams, dateStr) : 0
  const { incrementIntensity, baseIntensity } = resolveKIntensity(ctx.kIntensityRules, dateStr)

  // NUOVO canale intensificatore (30/06/2026): K modula DIRETTAMENTE il prezzo
  // base. baseIntensity=0 (default/fallback globale) o kCoeff=0 (modalita' BASE)
  // => fattore (1 + 0) = no-op, comportamento storico invariato.
  price = price * (1 + kCoeff * baseIntensity)

  // 1b. LOGICA MADRE: Scenario storico (bassa/alta occupazione anno precedente)
  // FIX 12/05/2026 (Architettura Ufficiale): scenarioModifier e' parte della modalita'
  // K-DRIVEN. In modalita' BASE viene neutralizzato (=1.0). Questo allinea il server
  // alla UI che gia' applicava il gate algorithmType==="advanced".
  const { occThresholdLow = 0, occThresholdHigh = 0, prevYearData = {} } = ctx
  let scenarioModifier = 1.0
  if (isAdvanced && occThresholdLow > 0 && occThresholdHigh > 0) {
    const monthDay = dateStr.slice(5) // "MM-DD"
    const prevRooms = prevYearData[monthDay]?.rooms_occupied ?? null
    if (prevRooms != null) {
      if (prevRooms <= occThresholdLow) {
        // BASSA: smorzare gli incrementi. Piu' camere = tolleranza maggiore.
        const totalRoomsHotel = roomTypes.reduce((s, r) => s + (r.total_rooms || 0), 0)
        const roomFactor = Math.min(1, Math.max(0.5, totalRoomsHotel / 60))
        scenarioModifier = 0.5 + (roomFactor * 0.3) // range: 0.5 - 0.8
      } else if (prevRooms >= occThresholdHigh) {
        // ALTA: amplificare leggermente gli incrementi per massimizzare ADR
        scenarioModifier = 1.15
      }
    }
  }

  // 2. Occupancy band increment (hotel-level)
  let totalSold = 0
  let totalCap = 0
  for (const rt of roomTypes) {
    const data = occupancyData[rt.id]?.[dateStr]
    if (data && data.total > 0) {
      totalSold += data.total - data.available
      totalCap += data.total
    }
  }
  const hotelOcc = totalCap > 0 ? Math.round((totalSold / totalCap) * 100) : null

  // Resolve which band group to use for this day
  const dayGroupId = getAlgoParam("band_group_id", dateStr)
  const activeBandGroup = dayGroupId
    ? bandGroups.find((g) => g.id === dayGroupId)
    : bandGroups[0]
  const bandsForDay = activeBandGroup?.bands ?? []

  if (hotelOcc !== null && bandsForDay.length > 0) {
    const occMode = bandsForDay[0]?.occupancy_mode || "pct"
    const incMode = bandsForDay[0]?.increment_mode || "pct"
    const occValue = occMode === "num" ? totalSold : hotelOcc

    const band = bandsForDay.find((b) =>
      occMode === "pct"
        ? occValue >= b.min_pct && occValue <= b.max_pct
        : occValue >= (b.min_num ?? 0) && occValue <= (b.max_num ?? 0)
    )
    if (band) {
      const bandIdx = bandsForDay.indexOf(band)
      const manualIncStr = getAlgoParam(`increment_band_${bandIdx}`, dateStr)
      const defaultInc =
        incMode === "eur"
          ? Number(band.increment_eur ?? 0)
          : Number(band.increment_pct ?? 0)
      let incrementVal =
        manualIncStr !== "" ? Number(manualIncStr) : defaultInc
      // Apply LOGICA MADRE scenario modifier + Coefficiente K to band increments
      // FIX 12/05/2026: K applicato SOLO in modalita' K-DRIVEN (advanced).
      // In BASE: kCoeff = 0, scenarioModifier = 1 → motore deterministico.
      // 30/06/2026: kCoeff risolto a monte (per-data), intensita' incremento
      // dall'intensificatore (fallback 0.3 = comportamento storico).
      incrementVal = incrementVal * scenarioModifier * (1 + kCoeff * incrementIntensity)
      if (!isNaN(incrementVal) && incrementVal !== 0) {
        const bandRowUnit = getRowUnit(`increment_band_${bandIdx}`)
        price =
          incMode === "eur" || bandRowUnit === "EUR"
            ? price + incrementVal
            : price * (1 + incrementVal / 100)
      }
    }
  }

  // 3. Room type adjustment (chain-based from reference)
  const targetRtIndex = roomTypes.findIndex((rt) => rt.id === roomTypeId)
  if (targetRtIndex !== -1 && targetRtIndex !== referenceRoomTypeIndex) {
    if (targetRtIndex > referenceRoomTypeIndex) {
      for (let ri = referenceRoomTypeIndex + 1; ri <= targetRtIndex; ri++) {
        const rtKey = `room_type_adj_${roomTypes[ri].id}`
        const rtAdjStr = getAlgoParam(rtKey, dateStr)
        if (rtAdjStr && !isNaN(Number(rtAdjStr))) {
          const rtAdj = Number(rtAdjStr)
          price =
            getRowUnit(rtKey) === "EUR"
              ? price + rtAdj
              : price * (1 + rtAdj / 100)
        }
      }
    } else {
      for (let ri = referenceRoomTypeIndex - 1; ri >= targetRtIndex; ri--) {
        const rtKey = `room_type_adj_${roomTypes[ri].id}`
        const rtAdjStr = getAlgoParam(rtKey, dateStr)
        if (rtAdjStr && !isNaN(Number(rtAdjStr))) {
          const rtAdj = Number(rtAdjStr)
          price =
            getRowUnit(rtKey) === "EUR"
              ? price - Math.abs(rtAdj)
              : price * (1 - Math.abs(rtAdj) / 100)
        }
      }
    }
  }

  // 4. Market demand weight (global multiplier, modulated by scenario + K)
  // FIX 12/05/2026: K applicato SOLO in modalita' K-DRIVEN (advanced).
  // In BASE: il demand weight viene applicato puro (senza scenario/K).
  const demandStr = getAlgoParam("market_demand_weight", dateStr)
  if (demandStr && !isNaN(Number(demandStr))) {
    const demandPct = Number(demandStr) * scenarioModifier * (1 + kCoeff * incrementIntensity)
    price = price * (1 + demandPct / 100)
  }

  // 5. Last minute discount (level-based with SHARED occupancy bands)
  // NUOVA STRUTTURA (09/05/2026): fasce di occupazione condivise per hotel.
  // Quando scegli un livello (es. "Forte"), il sistema cerca la fascia di
  // occupazione corretta in base alle camere libere e applica lo sconto
  // configurato per quella fascia in quel livello.
  const lmDaysStr = getAlgoParam("last_minute_days", dateStr)
  const lmLevelId = getAlgoParam("last_minute_level_id", dateStr)
  if (lmDaysStr && lmLevelId) {
    const lmDays = Number(lmDaysStr)
    const level = lastMinuteLevels.find((l) => l.id === lmLevelId) as (typeof lastMinuteLevels[number] & {
      shared_bands?: Array<{
        band_id: string
        min_rooms: number
        max_rooms: number
        sort_order: number
        discount_pct: number
        discount_eur?: number | null
        discount_mode: string
      }>
    }) | undefined
    
    if (level && !isNaN(lmDays) && lmDays > 0) {
      // FIX 30/04/2026: usa UTC midnight su entrambi i lati per evitare
      // che daysUntil dipenda dall'ora corrente
      const now = new Date()
      const todayUtcMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
      const checkInUtcMs = new Date(dateStr + "T00:00:00Z").getTime()
      const daysUntil = Math.floor((checkInUtcMs - todayUtcMs) / 86400000)
      
      if (daysUntil >= 0 && daysUntil <= lmDays) {
        // FIX 11/05/2026: Lo sconto Last Minute dipende dalle CAMERE LIBERE, non dai giorni.
        // shared_bands contiene fasce di camere (min_rooms, max_rooms) con relativi sconti.
        // Calcoliamo le camere libere totali dell'hotel e troviamo la fascia corrispondente.
        const availableRooms = totalCap - totalSold
        
        let appliedDiscount = false
        const sharedBands = level.shared_bands || []
        
        if (sharedBands.length > 0) {
          // Cerca la fascia che contiene il numero di camere libere
          for (const band of sharedBands) {
            if (availableRooms >= band.min_rooms && availableRooms <= band.max_rooms) {
              // Trovata la fascia corretta - applica lo sconto
              const discountMode = band.discount_mode === "eur" ? "eur" : "pct"
              if (discountMode === "eur" && (band.discount_eur ?? 0) > 0) {
                price = Math.max(0, price - (band.discount_eur ?? 0))
                appliedDiscount = true
              } else if (discountMode === "pct" && band.discount_pct > 0) {
                price = price * (1 - band.discount_pct / 100)
                appliedDiscount = true
              }
              break // Applica solo la prima fascia che matcha
            }
          }
        }
        
        // Fallback legacy: se non ci sono shared_bands o nessuna fascia matcha,
        // usa lo sconto principale del level (se configurato)
        if (!appliedDiscount) {
          const discountMode = level.discount_mode === "eur" ? "eur" : "pct"
          if (discountMode === "eur" && (level.discount_eur ?? 0) > 0) {
            price = Math.max(0, price - (level.discount_eur ?? 0))
          } else if (discountMode === "pct" && (level.discount_pct ?? 0) > 0) {
            price = price * (1 - level.discount_pct / 100)
          }
        }
      }
    }
  }

  // 6. Occupancy-camera chain adjustment
  const targetOcc = forOccupancy ?? baseOccupancy
  if (targetOcc !== baseOccupancy) {
    if (targetOcc > baseOccupancy) {
      for (let occ = baseOccupancy + 1; occ <= targetOcc; occ++) {
        const occKey = `occ_adj_${occ}`
        const adjStr = getAlgoParam(occKey, dateStr)
        if (adjStr && !isNaN(Number(adjStr))) {
          price =
            getRowUnit(occKey) === "EUR"
              ? price + Number(adjStr)
              : price * (1 + Number(adjStr) / 100)
        }
      }
    } else {
      for (let occ = baseOccupancy - 1; occ >= targetOcc; occ--) {
        const occKey = `occ_adj_${occ}`
        const adjStr = getAlgoParam(occKey, dateStr)
        if (adjStr && !isNaN(Number(adjStr))) {
          price =
            getRowUnit(occKey) === "EUR"
              ? price - Math.abs(Number(adjStr))
              : price * (1 - Math.abs(Number(adjStr)) / 100)
        }
      }
    }
  }

  // 6b. Rate plan adjustment (derived rates vs reference rate)
  const targetRateId = forRateId || referenceRateId
  if (targetRateId && targetRateId !== referenceRateId) {
    const rateKey = `rate_adj_${targetRateId}`
    const rateAdjStr = getAlgoParam(rateKey, dateStr)
    if (rateAdjStr && !isNaN(Number(rateAdjStr))) {
      const rateAdj = Number(rateAdjStr)
      price =
        getRowUnit(rateKey) === "EUR"
          ? price + rateAdj
          : price * (1 + rateAdj / 100)
    }
  }

  // 7. Clamp to [bottom_rate, rack_rate]
  const rl = getRateLimit(roomTypeId)
  if (rl) {
    if (rl.bottom_rate > 0 && price < rl.bottom_rate) price = rl.bottom_rate
    if (rl.rack_rate > 0 && price > rl.rack_rate) price = rl.rack_rate
  }

  return Math.round(price)
}

// -----------------------------------------------------------------------
// Batch calculation: compute suggested prices for all room types x dates
// -----------------------------------------------------------------------

export interface PriceChange {
  roomTypeId: string
  roomTypeName: string
  rateId: string
  occupancy: number
  date: string
  currentPrice: number | null
  suggestedPrice: number
}

export function calculateAllPriceChanges(
  ctx: PricingContext,
  dates: string[],
  currentPrices: Record<string, Record<string, number>>,
  rates: { id: string; name: string }[],
  occupancies: number[]
): PriceChange[] {
  const changes: PriceChange[] = []

  for (const rt of ctx.roomTypes) {
    for (const rate of rates) {
      for (const occ of occupancies) {
        for (const dateStr of dates) {
          const suggested = calculateSuggestedPrice(
            ctx,
            rt.id,
            dateStr,
            occ,
            rate.id
          )
          if (suggested === null) continue

          // Current price key: roomTypeId_rateId_occ
          const gridKey = `${rt.id}_${rate.id}_${occ}`
          const currentPrice = currentPrices[gridKey]?.[dateStr] ?? null

          // Only report if different from current
          if (currentPrice === null || currentPrice !== suggested) {
            changes.push({
              roomTypeId: rt.id,
              roomTypeName: rt.name,
              rateId: rate.id,
              occupancy: occ,
              date: dateStr,
              currentPrice,
              suggestedPrice: suggested,
            })
          }
        }
      }
    }
  }

  return changes
}

// -----------------------------------------------------------------------
// Hash function for deduplication
// -----------------------------------------------------------------------

export function hashPriceChanges(changes: PriceChange[]): string {
  const sorted = changes
    .map(
      (c) =>
        `${c.roomTypeId}|${c.rateId}|${c.occupancy}|${c.date}|${c.suggestedPrice}`
    )
    .sort()
    .join(";")
  // Simple hash
  let hash = 0
  for (let i = 0; i < sorted.length; i++) {
    const chr = sorted.charCodeAt(i)
    hash = (hash << 5) - hash + chr
    hash |= 0
  }
  return hash.toString(36)
}
