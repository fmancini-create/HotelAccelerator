import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { ScidooSyncService } from "@/lib/services/scidoo-sync-service"

/**
 * POST /api/admin/fiscal-resync
 * 
 * Re-syncs fiscal production data from Scidoo and rebuilds daily_production.
 * Used when scidoo_raw_fiscal_production is empty or out of sync.
 * 
 * Body:
 *   hotelId?: string - specific hotel (defaults to all Scidoo hotels)
 *   startDate?: string - start of sync range (defaults to 2025-01-01)
 *   endDate?: string - end of sync range (defaults to today + 3 months)
 */
export async function POST(request: NextRequest) {
  try {
    // Verify CRON_SECRET for security
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { hotelId, startDate, endDate } = body

    const supabase = await createServiceRoleClient()

    // Get all Scidoo hotels with fiscal sync enabled (have vat_number)
    let query = supabase
      .from("pms_integrations")
      .select("id, hotel_id, api_key, vat_number, property_id, config, hotels(name)")
      .eq("pms_name", "scidoo")
      .eq("is_active", true)
      .not("vat_number", "is", null)

    if (hotelId) {
      query = query.eq("hotel_id", hotelId)
    }

    const { data: integrations, error: intError } = await query

    if (intError) {
      return NextResponse.json({ error: intError.message }, { status: 500 })
    }

    if (!integrations || integrations.length === 0) {
      return NextResponse.json({ error: "No PMS integrations found with VAT number" }, { status: 404 })
    }

    // Default date range: 2025-01-01 to today + 3 months
    const syncStartDate = startDate || "2025-01-01"
    const syncEndDate = endDate || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]

    console.log(`[FiscalResync] Starting resync for ${integrations.length} hotels from ${syncStartDate} to ${syncEndDate}`)

    const results: Array<{
      hotelId: string
      hotelName: string
      success: boolean
      imported: number
      errors: string[]
    }> = []

    for (const integration of integrations) {
      const hotelName = (integration.hotels as any)?.name || "Unknown"
      console.log(`[FiscalResync] Processing ${hotelName} (${integration.hotel_id})`)

      try {
        const apiKey = integration.api_key
        const endpointUrl = (integration.config as any)?.endpoint_url || "https://www.scidoo.com/api/v1"
        const vatNumber = integration.vat_number

        if (!apiKey || !vatNumber) {
          results.push({
            hotelId: integration.hotel_id,
            hotelName,
            success: false,
            imported: 0,
            errors: ["Missing API key or VAT number"],
          })
          continue
        }

        const syncResult = await ScidooSyncService.syncFiscalProduction(
          integration.hotel_id,
          apiKey,
          endpointUrl,
          vatNumber,
          integration.id,
          syncStartDate,
          syncEndDate
        )

        results.push({
          hotelId: integration.hotel_id,
          hotelName,
          success: syncResult.success || false,
          imported: syncResult.imported,
          errors: syncResult.errors,
        })

        console.log(`[FiscalResync] ${hotelName}: imported ${syncResult.imported}, errors: ${syncResult.errors.length}`)
      } catch (err) {
        console.error(`[FiscalResync] Error processing ${hotelName}:`, err)
        results.push({
          hotelId: integration.hotel_id,
          hotelName,
          success: false,
          imported: 0,
          errors: [err instanceof Error ? err.message : String(err)],
        })
      }
    }

    // Verify final state
    const { data: finalState } = await supabase
      .schema("connectors")
      .from("scidoo_raw_fiscal_production")
      .select("id", { count: "exact", head: true })

    const totalImported = results.reduce((sum, r) => sum + r.imported, 0)
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0)

    return NextResponse.json({
      success: totalErrors === 0,
      summary: {
        hotels_processed: results.length,
        total_imported: totalImported,
        total_errors: totalErrors,
        raw_records_in_db: finalState?.length || 0,
      },
      results,
      date_range: {
        start: syncStartDate,
        end: syncEndDate,
      },
    })
  } catch (error) {
    console.error("[FiscalResync] Fatal error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
