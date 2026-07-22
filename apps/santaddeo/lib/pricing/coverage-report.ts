/**
 * Coverage report module — extracted from /api/superadmin/pricing-log/coverage
 * so it can be reused by the daily health cron without HTTP roundtrip.
 *
 * Compares pricing_grid (what should be at the PMS) against price_change_log
 * filtered for push sources (what was actually delivered to the PMS) and
 * produces a health score per hotel.
 *
 * Coverage thresholds:
 *   ok              >= 95%
 *   warning         70-94%
 *   critical        < 70%
 *   not_applicable  hotel in modalita' `notify`: per design l'autopilot manda
 *                   solo email all'utente, NON pusha al PMS. Quindi la
 *                   metrica push e' semanticamente irrilevante. La % resta
 *                   calcolata per scopo diagnostico nel pannello super-admin
 *                   ma il cron `pricing-health` non genera alert.
 *
 *                   FIX 15/05/2026: prima la modalita' `notify` ricadeva
 *                   sempre in `critical` (coverage tipicamente 0-10%) e
 *                   generava un alert email giornaliero falso positivo.
 *                   Caso scatenante: Barronci in mode='notify' con 247
 *                   date future, solo 17 pushate manualmente prima del
 *                   cambio modalita' = 8% coverage = alert critical
 *                   ripetuto ogni giorno.
 */

import { createServiceRoleClient } from "@/lib/supabase/server"

/**
 * "unknown" (FIX 29/05/2026): stato per hotel la cui config autopilot non e'
 * leggibile in modo affidabile al momento del calcolo (errore transitorio
 * sulla SELECT autopilot_configs). Prima questi cadevano sul fallback
 * `mode='disabled'` e, avendo coverage calcolata 0%, finivano nel ramo
 * `critical` -> alert email falso positivo. Ora vengono marcati `unknown`
 * e il cron `pricing-health` NON genera alert (come `not_applicable`).
 * Incident scatenante: Hotel Cavallino, report 29/05 con 0% / 95 missing /
 * modalita' "disabled", mentre in realta' era mode='autopilot' con coverage
 * 100% (248/248 date pushate). Causa combinata: lettura config transitoria
 * + lettura paginata troncata (vedi PartialReadError sotto).
 */
export type CoverageStatus = "ok" | "warning" | "critical" | "not_applicable" | "unknown"

export interface HotelCoverageReport {
  hotel: { id: string; name: string }
  autopilot: {
    mode: string
    last_full_sync_at: string | null
    last_push_at: string | null
    last_notification_at: string | null
    num_notify_emails: number
  }
  pricing_grid: {
    total_records: number
    future_records: number
    future_distinct_dates: number
    future_min_date: string | null
    future_max_date: string | null
  }
  push: {
    total_records: number
    distinct_dates: number
    distinct_future_dates: number
    min_pushed_date: string | null
    max_pushed_date: string | null
    sources_breakdown: Record<string, number>
  }
  missing: {
    count: number
    first_missing_date: string | null
    last_missing_date: string | null
    sample_dates: string[]
  }
  health: {
    coverage_pct: number
    status: CoverageStatus
  }
}

const PAGE = 1000

/**
 * Hard cap: 500k righe per query. Su hotel con autopilot attivo da molti
 * mesi, `price_change_log` puo' superare le 200k righe future (Moriano
 * 25/05/2026: 182k righe push verso il futuro). Il cap precedente di 50k
 * troncava silenziosamente il dataset, costruendo un Set<target_date>
 * incompleto e flaggando come "missing" date che erano invece state
 * pushate. 500k tiene un margine 3x e protegge da degenerate data.
 */
const MAX_ROWS = 500_000

