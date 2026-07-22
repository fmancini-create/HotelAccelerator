import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { ScidooSyncService } from "@/lib/services/scidoo-sync-service"
import { ScidooClient } from "@/lib/services/scidoo-client"
import { PerfContext, storePerfLog } from "@/lib/performance/perf-logger"

export async function POST(request: NextRequest) {
  const perf = new PerfContext("/api/scidoo/sync-module", "POST")

  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await perf.measureDb(() => supabase.auth.getUser(), "auth.getUser")

    if (!user) {
      const log = perf.finalize(401)
      storePerfLog(log)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    perf.setUserId(user.id)

    const body = await request.json()
    const { hotelId, module, startDate, endDate, roomTypeIds } = body

    if (!hotelId || !module) {
      const log = perf.finalize(400)
      storePerfLog(log)
      return NextResponse.json({ error: "Missing hotelId or module" }, { status: 400 })
    }

    perf.setHotelId(hotelId)

    const validModules = ["room_types", "rates", "minstay", "availability", "occupied", "production", "production_management", "bookings"]
    if (!validModules.includes(module)) {
      const log = perf.finalize(400)
      storePerfLog(log)
      return NextResponse.json({ error: "Invalid module" }, { status: 400 })
    }

    // Use service role to bypass RLS for pms_integrations lookup
    const serviceSupabaseForLookup = await createServiceRoleClient()
    
    const { data: pmsIntegration, error: pmsError } = await perf.measureDb(
      () =>
        serviceSupabaseForLookup
          .from("pms_integrations")
          .select("*")
          .eq("hotel_id", hotelId)
          .eq("pms_name", "scidoo")
          .eq("is_active", true)
          .maybeSingle(),
      "SELECT:pms_integrations",
    )

    if (pmsError || !pmsIntegration) {
      console.error("[v0] PMS integration lookup failed:", { pmsError, hotelId })
      const log = perf.finalize(404)
      storePerfLog(log)
      return NextResponse.json({ error: "PMS integration not found or not active" }, { status: 404 })
    }

    const apiKey = pmsIntegration.api_key || pmsIntegration.credentials?.api_key
    if (!apiKey) {
      const log = perf.finalize(400)
      storePerfLog(log)
      return NextResponse.json({ error: "API key not configured" }, { status: 400 })
    }

    const { data: hotel, error: hotelError } = await perf.measureDb(
      () => serviceSupabaseForLookup.from("hotels").select("organization_id, organizations(vat_number)").eq("id", hotelId).single(),
      "SELECT:hotels+organizations",
    )

    const vatNumber =
      (hotel?.organizations as any)?.vat_number || pmsIntegration.vat_number || pmsIntegration.credentials?.vat_number

    console.log(`[v0] Starting ${module} sync for hotel ${hotelId}`)
    if (startDate && endDate) {
      console.log(`[v0] Date range: ${startDate} to ${endDate}`)
    }
    if (roomTypeIds && roomTypeIds.length > 0) {
      console.log(`[v0] Filtering for ${roomTypeIds.length} room types`)
    }

    const propertyId = pmsIntegration.property_id || (pmsIntegration.config as any)?.property_id
    const client = new ScidooClient({ apiKey, propertyId })
    const serviceSupabase = await createServiceRoleClient()

    const syncStartDate =
      startDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0]
    const syncEndDate =
      endDate || new Date(new Date().getFullYear(), new Date().getMonth() + 4, 0).toISOString().split("T")[0]

    let result

    const syncStart = performance.now()

    switch (module) {
      case "room_types":
        result = await ScidooSyncService["syncRoomTypes"](hotelId, pmsIntegration.id, client, serviceSupabase)
        break
      case "rates":
        result = await ScidooSyncService["syncRates"](hotelId, pmsIntegration.id, client, serviceSupabase)
        break
      case "minstay":
        // FIX 21/07/2026: la firma reale di syncMinStay e'
        // (supabase, hotelId, apiKey, startDate, endDate). Prima qui venivano
        // passati 7 argomenti in ordine sbagliato (hotelId come supabase,
        // pmsIntegration.id come hotelId, client come apiKey...) -> il sync
        // manuale del minstay crashava. `roomTypeIds` non e' supportato dal
        // sync minstay (che scrive per room_type+date) ed e' ignorato.
        result = await ScidooSyncService.syncMinStay(
          serviceSupabase,
          hotelId,
          apiKey,
          syncStartDate,
          syncEndDate,
        )
        break
      case "availability":
      case "occupied":
        result = await ScidooSyncService["syncAvailability"](
          serviceSupabase, // supabase first
          hotelId,
          apiKey, // apiKey not client
          syncStartDate,
          syncEndDate,
          roomTypeIds,
        )
        break
      case "production": {
        const fiscalVat = vatNumber || pmsIntegration.vat_number
        if (!fiscalVat) {
          // Hotel without VAT number (e.g. casa vacanze) - skip fiscal sync gracefully
          console.log(`[v0] Skipping fiscal production sync for hotel ${hotelId} - no VAT number configured`)
          const log = perf.finalize(200)
          storePerfLog(log)
          return NextResponse.json({
            success: true,
            skipped: true,
            message: "Fiscal production sync skipped - no VAT number (Partita IVA) configured for this property",
          })
        }
        const endpointUrl = pmsIntegration.config?.endpoint_url || "https://www.scidoo.com/api/v1"
        result = await ScidooSyncService.syncFiscalProduction(
          hotelId,
          apiKey,
          endpointUrl,
          fiscalVat,
          pmsIntegration.id,
          syncStartDate,
          syncEndDate,
        )
        break
      }
      case "production_management": {
        // PRODUZIONE GESTIONALE (12/05/2026):
        // Il daily price per camera/notte arriva fisicamente nel payload delle
        // prenotazioni (scidoo_raw_bookings.raw_data.daily_price). Quindi
        // questo modulo internamente esegue uno syncBookings.
        // Differenza con il modulo "bookings": ha la sua riga in
        // pms_cron_settings (module='production_management') con last_run
        // tracciato separatamente -> il manager hotel vede una card dedicata
        // "Produzione Gestionale" che parla la sua lingua, anche se sotto
        // il dato proviene dalla stessa pipeline bookings. NON richiede VAT,
        // funziona per case vacanze.
        const { data: pmCronSetting } = await serviceSupabaseForLookup
          .from("pms_cron_settings")
          .select("is_initial_sync_done")
          .eq("hotel_id", hotelId)
          .eq("module", "production_management")
          .maybeSingle()

        const isInitialPmSync = !pmCronSetting?.is_initial_sync_done

        if (isInitialPmSync) {
          const today = new Date()
          const initialStart = new Date(today)
          initialStart.setFullYear(initialStart.getFullYear() - 2)
          const initialEnd = new Date(today)
          initialEnd.setFullYear(initialEnd.getFullYear() + 1)

          result = await ScidooSyncService.syncBookings(
            serviceSupabase,
            hotelId,
            apiKey,
            initialStart.toISOString().split("T")[0],
            initialEnd.toISOString().split("T")[0],
            true,
          )

          if (!result.errors?.length || result.imported > 0) {
            await serviceSupabaseForLookup
              .from("pms_cron_settings")
              .update({ is_initial_sync_done: true })
              .eq("hotel_id", hotelId)
              .eq("module", "production_management")
          }
        } else {
          result = await ScidooSyncService.syncBookings(
            serviceSupabase,
            hotelId,
            apiKey,
            syncStartDate,
            syncEndDate,
            false,
          )
        }
        break
      }
      case "bookings":
        // Check if we should do initial sync or incremental
        const { data: cronSetting } = await serviceSupabaseForLookup
          .from("pms_cron_settings")
          .select("is_initial_sync_done")
          .eq("hotel_id", hotelId)
          .eq("module", "bookings")
          .maybeSingle()
        
        const isInitialBookingsSync = !cronSetting?.is_initial_sync_done
        
        if (isInitialBookingsSync) {
          // For initial sync, use wide date range: 2 years back + 1 year forward
          const today = new Date()
          const initialStart = new Date(today)
          initialStart.setFullYear(initialStart.getFullYear() - 2)
          const initialEnd = new Date(today)
          initialEnd.setFullYear(initialEnd.getFullYear() + 1)
          
          result = await ScidooSyncService.syncBookings(
            serviceSupabase, 
            hotelId, 
            apiKey, 
            initialStart.toISOString().split('T')[0],
            initialEnd.toISOString().split('T')[0],
            true // isInitialSync
          )
          
          // Mark initial sync as done
          if (!result.errors?.length || result.imported > 0) {
            await serviceSupabaseForLookup
              .from("pms_cron_settings")
              .update({ is_initial_sync_done: true })
              .eq("hotel_id", hotelId)
              .eq("module", "bookings")
          }
        } else {
          // Incremental sync
          result = await ScidooSyncService.syncBookings(
            serviceSupabase, 
            hotelId, 
            apiKey, 
            syncStartDate, 
            syncEndDate,
            false // incremental
          )
        }
        break
      default:
        const log = perf.finalize(400)
        storePerfLog(log)
        return NextResponse.json({ error: "Invalid module" }, { status: 400 })
    }

    const syncDuration = performance.now() - syncStart
    console.log(`[PERF] ${module} sync took ${Math.round(syncDuration)}ms`)

    console.log(`[v0] ${module} sync completed:`, result)

    if (module === "availability" || module === "occupied") {
      console.log("[v0] Waiting 30 seconds before running ETL to avoid rate limiting...")
      await new Promise((resolve) => setTimeout(resolve, 30000))

      console.log("[v0] Running ETL to transform availability data from connectors to public schema")
      try {
        const { ETLOrchestrator } = await import("@/lib/etl/etl-orchestrator")

        const etlOrchestrator = new ETLOrchestrator({
          hotel_id: hotelId,
          job_type: "availability",
          date_from: syncStartDate,
          date_to: syncEndDate,
          triggered_by: "manual_sync",
        })

        const etlResult = await etlOrchestrator.run()
        console.log("[v0] ETL completed successfully:", etlResult)
      } catch (etlError) {
        console.error("[v0] ETL failed:", etlError)
        console.log("[v0] Sync data is saved in connectors schema, ETL can be retried later")
      }
    }

    // EVENT-DRIVEN AVAILABILITY (12/05/2026 sera tardi):
    // Quando la UI fa sync bookings manuale, vogliamo che subito dopo
    // arrivino availability + pricing aggiornati senza aspettare il cron 6h.
    // Lanciamo ETL bookings -> orchestrator -> il quale a sua volta triggera
    // syncAvailability mirato per il range, l'ETL availability e il pricing
    // recalc inline. NON blocchiamo la response: log only.
    // Sia "bookings" che "production_management" producono nuovi record in
    // scidoo_raw_bookings (il PM e' un alias UI dello stesso sync). In
    // entrambi i casi dobbiamo lanciare l'ETL bookings + il trigger event-
    // driven availability per non far arretrare disponibilita' e pricing.
    if ((module === "bookings" || module === "production_management") && result.imported > 0) {
      console.log(
        `[v0] event-driven: ${module} sync imported ${result.imported} records, kicking off bookings ETL + availability trigger`
      )
      try {
        const { ETLOrchestrator } = await import("@/lib/etl/etl-orchestrator")
        const etlOrchestrator = new ETLOrchestrator({
          hotel_id: hotelId,
          job_type: "bookings",
          date_from: syncStartDate,
          date_to: syncEndDate,
          triggered_by: `manual_sync:${module}:user:${user.email || user.id}`,
        })
        const etlResult = await etlOrchestrator.run()
        console.log("[v0] event-driven: bookings ETL + availability trigger completed", {
          job_id: etlResult.job_id,
          bookings_inserted: etlResult.results?.bookings?.records_inserted,
        })
      } catch (etlError) {
        console.error(
          "[v0] event-driven: bookings ETL trigger failed (non-blocking, sync result still returned):",
          etlError
        )
      }
    }

    // Update last_run in pms_cron_settings
    const nowIso = new Date().toISOString()
    console.log("[v0] Updating pms_cron_settings last_run to:", nowIso, "for module:", module)
    const { error: updateError } = await serviceSupabaseForLookup
      .from("pms_cron_settings")
      .update({ 
        last_run: nowIso,
        last_status: result.errors && result.errors.length > 0 ? "error" : "success"
      })
      .eq("hotel_id", hotelId)
      .eq("module", module)
    
    if (updateError) {
      console.error("[v0] Failed to update pms_cron_settings:", updateError)
    } else {
      console.log("[v0] Successfully updated pms_cron_settings last_run")
    }

    await perf.measureDb(
      () =>
        serviceSupabase.from("sync_logs").insert({
          hotel_id: hotelId,
          sync_type: module === "production" ? "fiscal_production" : module,
          status: result.errors && result.errors.length > 0 ? "completed" : "completed",
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          records_processed: result.imported || 0,
          records_failed: result.errors?.length || 0,
          error_message: result.errors && result.errors.length > 0 ? result.errors.join(", ") : null,
          trigger_type: "manual",
          triggered_by: user.email || user.id,
          metadata: {
            module,
            startDate: syncStartDate,
            endDate: syncEndDate,
            roomTypeIds,
          },
        }),
      "INSERT:sync_logs",
    )

    const log = perf.finalize(200)
    storePerfLog(log)

    return NextResponse.json({
      success: true,
      module,
      result,
      _perf: {
        totalMs: log.totalMs,
        dbMs: log.dbMs,
        coldStart: log.coldStart,
      },
    })
  } catch (error: any) {
    console.error("[v0] Sync module error:", error)
    const log = perf.finalize(500, error.message)
    storePerfLog(log)
    return NextResponse.json({ error: error.message || "Sync failed" }, { status: 500 })
  }
}
