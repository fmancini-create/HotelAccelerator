/**
 * Replay Debugger Light (FASE 2 - 12/05/2026)
 *
 * Wrapper diagnostico NON INVASIVO attorno a calculateSuggestedPrice.
 *
 * REGOLE ARCHITETTURALI:
 *  - Questo file NON sostituisce il motore di prezzi.
 *  - Questo file NON viene chiamato nel ciclo produzione (cron, recalc, push).
 *  - Solo endpoint admin/superadmin possono invocarlo per debug puntuale.
 *  - Output: breakdown strutturato JSON con tutti gli step intermedi.
 *
 * OBIETTIVO:
 *  Rispondere alla domanda "perche' questo prezzo e' stato generato?"
 *  senza modificare la pipeline di calcolo reale.
 *
 * COMPATIBILITA': Identica al motore reale per costruzione, perche'
 * questo file REPLICA la stessa formula ma logga ogni passaggio.
 * Se serve aggiornare il debugger, va sincronizzato a mano con
 * calculate-suggested-price.ts. Trade-off accettato per garantire
 * NON-INVASIVITA' del motore di produzione.
 */

import type { PricingContext } from "./calculate-suggested-price"
import { resolveKIntensity } from "./k-intensity"

export interface PriceBreakdown {
  // Metadati input
  hotel_id: string
  room_type_id: string
  rate_id: string
  occupancy: number
  date: string

  // Modalita' rilevata
  algorithm_mode: "base" | "k-driven"
  k_active: boolean

  // Step intermedi (in ordine di applicazione)
  step_1_base_rate: number | null
  // INTENSIFICATORE K (30/06/2026): modulazione diretta del prezzo base.
  // base_intensity=0 (default) => factor 1.0, price_after invariato.
  step_1a_k_base_intensity?: {
    base_intensity: number
    factor: number
    price_after_base_k: number
  }
  step_1b_scenario_modifier: number
  step_2_occupancy_band: {
    hotel_occupancy_pct: number | null
    matched_band_index: number | null
    increment_raw: number
    increment_after_scenario_and_k: number
    price_after_band: number
  }
  step_3_room_type_chain: {
    target_index: number
    reference_index: number
    chain_steps: Array<{ room_type_id: string; adj: number; unit: "EUR" | "%" }>
    price_after_room_type: number
  }
  step_4_market_demand: {
    raw_pct: number | null
    pct_after_scenario_and_k: number
    price_after_demand: number
  }
  step_5_last_minute: {
    enabled: boolean
    days_until_checkin: number | null
    lm_window_days: number | null
    level_id: string | null
    available_rooms: number | null
    matched_band_id: string | null
    discount_applied: number
    discount_mode: "pct" | "eur" | "none"
    price_after_lm: number
  }
  step_6_occupancy_chain: {
    base_occupancy: number
    target_occupancy: number
    chain_steps: Array<{ occ: number; adj: number; unit: "EUR" | "%" }>
    price_after_occupancy_chain: number
  }
  step_6b_rate_plan: {
    rate_id: string
    reference_rate_id: string
    adj: number
    unit: "EUR" | "%"
    price_after_rate: number
  }
  step_7_clamp: {
    bottom_rate: number | null
    rack_rate: number | null
    clamped_bottom: boolean
    clamped_rack: boolean
    price_after_clamp: number
  }

  // Output finale
  k_coefficient: number
  final_price: number | null
  final_price_rounded: number | null
}

/**
 * Versione diagnostica di calculateSuggestedPrice.
 * Ritorna il breakdown completo invece del solo prezzo.
 *
 * Per usare:
 *   const breakdown = calculatePriceWithDiagnostics(ctx, rtId, "2026-05-15", 2, rateId)
 *   console.log(JSON.stringify(breakdown, null, 2))
 *
 * NON USARE in produzione (overhead memoria + log). Solo debug puntuale.
 */