/**
 * FIX 29/05/2026 — guard anti-troncamento silenzioso.
 *
 * Root cause dell'incident Cavallino: una lettura paginata puo' terminare
 * prematuramente (pagina corta/vuota per hiccup transitorio del pooler, lag
 * replica, o race con un recalc che sta ripopolando pricing_grid) SENZA
 * lanciare errore. Il Set<date> risultante e' incompleto -> coverage 0% e
 * decine di date "missing" che in realta' erano coperte al 100%, e l'hotel
 * finisce negli alert email come falso positivo.
 *
 * Strategia: prima della paginazione facciamo un COUNT esatto (head:true,
 * zero righe trasferite, servito dagli indici) come "expected". Dopo la
 * paginazione, se il numero di righe raccolte e' sensibilmente INFERIORE
 * all'expected, la lettura e' stata troncata -> lanciamo PartialReadError.
 * L'errore viene catturato da `Promise.allSettled` in
 * computeCoverageForAllHotels: l'hotel viene ESCLUSO dal report di quel giro
 * (loggato) invece di apparire con una coverage fasulla.
 *
 * Tolleranza: nuove righe inserite tra il COUNT e la paginazione fanno solo
 * AUMENTARE il collected (collected >= expected = ok). Un ammanco oltre il
 * 2% indica troncamento (o delete massivi concomitanti, comunque dato non
 * affidabile per un alert).
 */
export class PartialReadError extends Error {
  constructor(table: string, collected: number, expected: number) {
    super(
      `${table}: partial read (collected ${collected} of expected ${expected}) — dato non affidabile, hotel escluso dal report`,
    )
    this.name = "PartialReadError"
  }
}

function assertComplete(table: string, collected: number, expected: number | null): void {
  if (typeof expected !== "number" || expected <= 0) return
  // 0.98: piccola tolleranza per delete concorrenti. Capiamo il caso reale
  // (collected ~= 1 pagina su molte) ben dentro questa soglia.
  if (collected < Math.floor(expected * 0.98)) {
    throw new PartialReadError(table, collected, expected)
  }
}

async function paginatedSelect<T>(
  supabase: any,
  table: string,
  columns: string,
  filters: (q: any) => any,
  /**
   * Colonne per `.order()` esplicito sulla query paginata. Senza ORDER BY,
   * PostgREST `range()` puo' restituire righe in ordine non deterministico
   * tra pagine consecutive su tabelle ad alta scrittura (heap order
   * instabile dopo autovacuum / HOT updates). Su questa pipeline si vede
   * come "date pushate ma flaggate missing" (incident Moriano 25-26/05/2026,
   * coverage 72% su date in realta' coperte al 100%). L'order DEVE
   * arrivare fino a una unique key, altrimenti i tie-break tra pagine
   * restano non deterministici.
   *
   * Vedi anche `recalculate-queued-prices.ts` e `load-pricing-context.ts`
   * per lo stesso fix sulle pipeline di pricing.
   */
  orderBy: Array<{ column: string; ascending?: boolean }>,
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  while (from < MAX_ROWS) {
    let q = filters(supabase.from(table).select(columns))
    for (const o of orderBy) {
      q = q.order(o.column, { ascending: o.ascending !== false })
    }
    const { data, error } = await q.range(from, from + PAGE - 1)
    if (error) throw new Error(`${table} pagination error: ${error.message}`)
    if (!data || data.length === 0) break
    all.push(...(data as T[]))
    if (data.length < PAGE) break
    from += PAGE
  }
  return all
}

/**
 * Compute the coverage report for a single hotel.
 * Public so /api/superadmin/pricing-log/coverage can call it in parallel.
 */
