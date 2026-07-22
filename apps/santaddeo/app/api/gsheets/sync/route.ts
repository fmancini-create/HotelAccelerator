// Manual GSheets sync trigger
// POST /api/gsheets/sync?hotelId=xxx
// Triggers a full sync of all GSheets data for the given hotel

import { type NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { GSheetsSyncService } from "@/lib/services/gsheets-sync-service"

export const maxDuration = 300 // 5 minutes for large syncs

export async function POST(request: NextRequest) {
  const supabase = await createServiceRoleClient()
  
  try {
    const { searchParams } = new URL(request.url)
    const hotelId = searchParams.get("hotelId")
    
    if (!hotelId) {
      return NextResponse.json({ error: "hotelId is required" }, { status: 400 })
    }
    
    // Get PMS integration for this hotel
    const { data: integration, error: intError } = await supabase
      .from("pms_integrations")
      .select("*, hotels(name)")
      .eq("hotel_id", hotelId)
      .eq("is_active", true)
      .single()
    
    if (intError || !integration) {
      return NextResponse.json({ 
        error: "PMS integration not found for hotel", 
        details: intError?.message 
      }, { status: 404 })
    }
    
    if (integration.integration_mode !== "gsheets") {
      return NextResponse.json({ 
        error: "Hotel is not in GSheets mode", 
        mode: integration.integration_mode 
      }, { status: 400 })
    }
    
    const spreadsheetId = integration.gsheet_spreadsheet_id
    const gsheetsMapping = (integration.config as any)?.gsheets_mapping
    
    if (!spreadsheetId || !gsheetsMapping) {
      return NextResponse.json({ 
        error: "Missing gsheet_spreadsheet_id or gsheets_mapping config" 
      }, { status: 400 })
    }
    
    console.log("[v0] GSheets manual sync starting for hotel:", integration.hotels?.name || hotelId)
    console.log("[v0] GSheets mapping categories:", Object.keys(gsheetsMapping || {}))
    
    // Run the sync
    const syncResult = await GSheetsSyncService.syncAll(
      hotelId,
      spreadsheetId,
      gsheetsMapping,
    )
    
    console.log("[v0] GSheets manual sync completed:", {
      success: syncResult.success,
      bookings: syncResult.bookings?.imported || 0,
      availability: syncResult.availability?.imported || 0,
      roomTypes: syncResult.roomTypes?.imported || 0,
      roomsProduction: syncResult.roomsProduction?.imported || 0,
      roomsOccupancy: syncResult.roomsOccupancy?.imported || 0,
    })
    
    // Run ETL to process the synced data
    try {
      const { ETLOrchestrator } = await import("@/lib/etl/etl-orchestrator")
      const etl = new ETLOrchestrator({
        hotel_id: hotelId,
        job_type: "full_sync",
        triggered_by: "manual_gsheets_sync",
      })
      const etlResult = await etl.run()
      console.log("[v0] ETL completed for manual GSheets sync:", etlResult)
    } catch (etlError) {
      console.error("[v0] ETL failed for manual GSheets sync (non-blocking):", etlError)
    }
    
    // Update last sync timestamp
    await supabase
      .from("pms_integrations")
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: syncResult.success ? "success" : "failed",
        last_sync_error: syncResult.error || null,
      })
      .eq("id", integration.id)
    
    return NextResponse.json({
      success: syncResult.success,
      hotel: integration.hotels?.name || hotelId,
      results: {
        bookings: syncResult.bookings,
        availability: syncResult.availability,
        roomTypes: syncResult.roomTypes,
        roomsProduction: syncResult.roomsProduction,
        roomsOccupancy: syncResult.roomsOccupancy,
        pricingGrid: syncResult.pricingGrid,
      },
      error: syncResult.error,
    })
  } catch (error: any) {
    console.error("[v0] GSheets manual sync error:", error)
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 })
  }
}
