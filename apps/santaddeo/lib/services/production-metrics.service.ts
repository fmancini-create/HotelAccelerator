/**
 * production-metrics.service.ts
 *
 * Layer sicuro PMS-agnostico per leggere metriche di produzione/disponibilita'/
 * fiscale dalle tabelle normalizzate Santaddeo.
 *
 * Architettura ufficiale (rispettata da queste funzioni):
 *
 *   qualsiasi PMS / Channel Manager / connector
 *     -> raw/staging tables (es. scidoo_raw_bookings, scidoo_raw_fiscal_production,
 *        connectors.scidoo_raw_*)
 *     -> ETL / normalizzazione
 *     -> tabelle normalizzate Santaddeo (daily_production, bookings,
 *        daily_availability, rms_*)
 *     -> funzioni prodotto (dashboard, RevMentor, KPI, alert)
 *
 * REGOLA NON NEGOZIABILE: questo helper e' l'UNICO punto di lettura sicuro per
 * funzioni prodotto. Le raw/staging tables sono riservate a sync, ETL, debug
 * tecnico, audit superadmin.
 *
 * REGOLA SOURCE-SAFETY: la tabella `daily_production` aggrega DUE famiglie di
 * source con semantica diversa (verificato 13/05/2026 con audit DB):
 *
 *   OPERATIONAL_SOURCES (popolano davvero rooms_occupied/rooms_available/
 *   occupancy/adr/revpar in modo coerente):
 *     - scidoo_raw_bookings   (4006 rows, 100% rooms_occupied > 0)
 *     - manual_import_2025    (355 rows, 100% rooms_occupied > 0)
 *     - gsheets_etl           (285 rows, 100% rooms_occupied > 0)
 *     - gsheets               (687 rows, 53% rooms_occupied > 0 - legacy)
 *
 *   FISCAL_SOURCES (popolano revenue/adr/revpar/occupancy_rate dal PMS ma
 *   lasciano rooms_occupied=0 e rooms_available=total_rooms come PLACEHOLDER):
 *     - scidoo_fiscal         (10 rows, 0% rooms_occupied > 0)
 *
 * Aggregare via SUM su tabelle source-miste senza filtrare e' GARANTITO falso.
 * Vedi memoria utente "Taddeo RevMentor numeri incoerenti".
 *
 * REGOLA PMS-AGNOSTIC: l'helper espone API generiche (`getOperationalProductionMetrics`,
 * `getFiscalProductionMetrics`, ecc.) basate su tabelle normalizzate, non su
 * tabelle specifiche di un PMS. L'aggiunta di un nuovo PMS richiede solo di
 * aggiornare i suoi processor ETL per popolare le tabelle normalizzate
 * con la giusta `source` value; nessun cambio in questo helper.
 */

// ---------------- COSTANTI SOURCE (FASE 4 - Regole ufficiali) ----------------

/**
 * Source ammesse per i CONTEGGI camere (rooms_occupied, rooms_available, total_rooms).
 * Solo source che popolano DAVVERO rooms_occupied. Verifica:
 *   SELECT source, COUNT(*) FILTER (WHERE rooms_occupied > 0) FROM daily_production GROUP BY source;
 */
export const RELIABLE_OPERATIONAL_SOURCES_FOR_ROOM_COUNTS = new Set<string>([
  "scidoo_raw_bookings",
  "manual_import_2025",
  "gsheets_etl",
])

/**
 * Source operative in senso lato (anche se hanno qualche placeholder camere).
 * Possono essere usate per ADR/RevPAR/Occupancy aggregati AVG (sono pre-calcolati PMS).
 */
export const OPERATIONAL_SOURCES = new Set<string>([
  "scidoo_raw_bookings",
  "manual_import_2025",
  "gsheets_etl",
  "gsheets", // legacy: popola occupancy_rate ma rooms_occupied a volte 0
])