export async function computeCoverageForHotel(
  hotel: { id: string; name: string },
  supabaseClient?: any,
): Promise<HotelCoverageReport> {
  const supabase = supabaseClient || (await createServiceRoleClient())
  const today = new Date().toISOString().split("T")[0]

  // FIX 03/05/2026: rimosso `last_sync_at` dalla SELECT — la colonna NON
  // ESISTE su autopilot_configs (vedi bug auto-trigger.ts del 03/05). La
  // SELECT con un campo inesistente fa fallire la query intera in PostgREST,
  // ritornando data=null e impedendo al daily superadmin email di
  // riconoscere lo stato config dell'autopilot.
  const { data: apConfig, error: apConfigError } = await supabase
    .from("autopilot_configs")
    .select(
      "mode, last_full_sync_at, last_push_at, last_notification_at, notify_emails",
    )
    .eq("hotel_id", hotel.id)
    .maybeSingle()

  // FIX 29/05/2026: se la SELECT config fallisce (errore transitorio), NON
  // assumiamo silenziosamente mode='disabled' (che porterebbe a un alert
  // critical falso positivo). Marchiamo la config come non leggibile ->
  // mode='unknown' -> status='unknown' -> nessun alert per questo giro.
  const configReadable = !apConfigError
  if (apConfigError) {
    console.warn(
      `[coverage-report] autopilot_configs read failed for ${hotel.name} (${hotel.id}): ${apConfigError.message} — marking mode=unknown`,
    )
  }

  // COUNT esatto (head:true) PRIMA della paginazione: serve da expected per
  // il guard anti-troncamento. Usa l'indice (hotel_id, date), zero righe
  // trasferite.
  const gridFutureCountResp = await supabase
    .from("pricing_grid")
    .select("*", { count: "exact", head: true })
    .eq("hotel_id", hotel.id)
    .gte("date", today)
  const gridFutureExpected = gridFutureCountResp.count
  // FIX 30/05/2026: cattura anche l'errore. Su timeout/connessione la COUNT
  // torna {count:null, error:...}. Se non lo rilevi, expected=null bypassa
  // assertComplete e il calcolo prosegue su un read vuoto -> falso 0%.
  const gridCountError = gridFutureCountResp.error

  const gridFuture = await paginatedSelect<{ date: string }>(
    supabase,
    "pricing_grid",
    "date",
    (q: any) => q.eq("hotel_id", hotel.id).gte("date", today),
    // Tie-breaker fino alla unique key di pricing_grid:
    // (hotel_id, date, room_type_id, rate_id, occupancy). hotel_id e' gia'
    // fissato dal filtro, quindi sui restanti campi.
    [
      { column: "date" },
      { column: "room_type_id" },
      { column: "rate_id" },
      { column: "occupancy" },
    ],
  )
  // Se la paginazione ha raccolto molto meno del COUNT, e' stata troncata:
  // lancia -> hotel escluso dal report (no falso positivo).
  assertComplete("pricing_grid", gridFuture.length, gridFutureExpected)
  const gridTotalCountResp = await supabase
    .from("pricing_grid")
    .select("*", { count: "exact", head: true })
    .eq("hotel_id", hotel.id)
  const gridTotal = gridTotalCountResp.count || 0

  const futureDates = new Set(gridFuture.map((r) => r.date))
  const sortedFuture = Array.from(futureDates).sort()
  const minFuture = sortedFuture[0] || null
  const maxFuture = sortedFuture[sortedFuture.length - 1] || null

  // FIX 19/05/2026: prima usavamo `.ilike('source', '%push%')`. Il
  // leading wildcard impedisce all'optimizer di usare un indice e su
  // hotel con molti log la query andava in statement timeout (10s
  // Supabase default). Ora enumeriamo esplicitamente le source push.
  // C'e' un partial index dedicato:
  //   idx_price_change_log_push_target ON (hotel_id, target_date, changed_at DESC)
  //   WHERE source IN (...questa stessa lista...)
  // Se aggiungi una nuova source push, aggiorna SIA questa lista SIA il
  // WHERE del partial index, altrimenti il filtro non sara' coperto.
  // FIX 24/05/2026: aggiunto `algo_param_change`. Questa e' la source
  // emessa dall'autotrigger autopilot (`lib/pricing/auto-trigger.ts`)
  // quando un cambio parametro K innesca un push automatico. Prima
  // era omessa dalla whitelist, quindi le date coperte SOLO da push
  // autopilot risultavano "missing" e la coverage_pct era sottostimata.
  // Incident scatenante: Tenuta Moriano report 24/05 mostrava 39%
  // coverage / 154 missing su pricing_grid che era invece coperto
  // al 100% (le date erano state effettivamente pushate via
  // algo_param_change durante la notte).
  // IMPORTANTE: tieni sincronizzato il partial index
  //   idx_price_change_log_push_target ON (hotel_id, target_date, changed_at DESC)
  //   WHERE source IN (...questa stessa lista...)
  // altrimenti il filtro non sara' coperto e la query rischia
  // statement timeout su hotel con molti log.
  const PUSH_SOURCES = [
    "autopilot_push",
    "manual_push",
    "manual_push_range",
    "manual_push_failed",
    "manual_push_range_failed",
    "algo_param_change",
  ]
  // ============================================================
  // FIX 02/06/2026 — aggregazione push in DB invece di paginare tutte le righe.
  //
  // `price_change_log` accumula MOLTE righe per singola data (ogni push di
  // ogni room_type / rate / occupancy / cambio parametro e' una riga). Esempio
  // reale Barronci 02/06/2026: 561.664 righe push future ma solo 229 DATE
  // distinte. Paginare ~562k righe (a pagine da 1000) per derivare 229 date e'
  // insostenibile e superava il cap `MAX_ROWS` (500k): `paginatedSelect`
  // troncava a 500k, `assertComplete` vedeva collected < expected e lanciava
  // `PartialReadError` -> l'hotel veniva ESCLUSO dal report ogni giorno con un
  // falso "dato non affidabile", pur essendo in realta' coperto al 100%
  // (229/229 date). Vedi log cron pricing-health 02/06 07:04 UTC.
  //
  // Soluzione: calcoliamo in DB (DISTINCT / GROUP BY) solo cio' che serve —
  // l'insieme delle date future pushate + il breakdown per source. Entrambe
  // le query sono coperte dal partial index
  //   idx_price_change_log_push_target ON (hotel_id, target_date, changed_at DESC)
  //   WHERE source IN (...PUSH_SOURCES...)
  // quindi sono index-only e ritornano pochissimi record: niente piu'
  // paginazione (quindi niente troncamento ne' deriva di pagina) e niente
  // statement timeout. Sostituisce sia la vecchia COUNT(head) sia la
  // `paginatedSelect` + `assertComplete` su price_change_log.
  //
  // SQL injection: `hotel.id` e' un UUID proveniente dal DB (validato sotto),
  // `today` e' una data ISO generata da noi, le `PUSH_SOURCES` sono costanti
  // hardcoded -> nessun input utente nella stringa SQL.
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      hotel.id,
    )
  ) {
    throw new Error(
      `coverage-report: hotel.id non e' un UUID valido: ${hotel.id}`,
    )
  }
  const sourcesSql = PUSH_SOURCES.map((s) => `'${s}'`).join(",")
  const pushWhere =
    `hotel_id = '${hotel.id}' AND target_date >= '${today}' ` +
    `AND source = ANY(ARRAY[${sourcesSql}]::text[])`

  // (1) date future distinte effettivamente pushate
  const { data: pushDatesData, error: pushDatesErr } = await supabase.rpc(
    "exec_sql_returning_json",
    {
      query:
        `SELECT DISTINCT target_date FROM price_change_log ` +
        `WHERE ${pushWhere} ORDER BY target_date`,
    },
  )
  // (2) conteggio righe push per source (breakdown diagnostico + totale)
  const { data: pushSrcData, error: pushSrcErr } = await supabase.rpc(
    "exec_sql_returning_json",
    {
      query:
        `SELECT source, COUNT(*)::int AS n FROM price_change_log ` +
        `WHERE ${pushWhere} GROUP BY source`,
    },
  )

  // Se una delle due aggregazioni fallisce (timeout/outage gateway), il dato
  // non e' affidabile: il guard fail-closed a valle marca status='unknown'
  // (nessun alert), esattamente come prima faceva pushCountError.
  const pushCountError = pushDatesErr || pushSrcErr
  const pushDateRows: Array<{ target_date: string }> = Array.isArray(
    pushDatesData,
  )
    ? (pushDatesData as Array<{ target_date: string }>)
    : []
  const pushSrcRows: Array<{ source: string; n: number }> = Array.isArray(
    pushSrcData,
  )
    ? (pushSrcData as Array<{ source: string; n: number }>)
    : []

  const pushedDates = new Set(
    pushDateRows.map((r) => String(r.target_date).slice(0, 10)),
  )
  const sourcesBreakdown: Record<string, number> = {}
  let pushTotalRecords = 0
  for (const r of pushSrcRows) {
    const n = Number(r.n) || 0
    sourcesBreakdown[r.source] = n
    pushTotalRecords += n
  }
  // `expected` per il guard di affidabilita': totale righe push future. Su
  // errore lo lasciamo null cosi' `countsUnreliable` lo intercetta.
  const pushFutureExpected = pushCountError ? null : pushTotalRecords

  // Query separata per ultimo push: usa l'indice (hotel_id, target_date,
  // changed_at DESC) WHERE source IN (...). LIMIT 1 -> Index Scan, no sort.
  const { data: lastPushRow } = await supabase
    .from("price_change_log")
    .select("changed_at")
    .eq("hotel_id", hotel.id)
    .in("source", PUSH_SOURCES)
    .order("changed_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  const lastPushAt = (lastPushRow as any)?.changed_at || apConfig?.last_push_at || null

  const sortedPushed = Array.from(pushedDates).sort()
  const minPushed = sortedPushed[0] || null
  const maxPushed = sortedPushed[sortedPushed.length - 1] || null

  const missing = sortedFuture.filter((d) => !pushedDates.has(d))
  const sampleMissing = missing.slice(0, 10)
  const firstMissing = missing[0] || null
  const lastMissing = missing[missing.length - 1] || null

  const distinctFutureDates = futureDates.size
  const distinctPushedFutureDates = sortedPushed.filter((d) =>
    futureDates.has(d),
  ).length
  const coveragePct =
    distinctFutureDates > 0
      ? Math.round((distinctPushedFutureDates / distinctFutureDates) * 100)
      : 0

  // ============================================================
  // FIX 30/05/2026 — guard di AFFIDABILITA' fail-closed.
  //
  // Incident ricorrente Cavallino: il report del 29/05 e di nuovo del 30/05
  // mostrava 0% / ~95 missing / mode="disabled" mentre l'hotel era
  // mode=autopilot con coverage reale 100% (186k righe push future, 46k
  // griglia). Il fix del 29/05 (assertComplete) NON bastava: assertComplete
  // lancia SOLO se `expected` e' un numero positivo, ma a tempo di cron
  // (09:00 UTC, sotto il carico dei cron concorrenti k-values/sync/push) le
  // query COUNT di questo hotel — il dataset piu' grande — vanno in
  // statement_timeout e tornano {count:null}. Con expected=null il guard
  // viene saltato e il calcolo prosegue su una lettura paginata vuota ->
  // falso 0%. Idem per la config (read null -> mode||"disabled").
  //
  // Principio: i COUNT autorevoli (index-only, la verita' di riferimento)
  // governano l'affidabilita'. NON emettiamo MAI un alert critical/warning
  // da dati che non abbiamo potuto verificare o che si contraddicono.
  //
  //  (a) countsUnreliable: una COUNT ha errore o non e' un numero.
  //  (b) readContradiction: il COUNT dice che esistono righe (>0) ma la
  //      lettura paginata ha prodotto 0 date -> lettura troncata/vuota.
  // In entrambi i casi -> status="unknown" -> il cron NON allerta.
  const countsUnreliable =
    !!gridCountError ||
    !!pushCountError ||
    typeof gridFutureExpected !== "number" ||
    typeof pushFutureExpected !== "number"
  const readContradiction =
    (typeof pushFutureExpected === "number" &&
      pushFutureExpected > 0 &&
      distinctPushedFutureDates === 0) ||
    (typeof gridFutureExpected === "number" &&
      gridFutureExpected > 0 &&
      distinctFutureDates === 0)
  const dataReliable = configReadable && !countsUnreliable && !readContradiction

  if (!dataReliable) {
    console.warn(
      `[coverage-report] dato inaffidabile per ${hotel.name} (${hotel.id}): ` +
        `configReadable=${configReadable} gridCountErr=${!!gridCountError} ` +
        `pushCountErr=${!!pushCountError} gridExpected=${gridFutureExpected} ` +
        `pushExpected=${pushFutureExpected} distinctPushed=${distinctPushedFutureDates} ` +
        `distinctGrid=${distinctFutureDates} -> status=unknown (nessun alert)`,
    )
  }

  // Determina lo status. In modalita' `notify` l'autopilot non pusha al
  // PMS (manda solo email all'utente), quindi la coverage push e'
  // semanticamente irrilevante: status = not_applicable. Il pannello
  // super-admin mostra comunque la % per debug ma il cron health non
  // genera alert (vedi filter in /api/cron/pricing-health).
  // Se il dato non e' affidabile, mode='unknown' e status='unknown' (non
  // allertante). Non assumiamo 'disabled': eviterebbe di mascherare un hotel
  // davvero attivo dietro un falso 0% (incident Cavallino 29-30/05/2026).
  const mode = dataReliable ? apConfig?.mode || "disabled" : "unknown"
  let status: CoverageStatus
  if (!dataReliable) {
    status = "unknown"
  } else if (mode === "notify") {
    status = "not_applicable"
  } else if (mode === "disabled" && distinctPushedFutureDates === 0) {
    // FIX 31/05/2026: un hotel mode='disabled' finisce in questo report
    // SOLO grazie al fix manual-push del 30/04 (incluso se last_push_at
    // < 30gg). Ma se non ha pushato NESSUNA data futura non sta davvero
    // mantenendo i prezzi a mano: il last_push_at recente proviene da un
    // push una-tantum su date ormai passate (tipicamente un recupero
    // incident). Trattarlo come not_applicable -> niente alert.
    //
    // Caso scatenante: Cavallino (mode='disabled'). Il 27/05 abbiamo
    // recuperato 48 push falliti, tutti con target_date=2026-05-25 (data
    // passata). last_push_at e' quindi recente, l'hotel rientra nel
    // report manual-push, ma le date future pushate sono 0 -> coverage
    // 0% -> alert 'critical' falso ogni giorno. Con questo guard
    // l'hotel non genera piu' alert finche' non pusha davvero date
    // future (a quel punto distinctPushedFutureDates > 0 e torna
    // monitorato come un normale manual-push, vedi caso Massabo').
    status = "not_applicable"
  } else {
    status =
      coveragePct >= 95 ? "ok" : coveragePct >= 70 ? "warning" : "critical"
  }

  return {
    hotel: { id: hotel.id, name: hotel.name },
    autopilot: {
      mode,
      last_full_sync_at: apConfig?.last_full_sync_at || null,
      last_push_at: lastPushAt,
      last_notification_at: apConfig?.last_notification_at || null,
      num_notify_emails: Array.isArray(apConfig?.notify_emails)
        ? apConfig.notify_emails.length
        : 0,
    },
    pricing_grid: {
      total_records: gridTotal,
      future_records: gridFuture.length,
      future_distinct_dates: distinctFutureDates,
      future_min_date: minFuture,
      future_max_date: maxFuture,
    },
    push: {
      total_records: pushTotalRecords,
      distinct_dates: pushedDates.size,
      distinct_future_dates: distinctPushedFutureDates,
      min_pushed_date: minPushed,
      max_pushed_date: maxPushed,
      sources_breakdown: sourcesBreakdown,
    },
    missing: {
      count: missing.length,
      first_missing_date: firstMissing,
      last_missing_date: lastMissing,
      sample_dates: sampleMissing,
    },
    health: {
      coverage_pct: coveragePct,
      status,
    },
  }
}

