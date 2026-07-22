import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { GSheetsSyncService } from "@/lib/services/gsheets-sync-service"

/**
 * POST /api/admin/resync-hotel-bookings
 * 
 * Triggers a full re-import of bookings from Google Sheets for a specific hotel.
 * Used to fix historical data issues (e.g. booking_date was set to check_in_date
 * due to normalizeDate() parsing bug).
 * 
 * Body: { hotel_id: string, cron_secret: string }
 * Protected by CRON_SECRET (no user auth needed - this is an admin repair tool)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { hotel_id, cron_secret } = body

    // Auth via CRON_SECRET (since this may be called without user session)
    if (cron_secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!hotel_id) {
      return NextResponse.json({ error: "hotel_id richiesto" }, { status: 400 })
    }

    const supabase = await createServiceRoleClient()

    // Step 1: Count bookings where booking_date == check_in_date BEFORE sync
    const { data: beforeCount } = await supabase.rpc("exec_sql", {
      sql: `SELECT count(*)::int as cnt FROM bookings WHERE hotel_id = '${hotel_id}' AND booking_date = check_in_date`
    })
    const beforeMatch = beforeCount?.[0]?.cnt ?? "unknown"

    // Step 2: Load PMS integration
    const { data: integration, error: intError } = await supabase
      .from("pms_integrations")
      .select("*, hotels(name)")
      .eq("hotel_id", hotel_id)
      .eq("is_active", true)
      .maybeSingle()

    if (intError || !integration) {
      return NextResponse.json({ error: "No active PMS integration for this hotel" }, { status: 404 })
    }

    const hotelName = integration.hotels?.name || hotel_id
    const spreadsheetId = integration.gsheet_spreadsheet_id
    const gsheetsMapping = (integration.config as any)?.gsheets_mapping

    if (!spreadsheetId || !gsheetsMapping) {
      return NextResponse.json({ error: "Missing spreadsheet_id or gsheets_mapping" }, { status: 400 })
    }

    console.log(`[resync] Starting full re-import for ${hotelName} (${hotel_id})`)
    console.log(`[resync] BEFORE: ${beforeMatch} bookings where booking_date == check_in_date`)

    // Step 3: Full re-sync
    const syncResult = await GSheetsSyncService.syncAll(hotel_id, spreadsheetId, gsheetsMapping)

    // Step 4: Count bookings where booking_date == check_in_date AFTER sync
    const { data: afterCount } = await supabase.rpc("exec_sql", {
      sql: `SELECT count(*)::int as cnt FROM bookings WHERE hotel_id = '${hotel_id}' AND booking_date = check_in_date`
    })
    const afterMatch = afterCount?.[0]?.cnt ?? "unknown"

    console.log(`[resync] AFTER: ${afterMatch} bookings where booking_date == check_in_date`)
    console.log(`[resync] Fixed: ${Number(beforeMatch) - Number(afterMatch)} records`)

    // Update sync timestamp
    await supabase
      .from("pms_integrations")
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: syncResult.success ? "success" : "failed",
      })
      .eq("id", integration.id)

    return NextResponse.json({
      success: true,
      hotel: hotelName,
      before: { booking_date_equals_check_in: beforeMatch },
      after: { booking_date_equals_check_in: afterMatch },
      fixed: Number(beforeMatch) - Number(afterMatch),
      sync: {
        bookings_imported: syncResult.bookings?.imported || 0,
        bookings_errors: syncResult.bookings?.errors?.slice(0, 5) || [],
        availability_imported: syncResult.availability?.imported || 0,
      },
    })
  } catch (error) {
    console.error("[resync] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    )
  }
}
