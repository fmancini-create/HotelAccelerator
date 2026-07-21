import { createServiceRoleClient } from "@/lib/supabase/server"
import { calculateSuggestedPrice, type PricingContext } from "@/lib/pricing/calculate-suggested-price"
import { warnIfAvailabilityStale } from "@/lib/sync/availability-sync-trigger"
import { markSyncCompleted } from "@/lib/sync/data-freshness"

export interface RecalculationResult {
  success: boolean
  affected_price_changes: number
  error?: string
}

export async function recalculatePricesForQueuedItem(queueItem: {
  id: string
  hotel_id: string
  date_range_start: string
  date_range_end: string
  triggered_by_user_id: string | null
}): Promise<RecalculationResult> {
  const supabase = await createServiceRoleClient()
  const recalcId = queueItem.id
  const hotelId = queueItem.hotel_id
  const dateStart = queueItem.date_range_start
  const dateEnd = queueItem.date_range_end
  const userId = queueItem.triggered_by_user_id

  // FASE 5: tracking durata per summary finale
  const startTime = Date.now()

  try {
    console.log(`[pricing-recalc] start hotel=${hotelId} range=${dateStart}..${dateEnd}`)

    // OBSERVABILITY (12/05/2026 sera tardi): emette WARN se availability per
    // questo hotel e' piu' vecchia della soglia (30 min). Fire-and-forget,
    // NON blocca il pricing (regola architetturale). Il warn finisce in
    // Vercel logs filtrabile come `[availability-stale]`.
    warnIfAvailabilityStale(hotelId, 30).catch(() => {})
    // Freshness pricing: marchiamo il momento dell'inizio del recalc come
    // last sync pricing per quell'hotel.
    markSyncCompleted(hotelId, "pricing").catch(() => {})

    // FIX 01/05/2026 (incident "volume sospetto 6-7k righe price_change_log
    // ogni run cron su Barronci"): le query su `pricing_grid` e
    // `pricing_algo_params` per Barronci possono restituire decine di
    // migliaia di righe (51k+ in pricing_grid: 286 date x 471 combo
    // rt/rate/occ). Senza paginazione esplicita, il client Supabase
    // applica un cap di default a 1000 e TRONCA silenziosamente: il
    // `pricesMap` risulta incompleto, la maggior parte dei lookup
    // ritorna `undefined`, e ogni cella appare come "greenfield"
    // (`old_price = null`). Risultato: 7000 righe loggate come variazioni
    // ad ogni run del cron, anche quando nessun parametro e' cambiato.
    // Stessa famiglia di bug documentata in
    // `v0_memories/user/santaddeo-connectors-health.md` per BookingsProcessor.
    const PAGE = 1000
    async function fetchAllPaginated<T = any>(
      buildQuery: () => any,
      label: string,
    ): Promise<{ rows: T[]; error: any }> {
      let from = 0
      const rows: T[] = []
      while (true) {
        const { data, error } = await buildQuery().range(from, from + PAGE - 1)
        if (error) {
          console.error(`[v0] PRECIO: paginated fetch ${label} error:`, error.message)
          return { rows, error }
        }
        if (!data || data.length === 0) break
        rows.push(...data)
        if (data.length < PAGE) break
        from += PAGE
      }
      return { rows, error: null }
    }

    // Fetch most data in parallel; pricing_grid e algo_params richiedono
    // paginazione esplicita e li carichiamo in parallelo dopo.
    const [
      { data: roomTypes, error: rtError },
      { data: rates, error: rError },
      { data: availability, error: availError },
      { data: bandGroups, error: bgError },
      { data: occupancyBands, error: obError },
      { data: lastMinuteLevels, error: lmError },
      { data: hotelOccBands, error: hotelOccBandsError },
      { data: lastMinuteLevelDiscounts, error: lmDiscountsError },
      // FASE 3 (12/05/2026): caricare pricing_variables per supportare K-DRIVEN
      // server-side. Attualmente nessun hotel Santaddeo ha pricing_variables attive,
      // quindi calculateK() ritorna 0 (algoritmo = BASE). Quando un hotel attivera'
      // K-driven, il caricamento qui assicura che il calcolo server-side sia
      // identico a quello UI, prevenendo drift pricing_grid vs UI/PMS.
      { data: pricingVariables, error: pvError },
    ] = await Promise.all([
      supabase
        .from("room_types")
        // FIX 01/05/2026 (incident "1000 modifiche prezzi con valori strani"
        // su Villa I Barronci): includere min_occupancy e max_occupancy
        // (proprieta' della CAMERA, non della tariffa) per filtrare il loop
        // sotto. Senza questo filtro, una camera doppia (max=2) generava
        // righe per occ 1..6 perche' il set globale di occupancies copriva
        // la suite a 6 pax. Il push poi le scartava ma le righe restavano
        // accumulate in price_change_log con old_price=null e finivano
        // nelle email "Prezzo Attuale: Nuovo / Diff: --" (vera spazzatura).
        .select("id, name, code, scidoo_room_type_id, capacity, capacity_default, additional_beds, total_rooms, is_active, display_order, min_occupancy, max_occupancy")
        .eq("hotel_id", hotelId)
        .eq("is_active", true)
        .order("display_order", { ascending: true, nullsFirst: false }),
      supabase.from("rates").select("*").eq("hotel_id", hotelId).eq("is_active", true).order("name"),
      // FIX 26/05/2026 (incident "Massabò ping-pong residuo 33 perfect
      // reverses" osservato nei log autopilot 14:47-14:50 UTC, dopo il fix
      // .order() del 25/05): `daily_availability` veniva caricata senza
      // paginazione e senza .order(). Su hotel con orizzonte 530 giorni e
      // 4 room types ci sono ~1450-2000 righe, ben oltre il limit di 1000
      // di default di Supabase. Risultato: la query ritornava SOLO le
      // prime 1000 righe in heap order (non deterministico). Le ~450-1000
      // righe scartate cambiavano tra una chiamata e l'altra: per le date
      // in cui (date, room_type) cadeva fuori dalle 1000, occupancyData
      // era undefined -> calculateSuggestedPrice non applicava il band
      // increment di hotel_occ -> prezzo diverso esattamente del valore
      // della banda (5/10/15 EUR), che e' il delta osservato nel
      // ping-pong (169<->164 = 5 EUR, increment ALTA banda 0).
      //
      // Sostituiamo con fetchAllPaginated ordinato. La unique key di
      // daily_availability e' (hotel_id, room_type_id, date), gia' fissato
      // hotel_id; ordiniamo su (date, room_type_id) per coprire fino al
      // tie-break unique e garantire idempotenza.
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
        "daily_availability",
      ).then(({ rows, error }) => ({ data: rows, error })),
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
      // FIX 11/05/2026: caricare hotel_occupancy_bands (fasce camere libere) 
      // e last_minute_level_discounts per calcolare lo sconto LM corretto.
      // NOTA: la UI usa hotel_occupancy_bands (min_rooms/max_rooms), NON last_minute_bands
      // che sono fasce temporali (min_days/max_days). Lo sconto dipende dalle camere libere.
      supabase
        .from("hotel_occupancy_bands")
        .select("*")
        .eq("hotel_id", hotelId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("last_minute_level_discounts")
        .select("*"),
      // FASE 3: pricing_variables filtrate per is_active=true (le inattive
      // non influenzano K).
      //
      // FIX 13/05/2026: rimosso il filtro impossibile `.eq("hotel_id", hotelId)`.
      // La tabella `pricing_variables` e' GLOBALE (definizioni del registry K),
      // NON ha colonna hotel_id. Prima di oggi quel filtro ritornava SEMPRE
      // un array vuoto -> ctx.pricingVariables.length=0 -> motore K-driven mai
      // applicato anche su hotel con subscription advanced. Bug pluri-mese.
      // L'attivazione per-hotel passa per accelerator_subscriptions.algorithm_type
      // (gate principale) + pricing_variable_weight_overrides per modulazione
      // stagionale del peso. Le inattive globali (deprecated o is_active=false)
      // sono escluse perche' diventerebbero rumore nel calcolo K.
      supabase
        .from("pricing_variables")
        .select("*")
        .eq("is_active", true),
    ])

    // 22/05/2026: soglia minima variazione tariffaria configurata sull'hotel.
    // Le variazioni con |old - new| < soglia vengono completamente scartate
    // (no log, no upsert pricing_grid, no push OTA). Questo evita rumore di
    // "1 euro su tariffe da 200 EUR". Default 1.00 = comportamento storico.
    const { data: hotelRow } = await supabase
      .from("hotels")
      .select("min_price_delta_eur")
      .eq("id", hotelId)
      .maybeSingle()
    const minPriceDeltaEur = Math.max(0, Number((hotelRow as any)?.min_price_delta_eur ?? 1))

    // FIX 12/05/2026 (Architettura Ufficiale Santaddeo - FIX UI/Server Drift):
    // Carichiamo algorithm_type dalla subscription attiva. Questo gate determina
    // se K e scenarioModifier vengono applicati o no, identicamente a UI/server/debugger.
    // Se la subscription non esiste o e' inattiva, fallback "basic" (modalita' BASE).
    //
    // FIX 13/05/2026: la tabella corretta e' `accelerator_subscriptions`, non
    // `hotel_subscriptions` (che non esiste piu' nello schema). Prima di oggi
    // questa query falliva silenziosamente -> hotelSubscription=null ->
    // algorithmType="basic" per TUTTI gli hotel -> motore K-driven mai
    // applicato anche per hotel con plan_type='advanced'. Bug pluri-mese.
    const { data: hotelSubscription } = await supabase
      .from("accelerator_subscriptions")
      .select("algorithm_type, is_active")
      .eq("hotel_id", hotelId)
      .eq("is_active", true)
      .maybeSingle()

    const algorithmType: "basic" | "advanced" =
      hotelSubscription?.algorithm_type === "advanced" ? "advanced" : "basic"

    // INTENSIFICATORE K (30/06/2026): carica le regole intensita' dell'hotel.
    // Questo path (recalc autopilot/cron) NON usa loadPricingContext condiviso,
    // quindi le regole vanno caricate qui esplicitamente, altrimenti il motore
    // userebbe il fallback globale (0.3 / 0) e l'intensificatore non avrebbe
    // effetto in autopilot. Set piccolo per design (no paginazione necessaria).
    const { data: kIntensityRules } = await supabase
      .from("hotel_k_intensity_rules")
      .select("scope, date_from, date_to, increment_intensity, base_intensity, is_active")
      .eq("hotel_id", hotelId)
      .eq("is_active", true)

    // FIX 25/05/2026 (incident "Moriano ping-pong 137<->133 ogni ~5min"):
    // PostgREST/Supabase pagina con range() ma SENZA un .order() esplicito
    // l'ordine di ritorno e' l'heap order (non deterministico tra pagine
    // consecutive su tabelle ad alta scrittura come pricing_algo_params e
    // pricing_grid). Risultato: ogni run del cron poteva saltare/duplicare
    // righe, costruendo un paramsMap/pricesMap leggermente diverso ad ogni
    // chiamata. Per data_sync (range 530gg, ~6k righe algo_params, 47k
    // righe pricing_grid) i dati venivano paginati su 7+/48+ pagine; per
    // last_minute_daily (7gg, <1000 righe) era sempre 1 pagina sola e
    // l'ordine non contava. Da qui l'oscillazione: data_sync calcolava un
    // valore X (con paramsMap A), 4 minuti dopo last_minute_daily ricalcolava
    // Y (con paramsMap B coerente perche' singola pagina), e i due si
    // riscrivevano a vicenda all'infinito.
    //
    // Aggiungere .order() su una colonna stabile e indicizzata garantisce
    // che ogni range() veda la stessa porzione totale ordinata, indipendente
    // dall'attivita' del DB (autovacuum, HOT updates, page reorgs). Le UNIQUE
    // delle tabelle sono usate come ordering: il piano di esecuzione fa un
    // index scan deterministico.
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
        "pricing_grid",
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
        "pricing_algo_params",
      ),
    ])

    const pricesData = pricesPaged.rows
    const pricesError = pricesPaged.error
    const algoParams = algoParamsPaged.rows
    const algoError = algoParamsPaged.error

    // FASE 5: log verboso rimosso, info inclusa nel summary finale

    // Check for errors
    if (rtError || rError || pricesError || availError || algoError || bgError || obError || lmError) {
      const errors = [rtError, rError, pricesError, availError, algoError, bgError, obError, lmError]
        .filter((e) => e)
        .map((e) => e?.message)
        .join("; ")
      throw new Error(`Fetch error: ${errors}`)
    }

    if (!roomTypes || roomTypes.length === 0) {
      console.log(`[pricing-recalc] hotel=${hotelId} skip_reason=no_active_room_types`)
      // Mark as completed with 0 changes
      await supabase
        .from("pricing_recalc_queue")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          affected_price_changes_count: 0,
        })
        .eq("id", recalcId)

      return { success: true, affected_price_changes: 0 }
    }

    // Build maps
    const occupancyMap: Record<string, Record<string, { available: number; total: number }>> = {}
    for (const row of availability) {
      if (!occupancyMap[row.room_type_id]) {
        occupancyMap[row.room_type_id] = {}
      }
      occupancyMap[row.room_type_id][row.date] = {
        available: row.rooms_available ?? 0,
        total: row.total_rooms ?? 0,
      }
    }

    const pricesMap: Record<string, Record<string, number>> = {}
    for (const p of pricesData || []) {
      const key = `${p.room_type_id}_${p.rate_id}_${p.occupancy}`
      if (!pricesMap[key]) {
        pricesMap[key] = {}
      }
      pricesMap[key][p.date] = parseFloat(p.price)
    }

    const paramsMap: Record<string, Record<string, string>> = {}
    for (const p of algoParams || []) {
      if (!paramsMap[p.param_key]) {
        paramsMap[p.param_key] = {}
      }
      paramsMap[p.param_key][p.date] = p.param_value
    }

    const groupsWithBands = (bandGroups || []).map((g) => ({
      ...g,
      bands: (occupancyBands || []).filter((b) => b.group_id === g.id),
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

    // Resolve context from algo params (use first date as reference for global params)
    const firstDateParams: Record<string, string> = {}
    for (const [key, dateMap] of Object.entries(paramsMap)) {
      // Use the first available date's value for global config params
      const firstVal = Object.values(dateMap)[0]
      if (firstVal !== undefined) firstDateParams[key] = firstVal
    }

    // Reference room type: resolve from param or default to first
    const refRoomTypeId = firstDateParams["reference_room_type_id"] || (roomTypes?.[0]?.id ?? "")
    const referenceRoomTypeIndex = Math.max(0, (roomTypes || []).findIndex(rt => rt.id === refRoomTypeId))

    // Reference rate: resolve from param or default to first
    const refRateId = firstDateParams["reference_rate_id"] || (rates?.[0]?.id ?? "")

    // Adjustment unit: resolve from param or default to %
    const adjUnit = (firstDateParams["adjustment_unit"] === "EUR" ? "EUR" : "%") as "%" | "EUR"

    // Base occupancy: resolve from param or default to 2
    const baseOcc = Number(firstDateParams["base_occupancy"]) || 2

    // Occupancy thresholds for Logica Madre
    const occThresholdLow = Number(firstDateParams["occ_threshold_low"]) || 0
    const occThresholdHigh = Number(firstDateParams["occ_threshold_high"]) || 0

    // FIX 11/05/2026: Costruire lastMinuteLevels con shared_bands popolati
    // hotel_occupancy_bands definisce le fasce di CAMERE LIBERE (min_rooms, max_rooms)
    // last_minute_level_discounts mappa level_id + band_id -> sconto
    // Il codice calculate-suggested-price cerca level.shared_bands con min_rooms/max_rooms
    // e confronta con availableRooms per trovare la fascia corretta.
    //
    // FASE 4 (12/05/2026): Diagnostic warning quando manca configurazione LM.
    // Se l'hotel ha last_minute_levels attivi ma hotel_occupancy_bands o
    // last_minute_level_discounts vuoti, il calcolo LM fallirà silenziosamente
    // e i prezzi pushati saranno SENZA sconto LM. Logghiamo warning una sola volta.
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
        reason: "Last Minute levels active but bands/discounts missing - LM will NOT be applied",
      })
    }

    const levelsWithDiscounts = (lastMinuteLevels || []).map((level: any) => {
      // Trova tutti gli sconti per questo level
      const discountsForLevel = (lastMinuteLevelDiscounts || [])
        .filter((d: any) => d.level_id === level.id)
      
      // Costruisci l'array di bande con i relativi sconti (stesso pattern dell'API pricing-grid)
      const shared_bands = (hotelOccBands || []).map((band: any) => {
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
      }).sort((a: any, b: any) => a.sort_order - b.sort_order)

      // FASE 4: Warning se questo level non ha alcuno sconto configurato in nessuna banda
      const hasAnyDiscount = shared_bands.some(
        (b: any) => (b.discount_pct || 0) !== 0 || (b.discount_eur || 0) !== 0
      )
      if (!hasAnyDiscount && shared_bands.length > 0) {
        console.warn("[pricing][LM missing]", {
          hotel_id: hotelId,
          level_name: level.name,
          level_id: level.id,
          shared_bands_count: shared_bands.length,
          reason: "Level has bands but no discounts configured",
        })
      }

      return {
        ...level,
        shared_bands,
      }
    })

    // 13/05/2026: carica gli override di importanza (peso) per le K
    // variabili attive in questo hotel + range. Se non esistono override,
    // weight_by_date resta vuoto e l'engine usa default_weight (no-op).
    let weightOverridesByVariable: Record<string, Record<string, number>> = {}
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
        console.warn("[pricing-recalc] weight overrides fetch error:", overridesErr.message)
      } else if (overridesRows && overridesRows.length > 0) {
        const { buildWeightOverrideMap } = await import("./k-variable-effective-weight")
        weightOverridesByVariable = buildWeightOverrideMap(
          overridesRows as any,
          dateStart,
          dateEnd,
        )
        console.log(
          `[pricing-recalc] hotel=${hotelId} weight_overrides_loaded=${overridesRows.length} variables_with_overrides=${Object.keys(weightOverridesByVariable).length}`,
        )
      }
    }

    // Inietta weight_by_date in ciascuna pricing_variable per la finestra
    // corrente. Cosi' l'engine in calculateK fa solo un lookup per data
    // senza dover conoscere la tabella override.
    const enrichedPricingVariables = (pricingVariables ?? []).map((v: any) => ({
      ...v,
      weight_by_date: weightOverridesByVariable[v.id] ?? {},
    }))

    // Build context
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
      // FASE 3 (12/05/2026): pricingVariables abilita calcolo K-DRIVEN.
      // 13/05/2026: arricchite con weight_by_date per override stagionali.
      // Se array vuoto (attuale per tutti gli hotel Santaddeo) → K=0 →
      // algoritmo si comporta come BASE. Caricato in modo condizionale
      // dal Promise.all sopra.
      pricingVariables: enrichedPricingVariables,
      // FIX 12/05/2026 (Architettura Ufficiale): gate K + scenarioModifier
      // identico tra UI/server/debugger. "basic" = modalita' BASE deterministica.
      algorithmType,
      // INTENSIFICATORE K (30/06/2026): regole per-hotel/periodo/giorno.
      kIntensityRules: (kIntensityRules ?? []) as any,
    }

    // Helper: generate date range
    function* dateRange(startStr: string, endStr: string): Generator<string> {
      const [sy, sm, sd] = startStr.split("-").map(Number)
      const [ey, em, ed] = endStr.split("-").map(Number)
      const start = new Date(Date.UTC(sy, sm - 1, sd))
      const end = new Date(Date.UTC(ey, em - 1, ed))
      for (let d = start; d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        yield d.toISOString().split("T")[0]
      }
    }

    // Collect unique occupancies from ROOM TYPE CAPACITIES, not just existing prices
    // This ensures we calculate and log prices for ALL valid occupancies, not just those with existing data
    const occupancySet = new Set<number>()
    
    // 1. Add occupancies from existing prices (backwards compatibility)
    for (const p of pricesData || []) {
      occupancySet.add(p.occupancy)
    }
    
    // 2. Add ALL occupancies from room type capacities (1 to capacity_default or capacity)
    for (const rt of roomTypes) {
      const maxOcc = rt.capacity_default || rt.capacity || 2
      for (let occ = 1; occ <= maxOcc; occ++) {
        occupancySet.add(occ)
      }
    }
    
    const occupancies = Array.from(occupancySet).sort((a, b) => a - b)
    if (occupancies.length === 0) occupancies.push(2)
    
    // FASE 5 (12/05/2026): Summary logging finale invece di per-row spam.
    // Counters mantenuti per il report finale.
    let processedCount = 0
  let skippedSamePriceCount = 0
  let skippedGreenfieldNoLogCount = 0
  let skippedBelowMinDeltaCount = 0
    let clampedBottomCount = 0
    let clampedRackCount = 0

    // Recalculate all prices and collect changes
    const priceChanges: any[] = []
    const priceUpdates: any[] = []

    for (const rt of roomTypes) {
      // FIX 01/05/2026: skippare le occupancies fuori dal range di QUESTA
      // specifica camera. min_occupancy/max_occupancy sono proprieta' della
      // CAMERA (es. Camera sull'albero accetta solo 2 pax, mai singole).
      // Fallback: capacity_default/capacity per gli hotel che non hanno
      // ancora popolato min_occupancy/max_occupancy.
      const rtMinOcc = (rt as any).min_occupancy ?? 1
      const rtMaxOcc =
        (rt as any).max_occupancy ?? rt.capacity_default ?? rt.capacity ?? 2
      for (const rate of rates || []) {
        for (const occ of occupancies) {
          if (occ < rtMinOcc || occ > rtMaxOcc) continue
          for (const dateStr of dateRange(dateStart, dateEnd)) {
            let newPrice = calculateSuggestedPrice(ctx, rt.id, dateStr, occ, rate.id)
            if (newPrice === null) continue
            processedCount++

            // CLAMP: Enforce [bottom_rate, rack_rate] before logging and upsert
            // newPrice qui è garantito non-null dal continue sopra.
            let priceClamped: number = newPrice
            const rateLimitForRoom = rateLimits?.find((rl) => rl.room_type_id === rt.id)
            if (rateLimitForRoom?.bottom_rate && rateLimitForRoom.bottom_rate > 0) {
              if (priceClamped < rateLimitForRoom.bottom_rate) {
                clampedBottomCount++
                priceClamped = rateLimitForRoom.bottom_rate
              }
            }
            if (rateLimitForRoom?.rack_rate && rateLimitForRoom.rack_rate > 0) {
              if (priceClamped > rateLimitForRoom.rack_rate) {
                clampedRackCount++
                priceClamped = rateLimitForRoom.rack_rate
              }
            }
            newPrice = priceClamped

            const gridKey = `${rt.id}_${rate.id}_${occ}`
            const oldPrice = pricesMap[gridKey]?.[dateStr] ?? null

            // ============================================================
            // FASE 1 (12/05/2026) - FIX CRITICO LOOP INFINITO
            // ============================================================
            // BUG STORICO: la condizione precedente "oldPrice IS NULL OR
            // oldPrice != newPrice" generava righe in price_change_log
            // anche per:
            //  (a) greenfield (oldPrice === null) - non e' una "variazione"
            //  (b) ricalcoli che producono lo stesso prezzo gia' presente
            //
            // Effetto: queste righe restavano action_taken='none' per sempre
            // perche' il push al PMS non aveva nulla da inviare (0 record).
            // Ad ogni ciclo cron (5 min) venivano ripescate, l'autopilot
            // ritriggerava un push vuoto, le righe restavano in stato pending.
            // Loop infinito con 800+ righe fantasma per hotel.
            //
            // FIX: loggare SOLO variazioni reali (oldPrice esiste E diverso
            // da newPrice). Il greenfield viene comunque persistito in
            // pricing_grid tramite priceUpdates sotto (source of truth).
            // ============================================================
            const newPriceNum = Number(newPrice)
            const oldPriceNum = oldPrice !== null ? Number(oldPrice) : null

            const isGreenfield = oldPriceNum === null
            const isSamePrice =
              oldPriceNum !== null && Math.abs(oldPriceNum - newPriceNum) <= 0.001
            // 22/05/2026: variazione "rumore" sotto la soglia hotel.
            // Solo per variazioni esistenti (non greenfield), e solo se la
            // soglia hotel e' > 0. Quando attivo, NON loggiamo la variazione
            // E non scriviamo neanche pricing_grid: cosi' last_sent_prices ==
            // pricing_grid e l'autopilot non vede nulla da pushare.
            const isBelowMinDelta =
              !isGreenfield &&
              !isSamePrice &&
              minPriceDeltaEur > 0 &&
              Math.abs((oldPriceNum as number) - newPriceNum) < minPriceDeltaEur

            if (isGreenfield) {
              skippedGreenfieldNoLogCount++
              // NON loggiamo greenfield: non e' una "variazione" semantica.
              // L'upsert sotto popola comunque pricing_grid.
            } else if (isSamePrice) {
              skippedSamePriceCount++
              // NON loggiamo: il prezzo non e' cambiato. Evita loop infinito.
            } else if (isBelowMinDelta) {
              skippedBelowMinDeltaCount++
              // Variazione minima sotto soglia hotel: ignora completamente
              // (skip log E skip pricing_grid upsert) per evitare push OTA
              // di pochi centesimi/euro su tariffe alte.
            } else {
              // Variazione REALE: oldPrice esiste e differisce da newPrice.
              priceChanges.push({
                hotel_id: hotelId,
                room_type_id: rt.id,
                rate_id: rate.id,
                occupancy: occ,
                target_date: dateStr,
                old_price: oldPriceNum,
                new_price: newPriceNum,
                changed_by: userId,
                source: "algo_param_change",
              })
            }

            // SEMPRE preparare upsert per tenere pricing_grid (source of truth)
            // sincronizzato con l'ultimo calcolo. Questo include i greenfield:
            // la prima volta che una cella viene calcolata, va comunque
            // persistita anche se non genera entry in price_change_log.
            // ECCEZIONE 22/05/2026: se la variazione e' sotto soglia hotel,
            // NON aggiorniamo neanche pricing_grid -> il prezzo "vecchio"
            // resta valido e last_sent_prices == pricing_grid (no push).
            if (isBelowMinDelta) {
              continue
            }
            priceUpdates.push({
              hotel_id: hotelId,
              room_type_id: rt.id,
              rate_id: rate.id,
              occupancy: occ,
              date: dateStr,
              price: newPriceNum,
              is_manual: false, // Calculated by algo
              updated_at: new Date().toISOString(),
              last_change_source: "algo_param_change",
            })
          }
        }
      }
    }

    // IMPORTANT: price_change_log MUST be written explicitly here.
    //
    // Historical context: an earlier version relied on the DB trigger
    // `fn_log_price_change` on `pricing_grid` to log automatically. That
    // trigger was later disabled via `scripts/drop-price-change-trigger.sql`
    // to avoid duplicate logging. Without explicit inserts here, the
    // queue-driven recalcs end up updating `pricing_grid` silently and
    // `executeAutopilotAction` (which queries `price_change_log` filtering
    // by `source='algo_param_change'`) finds zero rows, so the autopilot
    // push call is invoked with an empty `changes` array and nothing
    // actually reaches the PMS. Result: prices in the grid get out of sync
    // with `last_sent_prices` and the UI shows "In attesa di invio auto"
    // forever.
    //
    // Insert in batches of 100 to stay within Supabase's payload limits.
    if (priceChanges.length > 0) {
      const logChunkSize = 100
      for (let i = 0; i < priceChanges.length; i += logChunkSize) {
        const chunk = priceChanges.slice(i, i + logChunkSize)
        const { error: logErr } = await supabase
          .from("price_change_log")
          .insert(chunk)
        if (logErr) {
          // Don't throw: logging failure must not abort the recalc, the
          // pricing_grid upsert below is the source of truth.
          console.error("[v0] PRECIO: price_change_log insert error:", logErr.message)
        }
      }
    }

    // Batch upsert pricing_grid
    if (priceUpdates.length > 0) {
      const chunkSize = 500
      for (let i = 0; i < priceUpdates.length; i += chunkSize) {
        const chunk = priceUpdates.slice(i, i + chunkSize)
        const { error: upsertError } = await supabase
          .from("pricing_grid")
          .upsert(chunk, { onConflict: "hotel_id,room_type_id,rate_id,occupancy,date" })

        if (upsertError) {
          throw new Error(`Failed to upsert pricing_grid: ${upsertError.message}`)
        }
      }
    }

    // Mark queue item as completed
    const { error: updateError } = await supabase
      .from("pricing_recalc_queue")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        affected_price_changes_count: priceChanges.length,
      })
      .eq("id", recalcId)

    if (updateError) {
      throw new Error(`Failed to mark queue item as completed: ${updateError.message}`)
    }

    // FASE 5 (12/05/2026): Summary logging finale - una sola riga riassuntiva
    // invece di log per-row che riempiono la console di Vercel.
    //
    // FASE 3 (12/05/2026) - OBSERVABILITY CROSS-ALGORITHM:
    // Logghiamo SEPARATAMENTE i log per BASE vs K-DRIVEN, perche' i due
    // algoritmi hanno trigger di variazione diversi:
    //  - BASE: cambia per occupancy band / LM / scenario / clamp
    //  - K-DRIVEN: aggiunge cambi per variabili esterne (weather, pace, ecc.)
    // Il prefix [pricing-base] vs [pricing-kdriven] permette di filtrare
    // i log Vercel per tipo di algoritmo.
    const durationMs = Date.now() - startTime
    // FIX 12/05/2026: il tag riflette il vero algorithmType dalla subscription,
    // non l'esistenza di pricingVariables. Cosi' se un hotel ha pricing_variables
    // ma e' su algorithm_type='basic', il tag resta [pricing-base] (corretto:
    // K non viene applicato dal motore).
    const algoTag = algorithmType === "advanced" ? "pricing-kdriven" : "pricing-base"
    console.log(
      `[${algoTag}] hotel=${hotelId} processed=${processedCount} ` +
      `changed=${priceChanges.length} skipped_same_price=${skippedSamePriceCount} ` +
      `skipped_greenfield_no_log=${skippedGreenfieldNoLogCount} ` +
      `skipped_below_min_delta=${skippedBelowMinDeltaCount} (min=${minPriceDeltaEur}EUR) ` +
      `upserts=${priceUpdates.length} clamped_bottom=${clampedBottomCount} ` +
      `clamped_rack=${clampedRackCount} bands_total=${occupancyBands?.length ?? 0} ` +
      `band_groups=${bandGroups?.length ?? 0} lm_levels=${lastMinuteLevels?.length ?? 0} ` +
      `k_vars_active=${(ctx.pricingVariables ?? []).length} ` +
      `duration=${(durationMs / 1000).toFixed(1)}s`
    )

    // FIX 11/05/2026: TRIGGER IMMEDIATO AUTOPILOT
    // Senza questa chiamata, le righe in price_change_log con action_taken='none'
    // restano pending e il push al PMS non avviene MAI (aspetterebbe il cron retry
    // sweep che però è bloccato da backlog enormi di altri hotel).
    // Il prezzo DEVE essere pushato entro 1 minuto dalla variazione.
    // FASE 1 (12/05/2026): autopilot triggherato SOLO se ci sono variazioni REALI.
    // Con il fix sopra, priceChanges contiene solo righe dove old_price != new_price,
    // quindi questo blocco non scatta piu' a vuoto (era la radice del loop infinito).
    if (priceChanges.length > 0) {
      try {
        const { executeAutopilotAction } = await import("@/lib/pricing/auto-trigger")
        const autopilotResult = await executeAutopilotAction(
          hotelId,
          priceChanges.length,
          ["algo_param_change"] // source usato per le righe inserite sopra
        )
        console.log(
          `[pricing-recalc] autopilot hotel=${hotelId} triggered=${autopilotResult.triggered ?? false} ` +
          `mode=${autopilotResult.mode ?? "n/a"} reason=${autopilotResult.reason ?? "ok"}`
        )
      } catch (autopilotErr) {
        // Non bloccare il completamento del recalc, ma loggare l'errore
        console.error(
          `[pricing-recalc] autopilot_failed hotel=${hotelId} error=${autopilotErr instanceof Error ? autopilotErr.message : "unknown"}`
        )
      }
    }

    return {
      success: true,
      affected_price_changes: priceChanges.length,
    }
  } catch (err) {
    console.error("[v0] PRECIO: Error recalculating prices:", err)

    // Mark as failed.
    // NB: il query builder Supabase e' un thenable (ha .then) ma NON ha .catch,
    // quindi ".eq(...).catch(() => {})" lanciava "catch is not a function" ->
    // la riga restava bloccata in 'processing' e l'errore vero veniva mascherato.
    // Usiamo un try/catch reale attorno all'await.
    const errorMsg = err instanceof Error ? err.message : "Unknown error"
    try {
      const { error: markErr } = await supabase
        .from("pricing_recalc_queue")
        .update({
          status: "failed",
          error_message: errorMsg,
        })
        .eq("id", recalcId)
      if (markErr) {
        console.error("[v0] PRECIO: failed to mark queue item as failed:", markErr)
      }
    } catch (markEx) {
      console.error("[v0] PRECIO: exception marking queue item as failed:", markEx)
    }

    return {
      success: false,
      affected_price_changes: 0,
      error: errorMsg,
    }
  }
}
