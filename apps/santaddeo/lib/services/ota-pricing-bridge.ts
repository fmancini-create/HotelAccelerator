/**
 * OTA → Pricing Bridge
 * ====================
 * Distributes OTA signal scores onto daily rows of `pricing_algo_params`,
 * so the K-driven pricing engine can pick them up via the existing
 * `param_key = 'var_<variable_key>'` convention.
 *
 * Created 12/05/2026 (FASE 5 of OTA workflow generalization).
 *
 * Pattern reference: `lib/pricing/k-variables-service.ts > storeKVariableValues()`
 * already establishes this bridge for the cron-calculated K variables. We
 * follow the same shape (date, param_key, param_value 0-10) so the pricing
 * engine reads from a UNIFIED store.
 *
 * Why daily granularity from a periodic snapshot?
 *   The pricing engine works day-by-day. A monthly OTA snapshot has to be
 *   broadcast onto every day in [period_start, period_end]. We use FLAT
 *   distribution (same value every day) because:
 *     - The signal IS a period aggregate, not a daily measurement
 *     - The pricing engine multiplies by K weight + scenarioModifier per
 *       day already, so daily variability happens elsewhere
 *     - A more sophisticated distribution (e.g. weighted by historical
 *       daily occupancy) would require extra data and is overkill for v1.
 *
 * SAFETY: this bridge writes ONLY to `pricing_algo_params`. It NEVER:
 *   - touches `pricing_grid` (single source of truth, owned by the recalc loop)
 *   - calls the pricing engine
 *   - pushes to the PMS
 *   - triggers autopilot
 *
 * The downstream effect: at the next pricing recalc cycle (cron or manual),
 * the engine will read these new param values and incorporate them via the
 * K-driven formula (IF the hotel has algorithm_type='advanced'). For BASE
 * hotels the values are still persisted but inert, exactly as designed.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import {
  computeOtaSignalScores,
  type OtaKpiSnapshotInput,
  type OtaSignalScores,
} from "./ota-signal-scorer"

const OTA_K_KEYS: ReadonlyArray<keyof OtaSignalScores> = [
  "k_ota_views",
  "k_ota_conversion",
  "k_ota_booking_window",
  "k_ota_demand_trend",
] as const

export interface BridgeResult {
  scores: OtaSignalScores
  rows_written: number
  date_range: { start: string; end: string }
  errors: string[]
}

/**
 * Computes scores for the snapshot and broadcasts them to `pricing_algo_params`
 * across every day in [period_start, period_end].
 *
 * Conflict policy: ON CONFLICT (hotel_id, date, param_key) DO UPDATE SET
 * param_value = excluded.param_value. New OTA snapshots OVERWRITE old K
 * values (intentional: the most recent snapshot is the freshest demand signal).
 *
 * If the snapshot has no usable period dates, returns rows_written=0 with
 * an error string — never throws.
 */
export async function bridgeOtaSnapshotToPricingAlgoParams(
  supabase: SupabaseClient,
  snapshot: OtaKpiSnapshotInput & { hotel_id: string },
): Promise<BridgeResult> {
  const errors: string[] = []
  const emptyResult: BridgeResult = {
    scores: {
      k_ota_views: 5,
      k_ota_conversion: 5,
      k_ota_booking_window: 5,
      k_ota_demand_trend: 5,
    },
    rows_written: 0,
    date_range: { start: snapshot.period_start, end: snapshot.period_end },
    errors,
  }

  if (!snapshot.period_start || !snapshot.period_end) {
    errors.push("missing_period_dates")
    return emptyResult
  }

  // Load recent history (excluding the snapshot itself) for the baseline.
  // We grab up to 12 prior snapshots for the same hotel+platform.
  const { data: historyRaw } = await supabase
    .from("hotel_ota_kpi_snapshots")
    .select(
      "platform, period_start, period_end, search_views, property_views, bookings_count, prev_search_views, prev_property_views, prev_bookings_count, ranking_score, ranking_position, total_competitors, total_room_nights, total_revenue, adr",
    )
    .eq("hotel_id", snapshot.hotel_id)
    .eq("platform", snapshot.platform)
    .lt("period_end", snapshot.period_end)
    .order("period_end", { ascending: false })
    .limit(12)

  const history = ((historyRaw ?? []) as OtaKpiSnapshotInput[]) || []

  const scores = computeOtaSignalScores(snapshot, { history })

  // Generate one row per (date, param_key) combination.
  const dates = enumerateDates(snapshot.period_start, snapshot.period_end)
  if (dates.length === 0) {
    errors.push("empty_date_range")
    return { ...emptyResult, scores }
  }

  const rows = dates.flatMap((date) =>
    OTA_K_KEYS.map((key) => ({
      hotel_id: snapshot.hotel_id,
      date,
      param_key: `var_${key}`,
      param_value: scores[key],
      updated_at: new Date().toISOString(),
    })),
  )

  // Upsert in chunks of 500 to stay well below PostgREST's batch limit.
  const CHUNK = 500
  let written = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const { error } = await supabase
      .from("pricing_algo_params")
      .upsert(chunk, { onConflict: "hotel_id,date,param_key" })
    if (error) {
      errors.push(`upsert_chunk_${i}: ${error.message}`)
    } else {
      written += chunk.length
    }
  }

  return {
    scores,
    rows_written: written,
    date_range: { start: snapshot.period_start, end: snapshot.period_end },
    errors,
  }
}

/**
 * Inclusive YYYY-MM-DD enumeration. Returns up to 366 days to cap memory
 * and to refuse pathologically long periods (a snapshot should never span
 * more than ~1 year).
 */
function enumerateDates(start: string, end: string): string[] {
  const startMs = Date.parse(start + "T00:00:00Z")
  const endMs = Date.parse(end + "T00:00:00Z")
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return []
  }
  const out: string[] = []
  const MAX_DAYS = 366
  for (let t = startMs, n = 0; t <= endMs && n < MAX_DAYS; t += 86400000, n++) {
    out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}
