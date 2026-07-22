import { type NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { triggerAvailabilitySyncForDates } from "@/lib/sync/availability-sync-trigger"
import { measureRoute } from "@/lib/performance/with-perf"

/**
 * POST /api/scidoo/sync-availability
 * Simplified endpoint to sync ONLY availability (no room types, no bookings)
 */
async function _POST(request: NextRequest) {
  try {
    const supabase = await createServiceRoleClient()

    const body = await request.json()
    const { hotelId, startDate, endDate } = body

    if (!hotelId || !startDate || !endDate) {
      return NextResponse.json({ error: "Missing required fields: hotelId, startDate, endDate" }, { status: 400 })
    }

    console.log("[v0] Availability-only sync API called:", { hotelId, startDate, endDate })

    // Validazione: l'hotel deve avere un'integrazione Scidoo attiva con api key.
    const { data: pmsIntegration, error: pmsError } = await supabase
      .from("pms_integrations")
      .select("id, api_key, credentials")
      .eq("hotel_id", hotelId)
      .eq("pms_name", "scidoo")
      .eq("is_active", true)
      .single()

    if (pmsError || !pmsIntegration) {
      console.error("[v0] PMS integration not found:", pmsError)
      return NextResponse.json({ error: "PMS integration not found or not active" }, { status: 404 })
    }

    if (!pmsIntegration.api_key && !(pmsIntegration.credentials as any)?.api_key) {
      return NextResponse.json({ error: "API key not configured" }, { status: 400 })
    }

    // FIX 18/06/2026: l'endpoint chiamava `ScidooSyncService.syncAvailabilityOnly`
    // che NON esiste (dead call -> TypeError). Riusiamo l'helper canonico
    // `triggerAvailabilitySyncForDates`, che fa sync Scidoo (scidoo_raw_availability)
    // + ETL inline (daily_availability + rms_availability_daily, con OOO corretto
    // dal mapper) + freshness. bypassLock: re-sync esplicito, non deve essere
    // saltato da lock di altri sync ravvicinati.
    const result = await triggerAvailabilitySyncForDates({
      hotelId,
      dateFrom: startDate,
      dateTo: endDate,
      triggeredBy: "manual:sync-availability-endpoint",
      bypassLock: true,
    })

    if (!result.triggered) {
      return NextResponse.json({ error: result.reason || "sync_not_triggered" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      raw_imported: result.raw_imported,
      etl_inserted: result.etl_inserted,
      etl_failed: result.etl_failed,
      duration_ms: result.duration_ms,
    })
  } catch (error) {
    console.error("[v0] Availability sync API error:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    )
  }
}

export const POST = measureRoute("/api/scidoo/sync-availability", _POST as any)
