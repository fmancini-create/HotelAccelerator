/**
 * lib/pricing/load-pricing-context.ts
 *
 * 13/05/2026: estratto da `recalculate-queued-prices.ts` per consentire al
 * SIMULATORE (`/api/accelerator/pricing-simulate`) di costruire IL MEDESIMO
 * `PricingContext` usato dal motore di produzione. Prima di oggi il simulator
 * implementava una versione semplificata di `calculateSuggestedPrice` lato
 * client che driftava dal motore vero (manca K-driven, scenarioModifier,
 * rate plan adjustment, getRowUnit per-riga, clamp). Centralizzando qui il
 * caricamento del contesto eliminiamo il drift: server-side il motore vero
 * gira sempre sullo stesso input, sia per cron/autopilot sia per la
 * simulazione interattiva.
 *
 * Comportamento IDENTICO a `recalculate-queued-prices.ts` (vedi commenti
 * inline): pagina pricing_grid e pricing_algo_params, costruisce la
 * occupancyMap, popola lastMinuteLevels con shared_bands derivate da
 * hotel_occupancy_bands + last_minute_level_discounts, arricchisce le
 * pricing_variables con weight_by_date dagli override stagionali, e
 * risolve algorithmType dalla subscription attiva.
 *
 * NON include la fase di scrittura (priceUpdates, price_change_log, autopilot
 * trigger): quella resta unicamente in `recalculate-queued-prices.ts`. Qui
 * generiamo SOLO l'input pulito per il motore.
 */

import { fetchAllPaginated } from "@/lib/supabase/paginate"
import type { PricingContext } from "@/lib/pricing/calculate-suggested-price"

export interface LoadedPricingContext {
  /** Context pronto per essere passato a `calculateSuggestedPrice`. */
  ctx: PricingContext
  /** Tipi camera ATTIVI ordinati per display_order (con min/max_occupancy). */
  roomTypes: any[]
  /** Tariffe ATTIVE ordinate per nome. */
  rates: any[]
  /** Set di occupanze valide derivato dai prezzi esistenti + capacita' camere. */
  occupancies: number[]
  /** Map `${roomTypeId}_${rateId}_${occupancy}` -> dateStr -> prezzo corrente. */
  pricesMap: Record<string, Record<string, number>>
  /** Modalita' motore: "basic" o "advanced" (deriva dalla subscription). */
  algorithmType: "basic" | "advanced"
  /** Diagnostica: numero di bande caricate (per log finale dei consumer). */
  diagnostics: {
    bandsTotal: number
    bandGroupsCount: number
    lastMinuteLevelsCount: number
    pricingVariablesCount: number
    weightOverridesLoaded: number
  }
}

