import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { Redis } from "@upstash/redis"
import { isTransientError, logSupabaseError, withTimeout } from "@/lib/supabase/error-utils"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const hotelId = searchParams.get("hotel_id")
  const module = searchParams.get("module") || "bookings"

  if (!hotelId) {
    return NextResponse.json({ error: "hotel_id is required" }, { status: 400 })
  }

  // We consider THREE possible sources of truth for "last sync" and keep
  // the most recent value across them:
  //   1) pms_cron_settings  — Scidoo cron modules (bookings, availability, ...)
  //   2) sync_logs          — historical log entries
  //   3) pms_integrations   — primary timestamp for Google Sheets mode, where
  //                           cron_settings/sync_logs are never populated
  // This fixes the UX bug where hotels syncing via Google Sheets showed
  // "Mai sincronizzato" in the header while settings/pms showed a recent sync.
  //
  // Questa route e' interrogata in continuazione dalla UI (badge "ultima
  // sincronizzazione"). Durante un outage del gateway Supabase (Cloudflare 522:
  // pagina HTML al posto del JSON) l'auth/PostgREST puo' restare appeso o
  // lanciare AuthUnknownError ("Unexpected token '<'"). Avvolgiamo tutto in un
  // timeout fail-fast e, sugli errori transitori, rispondiamo 503 neutro senza
  // crashare ne' bruciare i 300s di runtime: la UI riprovera' al prossimo poll.
  let cronSettings: { last_run: string | null; last_status: string | null } | null = null
  let syncLog: { created_at: string | null; status: string | null } | null = null
  let integration: { last_sync_at: string | null; last_sync_status: string | null } | null = null
  try {
    const supabase = await createClient()
    const [cs, sl, integ] = await withTimeout(
      Promise.all([
        supabase
          .from("pms_cron_settings")
          .select("last_run, last_status")
          .eq("hotel_id", hotelId)
          .eq("module", module)
          .maybeSingle(),
        supabase
          .from("sync_logs")
          .select("created_at, status")
          .eq("hotel_id", hotelId)
          .eq("sync_type", module)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("pms_integrations")
          .select("last_sync_at, last_sync_status")
          .eq("hotel_id", hotelId)
          .maybeSingle(),
      ]),
      15_000,
      "last-sync queries",
    )
    cronSettings = cs.data
    syncLog = sl.data
    integration = integ.data
  } catch (error) {
    logSupabaseError("pms/last-sync", error)
    if (isTransientError(error)) {
      // Outage/timeout transitorio: 503 neutro, niente allarme. La UI tratta
      // l'assenza di dati come "freschezza sconosciuta" e riprova.
      return NextResponse.json(
        { lastSync: null, status: null, minutesSinceSync: null, freshness: "unknown", circuitBreakerOpen: false, source: null, transient: true },
        { status: 503 },
      )
    }
    return NextResponse.json({ error: "internal error" }, { status: 500 })
  }

  // Keep source metadata so we can pick the appropriate freshness thresholds.
  // Scidoo cron runs every few minutes → tight thresholds (30/120 min).
  // Google Sheets mode runs every ~3 hours → relax thresholds (6h/12h) to
  // avoid false "Dati non recenti" / "Sync bloccato" warnings.
  type Src = "scidoo" | "gsheets"
  const candidates: Array<{ ts: string | null; status: string | null; src: Src }> = [
    { ts: cronSettings?.last_run ?? null, status: cronSettings?.last_status ?? null, src: "scidoo" },
    { ts: syncLog?.created_at ?? null, status: syncLog?.status ?? null, src: "scidoo" },
    { ts: integration?.last_sync_at ?? null, status: integration?.last_sync_status ?? null, src: "gsheets" },
  ]

  // Pick the most recent timestamp across all sources.
  const mostRecent = candidates
    .filter((c) => c.ts)
    .sort((a, b) => new Date(b.ts as string).getTime() - new Date(a.ts as string).getTime())[0]

  const lastSync: string | null = mostRecent?.ts ?? null
  const status: string | null = mostRecent?.status ?? null
  const source: Src | null = mostRecent?.src ?? null

  // Check if ANY endpoint circuit breaker is open for this hotel
  let circuitBreakerOpen = false
  try {
    const { isAnyCircuitOpen } = await import("@/lib/services/scidoo-client")
    circuitBreakerOpen = await isAnyCircuitOpen(hotelId)
  } catch {
    // import or Redis not available, skip
  }

  // Calculate minutes since last sync
  const minutesSinceSync = lastSync
    ? Math.round((Date.now() - new Date(lastSync).getTime()) / 60000)
    : null

  // Thresholds depend on sync mode
  const staleAfter = source === "gsheets" ? 360 : 30 // 6h vs 30min
  const criticalAfter = source === "gsheets" ? 720 : 120 // 12h vs 2h

  // Determine freshness
  let freshness: "fresh" | "stale" | "critical" = "fresh"
  // Circuit breaker only applies to Scidoo hotels; ignore for pure gsheets mode.
  const breakerBlocks = circuitBreakerOpen && source !== "gsheets"
  if (minutesSinceSync === null || minutesSinceSync >= criticalAfter || breakerBlocks) {
    freshness = "critical"
  } else if (minutesSinceSync >= staleAfter) {
    freshness = "stale"
  }

  return NextResponse.json({
    lastSync,
    status,
    minutesSinceSync,
    freshness,
    circuitBreakerOpen,
    source,
  })
}
