import { type NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"
import { pushPricesToPMS } from "@/lib/pricing/push-prices"
import { sendPriceChangeEmailGuarded } from "@/lib/pricing/autopilot-email"
import type { PriceChange } from "@/lib/pricing/calculate-suggested-price"

export const maxDuration = 300

/**
 * POST /api/autopilot/push-range
 *
 * Manda al PMS tutti i prezzi presenti in `pricing_grid` per il range di date
 * specificato. Diversamente da /api/superadmin/push-prices-range, e' accessibile
 * a TUTTI gli utenti che hanno accesso all'hotel (non richiede super_admin).
 *
 * Body: { hotelId: string, dateFrom: "YYYY-MM-DD", dateTo: "YYYY-MM-DD",
 *         rateIds?: string[] }
 *
 * `rateIds` (opzionale): se fornito, restringe il push a quelle tariffe.
 * Se assente o array vuoto = tutte le tariffe madri (le derivate vengono
 * sempre escluse perche' Scidoo le ricalcola dalla madre).
 *
 * Comportamento:
 *  - Validate access via validateHotelAccess (super_admin oppure hotel_users / org match)
 *  - Carica pricing_grid per il range (paginato per evitare cap default 1000 di Supabase)
 *  - Filtra difensivamente i record con occupancy fuori range della camera (vedi memoria
 *    "Pricing push: occ fuori range della camera" — ManuBot/Massabo)
 *  - Push al PMS via pushPricesToPMS (Scidoo, GSheets, ecc.)
 *  - Aggiorna last_sent_prices, autopilot_configs.last_push_at, price_change_log
 *  - Manda email di notifica se autopilot_configs.notify_emails != []
 *  - Non bypassa la dedup: scrive comunque last_sent_prices alla fine, ma legge
 *    SEMPRE da pricing_grid quindi il push include anche date dove "non e' cambiato
 *    nulla", che e' esattamente quello che l'utente vuole quando seleziona un range.
 */
export async function POST(request: NextRequest) {
  let body: {
    hotelId?: string
    dateFrom?: string
    dateTo?: string
    rateIds?: string[]
    roomTypeIds?: string[]
    occupancies?: number[]
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { hotelId, dateFrom, dateTo, rateIds, roomTypeIds, occupancies } = body
  if (!hotelId || !dateFrom || !dateTo) {
    return NextResponse.json({ error: "hotelId, dateFrom, dateTo richiesti" }, { status: 400 })
  }

  // 23/05/2026: validazione rateIds (opzionale). Se presente deve essere
  // array di string non vuoto. Se assente o array vuoto -> nessun filtro,
  // pushiamo tutte le tariffe madri (comportamento storico).
  let rateIdsFilter: string[] | null = null
  if (Array.isArray(rateIds) && rateIds.length > 0) {
    if (rateIds.some((r) => typeof r !== "string" || r.length === 0)) {
      return NextResponse.json({ error: "rateIds deve contenere solo string non vuote" }, { status: 400 })
    }
    rateIdsFilter = rateIds
  }

  // 20/07/2026: filtro per tipologia camera (opzionale). Stessa semantica di
  // rateIds: assente/vuoto = tutte le camere; array = solo quelle indicate.
  let roomTypeIdsFilter: string[] | null = null
  if (Array.isArray(roomTypeIds) && roomTypeIds.length > 0) {
    if (roomTypeIds.some((r) => typeof r !== "string" || r.length === 0)) {
      return NextResponse.json({ error: "roomTypeIds deve contenere solo string non vuote" }, { status: 400 })
    }
    roomTypeIdsFilter = roomTypeIds
  }

  // 20/07/2026: filtro per occupazione (opzionale). Assente/vuoto = tutte le
  // occupazioni; array = solo le occupazioni indicate (interi positivi).
  let occupanciesFilter: number[] | null = null
  if (Array.isArray(occupancies) && occupancies.length > 0) {
    if (occupancies.some((o) => typeof o !== "number" || !Number.isInteger(o) || o <= 0)) {
      return NextResponse.json(
        { error: "occupancies deve contenere solo interi positivi" },
        { status: 400 },
      )
    }
    occupanciesFilter = occupancies
  }

  // Date format validation
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    return NextResponse.json({ error: "dateFrom e dateTo devono essere YYYY-MM-DD" }, { status: 400 })
  }
  if (dateFrom > dateTo) {
    return NextResponse.json({ error: "dateFrom deve essere <= dateTo" }, { status: 400 })
  }

  // Limita il range a max 730 giorni (2 anni) per evitare push enormi accidentali
  const fromTs = new Date(dateFrom).getTime()
  const toTs = new Date(dateTo).getTime()
  const daysDiff = Math.ceil((toTs - fromTs) / (1000 * 60 * 60 * 24))
  if (daysDiff > 730) {
    return NextResponse.json(
      { error: "Range troppo ampio: massimo 730 giorni (2 anni)" },
      { status: 400 }
    )
  }

  // Auth + access check
  const denied = await validateHotelAccess(hotelId)
  if (denied) return denied

  const supabase = await createServiceRoleClient()

  // Get PMS integration
  const { data: pms } = await supabase
    .from("pms_integrations")
    .select("integration_mode, pms_name, api_key, endpoint_url, property_id, config, gsheet_spreadsheet_id")
    .eq("hotel_id", hotelId)
    .eq("is_active", true)
    .maybeSingle()

  if (!pms) {
    return NextResponse.json(
      { error: "Nessuna integrazione PMS attiva per questo hotel" },
      { status: 404 }
    )
  }

  // Carica pricing_grid per il range — paginato per superare il cap default 1000 di Supabase
  const PAGE = 1000
  type GridRow = {
    room_type_id: string
    rate_id: string
    occupancy: number
    date: string
    price: number
  }
  const allPrices: GridRow[] = []
  let from = 0
  while (true) {
    let query = supabase
      .from("pricing_grid")
      .select("room_type_id, rate_id, occupancy, date, price")
      .eq("hotel_id", hotelId)
      .gte("date", dateFrom)
      .lte("date", dateTo)
      .gt("price", 0)
    // 20/07/2026: filtri opzionali camera/occupazione applicati a livello DB
    // per ridurre il payload (oltre al filtro tariffa, gestito piu' sotto sui
    // PriceChange perche' puo' includere override sulle derivate).
    if (roomTypeIdsFilter) query = query.in("room_type_id", roomTypeIdsFilter)
    if (occupanciesFilter) query = query.in("occupancy", occupanciesFilter)
    const { data: page, error } = await query.range(from, from + PAGE - 1)
    if (error) {
      return NextResponse.json(
        { error: `Errore lettura pricing_grid: ${error.message}` },
        { status: 500 }
      )
    }
    if (!page || page.length === 0) break
    allPrices.push(...page)
    if (page.length < PAGE) break
    from += PAGE
  }

  if (allPrices.length === 0) {
    return NextResponse.json({
      success: false,
      message: `Nessun prezzo in pricing_grid per il range ${dateFrom} -> ${dateTo}`,
      gridCount: 0,
      pushed: 0,
      totalInGrid: 0,
      errors: [],
      range: { from: dateFrom, to: dateTo },
    })
  }

  // Carica room types e rates per il mapping nel push
  const { data: roomTypes } = await supabase
    .from("room_types")
    .select(
      "id, code, name, scidoo_room_type_id, brig_room_code, slope_lodging_type_id, min_occupancy, max_occupancy",
    )
    .eq("hotel_id", hotelId)
    .eq("is_active", true)

  // 23/05/2026 (incident Tenuta Moriano): aggiunto parent_rate_id alla
  // SELECT per filtrare le derivate. Vedi commento in /api/autopilot/push.
  const { data: rates } = await supabase
    .from("rates")
    .select("id, name, scidoo_rate_id, brig_rate_code, slope_rate_plan_id, parent_rate_id")
    .eq("hotel_id", hotelId)

  const rtMap = new Map((roomTypes || []).map((r) => [r.id, r]))

  // Build PriceChange[] dal pricing_grid
  const priceChanges: PriceChange[] = allPrices.map((p) => ({
    roomTypeId: p.room_type_id,
    roomTypeName: rtMap.get(p.room_type_id)?.name || "N/D",
    rateId: p.rate_id,
    occupancy: p.occupancy,
    date: p.date,
    currentPrice: null,
    suggestedPrice: p.price,
  }))

  // 23/05/2026: scarta tariffe derivate prima del push (Scidoo le ricalcola
  // dalla madre). Senza questo filtro, su Tenuta Moriano si vedevano 22+
  // batch tutti success:true ma il pannello PMS restava sui prezzi vecchi.
  const derivedRateIds = new Set(
    ((rates || []) as Array<{ id: string; parent_rate_id: string | null }>)
      .filter((r) => r.parent_rate_id != null)
      .map((r) => r.id),
  )
  // 23/05/2026: filtro per tariffa scelto dall'utente nel dialog.
  // - userRateFilter = null  -> nessuna scelta utente: applichiamo il filtro
  //                              automatico contro le derivate (comportamento
  //                              di default sicuro).
  // - userRateFilter = Set   -> l'utente ha selezionato N tariffe: rispettiamo
  //                              la sua scelta letteralmente, anche se
  //                              include derivate (utile per debug: forzare
  //                              il push di una singola derivata e vedere se
  //                              Scidoo la accetta).
  const userRateFilter = rateIdsFilter ? new Set(rateIdsFilter) : null

  const beforeFilter = priceChanges.length
  const filteredChanges = priceChanges.filter((c) => {
    if (userRateFilter) {
      // Scelta esplicita: rispetta la selezione utente, niente filtro derivate.
      return userRateFilter.has(c.rateId)
    }
    // Default: scarta le derivate.
    return !derivedRateIds.has(c.rateId)
  })
  const derivedSkipped = userRateFilter
    ? 0
    : priceChanges.filter((c) => derivedRateIds.has(c.rateId)).length
  const userFilterSkipped = userRateFilter
    ? priceChanges.filter((c) => !userRateFilter.has(c.rateId)).length
    : 0
  if (derivedSkipped > 0) {
    console.log(
      `[v0] [autopilot/push-range] Skip derivate (auto): ${derivedSkipped} righe (su ${beforeFilter})`,
    )
  }
  if (userFilterSkipped > 0) {
    console.log(
      `[v0] [autopilot/push-range] User rate filter: scartate ${userFilterSkipped} righe non selezionate (rateIds=${rateIdsFilter?.join(",")})`,
    )
  }
  // Se l'utente ha selezionato derivate esplicitamente, lo loggo per
  // tracciabilita' (debugging dell'incident Moriano).
  if (userRateFilter) {
    const explicitDerived = filteredChanges.filter((c) => derivedRateIds.has(c.rateId)).length
    if (explicitDerived > 0) {
      console.log(
        `[v0] [autopilot/push-range] User ha incluso ${explicitDerived} righe di tariffe DERIVATE (override esplicito del filtro automatico)`,
      )
    }
  }

  if (filteredChanges.length === 0) {
    return NextResponse.json({
      success: false,
      message:
        userRateFilter
          ? "Nessun prezzo da inviare per le tariffe selezionate nel range richiesto."
          : "Tutte le tariffe nel range sono derivate. Push solo le tariffe madri (Scidoo ricalcola le derivate).",
      gridCount: priceChanges.length,
      pushed: 0,
      totalInGrid: allPrices.length,
      derivedSkipped,
      userFilterSkipped,
      errors: [],
      range: { from: dateFrom, to: dateTo },
    })
  }

  console.log(
    `[v0] [autopilot/push-range] hotel=${hotelId} range=${dateFrom}->${dateTo} records=${filteredChanges.length} ` +
      `(derivate=${derivedSkipped}, userFilter=${userFilterSkipped}, ` +
      `roomTypes=${roomTypeIdsFilter ? roomTypeIdsFilter.length : "all"}, ` +
      `occ=${occupanciesFilter ? occupanciesFilter.join("/") : "all"})`
  )

  let pushResult: any
  try {
    pushResult = await pushPricesToPMS(pms, filteredChanges, roomTypes || [], rates || [], {
      hotelId,
      source: "push-range",
    })
  } catch (pushErr) {
    console.error("[v0] [autopilot/push-range] pushPricesToPMS threw:", pushErr)
    return NextResponse.json(
      {
        success: false,
        error: pushErr instanceof Error ? pushErr.message : "Errore push PMS",
      },
      { status: 500 }
    )
  }

  console.log(
    `[v0] [autopilot/push-range] result: success=${pushResult.success}, records=${pushResult.cellsOrRecords}, errors=${pushResult.errors?.length ?? 0}, warnings=${pushResult.warnings?.length ?? 0}`
  )

  // DEFERRED (FIX 04/07/2026): un altro push per questo hotel era gia' in corso
  // (lock di concorrenza per-hotel, vedi lib/pricing/push-lock.ts). NON scriviamo
  // nulla (ne' last_sent_prices, ne' price_change_log): le celle restano "in
  // attesa di invio" e l'utente puo' ripremere "Invia range" tra poco. Status
  // 200 + deferred:true cosi' l'UI mostra un messaggio chiaro invece di un errore.
  if (pushResult?.deferred) {
    console.warn("[v0] [autopilot/push-range] Push RIMANDATO (lock occupato): nessuna scrittura.")
    return NextResponse.json(
      {
        success: false,
        deferred: true,
        method: pushResult.method,
        pushed: 0,
        errors: pushResult.errors || [],
      },
      { status: 200 }
    )
  }

  // Aggiorna last_sent_prices solo se push success
  if (pushResult.success) {
    // Dedup per chiave composita: se allPrices contiene duplicati su (hotel,room,rate,occ,target_date),
    // Postgres ON CONFLICT errora "cannot affect row a second time" e l'INTERO batch fallisce silenzioso
    // → UI mostra prezzi "in attesa di invio" anche se Scidoo ha ricevuto correttamente.
    const upsertsMap = new Map<string, any>()
    for (const p of allPrices) {
      if (!p.rate_id || !p.room_type_id || !p.date) continue
      const key = `${p.room_type_id}|${p.rate_id}|${p.occupancy}|${p.date}`
      upsertsMap.set(key, {
        hotel_id: hotelId,
        room_type_id: p.room_type_id,
        rate_id: p.rate_id,
        occupancy: p.occupancy,
        target_date: p.date,
        last_price: p.price,
        sent_at: new Date().toISOString(),
        source: "manual_push_range",
      })
    }
    const upserts = Array.from(upsertsMap.values())
    for (let i = 0; i < upserts.length; i += 200) {
      const batch = upserts.slice(i, i + 200)
      const { error: lspError } = await supabase
        .from("last_sent_prices")
        .upsert(batch, {
          onConflict: "hotel_id,room_type_id,rate_id,occupancy,target_date",
        })
      if (lspError) {
        console.error(
          `[autopilot/push-range] Error upserting last_sent_prices: ${lspError.message}`
        )
      }
    }

    // Stamp last_push_at
    await supabase
      .from("autopilot_configs")
      .update({ last_push_at: new Date().toISOString() })
      .eq("hotel_id", hotelId)
  }

  // Log every change in price_change_log
  const logs = allPrices
    .filter((p) => p.rate_id)
    .map((p) => ({
      hotel_id: hotelId,
      room_type_id: p.room_type_id,
      rate_id: p.rate_id,
      occupancy: p.occupancy,
      target_date: p.date,
      old_price: null,
      new_price: p.price,
      source: pushResult.success ? "manual_push_range" : "manual_push_range_failed",
      action_taken: pushResult.success ? "pms" : "none",
    }))
  if (logs.length > 0) {
    for (let i = 0; i < logs.length; i += 100) {
      const batch = logs.slice(i, i + 100)
      const { error } = await supabase.from("price_change_log").insert(batch)
      if (error) {
        console.error(`[autopilot/push-range] Error logging: ${error.message}`)
      }
    }
  }

  // Notifica email best-effort se ci sono destinatari configurati
  //
  // FIX 02/05/2026 (incident "9 mail Massabo'"): debounce 60s anche qui.
  // Stesso pattern di /api/autopilot/push e auto-trigger.ts branch notify.
  // Caso reale 01/05/2026 22:00:55 + 22:01:00: due push range distinti a
  // 5s di distanza (range agosto + range maggio) hanno generato 2 mail
  // back-to-back. Con il CAS lock su last_notification_at solo la prima
  // partira'; la seconda viene silenziosamente skip-ata (il PMS riceve
  // comunque entrambi i push, e' solo l'email aggregata che non parte 2x).
  let pushRangeEmailSkipped: string | null = null
  if (pushResult.success) {
    try {
      const { data: apConfig } = await supabase
        .from("autopilot_configs")
        .select("notify_emails, last_notification_at")
        .eq("hotel_id", hotelId)
        .maybeSingle()

      const notifyEmails = (apConfig?.notify_emails as string[] | null | undefined) ?? []
      if (notifyEmails.length > 0) {
        // CAS lock 60s
        const debounceCutoff = new Date(Date.now() - 60_000).toISOString()
        const acquireLockNow = new Date().toISOString()
        const { data: locked, error: lockError } = await supabase
          .from("autopilot_configs")
          .update({ last_notification_at: acquireLockNow })
          .eq("hotel_id", hotelId)
          .or(`last_notification_at.is.null,last_notification_at.lt.${debounceCutoff}`)
          .select("hotel_id")

        const lockAcquired = !lockError && Array.isArray(locked) && locked.length > 0
        if (!lockAcquired) {
          console.log(
            "[v0] [autopilot/push-range] Skipping email: debounce 60s not acquired",
          )
          pushRangeEmailSkipped = "debounce_60s"
        }

        if (lockAcquired) {
        const { data: hotelRow } = await supabase
          .from("hotels")
          .select("name")
          .eq("id", hotelId)
          .maybeSingle()

        // FIX 01/05/2026: arricchisci con last_sent_prices per mostrare
        // i prezzi precedenti nel template email (vedi `/api/autopilot/push`).
        // push-range costruisce changes da `pricing_grid` con
        // `currentPrice: null`, quindi senza enrichment TUTTE le righe
        // della mail mostrerebbero "Nuovo" anche se in realta' sono
        // varianti di prezzi gia' pushati.
        const enrichedChanges = await enrichChangesWithLastSentRange(
          supabase,
          hotelId,
          filteredChanges,
          dateFrom,
          dateTo,
        )

        // FIX storm 12/05/2026: via guarded sender. push-range è sempre
        // un click utente esplicito (seleziona range + Invia), quindi
        // bypassDebounce per non far sparire la conferma del push.
        await sendPriceChangeEmailGuarded(
          {
            hotelId,
            hotelName: hotelRow?.name || "Hotel",
            changes: enrichedChanges,
            emails: notifyEmails,
            pushResult,
            sourceLabel: `push range (${dateFrom} -> ${dateTo})`,
          },
          { bypassDebounce: true },
        )
        } // end if (lockAcquired)
      }
    } catch (emailErr) {
      console.error("[autopilot/push-range] Email notification error:", emailErr)
    }
  }

  return NextResponse.json({
    success: pushResult.success,
    method: pushResult.method,
    pushed: pushResult.cellsOrRecords,
    totalInGrid: allPrices.length,
    errors: pushResult.errors || [],
    // Soft warnings (skip occ fuori range): non bloccanti, mostrati come info nella UI.
    warnings: pushResult.warnings || [],
    range: { from: dateFrom, to: dateTo },
    emailSkipped: pushRangeEmailSkipped,
  })
}

/**
 * Variante "range-aware" di enrichChangesWithLastSent. La differenza con
 * la versione in `/api/autopilot/push/route.ts` e' che qui conosciamo
 * gia' il bounding range (dateFrom/dateTo) quindi non serve calcolarlo
 * dalle changes. Tutto il resto e' identico.
 */
async function enrichChangesWithLastSentRange(
  supabase: Awaited<ReturnType<typeof createServiceRoleClient>>,
  hotelId: string,
  changes: PriceChange[],
  dateFrom: string,
  dateTo: string,
): Promise<PriceChange[]> {
  const PAGE = 1000
  const lspRows: Array<{
    room_type_id: string
    rate_id: string
    occupancy: number
    target_date: string
    last_price: number | null
  }> = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from("last_sent_prices")
      .select("room_type_id, rate_id, occupancy, target_date, last_price")
      .eq("hotel_id", hotelId)
      .gte("target_date", dateFrom)
      .lte("target_date", dateTo)
      .range(from, from + PAGE - 1)
    if (error) {
      console.error("[autopilot/push-range] enrich lookup error:", error.message)
      return changes
    }
    if (!data || data.length === 0) break
    lspRows.push(...(data as typeof lspRows))
    if (data.length < PAGE) break
    from += PAGE
  }

  const keyOf = (rt: string, rate: string, occ: number, d: string) =>
    `${rt}|${rate}|${occ}|${d}`
  const lspMap = new Map<string, number>()
  for (const r of lspRows) {
    if (r.last_price != null && r.last_price > 0) {
      lspMap.set(
        keyOf(r.room_type_id, r.rate_id, r.occupancy, r.target_date),
        r.last_price,
      )
    }
  }

  let enriched = 0
  const out = changes.map((c) => {
    if (c.currentPrice != null && c.currentPrice > 0) return c
    if (!c.rateId) return c
    const k = keyOf(c.roomTypeId, c.rateId, c.occupancy ?? 2, c.date)
    const prev = lspMap.get(k)
    if (prev != null) {
      enriched++
      return { ...c, currentPrice: prev }
    }
    return c
  })
  console.log(
    `[autopilot/push-range] enrichChangesWithLastSentRange: enriched ${enriched}/${changes.length} rows`,
  )
  return out
}
