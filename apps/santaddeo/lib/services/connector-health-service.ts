import { createClient } from "@/lib/supabase/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { logSupabaseError } from "@/lib/supabase/error-utils"

// Types for legacy API compatibility
export interface HealthCheckResult {
  hotel_id: string
  hotel_name: string
  connector: string
  raw_total: number
  rms_total: number
  diff_total: number
  raw_cancelled: number
  rms_cancelled: number
  diff_cancelled: number
  // FIX 11/05/2026: Aggiunti campi per anno corrente (più rilevanti operativamente)
  raw_annual?: number
  rms_annual?: number
  diff_annual?: number
  drift_pct: number
  alert_triggered: boolean
  checked_at: string
}

export interface CheckAllResult {
  success: boolean
  checked: number
  alerts: number
  results: HealthCheckResult[]
  error?: string
}

export interface ConnectorHealthResult {
  hotelId: string
  hotelName: string
  checkType: "bookings" | "fiscal"
  status: "healthy" | "warning" | "critical"
  rawCount: number
  rmsCount: number
  driftPct: number
  lastSyncAt: string | null
  details: string
}

export interface FiscalHealthResult {
  hotelId: string
  hotelName: string
  recordsLast24h: number
  recordsLast7d: number
  lastSyncAt: string | null
  // "UNKNOWN" usato in dev mode quando lo schema `connectors` non e' esposto.
  status: "HEALTHY" | "BROKEN" | "UNKNOWN"
}

export interface StaleSyncResult {
  hotelId: string
  hotelName: string
  lastSyncAt: string | null
  minutesSinceSync: number
  status: "fresh" | "stale" | "critical"
  circuitBreakerOpen: boolean
}

// Stale thresholds
const STALE_THRESHOLD_MINUTES = 30
const CRITICAL_THRESHOLD_MINUTES = 120

/**
 * Check for stale sync data - detects hotels where last sync > 30 minutes ago
 * Uses sync_logs table and Redis circuit breaker state
 */
export async function checkStaleSyncs(hotelId?: string): Promise<StaleSyncResult[]> {
  const supabase = await createClient()

  // Get hotels with active API integration
  let hotelsQuery = supabase
    .from("hotels")
    .select(`
      id,
      name,
      pms_integrations!inner(
        is_active,
        integration_mode
      )
    `)
    .eq("pms_integrations.is_active", true)
    .eq("pms_integrations.integration_mode", "api")

  if (hotelId) {
    hotelsQuery = hotelsQuery.eq("id", hotelId)
  }

  const { data: hotels, error } = await hotelsQuery
  if (error || !hotels) {
    logSupabaseError("ConnectorHealth fetch hotels (stale check)", error)
    return []
  }

  // Check Redis circuit breaker state for each hotel
  let redis: import("@upstash/redis").Redis | null = null
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    const { Redis } = await import("@upstash/redis")
    redis = new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    })
  }

  const results: StaleSyncResult[] = []

  for (const hotel of hotels) {
    // Get the most recent successful sync for this hotel
    const { data: lastSync } = await supabase
      .from("sync_logs")
      .select("completed_at")
      .eq("hotel_id", hotel.id)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const lastSyncAt = lastSync?.completed_at || null
    const minutesSinceSync = lastSyncAt
      ? Math.round((Date.now() - new Date(lastSyncAt).getTime()) / 60000)
      : 9999

    // Check if ANY endpoint circuit breaker is open for this hotel
    let circuitBreakerOpen = false
    try {
      const { isAnyCircuitOpen } = await import("@/lib/services/scidoo-client")
      circuitBreakerOpen = await isAnyCircuitOpen(hotel.id)
    } catch {
      // ignore import/Redis errors
    }

    let status: "fresh" | "stale" | "critical" = "fresh"
    if (minutesSinceSync >= CRITICAL_THRESHOLD_MINUTES || circuitBreakerOpen) {
      status = "critical"
    } else if (minutesSinceSync >= STALE_THRESHOLD_MINUTES) {
      status = "stale"
    }

    results.push({
      hotelId: hotel.id,
      hotelName: hotel.name,
      lastSyncAt,
      minutesSinceSync,
      status,
      circuitBreakerOpen,
    })
  }

  return results
}

