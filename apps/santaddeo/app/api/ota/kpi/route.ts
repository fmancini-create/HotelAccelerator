import { NextResponse } from "next/server"
import { del } from "@vercel/blob"
import { createClient } from "@/lib/supabase/server"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"
import { bridgeOtaSnapshotToPricingAlgoParams } from "@/lib/services/ota-pricing-bridge"
import type { OtaKpiSnapshotInput } from "@/lib/services/ota-signal-scorer"

// K keys written to pricing_algo_params by the OTA→pricing bridge. Used by
// DELETE to clean up the exact rows an import produced.
const OTA_ALGO_PARAM_KEYS = [
  "var_k_ota_views",
  "var_k_ota_conversion",
  "var_k_ota_booking_window",
  "var_k_ota_demand_trend",
] as const

/**
 * Lists KPI snapshots for a hotel, ordered by period_end DESC.
 * Used by the OTA tab in settings and the `/dati/performance-ota` dashboard.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const hotelId = searchParams.get("hotelId")
  // FASE 2 (12/05/2026): if `platform` is passed we scope the snapshots to it.
  // Without the filter the per-platform tabs (BookingKpiTab, ExpediaKpiTab)
  // would see each other's data. Backward-compat: omitting the param keeps
  // the legacy behavior (return all platforms) for callers like
  // /dati/performance-ota which want the aggregate view.
  const platform = searchParams.get("platform")
  const limit = Math.min(parseInt(searchParams.get("limit") || "24", 10) || 24, 100)

  if (!hotelId) {
    return NextResponse.json({ error: "hotelId required" }, { status: 400 })
  }

  const denied = await validateHotelAccess(hotelId)
  if (denied) return denied

  const supabase = await createClient()
  let query = supabase
    .from("hotel_ota_kpi_snapshots")
    .select("*")
    .eq("hotel_id", hotelId)
    .order("period_end", { ascending: false })
    .limit(limit)
  if (platform) query = query.eq("platform", platform)
  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ snapshots: data ?? [] })
}

/**
 * Inserts (or updates) a KPI snapshot. The unique constraint
 * (hotel_id, platform, period_start, period_end) makes re-submission idempotent.
 */