export function calculatePriceWithDiagnostics(
  ctx: PricingContext,
  roomTypeId: string,
  dateStr: string,
  forOccupancy?: number,
  forRateId?: string
): PriceBreakdown {
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
    pricingVariables,
  } = ctx

  // Inizializza breakdown vuoto
  const breakdown: PriceBreakdown = {
    hotel_id: "",
    room_type_id: roomTypeId,
    rate_id: forRateId || referenceRateId || "",
    occupancy: forOccupancy ?? baseOccupancy,
    date: dateStr,
    algorithm_mode: "base",
    k_active: false,
    step_1_base_rate: null,
    step_1b_scenario_modifier: 1.0,
    step_2_occupancy_band: {
      hotel_occupancy_pct: null,
      matched_band_index: null,
      increment_raw: 0,
      increment_after_scenario_and_k: 0,
      price_after_band: 0,
    },
    step_3_room_type_chain: {
      target_index: -1,
      reference_index: referenceRoomTypeIndex,
      chain_steps: [],
      price_after_room_type: 0,
    },
    step_4_market_demand: {
      raw_pct: null,
      pct_after_scenario_and_k: 0,
      price_after_demand: 0,
    },
    step_5_last_minute: {
      enabled: false,
      days_until_checkin: null,
      lm_window_days: null,
      level_id: null,
      available_rooms: null,
      matched_band_id: null,
      discount_applied: 0,
      discount_mode: "none",
      price_after_lm: 0,
    },
    step_6_occupancy_chain: {
      base_occupancy: baseOccupancy,
      target_occupancy: forOccupancy ?? baseOccupancy,
      chain_steps: [],
      price_after_occupancy_chain: 0,
    },
    step_6b_rate_plan: {
      rate_id: forRateId || referenceRateId || "",
      reference_rate_id: referenceRateId || "",
      adj: 0,
      unit: "EUR",
      price_after_rate: 0,
    },
    step_7_clamp: {
      bottom_rate: null,
      rack_rate: null,
      clamped_bottom: false,
      clamped_rack: false,
      price_after_clamp: 0,
    },
    k_coefficient: 0,
    final_price: null,
    final_price_rounded: null,
  }

  // FIX 12/05/2026 (Architettura Ufficiale): la modalita' e' decisa dal gate
  // `algorithmType` della subscription (identico a UI + server engine).
  // `pricingVariables` puo' essere popolato anche in modalita' BASE (UI lo
  // mostra come "configurazione futura"), ma il calcolo K viene applicato
  // SOLO se algorithmType === "advanced".
  const isAdvanced = ctx.algorithmType === "advanced"
  const activeKVars = (pricingVariables ?? []).filter((v) => v.is_active !== false)
  breakdown.k_active = isAdvanced && activeKVars.length > 0
  breakdown.algorithm_mode = breakdown.k_active ? "k-driven" : "base"

  // Helper per leggere algo params (replica del motore reale)
  const getAlgoParam = (paramKey: string, date: string): string => {
    return algoParams[paramKey]?.[date] ?? ""
  }

  const getRowUnit = (paramKey: string): "EUR" | "%" => {
    const u = getAlgoParam(`unit_${paramKey}`, dateStr)
    if (u === "EUR" || u === "%") return u
    if (paramKey.startsWith("occ_adj_")) return "EUR"
    return adjustmentUnit
  }

  // Calcola K coefficient (replica) - SOLO se modalita' K-DRIVEN.
  // In BASE, kCoeff resta 0 → moltiplicatore (1 + 0 * intensita') = 1 = no-op.
  // 30/06/2026: intensita' risolta per-data dall'intensificatore (fallback 0.3).
  const { incrementIntensity, baseIntensity } = resolveKIntensity(ctx.kIntensityRules, dateStr)
  let kCoeff = 0
  if (isAdvanced && activeKVars.length > 0) {
    let sumWeighted = 0
    let sumWeightsMax = 0
    for (const v of activeKVars) {
      const paramVal = algoParams[`var_${v.variable_key}`]?.[dateStr] ?? ""
      const value = paramVal !== "" ? Number(paramVal) : v.default_weight ?? 5
      // 13/05/2026: simmetrico all'engine - leggi override per-data se presente.
      const overrideWeight = (v as { weight_by_date?: Record<string, number> }).weight_by_date?.[dateStr]
      const weight = overrideWeight !== undefined ? overrideWeight : (v.default_weight ?? 5)
      if (isNaN(value) || weight <= 0) continue
      sumWeighted += value * weight
      sumWeightsMax += 10 * weight
    }
    if (sumWeightsMax > 0) {
      const kRaw = sumWeighted / sumWeightsMax
      kCoeff = Math.max(-1, Math.min(1, (kRaw - 0.5) * 2))
    }
  }
  breakdown.k_coefficient = kCoeff

  // Check past date
  const today = new Date().toISOString().split("T")[0]
  if (dateStr < today) {
    return breakdown // final_price resta null
  }

  // 1. Base rate
  const baseRateStr = getAlgoParam("base_rate", dateStr)
  if (!baseRateStr || isNaN(Number(baseRateStr))) return breakdown
  const baseRate = Number(baseRateStr)
  if (baseRate <= 0) return breakdown
  breakdown.step_1_base_rate = baseRate

  let price = baseRate

  // NUOVO canale intensificatore (30/06/2026): K modula DIRETTAMENTE il prezzo
  // base. baseIntensity=0 (default/fallback) o kCoeff=0 (BASE) => no-op.
  const baseKFactor = 1 + kCoeff * baseIntensity
  price = price * baseKFactor
  if (baseIntensity > 0) {
    breakdown.step_1a_k_base_intensity = {
      base_intensity: baseIntensity,
      factor: baseKFactor,
      price_after_base_k: price,
    }
  }

  // 1b. Scenario modifier (Logica Madre) - SOLO in modalita' K-DRIVEN.
  // In BASE: scenarioModifier resta 1.0 → no effect.
  const { occThresholdLow = 0, occThresholdHigh = 0, prevYearData = {} } = ctx
  let scenarioModifier = 1.0
  if (isAdvanced && occThresholdLow > 0 && occThresholdHigh > 0) {
    const monthDay = dateStr.slice(5)
    const prevRooms = prevYearData[monthDay]?.rooms_occupied ?? null
    if (prevRooms != null) {
      if (prevRooms <= occThresholdLow) {
        const totalRoomsHotel = roomTypes.reduce((s, r) => s + (r.total_rooms || 0), 0)
        const roomFactor = Math.min(1, Math.max(0.5, totalRoomsHotel / 60))
        scenarioModifier = 0.5 + roomFactor * 0.3
      } else if (prevRooms >= occThresholdHigh) {
        scenarioModifier = 1.15
      }
    }
  }
  breakdown.step_1b_scenario_modifier = scenarioModifier

  // 2. Occupancy band
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
  breakdown.step_2_occupancy_band.hotel_occupancy_pct = hotelOcc

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
      breakdown.step_2_occupancy_band.matched_band_index = bandIdx
      const manualIncStr = getAlgoParam(`increment_band_${bandIdx}`, dateStr)
      const defaultInc =
        incMode === "eur"
          ? Number(band.increment_eur ?? 0)
          : Number(band.increment_pct ?? 0)
      const rawInc = manualIncStr !== "" ? Number(manualIncStr) : defaultInc
      breakdown.step_2_occupancy_band.increment_raw = rawInc
      const modulatedInc = rawInc * scenarioModifier * (1 + kCoeff * incrementIntensity)
      breakdown.step_2_occupancy_band.increment_after_scenario_and_k = modulatedInc
      if (!isNaN(modulatedInc) && modulatedInc !== 0) {
        const bandRowUnit = getRowUnit(`increment_band_${bandIdx}`)
        price =
          incMode === "eur" || bandRowUnit === "EUR"
            ? price + modulatedInc
            : price * (1 + modulatedInc / 100)
      }
    }
  }
  breakdown.step_2_occupancy_band.price_after_band = price

  // 3. Room type chain
  const targetRtIndex = roomTypes.findIndex((rt) => rt.id === roomTypeId)
  breakdown.step_3_room_type_chain.target_index = targetRtIndex
  if (targetRtIndex !== -1 && targetRtIndex !== referenceRoomTypeIndex) {
    const direction = targetRtIndex > referenceRoomTypeIndex ? 1 : -1
    const from =
      direction > 0 ? referenceRoomTypeIndex + 1 : referenceRoomTypeIndex - 1
    const to = targetRtIndex
    for (
      let ri = from;
      direction > 0 ? ri <= to : ri >= to;
      ri += direction
    ) {
      const rtKey = `room_type_adj_${roomTypes[ri].id}`
      const rtAdjStr = getAlgoParam(rtKey, dateStr)
      if (rtAdjStr && !isNaN(Number(rtAdjStr))) {
        const rtAdj = Number(rtAdjStr)
        const unit = getRowUnit(rtKey)
        const adjValue = direction > 0 ? rtAdj : -Math.abs(rtAdj)
        breakdown.step_3_room_type_chain.chain_steps.push({
          room_type_id: roomTypes[ri].id,
          adj: adjValue,
          unit,
        })
        price = unit === "EUR" ? price + adjValue : price * (1 + adjValue / 100)
      }
    }
  }
  breakdown.step_3_room_type_chain.price_after_room_type = price

  // 4. Market demand
  const demandStr = getAlgoParam("market_demand_weight", dateStr)
  if (demandStr && !isNaN(Number(demandStr))) {
    const raw = Number(demandStr)
    breakdown.step_4_market_demand.raw_pct = raw
    const modulated = raw * scenarioModifier * (1 + kCoeff * incrementIntensity)
    breakdown.step_4_market_demand.pct_after_scenario_and_k = modulated
    price = price * (1 + modulated / 100)
  }
  breakdown.step_4_market_demand.price_after_demand = price

  // 5. Last Minute
  const lmDaysStr = getAlgoParam("last_minute_days", dateStr)
  const lmLevelId = getAlgoParam("last_minute_level_id", dateStr)
  if (lmDaysStr && lmLevelId) {
    breakdown.step_5_last_minute.enabled = true
    breakdown.step_5_last_minute.lm_window_days = Number(lmDaysStr)
    breakdown.step_5_last_minute.level_id = lmLevelId

    const lmDays = Number(lmDaysStr)
    const level = lastMinuteLevels.find((l) => l.id === lmLevelId) as
      | (typeof lastMinuteLevels[number] & {
          shared_bands?: Array<{
            band_id: string
            min_rooms: number
            max_rooms: number
            sort_order: number
            discount_pct: number
            discount_eur?: number | null
            discount_mode: string
          }>
        })
      | undefined

    if (level && !isNaN(lmDays) && lmDays > 0) {
      const now = new Date()
      const todayUtcMs = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate()
      )
      const checkInUtcMs = new Date(dateStr + "T00:00:00Z").getTime()
      const daysUntil = Math.floor((checkInUtcMs - todayUtcMs) / 86400000)
      breakdown.step_5_last_minute.days_until_checkin = daysUntil

      if (daysUntil >= 0 && daysUntil <= lmDays) {
        const availableRooms = totalCap - totalSold
        breakdown.step_5_last_minute.available_rooms = availableRooms

        const sharedBands = level.shared_bands || []
        let applied = false
        for (const band of sharedBands) {
          if (
            availableRooms >= band.min_rooms &&
            availableRooms <= band.max_rooms
          ) {
            const mode = band.discount_mode === "eur" ? "eur" : "pct"
            if (mode === "eur" && (band.discount_eur ?? 0) > 0) {
              const d = band.discount_eur ?? 0
              breakdown.step_5_last_minute.matched_band_id = band.band_id
              breakdown.step_5_last_minute.discount_applied = d
              breakdown.step_5_last_minute.discount_mode = "eur"
              price = Math.max(0, price - d)
              applied = true
            } else if (mode === "pct" && band.discount_pct > 0) {
              breakdown.step_5_last_minute.matched_band_id = band.band_id
              breakdown.step_5_last_minute.discount_applied = band.discount_pct
              breakdown.step_5_last_minute.discount_mode = "pct"
              price = price * (1 - band.discount_pct / 100)
              applied = true
            }
            break
          }
        }
        // Fallback legacy: usa lo sconto principale del level se nessuna banda matcha
        if (!applied) {
          const mode = level.discount_mode === "eur" ? "eur" : "pct"
          if (mode === "eur" && (level.discount_eur ?? 0) > 0) {
            breakdown.step_5_last_minute.discount_applied = level.discount_eur ?? 0
            breakdown.step_5_last_minute.discount_mode = "eur"
            price = Math.max(0, price - (level.discount_eur ?? 0))
          } else if (mode === "pct" && (level.discount_pct ?? 0) > 0) {
            breakdown.step_5_last_minute.discount_applied = level.discount_pct
            breakdown.step_5_last_minute.discount_mode = "pct"
            price = price * (1 - level.discount_pct / 100)
          }
        }
      }
    }
  }
  breakdown.step_5_last_minute.price_after_lm = price

  // 6. Occupancy chain (per-pax)
  const targetOcc = forOccupancy ?? baseOccupancy
  breakdown.step_6_occupancy_chain.target_occupancy = targetOcc
  if (targetOcc !== baseOccupancy) {
    const direction = targetOcc > baseOccupancy ? 1 : -1
    const from = baseOccupancy + direction
    const to = targetOcc
    for (
      let occ = from;
      direction > 0 ? occ <= to : occ >= to;
      occ += direction
    ) {
      const occKey = `occ_adj_${occ}`
      const adjStr = getAlgoParam(occKey, dateStr)
      if (adjStr && !isNaN(Number(adjStr))) {
        const adj = Number(adjStr)
        const unit = getRowUnit(occKey)
        const adjValue = direction > 0 ? adj : -Math.abs(adj)
        breakdown.step_6_occupancy_chain.chain_steps.push({
          occ,
          adj: adjValue,
          unit,
        })
        price = unit === "EUR" ? price + adjValue : price * (1 + adjValue / 100)
      }
    }
  }
  breakdown.step_6_occupancy_chain.price_after_occupancy_chain = price

  // 6b. Rate plan
  const targetRateId = forRateId || referenceRateId
  if (targetRateId && targetRateId !== referenceRateId) {
    const rateKey = `rate_adj_${targetRateId}`
    const rateAdjStr = getAlgoParam(rateKey, dateStr)
    if (rateAdjStr && !isNaN(Number(rateAdjStr))) {
      const adj = Number(rateAdjStr)
      const unit = getRowUnit(rateKey)
      breakdown.step_6b_rate_plan.adj = adj
      breakdown.step_6b_rate_plan.unit = unit
      price = unit === "EUR" ? price + adj : price * (1 + adj / 100)
    }
  }
  breakdown.step_6b_rate_plan.price_after_rate = price

  // 7. Clamp
  const rl = rateLimits.find((r) => r.room_type_id === roomTypeId)
  if (rl) {
    breakdown.step_7_clamp.bottom_rate = rl.bottom_rate || null
    breakdown.step_7_clamp.rack_rate = rl.rack_rate || null
    if (rl.bottom_rate > 0 && price < rl.bottom_rate) {
      breakdown.step_7_clamp.clamped_bottom = true
      price = rl.bottom_rate
    }
    if (rl.rack_rate > 0 && price > rl.rack_rate) {
      breakdown.step_7_clamp.clamped_rack = true
      price = rl.rack_rate
    }
  }
  breakdown.step_7_clamp.price_after_clamp = price

  // Output
  breakdown.final_price = price
  breakdown.final_price_rounded = Math.round(price)

  return breakdown
}

/**
 * Helper per generare un log strutturato compatto del breakdown.
 * Usato dagli endpoint admin per audit.
 */
export function formatBreakdownLog(b: PriceBreakdown): string {
  return JSON.stringify({
    mode: b.algorithm_mode,
    k: b.k_coefficient.toFixed(3),
    base: b.step_1_base_rate,
    scenario: b.step_1b_scenario_modifier,
    band: b.step_2_occupancy_band.price_after_band,
    rt_chain: b.step_3_room_type_chain.price_after_room_type,
    demand: b.step_4_market_demand.price_after_demand,
    lm: {
      applied: b.step_5_last_minute.discount_applied,
      mode: b.step_5_last_minute.discount_mode,
    },
    occ_chain: b.step_6_occupancy_chain.price_after_occupancy_chain,
    rate: b.step_6b_rate_plan.price_after_rate,
    clamp: {
      bottom: b.step_7_clamp.clamped_bottom,
      rack: b.step_7_clamp.clamped_rack,
    },
    final: b.final_price_rounded,
  })
}
