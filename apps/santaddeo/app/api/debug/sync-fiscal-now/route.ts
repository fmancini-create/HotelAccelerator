/**
 * Debug endpoint to manually trigger fiscal sync for a hotel
 * GET /api/debug/sync-fiscal-now?hotel_id=xxx
 */

import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { ScidooSyncService } from "@/lib/services/scidoo-sync-service"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const hotelId = request.nextUrl.searchParams.get("hotel_id")
  
  if (!hotelId) {
    return NextResponse.json({ error: "hotel_id required" }, { status: 400 })
  }

  const supabase = await createServiceRoleClient()

  // Get PMS integration for this hotel
  const { data: pmsIntegration, error: pmsError } = await supabase
    .from("pms_integrations")
    .select("id, api_key, vat_number, property_id, config, hotels(name)")
    .eq("hotel_id", hotelId)
    .eq("pms_name", "scidoo")
    .eq("is_active", true)
    .single()

  if (pmsError || !pmsIntegration) {
    return NextResponse.json({ 
      error: "PMS integration not found", 
      details: pmsError?.message,
      hotelId 
    }, { status: 404 })
  }

  const hotelName = (pmsIntegration.hotels as any)?.name || hotelId

  // Check VAT number
  if (!pmsIntegration.vat_number) {
    return NextResponse.json({
      error: "VAT number not configured",
      message: "Fiscal sync requires vat_number in pms_integrations table",
      hotelName,
      hotelId,
      pmsIntegrationId: pmsIntegration.id
    }, { status: 400 })
  }

  // Sync fiscal production for current month
  const today = new Date()
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0]
  const endDate = today.toISOString().split("T")[0]

  console.log(`[FiscalDebug] Syncing fiscal for ${hotelName} from ${startOfMonth} to ${endDate}`)

  try {
    const result = await ScidooSyncService.syncFiscalProduction(
      hotelId,
      pmsIntegration.api_key,
      (pmsIntegration.config as any)?.endpoint_url || "https://www.scidoo.com/api/v1",
      pmsIntegration.vat_number,
      pmsIntegration.id,
      startOfMonth,
      endDate
    )

    // Verify what's in the database now
    const { data: fiscalData, error: fiscalError } = await supabase
      .schema("connectors")
      .from("scidoo_raw_fiscal_production")
      .select("date, total_revenue")
      .eq("hotel_id", hotelId)
      .gte("date", startOfMonth)
      .lte("date", endDate)
      .order("date", { ascending: false })

    const { data: dailyProd } = await supabase
      .from("daily_production")
      .select("date, production, source")
      .eq("hotel_id", hotelId)
      .gte("date", startOfMonth)
      .lte("date", endDate)
      .order("date", { ascending: false })

    return NextResponse.json({
      success: result.success,
      hotelName,
      hotelId,
      dateRange: { startOfMonth, endDate },
      syncResult: {
        imported: result.imported,
        errors: result.errors.slice(0, 10)
      },
      dbState: {
        scidoo_raw_fiscal_production: {
          count: fiscalData?.length || 0,
          records: fiscalData?.slice(0, 10) || [],
          error: fiscalError?.message
        },
        daily_production: {
          count: dailyProd?.length || 0,
          records: dailyProd?.slice(0, 10) || []
        }
      }
    })
  } catch (error) {
    return NextResponse.json({
      error: "Sync failed",
      message: error instanceof Error ? error.message : String(error),
      hotelName,
      hotelId
    }, { status: 500 })
  }
}
