/**
 * OTA Signal Scorer
 * =================
 * Pure function that converts raw OTA KPI snapshots into normalized
 * scores [0..10] suitable as input for the K-driven pricing algorithm.
 *
 * Created 12/05/2026 (FASE 3 of OTA workflow generalization).
 *
 * Why scores [0..10]?
 *   The K-driven pricing engine reads from `pricing_algo_params.param_value`
 *   which is normalized to a [0..10] scale (defined in the Architettura
 *   Ufficiale Santaddeo). Direct raw values (e.g. "1234 search views") are
 *   not comparable across hotels of different sizes. Scores are computed
 *   RELATIVE to the same hotel's recent history (rolling baseline), so a
 *   small B&B with 200 views/period and a 100-room hotel with 50.000
 *   views/period are scored on the same scale.
 *
 * Why 4 specific signals?
 *   - K_OTA_VIEWS:           page views trend (vs baseline → demand signal)
 *   - K_OTA_CONVERSION:      conversion rate (bookings / property_views)
 *   - K_OTA_BOOKING_WINDOW:  ranking score on the platform (visibility/health)
 *   - K_OTA_DEMAND_TREND:    YoY change on bookings (market trend signal)
 *
 * Each signal is independent; the K-driven engine combines them via the
 * pricing_variables weights (configured per-hotel).
 *
 * INPUT:  one fresh snapshot + optional history (up to last 6 months)
 * OUTPUT: { k_ota_views, k_ota_conversion, k_ota_booking_window, k_ota_demand_trend }
 *
 * IMPORTANT: this function is intentionally PURE. No DB calls, no side effects.
 * The caller (e.g. the bridge in pricing_algo_params upsert) decides when/how
 * to persist the scores.
 */

export interface OtaKpiSnapshotInput {
  platform: "booking_com" | "expedia"
  period_start: string // YYYY-MM-DD
  period_end: string
  // Performance fields
  search_views: number | null
  property_views: number | null
  bookings_count: number | null
  prev_search_views: number | null
  prev_property_views: number | null
  prev_bookings_count: number | null
  ranking_score: number | null
  ranking_position: number | null
  total_competitors: number | null
  // Production fields
  total_room_nights: number | null
  total_revenue: number | null
  adr: number | null
}

export interface OtaSignalScores {
  k_ota_views: number              // [0..10] - higher = more demand signal
  k_ota_conversion: number         // [0..10] - higher = better conversion = stronger pricing power
  k_ota_booking_window: number     // [0..10] - higher = better platform visibility/ranking
  k_ota_demand_trend: number       // [0..10] - higher = positive YoY trend = stronger demand
}

export interface OtaScorerOptions {
  /**
   * Recent history snapshots for the same hotel+platform.
   * Used to compute relative scores. If empty, falls back to absolute
   * scoring with sensible defaults.
   */
  history?: OtaKpiSnapshotInput[]
  /**
   * Optional explicit baseline override. Useful for tests and for hotels
   * with very little history.
   */
  baseline?: {
    avg_views?: number
    avg_conversion?: number
    avg_ranking_score?: number
  }
}

/**
 * Main entry point. Returns the 4 normalized scores for the given snapshot.
 *
 * If a signal cannot be computed (missing data), returns the NEUTRAL value 5.0
 * (interpretation: "no signal" rather than "negative signal").
 */
export function computeOtaSignalScores(
  snapshot: OtaKpiSnapshotInput,
  options: OtaScorerOptions = {},
): OtaSignalScores {
  const history = options.history ?? []
  const baseline = computeBaseline(history, options.baseline)

  return {
    k_ota_views: scoreViews(snapshot, baseline),
    k_ota_conversion: scoreConversion(snapshot, baseline),
    k_ota_booking_window: scoreBookingWindow(snapshot),
    k_ota_demand_trend: scoreDemandTrend(snapshot),
  }
}

// ----- Baseline -----

interface Baseline {
  avg_views: number | null
  avg_conversion: number | null
  avg_ranking_score: number | null
}

function computeBaseline(
  history: OtaKpiSnapshotInput[],
  override: OtaScorerOptions["baseline"],
): Baseline {
  const validViews = history
    .map((h) => h.property_views)
    .filter((v): v is number => typeof v === "number" && v > 0)
  const validConversions = history
    .map((h) =>
      typeof h.property_views === "number" &&
      h.property_views > 0 &&
      typeof h.bookings_count === "number"
        ? h.bookings_count / h.property_views
        : null,
    )
    .filter((v): v is number => v !== null && Number.isFinite(v))
  const validRankings = history
    .map((h) => h.ranking_score)
    .filter((v): v is number => typeof v === "number" && v >= 0)

  return {
    avg_views: override?.avg_views ?? avg(validViews),
    avg_conversion: override?.avg_conversion ?? avg(validConversions),
    avg_ranking_score: override?.avg_ranking_score ?? avg(validRankings),
  }
}