/**
 * Check booking connector health by comparing raw vs normalized counts
 *
 * 20/05/2026: refactor agnostico. Prima leggeva sempre `scidoo_raw_bookings`
 * con `source='scidoo'` -> hotel BRiG (Cavallino, Superlusso) apparivano
 * sempre status='critical' "No raw bookings in last 30 days" anche con sync
 * funzionante. Ora legge il provider reale da `pms_integrations.pms_name`
 * (con fallback a "scidoo" per retro-compatibilita') e usa la tabella raw
 * + il filtro `source` corretti per quel provider.
 */
export async function checkBookingConnectorHealth(hotelId?: string): Promise<ConnectorHealthResult[]> {
  const supabase = await createClient()
  
  // Get hotels with API integration + provider name
  let hotelsQuery = supabase
    .from("hotels")
    .select(`
      id,
      name,
      pms_integrations!inner(
        is_active,
        integration_mode,
        pms_name
      )
    `)
    .eq("pms_integrations.is_active", true)
    .eq("pms_integrations.integration_mode", "api")

  if (hotelId) {
    hotelsQuery = hotelsQuery.eq("id", hotelId)
  }

  const { data: hotels, error: hotelsError } = await hotelsQuery

  if (hotelsError || !hotels) {
    logSupabaseError("ConnectorHealth fetch hotels", hotelsError)
    return []
  }

  const results: ConnectorHealthResult[] = []
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  for (const hotel of hotels) {
    const integration = Array.isArray(hotel.pms_integrations)
      ? hotel.pms_integrations[0]
      : hotel.pms_integrations
    const provider = (integration?.pms_name || "scidoo") as string
    const rawTable = `${provider}_raw_bookings`

    // Count raw bookings (last 30 days). Schema "connectors" non e' sempre
    // esposto via PostgREST: catchiamo l'errore e ritorniamo 0 invece di
    // crashare l'intera dashboard.
    let rawCount = 0
    try {
      const { count } = await supabase
        .from(rawTable)
        .select("*", { count: "exact", head: true })
        .eq("hotel_id", hotel.id)
        .gte("synced_at", since30d)
      rawCount = count ?? 0
    } catch (e) {
      console.error(`[ConnectorHealth] raw count failed for ${provider}:`, e)
    }

    // Count normalized bookings (last 30 days) filtered by provider
    const { count: rmsCount } = await supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("hotel_id", hotel.id)
      .eq("source", provider)
      .gte("synced_at", since30d)

    const raw = rawCount
    const rms = rmsCount ?? 0
    const driftPct = raw > 0 ? Math.abs(raw - rms) / raw * 100 : 0

    let status: "healthy" | "warning" | "critical" = "healthy"
    let details = `Connector ${provider} functioning normally`

    if (raw === 0) {
      status = "critical"
      details = `No raw bookings (${provider}) in last 30 days - connector may be broken or sync never ran`
    } else if (driftPct > 10) {
      status = "critical"
      details = `High drift: ${driftPct.toFixed(1)}% difference between raw and normalized (${provider})`
    } else if (driftPct > 5) {
      status = "warning"
      details = `Moderate drift: ${driftPct.toFixed(1)}% difference (${provider})`
    }

    results.push({
      hotelId: hotel.id,
      hotelName: hotel.name,
      checkType: "bookings",
      status,
      rawCount: raw,
      rmsCount: rms,
      driftPct,
      lastSyncAt: null,
      details,
    })
  }

  return results
}

/**
 * Check fiscal connector health using the monitoring view
 */
