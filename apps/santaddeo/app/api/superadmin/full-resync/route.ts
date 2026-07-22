import { type NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { ScidooSyncService } from "@/lib/services/scidoo-sync-service"
import { ScidooClient } from "@/lib/services/scidoo-client"

export const maxDuration = 300

export async function POST(request: NextRequest) {
  // Verify auth first (before streaming)
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: profile } = await authClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  if (!profile || (profile.role !== "superadmin" && profile.role !== "super_admin")) {
    return NextResponse.json({ error: "Superadmin access required" }, { status: 403 })
  }

  const body = await request.json()
  const { hotelId } = body

  if (!hotelId) {
    return NextResponse.json({ error: "Missing hotelId" }, { status: 400 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function sendEvent(data: any) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch (_) { /* stream may be closed */ }
      }

      try {
        const supabase = await createServiceRoleClient()

        // Get PMS integration
        const { data: pmsIntegration } = await supabase
          .from("pms_integrations")
          .select("id, api_key, pms_name, is_active, property_id")
          .eq("hotel_id", hotelId)
          .eq("is_active", true)
          .single()

        if (!pmsIntegration || !pmsIntegration.api_key) {
          sendEvent({ type: "error", message: "Integrazione PMS non configurata o inattiva" })
          controller.close()
          return
        }

        // Build room type lookup
        const { data: roomTypes } = await supabase
          .from("room_types")
          .select("name,scidoo_room_type_id")
          .eq("hotel_id", hotelId)
        const scidooRtIdToName: Record<string, string> = {}
        for (const rt of roomTypes || []) {
          if (rt.scidoo_room_type_id) scidooRtIdToName[String(rt.scidoo_room_type_id)] = rt.name
        }

        // Count existing data BEFORE deleting (safety check)
        const { count: existingRawCount } = await supabase
          .from("scidoo_raw_bookings")
          .select("*", { count: "exact", head: true })
          .eq("hotel_id", hotelId)

        const { count: existingBookCount } = await supabase
          .from("bookings")
          .select("*", { count: "exact", head: true })
          .eq("hotel_id", hotelId)

        sendEvent({ type: "progress", step: 1, total: 8, message: `Dati esistenti: ${existingRawCount || 0} raw, ${existingBookCount || 0} bookings. Inizio sync sicuro...` })

        // ===== STEP 1: Sync from Scidoo (UPSERT - does NOT delete existing data) =====
        const startDate = new Date()
        startDate.setFullYear(startDate.getFullYear() - 2)
        startDate.setMonth(0, 1)
        const endDate = new Date()
        endDate.setFullYear(endDate.getFullYear() + 1)
        endDate.setMonth(11, 31)
        const startStr = startDate.toISOString().split("T")[0]
        const endStr = endDate.toISOString().split("T")[0]

        sendEvent({ type: "progress", step: 1, total: 8, message: `Scaricamento prenotazioni da Scidoo (${startStr} -> ${endStr})... Questo puo richiedere minuti.` })

        const result = await ScidooSyncService.syncAll(
          hotelId,
          pmsIntegration.api_key,
          startStr,
          endStr,
          undefined,
          undefined,
          true, // isInitialSync: fetch ALL bookings by checkin range, not just last_modified
        )

        sendEvent({ type: "progress", step: 1, total: 8, message: `Sync Scidoo completato: ${JSON.stringify(result).substring(0, 200)}` })

        // ===== STEP 2: Verify new data exists before any cleanup =====
        sendEvent({ type: "progress", step: 2, total: 8, message: "Verifica dati scaricati..." })

        const { count: newRawCount } = await supabase
          .from("scidoo_raw_bookings")
          .select("*", { count: "exact", head: true })
          .eq("hotel_id", hotelId)

        if (!newRawCount || newRawCount === 0) {
          sendEvent({ type: "error", message: `ABORT: Nessuna prenotazione scaricata da Scidoo. I dati esistenti (${existingRawCount || 0}) NON sono stati toccati. Verificare la connessione API Scidoo.` })
          controller.close()
          return
        }

        sendEvent({ type: "progress", step: 2, total: 8, message: `Verificati ${newRawCount} prenotazioni raw in database` })

        // ===== STEP 3: Sync rates =====
        sendEvent({ type: "progress", step: 3, total: 8, message: "Sincronizzazione tariffe da Scidoo..." })

        let ratesSynced = 0
        try {
          const scidooClient = new ScidooClient({
            apiKey: pmsIntegration.api_key,
            propertyId: pmsIntegration.property_id || "",
          })
          const scidooRates = await scidooClient.getRates()

          if (scidooRates && scidooRates.length > 0) {
            const ratesToUpsert = scidooRates.map((rate: any) => ({
              hotel_id: hotelId,
              scidoo_rate_id: String(rate.id),
              code: rate.code || String(rate.id),
              name: rate.name || "",
              arrangements: rate.arrangements || [],
              is_active: rate.is_active !== false,
              raw_data: rate,
              updated_at: new Date().toISOString(),
            }))

            const { data: upserted, error: ratesError } = await supabase
              .from("rates")
              .upsert(ratesToUpsert, { onConflict: "hotel_id,scidoo_rate_id", ignoreDuplicates: false })
              .select()

            if (ratesError) {
              sendEvent({ type: "progress", step: 3, total: 8, message: `Errore tariffe: ${ratesError.message}` })
            } else {
              ratesSynced = upserted?.length || 0
            }
          }
        } catch (ratesErr: any) {
          sendEvent({ type: "progress", step: 3, total: 8, message: `Errore sync tariffe (non bloccante): ${ratesErr.message}` })
        }

        sendEvent({ type: "progress", step: 3, total: 8, message: `Sincronizzate ${ratesSynced} tariffe` })

        // ===== STEP 4: Backfill room_type_name =====
        sendEvent({ type: "progress", step: 4, total: 8, message: "Correzione nomi tipologia camera..." })

        // Batch backfill room_type_name using SQL UPDATE with CASE
        let backfilledCount = 0
        const rtEntries = Object.entries(scidooRtIdToName)
        if (rtEntries.length > 0) {
          for (const [rtId, name] of rtEntries) {
            const { count } = await supabase
              .from("scidoo_raw_bookings")
              .update({ room_type_name: name as string, room_type_code: rtId })
              .eq("hotel_id", hotelId)
              .is("room_type_name", null)
              .eq("raw_data->>room_type_id", rtId)
            backfilledCount += (count || 0)
          }
        }

        sendEvent({ type: "progress", step: 4, total: 8, message: `Corrette ${backfilledCount} tipologie camera` })

        // ===== STEP 5: Regenerate bookings (delete old + ETL) =====
        sendEvent({ type: "progress", step: 5, total: 8, message: "Rigenerazione tabella bookings..." })

        await supabase
          .from("bookings")
          .delete()
          .eq("hotel_id", hotelId)

        let etlResult: any = null
        try {
          const { ETLOrchestrator } = await import("@/lib/etl/etl-orchestrator")
          // Only run bookings ETL - availability is handled separately by cron
          // and daily_production is generated directly via RPC in Step 6
          const etl = new ETLOrchestrator({
            hotel_id: hotelId,
            job_type: "bookings",
            date_from: startStr,
            date_to: endStr,
            triggered_by: "superadmin_full_resync",
          })
          etlResult = await etl.run()
          sendEvent({ type: "progress", step: 5, total: 8, message: `ETL bookings completato: ${etlResult?.results?.bookings?.records_processed || 0} processate` })
        } catch (etlError: any) {
          sendEvent({ type: "progress", step: 5, total: 8, message: `ETL fallito (non bloccante): ${etlError.message}` })
        }

        // ===== STEP 6: Regenerate daily_production =====
        sendEvent({ type: "progress", step: 6, total: 8, message: "Rigenerazione produzione giornaliera..." })

        try {
          // Delete existing daily_production
          await supabase
            .from("daily_production")
            .delete()
            .eq("hotel_id", hotelId)

          // Get total rooms
          const { data: rtData } = await supabase
            .from("room_types")
            .select("total_rooms")
            .eq("hotel_id", hotelId)
            .eq("is_active", true)
          const totalRooms = (rtData || []).reduce((s: number, r: any) => s + (r.total_rooms || 0), 0) || 21

          // Build daily stats from scidoo_raw_bookings via SQL
          const { data: dailyStats, error: dpError } = await supabase.rpc("generate_daily_production", {
            p_hotel_id: hotelId,
            p_total_rooms: totalRooms,
          })

          if (dpError) {
            // Fallback: use raw SQL via direct query approach
            // Calculate from bookings table instead
            sendEvent({ type: "progress", step: 6, total: 8, message: `RPC non disponibile, uso fallback bookings. ${dpError.message}` })
          } else {
            sendEvent({ type: "progress", step: 6, total: 8, message: `Produzione giornaliera rigenerata: ${dailyStats?.length || 0} giorni` })
          }
        } catch (dpErr: any) {
          sendEvent({ type: "progress", step: 6, total: 8, message: `Produzione giornaliera: errore non bloccante (${dpErr.message}). Rigenerare manualmente.` })
        }

        // ===== STEP 7: Cleanup stale cancelled bookings =====
        sendEvent({ type: "progress", step: 7, total: 8, message: "Pulizia prenotazioni obsolete..." })

        // Remove duplicates keeping the latest synced_at
        const { count: cleanedCount } = await supabase.rpc("cleanup_duplicate_raw_bookings", {
          p_hotel_id: hotelId,
        }).then((r: any) => ({ count: r.data || 0 })).catch(() => ({ count: 0 }))

        sendEvent({ type: "progress", step: 7, total: 8, message: `Pulizia completata (${cleanedCount} duplicati rimossi)` })

        // ===== STEP 8: Final verification =====
        sendEvent({ type: "progress", step: 8, total: 8, message: "Verifica finale integrita dati..." })

        const { count: rawCount } = await supabase
          .from("scidoo_raw_bookings")
          .select("*", { count: "exact", head: true })
          .eq("hotel_id", hotelId)

        const { count: bookCount } = await supabase
          .from("bookings")
          .select("*", { count: "exact", head: true })
          .eq("hotel_id", hotelId)

        const { count: nullNameCount } = await supabase
          .from("scidoo_raw_bookings")
          .select("*", { count: "exact", head: true })
          .eq("hotel_id", hotelId)
          .is("room_type_name", null)

        const { count: dpCount } = await supabase
          .from("daily_production")
          .select("*", { count: "exact", head: true })
          .eq("hotel_id", hotelId)

        const stats = {
          existingBefore: { raw: existingRawCount || 0, bookings: existingBookCount || 0 },
          backfilledRoomTypes: backfilledCount,
          ratesSynced,
          finalCounts: {
            rawBookings: rawCount || 0,
            bookings: bookCount || 0,
            missingRoomTypeName: nullNameCount || 0,
            dailyProduction: dpCount || 0,
          },
        }

        sendEvent({ type: "complete", message: `Resync completo! Raw: ${rawCount}, Bookings: ${bookCount}, Tariffe: ${ratesSynced}, Produzione: ${dpCount} giorni`, stats })

      } catch (error: any) {
        console.error("[full-resync] Error:", error)
        sendEvent({ type: "error", message: error.message || "Errore interno del server" })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