export async function loadPricingContext(
  supabase: any,
  hotelId: string,
  dateStart: string,
  dateEnd: string,
): Promise<LoadedPricingContext> {
  // ---------------------------------------------------------------------
  // Fetch parallelo: 9 query indipendenti (config + lookup tables)
  // ---------------------------------------------------------------------
  const [
    { data: roomTypes, error: rtError },
    { data: rates, error: rError },
    { data: availability, error: availError },
    { data: bandGroups, error: bgError },
    { data: occupancyBands, error: obError },
    { data: lastMinuteLevels, error: lmError },
    { data: hotelOccBands, error: hotelOccBandsError },
    { data: lastMinuteLevelDiscounts, error: lmDiscountsError },
    { data: pricingVariables, error: pvError },
  ] = await Promise.all([
    supabase
      .from("room_types")
      .select(
        "id, name, code, scidoo_room_type_id, capacity, capacity_default, additional_beds, total_rooms, is_active, display_order, min_occupancy, max_occupancy",
      )
      .eq("hotel_id", hotelId)
      .eq("is_active", true)
      .order("display_order", { ascending: true, nullsFirst: false }),
    supabase
      .from("rates")
      .select("*")
      .eq("hotel_id", hotelId)
      .eq("is_active", true)
      .order("name"),
    // FIX 26/05/2026 (incident "Massabò ping-pong residuo"): paginare
    // daily_availability con .order() esplicito. Su orizzonti grandi
    // (530gg x 4 room types = ~2000 righe) il limit di default 1000
    // di Supabase troncava silenziosamente in heap order non
    // deterministico. Le righe scartate variavano tra chiamate
    // consecutive -> occupancyData diverso -> band increment applicato
    // o no -> ping-pong perfetto del valore della banda. Vedi commento
    // analogo in `recalculate-queued-prices.ts`.
    fetchAllPaginated<{ date: string; room_type_id: string; rooms_available: number; total_rooms: number }>(
      () =>
        supabase
          .from("daily_availability")
          .select("date, room_type_id, rooms_available, total_rooms")
          .eq("hotel_id", hotelId)
          .gte("date", dateStart)
          .lte("date", dateEnd)
          .order("date", { ascending: true })
          .order("room_type_id", { ascending: true }),
    ),
    supabase
      .from("occupancy_band_groups")
      .select("*")
      .eq("hotel_id", hotelId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("occupancy_bands")
      .select("*")
      .eq("hotel_id", hotelId)
      .order("band_index", { ascending: true }),
    supabase
      .from("last_minute_levels")
      .select("*")
      .eq("hotel_id", hotelId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("hotel_occupancy_bands")
      .select("*")
      .eq("hotel_id", hotelId)
      .order("sort_order", { ascending: true }),
    supabase.from("last_minute_level_discounts").select("*"),
    // pricing_variables e' GLOBALE: niente filtro hotel_id (vedi commento in
    // recalculate-queued-prices.ts del 13/05/2026).
    supabase.from("pricing_variables").select("*").eq("is_active", true),
  ])

  // ---------------------------------------------------------------------
  // Algorithm type dalla subscription attiva (gate per K e scenarioModifier)
  // ---------------------------------------------------------------------
  const { data: hotelSubscription } = await supabase
    .from("accelerator_subscriptions")
    .select("algorithm_type, is_active")
    .eq("hotel_id", hotelId)
    .eq("is_active", true)
    .maybeSingle()

  const algorithmType: "basic" | "advanced" =
    hotelSubscription?.algorithm_type === "advanced" ? "advanced" : "basic"

  // ---------------------------------------------------------------------
  // INTENSIFICATORE K (30/06/2026): regole intensita' per-hotel/periodo/giorno.
  // Carichiamo TUTTE le regole attive dell'hotel (sono poche per definizione:
  // un default + qualche periodo/giorno) e lasciamo la risoluzione per-data al
  // resolver puro `resolveKIntensity`. Se la tabella e' vuota -> [] -> fallback
  // globale (0.3 / 0) = comportamento storico identico.
  // ---------------------------------------------------------------------
  const { data: kIntensityRows, error: kIntensityErr } = await supabase
    .from("hotel_k_intensity_rules")
    .select("scope, date_from, date_to, increment_intensity, base_intensity, is_active")
    .eq("hotel_id", hotelId)
    .eq("is_active", true)
  if (kIntensityErr) {
    console.warn("[loadPricingContext] k-intensity rules fetch error:", kIntensityErr.message)
  }

  // ---------------------------------------------------------------------
  // pricing_grid + pricing_algo_params: paginate (>1000 row hotel large)
  //
  // FIX 25/05/2026: aggiunto .order() esplicito per rendere deterministica
  // la paginazione. Senza ORDER BY le pagine successive di range() possono
  // saltare/duplicare righe (heap order non stabile su tabelle ad alta
  // scrittura). Vedi `recalculate-queued-prices.ts` per il post-mortem
  // completo (incident "Moriano ping-pong 137<->133").
  // ---------------------------------------------------------------------
  const [pricesPaged, algoParamsPaged] = await Promise.all([
    fetchAllPaginated<any>(
      () =>
        supabase
          .from("pricing_grid")
          .select("*")
          .eq("hotel_id", hotelId)
          .gte("date", dateStart)
          .lte("date", dateEnd)
          .order("date", { ascending: true })
          .order("room_type_id", { ascending: true })
          .order("rate_id", { ascending: true })
          .order("occupancy", { ascending: true }),
    ),
    fetchAllPaginated<any>(
      () =>
        supabase
          .from("pricing_algo_params")
          .select("param_key, param_value, date")
          .eq("hotel_id", hotelId)
          .gte("date", dateStart)
          .lte("date", dateEnd)
          .order("date", { ascending: true })
          .order("param_key", { ascending: true }),
    ),
  ])

  const pricesData = pricesPaged.data ?? []
  const algoParams = algoParamsPaged.data ?? []

  // Error surface
  if (rtError || rError || availError || bgError || obError || lmError) {
    const errors = [rtError, rError, availError, bgError, obError, lmError]
      .filter((e) => e)
      .map((e: any) => e?.message)
      .join("; ")
    throw new Error(`loadPricingContext fetch error: ${errors}`)
  }

  // ---------------------------------------------------------------------
  // Maps
  // ---------------------------------------------------------------------
  const occupancyMap: Record<
    string,
    Record<string, { available: number; total: number }>
  > = {}
  for (const row of availability || []) {
    if (!occupancyMap[row.room_type_id]) occupancyMap[row.room_type_id] = {}
    occupancyMap[row.room_type_id][row.date] = {
      available: row.rooms_available ?? 0,
      total: row.total_rooms ?? 0,
    }
  }

  const pricesMap: Record<string, Record<string, number>> = {}
  for (const p of pricesData) {
    const key = `${p.room_type_id}_${p.rate_id}_${p.occupancy}`
    if (!pricesMap[key]) pricesMap[key] = {}
    pricesMap[key][p.date] = parseFloat(p.price)
  }

  const paramsMap: Record<string, Record<string, string>> = {}
  for (const p of algoParams) {
    if (!paramsMap[p.param_key]) paramsMap[p.param_key] = {}
    paramsMap[p.param_key][p.date] = p.param_value
  }

  const groupsWithBands = (bandGroups || []).map((g: any) => ({
    ...g,
    bands: (occupancyBands || []).filter((b: any) => b.group_id === g.id),
  }))

  const { data: rateLimitsData } = await supabase
    .from("rate_limits")
    .select("*")
    .eq("hotel_id", hotelId)

  const rateLimits = (rateLimitsData || []).map((rl: any) => ({
    room_type_id: rl.room_type_id,
    room_type_name: rl.room_type_name || "",
    bottom_rate: rl.bottom_rate || 0,
    rack_rate: rl.rack_rate || 0,
  }))

  // ---------------------------------------------------------------------
  // Global config params (reference room/rate, adjustmentUnit, baseOccupancy,
  // occ thresholds): risolti dalla PRIMA data disponibile in paramsMap.
  // Stessa logica del recalc.
  // ---------------------------------------------------------------------
  const firstDateParams: Record<string, string> = {}
  for (const [key, dateMap] of Object.entries(paramsMap)) {
    const firstVal = Object.values(dateMap)[0]
    if (firstVal !== undefined) firstDateParams[key] = firstVal
  }

  const refRoomTypeId =
    firstDateParams["reference_room_type_id"] || (roomTypes?.[0]?.id ?? "")
  const referenceRoomTypeIndex = Math.max(
    0,
    (roomTypes || []).findIndex((rt: any) => rt.id === refRoomTypeId),
  )

  const refRateId = firstDateParams["reference_rate_id"] || (rates?.[0]?.id ?? "")

  const adjUnit = (firstDateParams["adjustment_unit"] === "EUR" ? "EUR" : "%") as
    | "%"
    | "EUR"

  const baseOcc = Number(firstDateParams["base_occupancy"]) || 2

  const occThresholdLow = Number(firstDateParams["occ_threshold_low"]) || 0
  const occThresholdHigh = Number(firstDateParams["occ_threshold_high"]) || 0

  // ---------------------------------------------------------------------
  // lastMinuteLevels con shared_bands (occupancy bands + discounts)
  // ---------------------------------------------------------------------
  const hasLastMinuteConfig =
    (lastMinuteLevels?.length || 0) > 0 &&
    (hotelOccBands?.length || 0) > 0 &&
    (lastMinuteLevelDiscounts?.length || 0) > 0

  if ((lastMinuteLevels?.length || 0) > 0 && !hasLastMinuteConfig) {
    console.warn("[pricing][LM missing]", {
      hotel_id: hotelId,
      levels_count: lastMinuteLevels?.length || 0,
      hotel_occ_bands_count: hotelOccBands?.length || 0,
      last_minute_discounts_count: lastMinuteLevelDiscounts?.length || 0,
      reason:
        "Last Minute levels active but bands/discounts missing - LM will NOT be applied",
    })
  }

  const levelsWithDiscounts = (lastMinuteLevels || []).map((level: any) => {
    const discountsForLevel = (lastMinuteLevelDiscounts || []).filter(
      (d: any) => d.level_id === level.id,
    )

    const shared_bands = (hotelOccBands || [])
      .map((band: any) => {
        const discount = discountsForLevel.find((d: any) => d.band_id === band.id)
        return {
          band_id: band.id,
          min_rooms: band.min_rooms,
          max_rooms: band.max_rooms,
          sort_order: band.sort_order,
          discount_pct: discount ? Number(discount.discount_pct) : 0,
          discount_eur: discount?.discount_eur ? Number(discount.discount_eur) : null,
          discount_mode: discount?.discount_mode || "pct",
        }
      })
      .sort((a: any, b: any) => a.sort_order - b.sort_order)

    return {
      ...level,
      shared_bands,
    }
  })

  // ---------------------------------------------------------------------
  // Weight overrides stagionali (K variabili) -> weight_by_date per variabile
  // ---------------------------------------------------------------------
  let weightOverridesByVariable: Record<string, Record<string, number>> = {}
  let weightOverridesLoaded = 0
  if (pricingVariables && pricingVariables.length > 0) {
    const activeVarIds = pricingVariables.map((v: any) => v.id)
    const { data: overridesRows, error: overridesErr } = await supabase
      .from("pricing_variable_weight_overrides")
      .select("*")
      .eq("hotel_id", hotelId)
      .eq("is_active", true)
      .in("variable_id", activeVarIds)
      .lte("date_from", dateEnd)
      .gte("date_to", dateStart)
    if (overridesErr) {
      console.warn(
        "[loadPricingContext] weight overrides fetch error:",
        overridesErr.message,
      )
    } else if (overridesRows && overridesRows.length > 0) {
      const { buildWeightOverrideMap } = await import("./k-variable-effective-weight")
      weightOverridesByVariable = buildWeightOverrideMap(
        overridesRows as any,
        dateStart,
        dateEnd,
      )
      weightOverridesLoaded = overridesRows.length
    }
  }

  const enrichedPricingVariables = (pricingVariables ?? []).map((v: any) => ({
    ...v,
    weight_by_date: weightOverridesByVariable[v.id] ?? {},
  }))

  // ---------------------------------------------------------------------
  // Build context
  // ---------------------------------------------------------------------
  const ctx: PricingContext = {
    roomTypes: roomTypes || [],
    referenceRoomTypeIndex,
    referenceRateId: refRateId,
    adjustmentUnit: adjUnit,
    baseOccupancy: baseOcc,
    bandGroups: groupsWithBands,
    lastMinuteLevels: levelsWithDiscounts,
    rateLimits,
    algoParams: paramsMap,
    occupancyData: occupancyMap,
    occThresholdLow,
    occThresholdHigh,
    pricingVariables: enrichedPricingVariables,
    algorithmType,
    kIntensityRules: (kIntensityRows ?? []) as any,
  }

  // ---------------------------------------------------------------------
  // Occupanze valide: union(prezzi esistenti, capacita' camere)
  // ---------------------------------------------------------------------
  const occupancySet = new Set<number>()
  for (const p of pricesData) occupancySet.add(p.occupancy)
  for (const rt of roomTypes || []) {
    const maxOcc = rt.capacity_default || rt.capacity || 2
    for (let occ = 1; occ <= maxOcc; occ++) occupancySet.add(occ)
  }
  const occupancies = Array.from(occupancySet).sort((a, b) => a - b)
  if (occupancies.length === 0) occupancies.push(2)

  return {
    ctx,
    roomTypes: roomTypes || [],
    rates: rates || [],
    occupancies,
    pricesMap,
    algorithmType,
    diagnostics: {
      bandsTotal: occupancyBands?.length ?? 0,
      bandGroupsCount: bandGroups?.length ?? 0,
      lastMinuteLevelsCount: lastMinuteLevels?.length ?? 0,
      pricingVariablesCount: enrichedPricingVariables.length,
      weightOverridesLoaded,
    },
  }
}