/**
 * Source FISCALI: popolano revenue/adr/revpar/occupancy dal PMS, MA rooms_occupied=0 placeholder.
 * NON usare per metriche operative di camere.
 */
export const FISCAL_SOURCES = new Set<string>([
  "scidoo_fiscal",
])

/**
 * Versioni ARRAY delle costanti source. Da usare DIRETTAMENTE nei filtri Supabase
 * `.in("source", [...])`. Importare SEMPRE da qui, MAI duplicare letterali nei
 * route handler. Aggiungere/rimuovere una source si fa in UN SOLO posto: questo file.
 *
 * Esempio:
 *   import { OPERATIONAL_SOURCE_KEYS } from "@/lib/services/production-metrics.service"
 *   supabase.from("daily_production").select(...).in("source", OPERATIONAL_SOURCE_KEYS)
 */
export const RELIABLE_OPERATIONAL_SOURCE_KEYS = Array.from(RELIABLE_OPERATIONAL_SOURCES_FOR_ROOM_COUNTS)
export const OPERATIONAL_SOURCE_KEYS = Array.from(OPERATIONAL_SOURCES)
export const FISCAL_SOURCE_KEYS = Array.from(FISCAL_SOURCES)

// ---------------- COSTANTI COPERTURA DATI (FASE 2) ----------------

/**
 * Soglie di copertura dati affidabili (giorni con conteggi camere validi / giorni totali del periodo).
 *
 *  - reliable_room_count_coverage_percent < ERROR  -> data_quality.status = "error"
 *    (RevMentor NON deve dare giudizi operativi mensili)
 *  - >= ERROR e < WARNING                          -> data_quality.status = "warning"
 *    (RevMentor deve esplicitare che la copertura e' parziale)
 *  - >= WARNING                                    -> data_quality.status = "ok"
 *
 * Modificabili in UN SOLO posto. Tutte le regole derivate (prompt RevMentor, alert,
 * dashboard health) leggono da qui.
 */
export const DATA_COVERAGE_ERROR_THRESHOLD_PCT = 30
export const DATA_COVERAGE_WARNING_THRESHOLD_PCT = 70

/**
 * Definizione canonica RevPOR (unica fonte di verita').
 *
 *   RevPOR = total_revenue_operational / rooms_sold_reliable
 *
 * Calcolato come SUM/SUM (non come AVG di colonna PMS pre-calcolata), per evitare
 * il problema matematico AVG-of-ratios != ratio-of-AVGs che produceva valori
 * diversi (254.95 vs 266.12) per lo stesso periodo.
 *
 * Differenza con ADR:
 *   ADR    = room_revenue_operational / rooms_sold_reliable  (solo ricavi camera)
 *   RevPOR = total_revenue_operational / rooms_sold_reliable (ricavi camera + extra)
 */
export const REVPOR_DEFINITION = "total_revenue_operational / rooms_sold_reliable" as const

// ---------------- TYPES ----------------

export type DataQualityStatus = "ok" | "warning" | "error" | "not_available"

export interface DataQuality {
  status: DataQualityStatus
  reason?: string
  details?: Record<string, unknown>
}

