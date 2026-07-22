import { type NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { GSheetsSyncService } from "@/lib/services/gsheets-sync-service"
import { ScidooSyncService } from "@/lib/services/scidoo-sync-service"
import { syncSlopeForHotel } from "@/lib/connectors/slope/sync"
import { SlopeBookingsProcessor } from "@/lib/etl/processors/slope-bookings-processor"

/**
 * POST /api/superadmin/sync
 * Trigger manuale del sync per un hotel specifico
 * Protetto da auth super_admin
 * Body: { hotel_id: string }
 */
export async function POST(request: NextRequest) {
  try {
    // Auth check con il client utente (ha accesso ai cookie)
    const userSupabase = await createClient()
    const { data: { user }, error: authError } = await userSupabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
    }

    // Service role per le operazioni (bypass RLS)
    const supabase = await createServiceRoleClient()

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (profile?.role !== "super_admin" && user.email !== "f.mancini@4bid.it" && user.email !== "f.mancini@ibarronci.com") {
      return NextResponse.json({ error: "Solo super_admin" }, { status: 403 })
    }

    const body = await request.json()
    const hotelId = body.hotel_id

    if (!hotelId) {
      return NextResponse.json({ error: "hotel_id richiesto" }, { status: 400 })
    }

    // Carica integrazione PMS per questo hotel
    const { data: integration, error: intError } = await supabase
      .from("pms_integrations")
      .select("*, hotels(id, name)")
      .eq("hotel_id", hotelId)
      .eq("is_active", true)
      .maybeSingle()

    if (intError || !integration) {
      return NextResponse.json({ error: "Nessuna integrazione PMS attiva per questo hotel" }, { status: 404 })
    }

    const hotelName = integration.hotels?.name || hotelId
    const integrationMode = integration.integration_mode || "api"

    console.log("[v0] Manual sync triggered for", hotelName, "mode:", integrationMode)

    let syncResult: any

    if (integrationMode === "gsheets") {
      // Leggi spreadsheet_id dal JSON config (nuovo location)
      const spreadsheetId = integration.config?.spreadsheet_id || integration.gsheet_spreadsheet_id
      const gsheetsMapping = (integration.config as any)?.gsheets_mapping

      if (!spreadsheetId || !gsheetsMapping) {
        return NextResponse.json({ 
          error: "GSheets mode ma manca spreadsheet_id o gsheets_mapping nella config" 
        }, { status: 400 })
      }

      syncResult = await GSheetsSyncService.syncAll(hotelId, spreadsheetId, gsheetsMapping)
    } else if (integrationMode === "api" && integration.pms_name === "scidoo") {
      const dateTo = new Date().toISOString().split("T")[0]
      const dateFrom = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
      syncResult = await ScidooSyncService.syncAll(hotelId, integration.api_key, dateFrom, dateTo)
    } else if (integrationMode === "api" && integration.pms_name === "slope") {
      // Slope ha un connettore NATIVO (Partner API v1): stesso flusso di
      // processSlopeModule nel cron sync-modules -> delta sync su lastUpdateDate
      // + ETL SlopeBookingsProcessor solo se sono state scritte righe raw.
      // Prima questo ramo mancava e il pulsante "Sync ora" restituiva
      // "Modalita' non supportata: mode=api, pms=slope".
      const slope = await syncSlopeForHotel({ hotelId })
      const totalWritten = slope.inserted + slope.updated + slope.deletedMarked
      let etlError: string | null = null
      if (totalWritten > 0) {
        try {
          const processor = new SlopeBookingsProcessor(hotelId, `manual-slope-${Date.now()}`)
          await processor.process()
        } catch (e) {
          etlError = e instanceof Error ? e.message : String(e)
          console.error("[v0] Manual Slope ETL failed for", hotelName, etlError)
        }
      }
      const slopeErrors = [...slope.errors, etlError].filter(Boolean) as string[]
      syncResult = {
        success: slopeErrors.length === 0,
        bookings: { imported: slope.inserted + slope.updated, errors: slope.errors },
        error: slopeErrors.length ? slopeErrors.join(" | ") : undefined,
      }
    } else {
      return NextResponse.json({ 
        error: `Modalita' non supportata: mode=${integrationMode}, pms=${integration.pms_name}` 
      }, { status: 400 })
    }

    // Aggiorna timestamp sync
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
      hotel: hotelName,
      mode: integrationMode,
      bookings_imported: syncResult.bookings?.imported || 0,
      bookings_errors: syncResult.bookings?.errors || [],
      availability_imported: syncResult.availability?.imported || 0,
      availability_errors: syncResult.availability?.errors || [],
      room_types_imported: syncResult.roomTypes?.imported || 0,
      error: syncResult.error,
    })
  } catch (error) {
    console.error("[v0] Manual sync error:", error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Errore interno" 
    }, { status: 500 })
  }
}