export async function checkFiscalConnectorHealth(hotelId?: string): Promise<FiscalHealthResult[]> {
  const supabase = await createClient()

  // Query the monitoring view we created
  let query = supabase
    .rpc("get_fiscal_connector_health")

  const { data, error } = await query

  if (error) {
    // Fallback: query directly if RPC doesn't exist. Logga compatto (in
    // outage l'errore e' un blob HTML 522, qui lo riduciamo a una riga).
    logSupabaseError("ConnectorHealth RPC (fallback direct query)", error)
    
    // FIX 14/05/2026 (incident "alert fiscal_broken per hotel con toggle
    // disattivato"): consideriamo solo hotel con il modulo fiscale ATTIVO
    // in pms_cron_settings. Senza, qualsiasi hotel con PMS attivo
    // generava un alert "fiscal BROKEN" anche se l'utente aveva
    // esplicitamente spento il toggle "Produzione Fiscale".
    // La UI usa module='production' per il toggle, alcuni record legacy
    // 'fiscal_production'. Filtriamo per entrambi.
    let directQuery = supabase
      .from("hotels")
      .select(`
        id,
        name,
        pms_integrations!inner(
          is_active,
          integration_mode
        ),
        pms_cron_settings!inner(
          module,
          enabled
        )
      `)
      .eq("pms_integrations.is_active", true)
      .eq("pms_integrations.integration_mode", "api")
      .in("pms_cron_settings.module", ["production", "fiscal_production"])
      .eq("pms_cron_settings.enabled", true)

    if (hotelId) {
      directQuery = directQuery.eq("id", hotelId)
    }

    const { data: hotels } = await directQuery

    if (!hotels) return []

    // Skip connectors schema queries in dev mode (not exposed via PostgREST)
    const isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === "true"
    if (isDevMode) {
      return hotels.map(hotel => ({
        hotelId: hotel.id,
        hotelName: hotel.name,
        recordsLast24h: 0,
        recordsLast7d: 0,
        lastSyncAt: null,
        status: "UNKNOWN" as const,
      }))
    }

    const results: FiscalHealthResult[] = []

    for (const hotel of hotels) {
      // Count fiscal records in last 24h
      const { count: count24h } = await supabase
        .schema("connectors")
        .from("scidoo_raw_fiscal_production")
        .select("*", { count: "exact", head: true })
        .eq("hotel_id", hotel.id)
        .gte("synced_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

      // Count fiscal records in last 7 days
      const { count: count7d } = await supabase
        .schema("connectors")
        .from("scidoo_raw_fiscal_production")
        .select("*", { count: "exact", head: true })
        .eq("hotel_id", hotel.id)
        .gte("synced_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

      // Get last sync time
      const { data: lastSync } = await supabase
        .schema("connectors")
        .from("scidoo_raw_fiscal_production")
        .select("synced_at")
        .eq("hotel_id", hotel.id)
        .order("synced_at", { ascending: false })
        .limit(1)
        .single()

      results.push({
        hotelId: hotel.id,
        hotelName: hotel.name,
        recordsLast24h: count24h ?? 0,
        recordsLast7d: count7d ?? 0,
        lastSyncAt: lastSync?.synced_at ?? null,
        status: (count24h ?? 0) === 0 ? "BROKEN" : "HEALTHY",
      })
    }

    return results
  }

  // 13/05/2026: la RPC `get_fiscal_connector_health` restituisce campi in
  // snake_case (hotel_name, last_sync_at, records_last_24h, records_last_7d),
  // ma `FiscalHealthResult` e' camelCase. Senza questo mapping, hotelName e
  // lastSyncAt erano undefined a runtime -> le email di alert rendevano
  // "undefined: ultimo sync mai" invece del vero nome hotel.
  const mapped: FiscalHealthResult[] = (data ?? []).map((r: any) => ({
    hotelId: r.hotelId ?? r.hotel_id,
    hotelName: r.hotelName ?? r.hotel_name,
    recordsLast24h: r.recordsLast24h ?? r.records_last_24h ?? 0,
    recordsLast7d: r.recordsLast7d ?? r.records_last_7d ?? 0,
    lastSyncAt: r.lastSyncAt ?? r.last_sync_at ?? null,
    status: (r.status as "HEALTHY" | "BROKEN") ?? "BROKEN",
  }))

  // Filter by hotel if specified
  if (hotelId) {
    return mapped.filter((r) => r.hotelId === hotelId)
  }

  return mapped
}

/**
 * Run full health check and return combined results
 */
export async function runFullHealthCheck(hotelId?: string): Promise<{
  bookings: ConnectorHealthResult[]
  fiscal: FiscalHealthResult[]
  staleSyncs: StaleSyncResult[]
  hasIssues: boolean
}> {
  const [bookings, fiscal, staleSyncs] = await Promise.all([
    checkBookingConnectorHealth(hotelId),
    checkFiscalConnectorHealth(hotelId),
    checkStaleSyncs(hotelId),
  ])

  const hasIssues = 
    bookings.some(r => r.status !== "healthy") ||
    fiscal.some(r => r.status === "BROKEN") ||
    staleSyncs.some(r => r.status !== "fresh")

  return { bookings, fiscal, staleSyncs, hasIssues }
}

/**
 * Send alert email for broken connectors
 */
export async function sendConnectorAlert(results: {
  bookings: ConnectorHealthResult[]
  fiscal: FiscalHealthResult[]
  staleSyncs?: StaleSyncResult[]
}): Promise<void> {
  const brokenBookings = results.bookings.filter(r => r.status === "critical")
  const brokenFiscal = results.fiscal.filter(r => r.status === "BROKEN")
  const staleSyncs = (results.staleSyncs || []).filter(r => r.status !== "fresh")

  if (brokenBookings.length === 0 && brokenFiscal.length === 0 && staleSyncs.length === 0) {
    return
  }

  // Build alert message
  const lines: string[] = ["CONNECTOR HEALTH ALERT", ""]

  if (brokenBookings.length > 0) {
    lines.push("BOOKING CONNECTORS:")
    for (const b of brokenBookings) {
      lines.push(`  - ${b.hotelName}: ${b.details}`)
    }
    lines.push("")
  }

  if (brokenFiscal.length > 0) {
    lines.push("FISCAL CONNECTORS (0 records in last 24h):")
    for (const f of brokenFiscal) {
      lines.push(`  - ${f.hotelName}: Last sync ${f.lastSyncAt ?? "never"}`)
    }
    lines.push("")
  }

  if (staleSyncs.length > 0) {
    lines.push("STALE SYNC DATA:")
    for (const s of staleSyncs) {
      const circuitInfo = s.circuitBreakerOpen ? " [CIRCUIT BREAKER OPEN]" : ""
      lines.push(`  - ${s.hotelName}: Last sync ${s.minutesSinceSync}m ago (${s.status})${circuitInfo}`)
    }
  }

  console.error("[ConnectorHealth] ALERT:", lines.join("\n"))

  // TODO: Integrate with email service
  // await sendEmail({
  //   to: "alerts@santaddeo.com",
  //   subject: "Connector Health Alert",
  //   text: lines.join("\n"),
  // })
}

// ============================================
// LEGACY API FUNCTIONS (for superadmin route)
// ============================================

/**
 * Check connector health for a single hotel
 * Used by POST /api/superadmin/connectors-health with hotelId
 * 
 * FIX 11/05/2026: Esclude prenotazioni con status 'check_out' e 'annullata' dal conteggio RAW
 * perché sono storico che non impatta le operazioni correnti. Il confronto ora è solo su
 * prenotazioni "attive" (confermata, confermata_carta, in_house, ecc.)
 */
export async function checkConnectorHealth(
  supabase: SupabaseClient,
  hotelId: string
): Promise<HealthCheckResult | null> {
  try {
    // Get hotel info
    const { data: hotel } = await supabase
      .from("hotels")
      .select("id, name")
      .eq("id", hotelId)
      .single()

    if (!hotel) return null

    // 19/05/2026: leggiamo il provider reale dal record pms_integrations
    // attivo. Prima era hardcoded "scidoo" e i conteggi erano sbagliati per
    // tutti gli hotel BRiG (Cavallino, Superlusso) che apparivano sempre 0/0
    // in /superadmin/connectors-health con badge "Scidoo" fuorviante.
    const { data: integration } = await supabase
      .from("pms_integrations")
      .select("pms_name")
      .eq("hotel_id", hotelId)
      .eq("is_active", true)
      .maybeSingle()

    const provider = (integration?.pms_name || "scidoo") as "scidoo" | "brig"

    // FIX 27/05/2026 — la metrica RAW vs RMS era inquinata da due bug:
    //
    //  (a) BRiG raw bookings vivono in `connectors.brig_raw_bookings`, NON
    //      in `public.brig_raw_bookings`. La query precedente interrogava
    //      la public (vuota -> tabella legacy) e Cavallino appariva sempre
    //      0 RAW vs 3166 RMS. Inoltre lo schema reale non ha le colonne
    //      `cancellation_date` / `checkout_date` (quelle del codice
    //      precedente erano un mix tra Scidoo e una vecchia versione brig):
    //      le colonne effettive sono `checkin` / `checkout` (timestamptz)
    //      e `original_status` (in pratica sempre NULL su Brig sandbox).
    //      Per identificare le cancellate su Brig si usa
    //      `raw_data->>'status'`.
    //
    //  (b) La definizione di "attivo" era incoerente fra RAW e RMS:
    //      - RAW: status NOT IN (check_out, annullata) -> esclude lo
    //        storico passato.
    //      - RMS: solo `is_cancelled=false` -> include TUTTO lo storico
    //        non cancellato, anche soggiorni di 5 anni fa.
    //      Risultato: hotel con tante prenotazioni storiche (Barronci
    //      11k check_out vecchi) appariva con drift gigantesco
    //      (-11093) ed era marcato "Critico" senza alcun problema reale.
    //
    // Nuova definizione di "attivo": prenotazioni con `checkout >= oggi`,
    // non cancellate. Coerente fra RAW e RMS. I conteggi storici totali
    // restano disponibili come `total` (ma non concorrono al diff).
    const todayISO = new Date().toISOString().slice(0, 10)

    // Helper per costruire una query sulla tabella raw del provider.
    // BRiG e' in schema `connectors`, Scidoo in `public`.
    const rawQuery = (countOnly = true) => {
      const builder =
        provider === "brig"
          ? supabase.schema("connectors").from("brig_raw_bookings")
          : supabase.from("scidoo_raw_bookings")
      const select = countOnly ? "*" : "id"
      return builder
        .select(select, { count: "exact", head: countOnly })
        .eq("hotel_id", hotelId) as ReturnType<typeof builder.select>
    }

    // ---- RAW ATTIVI (checkout futuro o oggi, non cancellate) ----
    let rawActiveQuery = rawQuery()
    if (provider === "brig") {
      // BRiG: cancellate identificate da raw_data->>'status' = 'CANCELLED'
      // (gli `original_status` top-level sono NULL al 100% su sandbox).
      rawActiveQuery = rawActiveQuery
        .gte("checkout", todayISO)
        .or("status_code.is.null,status_code.neq.99")
    } else {
      // Scidoo: status text con valori 'annullata','check_out','...'
      rawActiveQuery = rawActiveQuery
        .gte("checkout_date", todayISO)
        .neq("status", "annullata")
    }
    const { count: rawTotal } = await rawActiveQuery

    // ---- RMS ATTIVI (check_out_date futuro o oggi, non cancellate) ----
    const { count: rmsTotal } = await supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("hotel_id", hotelId)
      .eq("source", provider)
      .eq("is_cancelled", false)
      .gte("check_out_date", todayISO)

    // ---- RAW CANCELLED (info, su tutto lo storico) ----
    let rawCancelledQuery = rawQuery()
    if (provider === "brig") {
      rawCancelledQuery = rawCancelledQuery.eq("status_code", 99)
    } else {
      rawCancelledQuery = rawCancelledQuery.eq("status", "annullata")
    }
    const { count: rawCancelled } = await rawCancelledQuery

    // Count rms cancelled - solo per info
    const { count: rmsCancelled } = await supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("hotel_id", hotelId)
      .eq("source", provider)
      .eq("is_cancelled", true)

    // Conta anche l'anno corrente per diff_ann (più rilevante operativamente)
    const currentYear = new Date().getFullYear()
    const yearStart = `${currentYear}-01-01`

    let rawAnnualQuery = rawQuery()
    if (provider === "brig") {
      rawAnnualQuery = rawAnnualQuery
        .gte("checkin", yearStart)
        .or("status_code.is.null,status_code.neq.99")
    } else {
      rawAnnualQuery = rawAnnualQuery
        .gte("checkin_date", yearStart)
        .neq("status", "annullata")
    }
    const { count: rawAnnual } = await rawAnnualQuery

    const { count: rmsAnnual } = await supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("hotel_id", hotelId)
      .eq("source", provider)
      .eq("is_cancelled", false)
      .gte("check_in_date", yearStart)

    const raw = rawTotal ?? 0
    const rms = rmsTotal ?? 0
    const driftPct = raw > 0 ? Math.abs(raw - rms) / raw * 100 : 0

    return {
      hotel_id: hotel.id,
      hotel_name: hotel.name,
      connector: provider,
      raw_total: raw,
      rms_total: rms,
      diff_total: raw - rms,
      raw_cancelled: rawCancelled ?? 0,
      rms_cancelled: rmsCancelled ?? 0,
      diff_cancelled: (rawCancelled ?? 0) - (rmsCancelled ?? 0),
      drift_pct: driftPct,
      alert_triggered: driftPct > 5,
      checked_at: new Date().toISOString(),
      // Aggiungo campi per anno corrente (il frontend li usa già)
      raw_annual: rawAnnual ?? 0,
      rms_annual: rmsAnnual ?? 0,
      diff_annual: (rawAnnual ?? 0) - (rmsAnnual ?? 0),
    }
  } catch (error) {
    console.error("[checkConnectorHealth] Error:", error)
    return null
  }
}

/**
 * Check all connectors health
 * Used by POST /api/superadmin/connectors-health without hotelId
 */
export async function checkAllConnectorsHealth(
  supabase: SupabaseClient
): Promise<CheckAllResult> {
  try {
    // Get all hotels with API integration
    const { data: hotels } = await supabase
      .from("hotels")
      .select(`
        id,
        name,
        pms_integrations!inner(
          is_active,
          integration_mode
        )
      `)
      .eq("pms_integrations.is_active", true)
      .eq("pms_integrations.integration_mode", "api")

    if (!hotels || hotels.length === 0) {
      return { success: true, checked: 0, alerts: 0, results: [] }
    }

    const results: HealthCheckResult[] = []
    let alerts = 0

    for (const hotel of hotels) {
      const result = await checkConnectorHealth(supabase, hotel.id)
      if (result) {
        results.push(result)
        if (result.alert_triggered) alerts++
      }
    }

    return {
      success: true,
      checked: results.length,
      alerts,
      results,
    }
  } catch (error) {
    console.error("[checkAllConnectorsHealth] Error:", error)
    return {
      success: false,
      checked: 0,
      alerts: 0,
      results: [],
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Get latest health check results grouped by hotel
 * Used by GET /api/superadmin/connectors-health
 */
export async function getLatestHealthByHotel(
  supabase: SupabaseClient
): Promise<HealthCheckResult[]> {
  // For now, run a fresh check since we don't have a logs table yet
  const result = await checkAllConnectorsHealth(supabase)
  return result.results
}