export interface OperationalProductionMetrics {
  /** ADR medio (AVG su colonna pre-calcolata PMS) - autoritativo */
  adr: number | null
  /** RevPAR medio (AVG su colonna pre-calcolata PMS) - autoritativo */
  revpar: number | null
  /** RevPOR medio (AVG su colonna pre-calcolata PMS, fallback SUM/SUM su righe affidabili) */
  revpor: number | null
  /** Occupazione PMS (AVG occupancy_rate, autoritativo per ogni source operativa) */
  occupancy_pms: number | null
  /** Occupazione derivata dai conteggi (rooms_sold / capacity), SOLO righe affidabili */
  occupancy_derived: number | null
  /** Totale camere vendute, SOLO righe affidabili */
  rooms_sold: number | null
  /** Totale camere libere residue, SOLO righe affidabili */
  rooms_available: number | null
  /** Capacita totale (total_rooms x giorni affidabili), SOLO righe affidabili */
  total_rooms_capacity: number | null
  /** Revenue totale (somma su righe operative, escludendo fiscale per evitare double-count) */
  room_revenue: number | null
  /** Numero giorni totali nel periodo con dati operativi (utili per UI/debug) */
  days_with_operational_data: number
  /** Numero giorni con conteggi camere affidabili (subset di days_with_operational_data) */
  days_with_reliable_room_counts: number
  /** Numero giorni totali del periodo richiesto (endDate - startDate + 1, inclusivo) */
  period_days: number
  /** Copertura operativa: days_with_operational_data / period_days * 100 */
  operational_coverage_percent: number
  /** Copertura conteggi affidabili: days_with_reliable_room_counts / period_days * 100 */
  reliable_room_count_coverage_percent: number
  /** Definizione canonica RevPOR per il consumer (audit/UI/AI prompt) */
  revpor_definition: typeof REVPOR_DEFINITION
  /** Stato di affidabilita' del set di metriche */
  data_quality: DataQuality
}

export interface FiscalProductionMetrics {
  /** Revenue fiscale totale (somma su righe fiscali) */
  fiscal_revenue: number | null
  /** Numero giorni con dati fiscali */
  days_with_fiscal_data: number
  /** Stato di affidabilita' */
  data_quality: DataQuality
}

export interface RevenueSummary {
  operational: OperationalProductionMetrics
  fiscal: FiscalProductionMetrics
  /** Sources operative effettivamente trovate nel periodo */
  operational_sources_found: string[]
  /** Sources fiscali effettivamente trovate nel periodo */
  fiscal_sources_found: string[]
  /** Periodo richiesto */
  period: { start_date: string; end_date: string }
}

// ---------------- INPUT TYPES ----------------

interface QueryParams {
  hotelId: string
  startDate: string // YYYY-MM-DD
  endDate: string   // YYYY-MM-DD
}

interface DPRow {
  date: string
  adr: number | string | null
  revpar: number | string | null
  revpor: number | string | null
  occupancy_rate: number | string | null
  total_revenue: number | string | null
  rooms_occupied: number | null
  rooms_available: number | null
  total_rooms: number | null
  source: string | null
}

// Supabase client passato dall'esterno. Usiamo `any` deliberatamente perche'
// supabase-js v2 ha types generics extremely deep che causano TS2589 quando
// vengono inferiti tramite la nostra SDK + tipi route. L'helper e' compatto
// e tutte le query sono concentrate qui dentro, quindi il tradeoff e' accettabile.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

// ---------------- INTERNAL HELPERS ----------------

function avgOf(
  rows: DPRow[],
  key: "adr" | "revpar" | "revpor" | "occupancy_rate",
): number | null {
  const vals = rows
    .map((r) => Number(r?.[key]))
    .filter((n) => Number.isFinite(n) && n > 0)
  if (vals.length === 0) return null
  return vals.reduce((s, v) => s + v, 0) / vals.length
}

function sumOf(
  rows: DPRow[],
  key: "total_revenue" | "rooms_occupied" | "rooms_available" | "total_rooms",
): number {
  const vals = rows
    .map((r) => Number(r?.[key]))
    .filter(Number.isFinite)
  return vals.reduce((s, v) => s + v, 0)
}

/**
 * Numero di giorni nel range [startDate, endDate] inclusivo.
 * Robust ai timezone: parse YYYY-MM-DD come UTC.
 */