export async function POST(request: Request) {
  const body = await request.json()
  const {
    hotelId,
    platform = "booking_com",
    periodStart,
    periodEnd,
    searchViews,
    propertyViews,
    bookingsCount,
    prevSearchViews,
    prevPropertyViews,
    prevBookingsCount,
    rankingScore,
    rankingPosition,
    totalCompetitors,
    notes,
  } = body ?? {}

  if (!hotelId || !periodStart || !periodEnd) {
    return NextResponse.json({ error: "hotelId, periodStart, periodEnd required" }, { status: 400 })
  }

  const denied = await validateHotelAccess(hotelId)
  if (denied) return denied

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const payload = {
    hotel_id: hotelId,
    platform,
    period_start: periodStart,
    period_end: periodEnd,
    search_views: searchViews ?? null,
    property_views: propertyViews ?? null,
    bookings_count: bookingsCount ?? null,
    prev_search_views: prevSearchViews ?? null,
    prev_property_views: prevPropertyViews ?? null,
    prev_bookings_count: prevBookingsCount ?? null,
    ranking_score: rankingScore ?? null,
    ranking_position: rankingPosition ?? null,
    total_competitors: totalCompetitors ?? null,
    notes: notes ?? null,
    created_by: user?.id ?? null,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from("hotel_ota_kpi_snapshots")
    .upsert(payload, { onConflict: "hotel_id,platform,period_start,period_end" })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // FASE 5 BRIDGE (manual entry): feed the K-driven engine.
  // Same safety properties as the upload pipeline: writes only to
  // pricing_algo_params, fully non-fatal.
  try {
    const bridgeInput: OtaKpiSnapshotInput & { hotel_id: string } = {
      hotel_id: hotelId,
      platform,
      period_start: periodStart,
      period_end: periodEnd,
      search_views: searchViews ?? null,
      property_views: propertyViews ?? null,
      bookings_count: bookingsCount ?? null,
      prev_search_views: prevSearchViews ?? null,
      prev_property_views: prevPropertyViews ?? null,
      prev_bookings_count: prevBookingsCount ?? null,
      ranking_score: rankingScore ?? null,
      ranking_position: rankingPosition ?? null,
      total_competitors: totalCompetitors ?? null,
      total_room_nights: null,
      total_revenue: null,
      adr: null,
    }
    const bridgeResult = await bridgeOtaSnapshotToPricingAlgoParams(
      supabase,
      bridgeInput,
    )
    console.log("[ota-kpi] bridge done", {
      hotelId,
      platform,
      rows: bridgeResult.rows_written,
      scores: bridgeResult.scores,
      errors: bridgeResult.errors,
    })
    await supabase
      .from("hotel_ota_kpi_snapshots")
      .update({ normalized_scores: bridgeResult.scores })
      .eq("hotel_id", hotelId)
      .eq("platform", platform)
      .eq("period_start", periodStart)
      .eq("period_end", periodEnd)
  } catch (bridgeErr: any) {
    console.error("[ota-kpi] bridge failed (non-fatal):", bridgeErr)
  }

  // Reset reminder "next_run_at" for this user, so the new countdown starts fresh.
  if (user?.id) {
    await supabase
      .from("ota_reminder_settings")
      .update({
        last_triggered_at: new Date().toISOString(),
        next_run_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("hotel_id", hotelId)
      .eq("user_id", user.id)
      .eq("platform", platform)
  }

  return NextResponse.json({ snapshot: data })
}

/**
 * Deletes a single imported KPI snapshot and undoes ALL its side effects, so a
 * wrong import can be fully reverted:
 *   1. the `hotel_ota_kpi_snapshots` row (the visible history entry)
 *   2. the OTA K signals it broadcast onto `pricing_algo_params`
 *      (`var_k_ota_*`) for its period — then RE-BRIDGES any remaining snapshot
 *      whose period overlaps, so we never wipe values that another (still
 *      valid) import legitimately set for those days
 *   3. the underlying uploaded report rows in `hotel_ota_reports` for the same
 *      platform+period, plus their private Blob files
 *
 * Scoped by `hotelId` + tenant access check, exactly like GET/POST.
 */
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  const hotelId = searchParams.get("hotelId")

  if (!id || !hotelId) {
    return NextResponse.json({ error: "id and hotelId required" }, { status: 400 })
  }

  const denied = await validateHotelAccess(hotelId)
  if (denied) return denied

  const supabase = await createClient()

  // 1) Load the snapshot (scoped to the hotel) to know platform + period.
  const { data: snap, error: loadErr } = await supabase
    .from("hotel_ota_kpi_snapshots")
    .select("id, hotel_id, platform, period_start, period_end")
    .eq("id", id)
    .eq("hotel_id", hotelId)
    .maybeSingle()

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 })
  if (!snap) return NextResponse.json({ error: "not found" }, { status: 404 })

  // 2) Delete the snapshot row itself.
  const { error: delErr } = await supabase
    .from("hotel_ota_kpi_snapshots")
    .delete()
    .eq("id", id)
    .eq("hotel_id", hotelId)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  // 3) Remove the OTA K signals this import broadcast for its period.
  const { error: algoErr } = await supabase
    .from("pricing_algo_params")
    .delete()
    .eq("hotel_id", hotelId)
    .in("param_key", OTA_ALGO_PARAM_KEYS as unknown as string[])
    .gte("date", snap.period_start)
    .lte("date", snap.period_end)
  if (algoErr) {
    // Non-fatal: the snapshot is already gone; log and continue cleanup.
    console.error("[ota-kpi][DELETE] algo params cleanup error:", algoErr.message)
  }

  // 4) Re-bridge any remaining snapshot (ANY platform) whose period overlaps
  //    the deleted range, so days shared with a still-valid import keep their
  //    correct K values instead of being left blank. Oldest→newest so the most
  //    recent snapshot wins on shared days (same policy as the upload pipeline).
  try {
    const { data: overlapping } = await supabase
      .from("hotel_ota_kpi_snapshots")
      .select("*")
      .eq("hotel_id", hotelId)
      .lte("period_start", snap.period_end)
      .gte("period_end", snap.period_start)
      .order("period_end", { ascending: true })

    for (const r of overlapping ?? []) {
      const bridgeInput: OtaKpiSnapshotInput & { hotel_id: string } = {
        hotel_id: hotelId,
        platform: r.platform,
        period_start: r.period_start,
        period_end: r.period_end,
        search_views: r.search_views ?? null,
        property_views: r.property_views ?? null,
        bookings_count: r.bookings_count ?? null,
        prev_search_views: r.prev_search_views ?? null,
        prev_property_views: r.prev_property_views ?? null,
        prev_bookings_count: r.prev_bookings_count ?? null,
        ranking_score: r.ranking_score ?? null,
        ranking_position: r.ranking_position ?? null,
        total_competitors: r.total_competitors ?? null,
        total_room_nights: r.total_room_nights ?? null,
        total_revenue: r.total_revenue ?? null,
        adr: r.adr ?? null,
      }
      await bridgeOtaSnapshotToPricingAlgoParams(supabase, bridgeInput)
    }
  } catch (rebridgeErr: any) {
    console.error("[ota-kpi][DELETE] re-bridge failed (non-fatal):", rebridgeErr?.message)
  }

  // 5) Delete the uploaded report rows for the same platform+period and their
  //    private Blob files.
  try {
    const { data: reports } = await supabase
      .from("hotel_ota_reports")
      .select("id, file_path")
      .eq("hotel_id", hotelId)
      .eq("platform", snap.platform)
      .eq("period_start", snap.period_start)
      .eq("period_end", snap.period_end)

    for (const rep of reports ?? []) {
      if (rep.file_path) {
        await del(rep.file_path).catch((e) =>
          console.error("[ota-kpi][DELETE] blob del failed:", e?.message),
        )
      }
    }

    if (reports && reports.length > 0) {
      await supabase
        .from("hotel_ota_reports")
        .delete()
        .in(
          "id",
          reports.map((r) => r.id),
        )
    }
  } catch (repErr: any) {
    console.error("[ota-kpi][DELETE] report cleanup failed (non-fatal):", repErr?.message)
  }

  return NextResponse.json({ success: true })
}
