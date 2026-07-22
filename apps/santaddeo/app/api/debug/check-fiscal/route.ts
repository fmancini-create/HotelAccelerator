import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"

/**
 * GET /api/debug/check-fiscal?hotel_id=XXX
 * 
 * Debug endpoint to check fiscal sync status for a hotel.
 * Returns: PMS integration config, VAT number status, and fiscal records count.
 */
export async function GET(request: NextRequest) {
  const hotelId = request.nextUrl.searchParams.get("hotel_id")
  
  if (!hotelId) {
    return NextResponse.json({ error: "hotel_id required" }, { status: 400 })
  }

  const supabase = await createServiceRoleClient()

  // 1. Check PMS integration
  const { data: pmsIntegration, error: pmsError } = await supabase
    .from("pms_integrations")
    .select("id, hotel_id, pms_name, api_key, vat_number, property_id, config, is_active")
    .eq("hotel_id", hotelId)
    .maybeSingle()

  // 2. Count fiscal records in connectors schema
  const { count: fiscalCount, error: fiscalError } = await supabase
    .schema("connectors")
    .from("scidoo_raw_fiscal_production")
    .select("id", { count: "exact", head: true })
    .eq("hotel_id", hotelId)

  // 3. Get sample fiscal records
  const { data: sampleRecords } = await supabase
    .schema("connectors")
    .from("scidoo_raw_fiscal_production")
    .select("id, date, total_revenue, synced_at")
    .eq("hotel_id", hotelId)
    .order("date", { ascending: false })
    .limit(5)

  // 4. Check sync_logs for fiscal sync attempts
  const { data: syncLogs } = await supabase
    .from("sync_logs")
    .select("id, sync_type, status, error_message, records_inserted, completed_at")
    .eq("hotel_id", hotelId)
    .eq("sync_type", "fiscal_production")
    .order("completed_at", { ascending: false })
    .limit(10)

  return NextResponse.json({
    hotel_id: hotelId,
    pms_integration: {
      exists: !!pmsIntegration,
      pms_name: pmsIntegration?.pms_name,
      is_active: pmsIntegration?.is_active,
      has_api_key: !!pmsIntegration?.api_key,
      has_vat_number: !!pmsIntegration?.vat_number,
      vat_number: pmsIntegration?.vat_number,
      property_id: pmsIntegration?.property_id,
      error: pmsError?.message,
    },
    fiscal_data: {
      records_count: fiscalCount || 0,
      sample_records: sampleRecords || [],
      error: fiscalError?.message,
    },
    sync_logs: syncLogs || [],
    diagnosis: !pmsIntegration 
      ? "NO_PMS_INTEGRATION" 
      : !pmsIntegration.vat_number 
        ? "MISSING_VAT_NUMBER - Add vat_number to pms_integrations" 
        : fiscalCount === 0 
          ? "NO_FISCAL_DATA - Run fiscal sync" 
          : "OK",
  })
}