// ----- Signal 1: views (demand pressure on the listing) -----

/**
 * Score the current period's property_views against the hotel's own historical
 * average. If current > 2x baseline → score 10, if equal → score 5,
 * if zero → score 0.
 *
 * Why property_views and not search_views? search_views can spike for
 * non-meaningful reasons (Booking adjusting their algorithm, country
 * promotions, etc.) — property_views is closer to actual user intent.
 */
function scoreViews(snapshot: OtaKpiSnapshotInput, baseline: Baseline): number {
  const current = snapshot.property_views
  if (current == null || current < 0) return 5.0 // no signal

  if (baseline.avg_views == null || baseline.avg_views <= 0) {
    // No history: use absolute thresholds calibrated on small-mid hotels
    if (current === 0) return 0
    if (current < 100) return 3
    if (current < 500) return 5
    if (current < 2000) return 7
    return 9
  }

  // Ratio current / baseline. Clamp [0, 2] then map to [0, 10].
  const ratio = current / baseline.avg_views
  const clamped = Math.max(0, Math.min(2, ratio))
  return round1(clamped * 5)
}

// ----- Signal 2: conversion rate (revenue management leverage) -----

/**
 * Score = current conversion vs baseline conversion.
 * Conversion = bookings / property_views.
 *
 * A high conversion rate means users who land on the listing book often,
 * which is a strong signal that the listing has a price/value advantage
 * → safe to push prices up. Low conversion = the opposite.
 */
function scoreConversion(snapshot: OtaKpiSnapshotInput, baseline: Baseline): number {
  if (
    snapshot.property_views == null ||
    snapshot.property_views <= 0 ||
    snapshot.bookings_count == null
  ) {
    return 5.0 // no signal
  }
  const current = snapshot.bookings_count / snapshot.property_views
  if (!Number.isFinite(current)) return 5.0

  if (baseline.avg_conversion == null || baseline.avg_conversion <= 0) {
    // No baseline: absolute thresholds. Typical OTA conversion is 1-3%.
    if (current >= 0.05) return 9
    if (current >= 0.03) return 7
    if (current >= 0.015) return 5
    if (current >= 0.005) return 3
    return 1
  }

  const ratio = current / baseline.avg_conversion
  const clamped = Math.max(0, Math.min(2, ratio))
  return round1(clamped * 5)
}

// ----- Signal 3: ranking / visibility (booking window proxy) -----

/**
 * Score the platform-reported ranking score directly. This is already on a
 * 0-10 (or 0-100) scale depending on the platform; we normalize.
 *
 * If ranking_position vs total_competitors is available, we use that as a
 * secondary signal: higher relative position = higher score.
 */
function scoreBookingWindow(snapshot: OtaKpiSnapshotInput): number {
  // Direct ranking score takes priority if available.
  if (snapshot.ranking_score != null) {
    // Heuristic: if it's between 0-10 use as-is, otherwise normalize from 0-100.
    if (snapshot.ranking_score <= 10) return round1(snapshot.ranking_score)
    return round1((snapshot.ranking_score / 100) * 10)
  }

  // Fallback: positional ranking.
  if (
    snapshot.ranking_position != null &&
    snapshot.total_competitors != null &&
    snapshot.total_competitors > 0
  ) {
    // Position 1 of N → score 10, position N of N → score 0.
    const percentile = 1 - (snapshot.ranking_position - 1) / snapshot.total_competitors
    return round1(Math.max(0, Math.min(1, percentile)) * 10)
  }

  return 5.0 // no signal
}

// ----- Signal 4: YoY demand trend -----

/**
 * Score the year-over-year delta on bookings. Positive growth = market
 * is hot → push prices. Negative growth = market is cold → defend rates.
 *
 * Mapping (after clamping delta to [-50%, +50%]):
 *   -50% → score 0
 *   -25% → score 2.5
 *     0% → score 5  (neutral)
 *   +25% → score 7.5
 *   +50% → score 10
 */
function scoreDemandTrend(snapshot: OtaKpiSnapshotInput): number {
  const current = snapshot.bookings_count
  const previous = snapshot.prev_bookings_count
  if (
    current == null ||
    previous == null ||
    previous <= 0
  ) {
    return 5.0 // no signal
  }

  const delta = (current - previous) / previous
  const clamped = Math.max(-0.5, Math.min(0.5, delta))
  // [-0.5, +0.5] → [0, 10]
  return round1((clamped + 0.5) * 10)
}

// ----- Helpers -----

function avg(arr: number[]): number | null {
  if (arr.length === 0) return null
  return arr.reduce((s, v) => s + v, 0) / arr.length
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