function periodDaysInclusive(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`).getTime()
  const end = new Date(`${endDate}T00:00:00Z`).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0
  return Math.round((end - start) / 86400000) + 1
}

/**
 * Classifica un set di metriche in base alla copertura dati affidabile.
 * Applica le soglie in `DATA_COVERAGE_*_THRESHOLD_PCT`.
 *
 * Ritorna NULL se la copertura e' sufficiente (>= warning threshold) -> il chiamante
 * potra' poi fare il check occupancy_mismatch. Altrimenti ritorna un DataQuality
 * gia' compilato che spiega la copertura bassa.
 */
function dataQualityForCoverage(
  coveragePct: number,
  days_with_reliable_room_counts: number,
  period_days: number,
  extraDetails: Record<string, unknown> = {},
): DataQuality | null {
  if (coveragePct < DATA_COVERAGE_ERROR_THRESHOLD_PCT) {
    return {
      status: "error",
      reason: "low_data_coverage",
      details: {
        reliable_room_count_coverage_percent: coveragePct,
        days_with_reliable_room_counts,
        period_days,
        error_threshold_pct: DATA_COVERAGE_ERROR_THRESHOLD_PCT,
        warning_threshold_pct: DATA_COVERAGE_WARNING_THRESHOLD_PCT,
        ...extraDetails,
      },
    }
  }
  if (coveragePct < DATA_COVERAGE_WARNING_THRESHOLD_PCT) {
    return {
      status: "warning",
      reason: "low_data_coverage",
      details: {
        reliable_room_count_coverage_percent: coveragePct,
        days_with_reliable_room_counts,
        period_days,
        error_threshold_pct: DATA_COVERAGE_ERROR_THRESHOLD_PCT,
        warning_threshold_pct: DATA_COVERAGE_WARNING_THRESHOLD_PCT,
        ...extraDetails,
      },
    }
  }
  return null
}

async function fetchDailyProduction(
  supabase: SupabaseLike,
  { hotelId, startDate, endDate }: QueryParams,
): Promise<DPRow[]> {
  const { data, error } = await supabase
    .from("daily_production")
    .select("date, adr, revpar, revpor, occupancy_rate, total_revenue, rooms_occupied, rooms_available, total_rooms, source")
    .eq("hotel_id", hotelId)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: true })
  if (error) {
    console.warn("[production-metrics] daily_production fetch error", {
      hotel_id: hotelId,
      start_date: startDate,
      end_date: endDate,
      error: error.message,
    })
    return []
  }
  return (data ?? []) as DPRow[]
}

// ---------------- PUBLIC API ----------------

/**
 * Metriche di produzione OPERATIVA (revenue management, occupancy, ADR/RevPAR).
 *
 * Cosa restituisce:
 *  - ADR / RevPAR / RevPOR / Occupazione PMS: AVG sulle colonne PRE-CALCOLATE PMS
 *    di tutte le righe OPERATIONAL_SOURCES (sono coerenti per costruzione).
 *  - rooms_sold / rooms_available / capacity / occupancy_derived: aggregazioni
 *    SOLO su righe RELIABLE_OPERATIONAL_SOURCES_FOR_ROOM_COUNTS.
 *  - data_quality: 'warning' se la differenza tra occupazione PMS e occupazione
 *    derivata > 2pp (FASE 6 validation guard).
 *
 * Mai usare i conteggi camere (rooms_sold, rooms_available) per concludere
 * giudizi operativi se data_quality.status === 'warning'.
 */
export async function getOperationalProductionMetrics(
  supabase: SupabaseLike,
  params: QueryParams,
): Promise<OperationalProductionMetrics> {
  const allRows = await fetchDailyProduction(supabase, params)
  const opRows = allRows.filter((r) => OPERATIONAL_SOURCES.has(r.source ?? ""))
  const reliableRows = allRows.filter((r) =>
    RELIABLE_OPERATIONAL_SOURCES_FOR_ROOM_COUNTS.has(r.source ?? ""),
  )

  // ---- COPERTURA DATI (FASE 1) ----
  const periodDays = periodDaysInclusive(params.startDate, params.endDate)
  const operationalCoveragePct =
    periodDays > 0 ? (opRows.length / periodDays) * 100 : 0
  const reliableCoveragePct =
    periodDays > 0 ? (reliableRows.length / periodDays) * 100 : 0

  if (opRows.length === 0 && reliableRows.length === 0) {
    return {
      adr: null,
      revpar: null,
      revpor: null,
      occupancy_pms: null,
      occupancy_derived: null,
      rooms_sold: null,
      rooms_available: null,
      total_rooms_capacity: null,
      room_revenue: null,
      days_with_operational_data: 0,
      days_with_reliable_room_counts: 0,
      period_days: periodDays,
      operational_coverage_percent: 0,
      reliable_room_count_coverage_percent: 0,
      revpor_definition: REVPOR_DEFINITION,
      data_quality: {
        status: "not_available",
        reason: "no_operational_rows_in_period",
        details: {
          start_date: params.startDate,
          end_date: params.endDate,
          period_days: periodDays,
          total_rows_in_period: allRows.length,
        },
      },
    }
  }

  // ---- METRICHE PMS AUTORITATIVE (su righe operative, escludendo fiscali) ----
  const occupancyPms = avgOf(opRows, "occupancy_rate")
  const adr = avgOf(opRows, "adr")
  const revpar = avgOf(opRows, "revpar")

  // ---- CONTEGGI CAMERE: solo righe affidabili ----
  const roomsSold = sumOf(reliableRows, "rooms_occupied")
  const capacity = sumOf(reliableRows, "total_rooms")
  const roomsAvailable = sumOf(reliableRows, "rooms_available")
  // clamp a 100%: l'occupazione non puo' superare il 100% (capacita' storica
  // statica + conteggi vendite da fonti fuori capacita'). Vedi nota Obiettivi 27/06/2026.
  const occupancyDerived = capacity > 0 ? Math.min(100, (roomsSold / capacity) * 100) : null

  // ---- RevPOR CANONICO (UN solo calcolo, UN solo file) ----
  // Formula: total_revenue_operational / rooms_sold_reliable
  // SUM/SUM (mai AVG di colonna), per evitare AVG-of-ratios diverso da ratio-of-AVGs.
  // I clienti del helper devono usare SOLO questo valore, mai ricalcolare.
  const totalRevReliable = sumOf(reliableRows, "total_revenue")
  const revpor: number | null =
    totalRevReliable > 0 && roomsSold > 0 ? totalRevReliable / roomsSold : null

  // ---- ROOM REVENUE: somma SOLO su righe operative ----
  // (non includiamo le fiscali per evitare double-count con i tool fiscali)
  const roomRevenue = sumOf(opRows, "total_revenue") || null

  // ---- VALIDATION GUARD ----
  // Priorita': low_data_coverage > occupancy_mismatch > ok.
  // Una copertura bassa rende inutili i conteggi -> non ha senso verificarne la consistenza.
  let dataQuality: DataQuality
  const coverageQuality = dataQualityForCoverage(
    reliableCoveragePct,
    reliableRows.length,
    periodDays,
    {
      operational_coverage_percent: operationalCoveragePct,
      days_with_operational_data: opRows.length,
    },
  )
  if (coverageQuality) {
    dataQuality = coverageQuality
  } else {
    const mismatchPp =
      occupancyPms !== null && occupancyDerived !== null
        ? Math.abs(occupancyDerived - occupancyPms)
        : null
    if (mismatchPp === null) {
      dataQuality = {
        status: reliableRows.length === 0 ? "warning" : "ok",
        reason:
          reliableRows.length === 0
            ? "no_reliable_room_counts"
            : "occupancy_check_skipped",
        details: {
          days_with_operational_data: opRows.length,
          days_with_reliable_room_counts: reliableRows.length,
          reliable_room_count_coverage_percent: reliableCoveragePct,
        },
      }
    } else if (mismatchPp > 2) {
      dataQuality = {
        status: "warning",
        reason: "occupancy_mismatch",
        details: {
          pms_occupancy: occupancyPms,
          derived_occupancy: occupancyDerived,
          mismatch_pp: mismatchPp,
          days_with_operational_data: opRows.length,
          days_with_reliable_room_counts: reliableRows.length,
          reliable_room_count_coverage_percent: reliableCoveragePct,
          sources_in_period: Array.from(new Set(allRows.map((r) => r.source ?? "unknown"))),
        },
      }
    } else {
      dataQuality = {
        status: "ok",
        details: {
          pms_occupancy: occupancyPms,
          derived_occupancy: occupancyDerived,
          mismatch_pp: mismatchPp,
          days_with_operational_data: opRows.length,
          days_with_reliable_room_counts: reliableRows.length,
          reliable_room_count_coverage_percent: reliableCoveragePct,
        },
      }
    }
  }

  return {
    adr,
    revpar,
    revpor,
    occupancy_pms: occupancyPms,
    occupancy_derived: occupancyDerived,
    rooms_sold: reliableRows.length > 0 ? roomsSold : null,
    rooms_available: reliableRows.length > 0 ? roomsAvailable : null,
    total_rooms_capacity: reliableRows.length > 0 ? capacity : null,
    room_revenue: roomRevenue,
    days_with_operational_data: opRows.length,
    days_with_reliable_room_counts: reliableRows.length,
    period_days: periodDays,
    operational_coverage_percent: operationalCoveragePct,
    reliable_room_count_coverage_percent: reliableCoveragePct,
    revpor_definition: REVPOR_DEFINITION,
    data_quality: dataQuality,
  }
}

/**
 * Metriche di produzione FISCALE (revenue contabile, fatture, corrispettivi).
 *
 * Cosa restituisce: solo aggregazioni su righe con FISCAL_SOURCES.
 * Non restituisce mai rooms_occupied/rooms_available (per definizione le
 * source fiscali hanno placeholder camere).
 */
export async function getFiscalProductionMetrics(
  supabase: SupabaseLike,
  params: QueryParams,
): Promise<FiscalProductionMetrics> {
  const allRows = await fetchDailyProduction(supabase, params)
  const fiscalRows = allRows.filter((r) => FISCAL_SOURCES.has(r.source ?? ""))

  if (fiscalRows.length === 0) {
    return {
      fiscal_revenue: null,
      days_with_fiscal_data: 0,
      data_quality: {
        status: "not_available",
        reason: "no_fiscal_rows_in_period",
        details: { start_date: params.startDate, end_date: params.endDate },
      },
    }
  }

  const fiscalRevenue = sumOf(fiscalRows, "total_revenue")
  return {
    fiscal_revenue: fiscalRevenue || null,
    days_with_fiscal_data: fiscalRows.length,
    data_quality: {
      status: "ok",
      details: { sources: Array.from(new Set(fiscalRows.map((r) => r.source ?? "unknown"))) },
    },
  }
}

/**
 * Summary completo: operativo + fiscale separati, mai mescolati.
 * Da preferire quando una pagina/AI vuole presentare entrambi.
 */
export async function getRevenueSummary(
  supabase: SupabaseLike,
  params: QueryParams,
): Promise<RevenueSummary> {
  // Single source of truth: deleghiamo alle due funzioni canoniche. La
  // doppia query e' accettabile (1 select su daily_production con range
  // limitato) ed elimina ogni rischio di drift logico tra summary e funzioni.
  const [operational, fiscal] = await Promise.all([
    getOperationalProductionMetrics(supabase, params),
    getFiscalProductionMetrics(supabase, params),
  ])

  // Per popolare sources_found rifetchiamo le righe? No: le funzioni sopra
  // non ce le restituiscono. Riproduciamo solo le source con una query lite.
  const allRows = await fetchDailyProduction(supabase, params)
  const sourcesFound = Array.from(new Set(allRows.map((r) => r.source ?? "unknown")))

  return {
    operational,
    fiscal,
    operational_sources_found: sourcesFound.filter((s) => OPERATIONAL_SOURCES.has(s)),
    fiscal_sources_found: sourcesFound.filter((s) => FISCAL_SOURCES.has(s)),
    period: { start_date: params.startDate, end_date: params.endDate },
  }
}