/**
 * Compute coverage for all hotels with autopilot configured (mode in
 * autopilot|notify). Hotels with mode=disabled are excluded — there's no
 * push pipeline expected to run on them.
 *
 * Returns reports sorted by coverage_pct ascending (most problematic first).
 */
export async function computeCoverageForAllHotels(): Promise<HotelCoverageReport[]> {
  const supabase = await createServiceRoleClient()

  // FIX 30/04/2026 (incident Massabo' luglio/agosto 2026):
  // Prima includevamo SOLO hotel con mode in ('autopilot','notify'). Hotel
  // come Massabo' (mode='disabled' ma utente che pusha manualmente da UI)
  // erano completamente esclusi dal coverage report e dall'email
  // diagnostica giornaliera. Risultato: un push manuale fallito poteva
  // restare invisibile per giorni.
  // Ora includiamo anche `mode='disabled'` se l'hotel ha pushato negli
  // ultimi 30 giorni (`last_push_at`) — segno che l'utente lo usa in
  // modalita' manual-push. Questi hotel hanno bisogno dello stesso
  // monitoraggio coverage degli automatici.
  //
  // NOTA (refinement 31/05/2026): `last_push_at` da solo non basta a
  // distinguere un vero manual-push da un push una-tantum su date
  // passate (recupero incident). Il filtro a valle e' in
  // `computeCoverageForHotel`: un hotel disabled qui incluso ma con 0
  // date FUTURE pushate viene marcato `not_applicable` (no alert).
  // Vedi commento sul calcolo dello `status`.
  const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const [activeResp, manualResp] = await Promise.all([
    supabase
      .from("autopilot_configs")
      .select("hotel_id, hotels!inner(id, name)")
      .in("mode", ["autopilot", "notify"]),
    supabase
      .from("autopilot_configs")
      .select("hotel_id, hotels!inner(id, name)")
      .eq("mode", "disabled")
      .gte("last_push_at", thirtyDaysAgoIso),
  ])

  if (activeResp.error) {
    throw new Error(`Failed to load active hotels: ${activeResp.error.message}`)
  }
  if (manualResp.error) {
    console.error(
      "[coverage-report] Manual-push hotels query error (non blocking):",
      manualResp.error.message,
    )
  }

  const seen = new Set<string>()
  const hotelsToAnalyze: Array<{ id: string; name: string }> = []
  for (const r of [...((activeResp.data as any) || []), ...((manualResp.data as any) || [])]) {
    const h = r.hotels
    if (!h || !h.id) continue
    if (seen.has(h.id)) continue
    seen.add(h.id)
    hotelsToAnalyze.push(h)
  }

  const reports: HotelCoverageReport[] = []
  for (let i = 0; i < hotelsToAnalyze.length; i += 5) {
    const batch = hotelsToAnalyze.slice(i, i + 5)
    // settle anziche' all: se 1 hotel fallisce (es. timeout su un dataset
    // degenere), gli altri 4 del batch e i successivi devono comunque
    // produrre un report. L'errore singolo viene loggato ma non propagato.
    const settled = await Promise.allSettled(
      batch.map((h: any) => computeCoverageForHotel(h, supabase)),
    )
    for (let j = 0; j < settled.length; j++) {
      const s = settled[j]
      if (s.status === "fulfilled") {
        reports.push(s.value)
      } else {
        console.error(
          `[coverage-report] computeCoverageForHotel failed for ${batch[j].name} (${batch[j].id}):`,
          s.reason,
        )
      }
    }
  }

  reports.sort((a, b) => a.health.coverage_pct - b.health.coverage_pct)
  return reports
}
