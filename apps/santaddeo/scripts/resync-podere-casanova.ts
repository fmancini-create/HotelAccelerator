/**
 * Re-import bookings per Podere Casanova (afedce7a-f8c7-48c1-9eae-4e7bae1c2dd6)
 * 
 * Scopo: correggere i booking_date storici che erano stati settati = check_in_date
 * a causa del bug in normalizeDate() che non gestiva il formato "DD/MM/YYYY HH:MM:SS".
 * 
 * Questo script:
 * 1. Legge la config GSheets dell'hotel da pms_integrations
 * 2. Chiama GSheetsSyncService.syncAll() che ri-legge il foglio completo
 * 3. L'upsert aggiorna booking_date con il valore corretto parsato da BK_DATE
 * 4. NON cancella righe, NON cambia primary keys
 */

import { createClient } from "@supabase/supabase-js"
import { GSheetsSyncService } from "../lib/services/gsheets-sync-service"

const HOTEL_ID = "afedce7a-f8c7-48c1-9eae-4e7bae1c2dd6"

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  // Step 1: Verify current state (before)
  const { data: before } = await supabase
    .from("bookings")
    .select("pms_booking_id, booking_date, check_in_date")
    .eq("hotel_id", HOTEL_ID)
    .limit(5)

  console.log("[resync] BEFORE - Sample bookings:", JSON.stringify(before, null, 2))

  const { count: matchBefore } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("hotel_id", HOTEL_ID)
    .filter("booking_date", "eq", "check_in_date")

  // Count via raw query approach
  const { data: countData } = await supabase.rpc("exec_sql", {
    sql: `SELECT count(*) as cnt FROM bookings WHERE hotel_id = '${HOTEL_ID}' AND booking_date = check_in_date`
  })
  console.log("[resync] BEFORE - Bookings where booking_date == check_in_date:", countData)

  // Step 2: Load PMS integration config
  const { data: integration, error: intError } = await supabase
    .from("pms_integrations")
    .select("*")
    .eq("hotel_id", HOTEL_ID)
    .eq("is_active", true)
    .maybeSingle()

  if (intError || !integration) {
    console.error("[resync] No active PMS integration found for hotel:", HOTEL_ID, intError)
    process.exit(1)
  }

  const spreadsheetId = integration.gsheet_spreadsheet_id
  const gsheetsMapping = (integration.config as any)?.gsheets_mapping

  if (!spreadsheetId || !gsheetsMapping) {
    console.error("[resync] Missing spreadsheet_id or gsheets_mapping in config")
    process.exit(1)
  }

  console.log("[resync] Starting full re-import for Podere Casanova...")
  console.log("[resync] Spreadsheet ID:", spreadsheetId)
  console.log("[resync] Mapping keys:", Object.keys(gsheetsMapping))

  // Step 3: Run full sync (re-reads entire sheet, upserts all rows)
  const syncResult = await GSheetsSyncService.syncAll(HOTEL_ID, spreadsheetId, gsheetsMapping)

  console.log("[resync] Sync result:", JSON.stringify({
    success: syncResult.success,
    bookings_imported: syncResult.bookings?.imported || 0,
    bookings_errors: syncResult.bookings?.errors?.length || 0,
    availability_imported: syncResult.availability?.imported || 0,
    error: syncResult.error,
  }, null, 2))

  if (syncResult.bookings?.errors?.length) {
    console.log("[resync] Booking errors:", syncResult.bookings.errors.slice(0, 10))
  }

  // Step 4: Verify state (after)
  const { data: after } = await supabase
    .from("bookings")
    .select("pms_booking_id, booking_date, check_in_date")
    .eq("hotel_id", HOTEL_ID)
    .limit(5)

  console.log("[resync] AFTER - Sample bookings:", JSON.stringify(after, null, 2))

  const { data: countAfter } = await supabase.rpc("exec_sql", {
    sql: `SELECT count(*) as cnt FROM bookings WHERE hotel_id = '${HOTEL_ID}' AND booking_date = check_in_date`
  })
  console.log("[resync] AFTER - Bookings where booking_date == check_in_date:", countAfter)

  // Update pms_integrations timestamp
  await supabase
    .from("pms_integrations")
    .update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: syncResult.success ? "success" : "failed",
    })
    .eq("id", integration.id)

  console.log("[resync] Done!")
}

main().catch((err) => {
  console.error("[resync] Fatal error:", err)
  process.exit(1)
})
