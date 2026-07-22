import { type NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { isServiceUnavailableError, logSupabaseError } from "@/lib/supabase/error-utils"
import { ScidooSyncService } from "@/lib/services/scidoo-sync-service"
import { requireCronAuth } from "@/lib/cron-auth"
import { ScidooClient } from "@/lib/services/scidoo-client"
import { invalidateHotelCache } from "@/lib/cache/redis"
import { emailService } from "@/lib/services/email-service"
import { syncBrigForHotel, reconcileBrigStaleCancellations } from "@/lib/connectors/brig/sync"
import { BrigBookingsProcessor } from "@/lib/etl/processors/brig-bookings-processor"
import { BrigAvailabilityProcessor } from "@/lib/etl/processors/brig-availability-processor"
import { syncSlopeForHotel } from "@/lib/connectors/slope/sync"
import { SlopeBookingsProcessor } from "@/lib/etl/processors/slope-bookings-processor"
import { SlopeAvailabilityProcessor } from "@/lib/etl/processors/slope-availability-processor"

export const dynamic = "force-dynamic"
export const maxDuration = 300 // 5 minutes: now processes ALL hotels in parallel

/** Aggiunge `days` giorni a una data (UTC), senza mutare l'originale. */
function addDaysUTCSimple(d: Date, days: number): Date {
  const r = new Date(d)
  r.setUTCDate(r.getUTCDate() + days)
  return r
}
/** Formatta una data come YYYY-MM-DD in UTC. */
function ymdUTC(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Cron job per sincronizzazione automatica dei moduli Scidoo
 * Eseguito ogni 15 minuti da Vercel Cron
 * Processa TUTTI gli hotel attivi in parallelo con Promise.allSettled
 */
export async function GET(request: NextRequest) {
  console.log("========================================")
  console.log("[CRON] sync-modules STARTED at", new Date().toISOString())
  console.log("========================================")

  try {
    const unauthorized = requireCronAuth(request)
    if (unauthorized) {
      console.log("[CRON] UNAUTHORIZED - missing CRON_SECRET or auth mismatch")
      return unauthorized
    }

    const supabase = await createServiceRoleClient()
    const now = new Date()

    // Fix NULL next_run values
    const { data: nullNextRunJobs } = await supabase
      .from("pms_cron_settings")
      .select("id, module, hotel_id")
      .eq("enabled", true)
      .is("next_run", null)

    if (nullNextRunJobs && nullNextRunJobs.length > 0) {
      console.log("[CRON] Fixing", nullNextRunJobs.length, "jobs with NULL next_run")
      for (const job of nullNextRunJobs) {
        await supabase.from("pms_cron_settings").update({ next_run: now.toISOString() }).eq("id", job.id)
      }
    }

    // BUG FIX 13/05/2026 (incident "email sync_modules_failure per hotel demo"):
    // pms_cron_settings contiene ANCHE righe `module='pricing'` che NON sono
    // di pertinenza di questo cron (le gestisce /api/cron/calculate-k-values).
    // Prima senza whitelist:
    //  - Hotel demo (Casanova, Cavallino, Superlusso) con solo `pricing`
    //    enabled e nessun PMS → fallback `no_pms_integration` per 1/1
    //    moduli → 100% failure → email "sync_modules_failure".
    //  - Hotel con PMS (Moriano) → `default: throw Unknown module: pricing`.
    // Soluzione: lista esplicita dei moduli realmente gestiti dal `switch`
    // più sotto. Qualsiasi nuovo modulo aggiunto al switch va aggiunto qui.
    const SYNC_MODULES_HANDLED = [
      "room_types",
      "rates",
      "minstay",
      "availability",
      "occupied",
      "production",
      "production_management",
      "bookings",
      // FIX 24/05/2026 (incident "Cavallino 4 giorni senza prenotazioni"):
      // BRiG usa `module='reservations'` mentre Scidoo usa `bookings`.
      // Senza questa entry il cron filtrava via tutte le righe Brig dal
      // .in("module", SYNC_MODULES_HANDLED), il loro next_run restava nel
      // passato per sempre e il sync automatico di prenotazioni Brig non
      // accadeva mai. Cavallino ha smesso di scaricare bookings il 21/05
      // dopo l'ultimo sync manuale dal pannello, e ha avuto 4 giorni di
      // silenzio totale (0 prenotazioni nuove in DB).
      "reservations",
    ] as const

    // Find ALL enabled cron settings that need to run (not just one)
    const { data: cronSettings, error: cronError } = await supabase
      .from("pms_cron_settings")
      .select("*")
      .eq("enabled", true)
      .in("module", SYNC_MODULES_HANDLED as unknown as string[])
      .lte("next_run", now.toISOString())
      .order("next_run", { ascending: true })

    if (cronError) {
      // FIX 31/05/2026: outage Supabase (gateway Cloudflare 5xx -> HTML)
      // non e' un errore applicativo. Logga compatto (mai il blob HTML) e
      // rispondi 503 transitorio invece di 500, cosi' non genera allarmi.
      logSupabaseError("sync-modules: fetch cron settings", cronError)
      const transient = isServiceUnavailableError(cronError)
      return NextResponse.json(
        { error: transient ? "Supabase temporarily unavailable" : cronError.message },
        { status: transient ? 503 : 500 },
      )
    }

    console.log("[CRON] Jobs ready to run:", cronSettings?.length || 0)

    if (!cronSettings || cronSettings.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No modules ready to sync",
        synced: 0,
        timestamp: now.toISOString(),
      })
    }

    // Auto-heal: reset any module stuck in "running" for more than 10 minutes
    const stuckCutoff = new Date(now.getTime() - 10 * 60 * 1000).toISOString()
    await supabase
      .from("pms_cron_settings")
      .update({ last_status: "idle", next_run: now.toISOString() })
      .eq("last_status", "running")
      .lt("updated_at", stuckCutoff)

    // Group settings by hotel_id
    const settingsByHotel = new Map<string, typeof cronSettings>()
    for (const setting of cronSettings) {
      const hotelId = setting.hotel_id
      if (!settingsByHotel.has(hotelId)) {
        settingsByHotel.set(hotelId, [])
      }
      settingsByHotel.get(hotelId)!.push(setting)
    }

    console.log(`[CRON] Processing ${settingsByHotel.size} hotel(s) with ${cronSettings.length} total module(s) in parallel`)

    // Process ALL hotels in parallel with Promise.allSettled
    const hotelResults = await Promise.allSettled(
      Array.from(settingsByHotel.entries()).map(([hotelId, settings]) =>
        processHotel(supabase, hotelId, settings, now)
      )
    )

    // Collect all results
    const allResults: any[] = []
    let hotelsSuccess = 0
    let hotelsFailed = 0

    for (let i = 0; i < hotelResults.length; i++) {
      const hotelResult = hotelResults[i]
      const hotelId = Array.from(settingsByHotel.keys())[i]

      if (hotelResult.status === "fulfilled") {
        allResults.push(...hotelResult.value)
        // BUG FIX 13/05/2026: `skipped` (no_pms_integration / no_api_key)
        // NON conta come failure. Sono configurazioni mancanti, non errori
        // di sync. Senza questo filtro un hotel demo senza PMS finiva
        // in `hotelsFailed` e generava email "sync_modules_failure".
        const hadRealErrors = hotelResult.value.some(
          (r: any) => !r.success && !r.skipped
        )
        if (hadRealErrors) {
          hotelsFailed++
        } else {
          hotelsSuccess++
        }
      } else {
        hotelsFailed++
        allResults.push({
          hotel_id: hotelId,
          module: "all",
          success: false,
          error: hotelResult.reason?.message || String(hotelResult.reason),
        })
      }
    }

    console.log("========================================")
    console.log(`[CRON] COMPLETED: ${hotelsSuccess} hotel(s) OK, ${hotelsFailed} hotel(s) with errors`)
    console.log(`[CRON] Modules: ${allResults.filter(r => r.success).length} succeeded, ${allResults.filter(r => !r.success).length} failed`)
    console.log("========================================")

    // Send throttled email alerts for hotels with >50% module failures
    // BUG FIX 13/05/2026: i moduli con `skipped:true` (no_pms_integration /
    // no_api_key) NON contano come failure. Senza filtro, hotel demo senza
    // PMS ricevevano email "1/1 moduli sync falliti" ad ogni ciclo cron.
    if (hotelsFailed > 0) {
      const failedHotelIds = Array.from(settingsByHotel.keys()).filter((hId, i) => {
        const hr = hotelResults[i]
        return (
          hr.status === "rejected" ||
          (hr.status === "fulfilled" && hr.value.some((r: any) => !r.success && !r.skipped))
        )
      })

      if (failedHotelIds.length > 0) {
        const { data: hotelNames } = await supabase
          .from("hotels")
          .select("id, name")
          .in("id", failedHotelIds)

        const nameMap = new Map((hotelNames || []).map(h => [h.id, h.name]))

        for (let i = 0; i < hotelResults.length; i++) {
          const hr = hotelResults[i]
          const hId = Array.from(settingsByHotel.keys())[i]
          // Denominator = solo moduli effettivamente tentati (escludendo
          // gli skipped). Se TUTTI sono skipped → totalAttempted=0 → no email.
          let totalAttempted = settingsByHotel.get(hId)?.length || 0
          let failedModules: string[] = []
          if (hr.status === "rejected") {
            failedModules = [`Errore globale: ${hr.reason?.message || String(hr.reason)}`]
          } else if (hr.status === "fulfilled") {
            const skippedCount = hr.value.filter((r: any) => r.skipped).length
            totalAttempted = Math.max(totalAttempted - skippedCount, 0)
            failedModules = hr.value
              .filter((r: any) => !r.success && !r.skipped)
              .map((r: any) => `${r.module}: ${r.error || "errore sconosciuto"}`)
          }

          // Alert if >50% of *attempted* modules failed
          if (
            totalAttempted > 0 &&
            failedModules.length > 0 &&
            failedModules.length / totalAttempted >= 0.5
          ) {
            await emailService.sendAlertIfNotRecent({
              alertType: "sync_modules_failure",
              hotelId: hId,
              hotelName: nameMap.get(hId) || hId,
              summary: `${failedModules.length}/${totalAttempted} moduli sync falliti`,
              details: failedModules,
            })
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      hotelsProcessed: settingsByHotel.size,
      hotelsSuccess,
      hotelsFailed,
      synced: allResults.filter((r) => r.success).length,
      failed: allResults.filter((r) => !r.success).length,
      results: allResults,
      timestamp: now.toISOString(),
    })
  } catch (error) {
    console.error("[CRON] FATAL ERROR:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    )
  }
}

/**
 * Process ALL modules for a single hotel in parallel
 */
async function processHotel(
  supabase: any,
  hotelId: string,
  settings: any[],
  now: Date
): Promise<any[]> {
  // FIX 24/05/2026 (Cavallino bookings stuck): prima la query era
  // `.eq("pms_name", "scidoo")` hardcoded, quindi tutti gli hotel con
  // PMS Brig finivano sempre nel ramo `no_pms_integration`. Ora leggiamo
  // QUALSIASI integrazione attiva e dispatchiamo al connector giusto.
  const { data: pmsIntegration } = await supabase
    .from("pms_integrations")
    .select("*")
    .eq("hotel_id", hotelId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!pmsIntegration) {
    // BUG FIX 13/05/2026: prima ritornavamo `success:false` senza toccare
    // pms_cron_settings → next_run restava nel passato → ogni 15 min lo
    // ribeccavamo → email spam. Ora marchiamo skipped e avanziamo next_run
    // alla frequenza configurata. La pricing-grid/UI scidoo-sync-panel
    // mostrerà comunque "PMS non configurato" come stato corretto.
    console.log(`[CRON] Skipping hotel ${hotelId}: no active PMS integration`)
    await Promise.all(
      settings.map(s => {
        const nextRun = calculateNextRun(s.frequency)
        return supabase
          .from("pms_cron_settings")
          .update({
            last_status: "skipped",
            last_error: "no_pms_integration",
            next_run: nextRun.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq("id", s.id)
      })
    )
    return settings.map(s => ({
      hotel_id: hotelId,
      module: s.module,
      success: false,
      error: "no_pms_integration",
      skipped: true,
    }))
  }

  // FIX 24/05/2026: dispatch al connector Brig se l'integrazione e' brig.
  // I moduli Brig oggi gestiti dal cron sono solo 'reservations'
  // (= scarica prenotazioni); 'rates' e 'room_types' per Brig sono in
  // realta' allineate dentro syncBrigForHotel stesso (room_types
  // names) e non hanno endpoint pricing dedicato dal cron, quindi le
  // marchiamo skipped per non spammare errori.
  if (pmsIntegration.pms_name === "brig") {
    const results = await Promise.allSettled(
      settings.map((s) => processBrigModule(supabase, s, hotelId, now)),
    )
    const out: any[] = []
    for (let i = 0; i < results.length; i++) {
      const r = results[i]
      const setting = settings[i]
      if (r.status === "fulfilled") {
        out.push(r.value)
      } else {
        const errMsg = r.reason?.message || String(r.reason)
        const nextRun = calculateNextRun(setting.frequency)
        await supabase
          .from("pms_cron_settings")
          .update({
            last_status: "error",
            last_error: errMsg,
            next_run: nextRun.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq("id", setting.id)
        out.push({
          hotel_id: hotelId,
          module: setting.module,
          success: false,
          error: errMsg,
        })
      }
    }
    // Cache invalidation anche per Brig: la dashboard Cavallino legge
    // bookings cached e va rinfrescata dopo un sync che ha portato dati.
    await invalidateHotelCache(hotelId).catch((err) =>
      console.error(`[CRON] Cache invalidation failed for hotel ${hotelId}:`, err),
    )
    return out
  }

  // FIX 13/07/2026: dispatch al connettore Slope NATIVO (Partner API v1).
  // Slope era raggiungibile solo via bridge BRiG (brig_sub_pms), mai attivato
  // per mancanza di credenziali BRiG; ora ha API dirette. Stesso pattern del
  // branch brig qui sopra: Promise.allSettled per modulo + cache invalidation.
  if (pmsIntegration.pms_name === "slope") {
    const results = await Promise.allSettled(
      settings.map((s) => processSlopeModule(supabase, s, hotelId, now)),
    )
    const out: any[] = []
    for (let i = 0; i < results.length; i++) {
      const r = results[i]
      const setting = settings[i]
      if (r.status === "fulfilled") {
        out.push(r.value)
      } else {
        const errMsg = r.reason?.message || String(r.reason)
        const nextRun = calculateNextRun(setting.frequency)
        await supabase
          .from("pms_cron_settings")
          .update({
            last_status: "error",
            last_error: errMsg,
            next_run: nextRun.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq("id", setting.id)
        out.push({
          hotel_id: hotelId,
          module: setting.module,
          success: false,
          error: errMsg,
        })
      }
    }
    await invalidateHotelCache(hotelId).catch((err) =>
      console.error(`[CRON] Cache invalidation failed for hotel ${hotelId}:`, err),
    )
    return out
  }

  // Scidoo flow continues unchanged below
  if (pmsIntegration.pms_name !== "scidoo") {
    // Future-proof: PMS sconosciuto → skipped, non error.
    console.log(
      `[CRON] Skipping hotel ${hotelId}: unsupported pms_name=${pmsIntegration.pms_name}`,
    )
    await Promise.all(
      settings.map((s) => {
        const nextRun = calculateNextRun(s.frequency)
        return supabase
          .from("pms_cron_settings")
          .update({
            last_status: "skipped",
            last_error: `unsupported_pms:${pmsIntegration.pms_name}`,
            next_run: nextRun.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq("id", s.id)
      }),
    )
    return settings.map((s) => ({
      hotel_id: hotelId,
      module: s.module,
      success: false,
      error: `unsupported_pms:${pmsIntegration.pms_name}`,
      skipped: true,
    }))
  }

  const apiKey = pmsIntegration.api_key || pmsIntegration.credentials?.api_key
  if (!apiKey) {
    // Same defensive skip as above (no API key configured)
    console.log(`[CRON] Skipping hotel ${hotelId}: no API key`)
    await Promise.all(
      settings.map(s => {
        const nextRun = calculateNextRun(s.frequency)
        return supabase
          .from("pms_cron_settings")
          .update({
            last_status: "skipped",
            last_error: "no_api_key",
            next_run: nextRun.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq("id", s.id)
      })
    )
    return settings.map(s => ({
      hotel_id: hotelId,
      module: s.module,
      success: false,
      error: "no_api_key",
      skipped: true,
    }))
  }

  // Get organization for VAT number (needed for production sync)
  const { data: hotelData } = await supabase
    .from("hotels")
    .select("organization_id, organizations(vat_number)")
    .eq("id", hotelId)
    .single()

  const vatNumber = (hotelData?.organizations as any)?.vat_number
  const propertyId = pmsIntegration.property_id || (pmsIntegration.config as any)?.property_id
  const client = new ScidooClient({ apiKey, propertyId, hotelId })

  // Process ALL modules for this hotel in parallel
  const moduleResults = await Promise.allSettled(
    settings.map(setting => processModule(supabase, setting, client, pmsIntegration, apiKey, vatNumber, now))
  )

  const results: any[] = []
  for (let i = 0; i < moduleResults.length; i++) {
    const moduleResult = moduleResults[i]
    const setting = settings[i]

    if (moduleResult.status === "fulfilled") {
      results.push(moduleResult.value)
    } else {
      // Module threw an unhandled error -- log it and continue
      const errorMsg = moduleResult.reason?.message || String(moduleResult.reason)
      console.error(`[CRON] Unhandled error in ${setting.module} for hotel ${hotelId}:`, errorMsg)

      const nextRun = calculateNextRun(setting.frequency)
      await supabase
        .from("pms_cron_settings")
        .update({
          last_status: "error",
          last_error: errorMsg,
          next_run: nextRun.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq("id", setting.id)

          // NOTA 16/05/2026: questa funzione scrive su `public.sync_logs`
          // (default schema del client supabase, NON connectors.sync_logs
          // che ha schema diverso). public.sync_logs ha colonne:
          //   records_processed, records_failed, error_message,
          //   trigger_type, triggered_by, metadata jsonb
          // E' la fonte dati della pagina "Log Sincronizzazioni" in UI.
          await supabase.from("sync_logs").insert({
            hotel_id: hotelId,
            sync_type: setting.module,
            status: "error",
            started_at: now.toISOString(),
            completed_at: new Date().toISOString(),
            records_processed: 0,
            records_failed: 1,
            error_message: errorMsg,
            trigger_type: "automatic",
            triggered_by: "cron",
            metadata: { module: setting.module, frequency: setting.frequency },
          })

      results.push({
        hotel_id: hotelId,
        module: setting.module,
        success: false,
        error: errorMsg,
      })
    }
  }

  // Invalidate Redis cache for this hotel so dashboard shows fresh data
  await invalidateHotelCache(hotelId).catch((err) =>
    console.error(`[CRON] Cache invalidation failed for hotel ${hotelId}:`, err)
  )

  return results
}

/**
 * Process a single module for a single hotel
 * The internal sync logic is unchanged from the original implementation
 */
async function processModule(
  supabase: any,
  setting: any,
  client: ScidooClient,
  pmsIntegration: any,
  apiKey: string,
  vatNumber: string | null,
  now: Date
): Promise<any> {
  const hotelId = setting.hotel_id

  try {
    // Mark as running
    await supabase
      .from("pms_cron_settings")
      .update({
        last_status: "running",
        last_run: now.toISOString(),
      })
      .eq("id", setting.id)

    console.log(`[CRON] Running ${setting.module} sync for hotel ${hotelId}`)

    // Calculate dates
    let startDate = setting.date_from || getDefaultStartDate(setting.module)
    let endDate = setting.date_to || getDefaultEndDate(setting.module)

    // GUARD 15/05/2026: sanity check sulle date salvate in
    // pms_cron_settings. Incident Barronci 13-15/05: date_from='0202-01-01'
    // (typo storico, "0202" invece di "2026") faceva chiamare Scidoo con un
    // range di 1800+ anni -> 500 Internal Server Error per ogni run del
    // cron, 0 nuove righe in connectors.scidoo_raw_fiscal_production,
    // monitor fiscale BROKEN, alert email orari.
    // Clamp: se startDate < 2020 o endDate < oggi - 1 anno, cadiamo sui
    // default (mese corrente per production/fiscal_production, ultimi 90gg
    // per bookings). Logghiamo SEMPRE per visibilita' nel cron output.
    const MIN_VALID_YEAR = 2020
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0]
    const startYear = Number.parseInt(startDate?.slice(0, 4) ?? "0", 10)
    if (!Number.isFinite(startYear) || startYear < MIN_VALID_YEAR) {
      const fallback = getDefaultStartDate(setting.module)
      console.warn(
        `[CRON] Invalid date_from "${startDate}" on pms_cron_settings ${setting.id} ` +
          `(module=${setting.module}, hotel=${hotelId}). Falling back to "${fallback}".`,
      )
      startDate = fallback
    }
    if (endDate && endDate < oneYearAgo) {
      const fallback = getDefaultEndDate(setting.module)
      console.warn(
        `[CRON] Stale date_to "${endDate}" on pms_cron_settings ${setting.id} ` +
          `(module=${setting.module}, hotel=${hotelId}, more than 1 year in the past). ` +
          `Falling back to "${fallback}".`,
      )
      endDate = fallback
    }

    let syncResult: any

    // Execute sync based on module type (logic unchanged)
    switch (setting.module) {
      case "room_types":
        syncResult = await ScidooSyncService.syncRoomTypes(hotelId, pmsIntegration.id, client, supabase)
        break

      case "rates":
        syncResult = await ScidooSyncService.syncRates(hotelId, pmsIntegration.id, client, supabase)
        break

      case "minstay":
        syncResult = await ScidooSyncService.syncMinStay(supabase, hotelId, apiKey, startDate, endDate)
        break

      case "availability":
      case "occupied":
        syncResult = await ScidooSyncService.syncAvailability(supabase, hotelId, apiKey, startDate, endDate)
        break

      case "production": {
        const fiscalVat = pmsIntegration.vat_number || vatNumber
        if (!fiscalVat) {
          console.log(`[CRON] Skipping fiscal production sync for hotel ${hotelId} - no VAT number configured`)
          syncResult = { success: true, skipped: true, message: "No VAT number - fiscal sync skipped" }
          break
        }
        const endpointUrl = pmsIntegration.config?.endpoint_url || "https://www.scidoo.com/api/v1"
        syncResult = await ScidooSyncService.syncFiscalProduction(
          hotelId, apiKey, endpointUrl, fiscalVat, pmsIntegration.id, startDate, endDate,
        )
        break
      }

      case "production_management": {
        // PRODUZIONE GESTIONALE (12/05/2026):
        // Alias del sync bookings (il daily price arriva nel payload prenotazioni).
        // Tracciato separatamente in pms_cron_settings per dare visibilita'
        // dedicata al manager hotel. NON richiede VAT.
        const isInitialPmSync = !setting.is_initial_sync_done
        if (isInitialPmSync) {
          const today = new Date()
          const initialStart = new Date(today)
          initialStart.setFullYear(initialStart.getFullYear() - 2)
          const initialEnd = new Date(today)
          initialEnd.setFullYear(initialEnd.getFullYear() + 1)

          syncResult = await ScidooSyncService.syncBookings(
            supabase, hotelId, apiKey,
            initialStart.toISOString().split("T")[0],
            initialEnd.toISOString().split("T")[0],
            true,
          )

          if (!syncResult.errors?.length || syncResult.imported > 0) {
            await supabase
              .from("pms_cron_settings")
              .update({ is_initial_sync_done: true })
              .eq("id", setting.id)
          }
        } else {
          syncResult = await ScidooSyncService.syncBookings(
            supabase, hotelId, apiKey, startDate, endDate, false,
          )
        }
        break
      }

      case "bookings": {
        const isInitialSync = !setting.is_initial_sync_done

        if (isInitialSync) {
          const today = new Date()
          const initialStartDate = new Date(today)
          initialStartDate.setFullYear(initialStartDate.getFullYear() - 2)
          const initialEndDate = new Date(today)
          initialEndDate.setFullYear(initialEndDate.getFullYear() + 1)

          syncResult = await ScidooSyncService.syncBookings(
            supabase, hotelId, apiKey,
            initialStartDate.toISOString().split("T")[0],
            initialEndDate.toISOString().split("T")[0],
            true,
          )

          if (!syncResult.errors?.length || syncResult.imported > 0) {
            await supabase
              .from("pms_cron_settings")
              .update({ is_initial_sync_done: true })
              .eq("id", setting.id)
          }
        } else {
          syncResult = await ScidooSyncService.syncBookings(
            supabase, hotelId, apiKey, startDate, endDate, false,
          )
        }
        break
      }

      default:
        throw new Error(`Unknown module: ${setting.module}`)
    }

    // Calculate next run time based on frequency
    const nextRun = calculateNextRun(setting.frequency)

    // Update cron setting with success
    await supabase
      .from("pms_cron_settings")
      .update({
        last_status: "success",
        last_error: null,
        next_run: nextRun.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("id", setting.id)

    // Log su public.sync_logs (vedi nota nel ramo error per dettagli schema).
    await supabase.from("sync_logs").insert({
      hotel_id: hotelId,
      sync_type: setting.module === "production" ? "fiscal_production" : setting.module,
      status: "completed",
      started_at: now.toISOString(),
      completed_at: new Date().toISOString(),
      records_processed: syncResult?.imported || 0,
      records_failed: syncResult?.errors?.length || 0,
      error_message: syncResult?.errors?.length > 0 ? syncResult.errors.join(", ") : null,
      trigger_type: "automatic",
      triggered_by: "cron",
      metadata: {
        module: setting.module,
        startDate,
        endDate,
        frequency: setting.frequency,
      },
    })

    console.log(`[CRON] ${setting.module} sync completed for hotel ${hotelId}`)

    return {
      hotel_id: hotelId,
      module: setting.module,
      success: true,
      next_run: nextRun.toISOString(),
    }
  } catch (error) {
    console.error(`[CRON] Error syncing ${setting.module} for hotel ${hotelId}:`, error)

    const nextRun = calculateNextRun(setting.frequency)

    await supabase
      .from("pms_cron_settings")
      .update({
        last_status: "error",
        last_error: error instanceof Error ? error.message : String(error),
        next_run: nextRun.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("id", setting.id)

    await supabase.from("sync_logs").insert({
      hotel_id: hotelId,
      sync_type: setting.module,
      status: "error",
      started_at: now.toISOString(),
      completed_at: new Date().toISOString(),
      records_processed: 0,
      records_failed: 1,
      error_message: error instanceof Error ? error.message : String(error),
      trigger_type: "automatic",
      triggered_by: "cron",
      metadata: { module: setting.module, frequency: setting.frequency },
    })

    return {
      hotel_id: hotelId,
      module: setting.module,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Handler Brig per il cron sync-modules (FIX 24/05/2026).
 *
 * Brig usa un singolo endpoint paginato `getReservations` per scaricare
 * tutte le prenotazioni; non c'e' un concetto di "rates" o "room_types"
 * separati come in Scidoo. Mappiamo quindi:
 *  - module='reservations' → syncBrigForHotel + ETL bookings
 *  - module='room_types', 'rates' (se presenti per qualche hotel
 *    storico) → skipped success, perche' room_types names sono
 *    gia' allineati dentro syncBrigForHotel (riga 1bis di
 *    lib/connectors/brig/sync.ts).
 *  - qualsiasi altro modulo → skipped (no-op pulito).
 *
 * Comportamento speculare a processModule (Scidoo):
 *  - Mark running, update last_run, eseguito sync, log su sync_logs,
 *    avanzo next_run alla frequenza. In caso di errore upstream
 *    (BrigError, rate limit 429, ecc.) marca status=error e ritenta
 *    al prossimo ciclo cron.
 */
/**
 * Processa un modulo cron per un hotel SLOPE (Partner API v1, 13/07/2026).
 *
 * Molto piu' semplice del gemello BRiG:
 *  - 'reservations': syncSlopeForHotel (delta su lastUpdateDate, Strategia 1
 *    della doc Slope) + ETL SlopeBookingsProcessor se ha scritto righe.
 *  - qualsiasi altro modulo → skipped (Slope non espone availability
 *    aggregata; l'occupancy deriva dalle prenotazioni via ETL).
 *
 * Niente circuit breaker di quota giornaliera: il rate limit Slope e'
 * PER MINUTO (30 req/min) e il retry con backoff vive in SlopeClient.
 */
async function processSlopeModule(
  supabase: any,
  setting: any,
  hotelId: string,
  now: Date,
): Promise<any> {
  if (setting.module !== "reservations") {
    const nextRun = calculateNextRun(setting.frequency, setting.module)
    await supabase
      .from("pms_cron_settings")
      .update({
        last_status: "skipped",
        last_error: `slope_module_not_supported:${setting.module}`,
        last_run: now.toISOString(),
        next_run: nextRun.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("id", setting.id)
    return {
      hotel_id: hotelId,
      module: setting.module,
      success: false,
      skipped: true,
      error: `slope_module_not_supported:${setting.module}`,
    }
  }

  try {
    await supabase
      .from("pms_cron_settings")
      .update({ last_status: "running", last_run: now.toISOString() })
      .eq("id", setting.id)

    console.log(`[CRON] Running Slope reservations sync for hotel ${hotelId}`)
    const result = await syncSlopeForHotel({ hotelId })

    // ETL post-sync se il sync ha scritto/aggiornato righe raw o marcato
    // hard-delete (che vanno propagate a public.bookings come cancellazioni).
    let etlError: string | null = null
    const totalWritten = result.inserted + result.updated + result.deletedMarked
    if (totalWritten > 0) {
      try {
        const processor = new SlopeBookingsProcessor(hotelId, `cron-slope-${Date.now()}`)
        await processor.process()
      } catch (e) {
        etlError = e instanceof Error ? e.message : String(e)
        console.error(`[CRON] Slope ETL post-sync failed for hotel ${hotelId}:`, etlError)
      }
    }

    // Availability DERIVATA dalle prenotazioni (17/07/2026): Slope non espone
    // un endpoint disponibilita' -> senza questo passo daily_availability resta
    // vuota e la dashboard mostra occupancy 0% pur con notti vendute. Eseguito
    // SEMPRE (non solo su totalWritten>0) perche' deriva da tutte le bookings
    // gia' in DB: cosi' popola l'occupazione anche al primo giro dopo il deploy
    // e riflette le cancellazioni riconciliate. Non-fatal.
    try {
      const availProcessor = new SlopeAvailabilityProcessor(hotelId, `cron-slope-avail-${Date.now()}`)
      await availProcessor.process()
    } catch (e) {
      const availErr = e instanceof Error ? e.message : String(e)
      console.error(`[CRON] Slope availability derivation failed for hotel ${hotelId}:`, availErr)
      etlError = etlError ? `${etlError} | avail: ${availErr}` : `avail: ${availErr}`
    }

    const hasErrors = result.errors.length > 0 || !!etlError
    const errorMsg = hasErrors
      ? [...result.errors, etlError].filter(Boolean).join(" | ")
      : null

    const nextRun = calculateNextRun(setting.frequency, setting.module)
    await supabase
      .from("pms_cron_settings")
      .update({
        last_status: hasErrors ? "error" : "success",
        last_error: errorMsg,
        next_run: nextRun.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("id", setting.id)

    await supabase.from("sync_logs").insert({
      hotel_id: hotelId,
      sync_type: setting.module,
      status: hasErrors ? "error" : "completed",
      started_at: now.toISOString(),
      completed_at: new Date().toISOString(),
      records_processed: result.inserted + result.updated,
      records_failed: result.errors.length,
      error_message: errorMsg,
      trigger_type: "automatic",
      triggered_by: "cron",
      metadata: {
        module: setting.module,
        pms: "slope",
        frequency: setting.frequency,
        pagesFetched: result.pagesFetched,
        recordsExamined: result.recordsExamined,
        inserted: result.inserted,
        updated: result.updated,
        unchanged: result.unchanged,
        deletedMarked: result.deletedMarked,
        usedCursor: result.usedCursor,
      },
    })

    return {
      hotel_id: hotelId,
      module: setting.module,
      success: !hasErrors,
      records_inserted: result.inserted,
      records_updated: result.updated,
      error: errorMsg ?? undefined,
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    const nextRun = calculateNextRun(setting.frequency, setting.module)
    await supabase
      .from("pms_cron_settings")
      .update({
        last_status: "error",
        last_error: errMsg,
        last_run: now.toISOString(),
        next_run: nextRun.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("id", setting.id)
    return {
      hotel_id: hotelId,
      module: setting.module,
      success: false,
      error: errMsg,
    }
  }
}

async function processBrigModule(
  supabase: any,
  setting: any,
  hotelId: string,
  now: Date,
): Promise<any> {
  // Brig supporta nativamente solo 'reservations'. Per 'availability'
  // (FIX 25/05/2026 incident Cavallino "disponibilita' obsoleta")
  // deriviamo i counter dalle reservations gia' sincronizzate, senza
  // chiamare la API Brig (che peraltro non espone availability).
  // Tutti gli altri moduli restano no-op.
  const isReservations = setting.module === "reservations"
  const isAvailability = setting.module === "availability"

  // Circuit breaker giornaliero (FIX 25/05/2026 incident Cavallino
  // "Brig API error 429 maximum number of requests [100]"). La sandbox
  // BRiG impone 100 req/giorno totali per hotel. Quando uno dei moduli
  // (tipicamente reservations) esaurisce la quota, blocchiamo i moduli
  // BRiG dell'hotel che CONSUMANO quota fino al reset.
  // Implementazione zero-migration: marker stringa in `last_error` con
  // prefisso `brig_quota_exhausted:` + timestamp scadenza in
  // `next_run`. Il check legge `last_error` di TUTTI i moduli BRiG
  // dello stesso hotel: se uno ha quota esaurita non scaduta, salta.
  //
  // FIX 26/05/2026: il modulo `availability` NON consuma quota Brig
  // (e' una semplice rederivazione di rms_availability_daily a partire
  // dai bookings gia' presenti in DB locale via BrigAvailabilityProcessor).
  // Bloccarlo dietro il circuit breaker era un over-blocking: la
  // disponibilita' della UI rimaneva ferma alle 07:20 del mattino fino
  // alle 04:00 del giorno successivo, anche se i bookings in DB nel
  // frattempo non erano cambiati. Ora il breaker si applica SOLO a
  // `reservations` (l'unico modulo che chiama davvero Brig).
  if (isReservations) {
    // Filtriamo solo per hotel_id: siamo gia' in processBrigModule
    // (dispatch a monte via pms_integrations.pms_name = 'brig'), quindi
    // tutti i moduli di questo hotel sono BRiG e condividono la stessa
    // quota giornaliera.
    const { data: siblingSettings } = await supabase
      .from("pms_cron_settings")
      .select("module, last_error, next_run")
      .eq("hotel_id", hotelId)

    const quotaBlocker = (siblingSettings ?? []).find((s: any) => {
      if (!s.last_error || typeof s.last_error !== "string") return false
      if (!s.last_error.startsWith("brig_quota_exhausted:")) return false
      const expiresAtIso = s.last_error.replace("brig_quota_exhausted:", "")
      const expiresAt = new Date(expiresAtIso)
      if (isNaN(expiresAt.getTime())) return false
      return expiresAt > now
    })

    if (quotaBlocker) {
      const expiresAtIso = quotaBlocker.last_error.replace(
        "brig_quota_exhausted:",
        "",
      )
      // Avanza next_run di QUESTO modulo allo stesso reset, marca skipped
      // (escluso dal computo failure che genera email).
      await supabase
        .from("pms_cron_settings")
        .update({
          last_status: "skipped",
          last_error: `brig_quota_exhausted:${expiresAtIso}`,
          last_run: now.toISOString(),
          next_run: expiresAtIso,
          updated_at: now.toISOString(),
        })
        .eq("id", setting.id)
      return {
        hotel_id: hotelId,
        module: setting.module,
        success: false,
        skipped: true,
        error: `brig_quota_exhausted:until ${expiresAtIso}`,
      }
    }
  }

  if (!isReservations && !isAvailability) {
    const nextRun = calculateNextRun(setting.frequency, setting.module)
    await supabase
      .from("pms_cron_settings")
      .update({
        last_status: "skipped",
        last_error: `brig_module_not_supported:${setting.module}`,
        last_run: now.toISOString(),
        next_run: nextRun.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("id", setting.id)
    return {
      hotel_id: hotelId,
      module: setting.module,
      success: false,
      skipped: true,
      error: `brig_module_not_supported:${setting.module}`,
    }
  }

  if (isAvailability) {
    try {
      await supabase
        .from("pms_cron_settings")
        .update({ last_status: "running", last_run: now.toISOString() })
        .eq("id", setting.id)

      console.log(`[CRON] Running Brig availability derivation for hotel ${hotelId}`)
      const etlJobId = `cron-brig-avail-${Date.now()}`
      const processor = new BrigAvailabilityProcessor(hotelId, etlJobId)
      const result = await processor.process()

      const nextRun = calculateNextRun(setting.frequency, setting.module)
      await supabase
        .from("pms_cron_settings")
        .update({
          last_status: result.success ? "success" : "error",
          last_error: result.error_message ?? null,
          last_run: now.toISOString(),
          next_run: nextRun.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq("id", setting.id)

      // FIX 01/06/2026: il modulo "availability" non scriveva NULLA in
      // sync_logs (solo le reservations lo facevano), quindi il sync di
      // disponibilita' era invisibile in diagnostica/connectors-health e
      // l'incident "disponibilita' non torna" era impossibile da tracciare.
      // Allineiamo al branch reservations registrando ogni run.
      try {
        await supabase.from("sync_logs").insert({
          hotel_id: hotelId,
          sync_type: "availability",
          status: result.success ? "completed" : "error",
          started_at: now.toISOString(),
          completed_at: new Date().toISOString(),
          records_processed: result.records_inserted ?? 0,
          records_failed: result.records_failed ?? 0,
          error_message: result.error_message ?? null,
          trigger_type: "automatic",
          triggered_by: "cron",
          metadata: {
            module: "availability",
            pms: "brig",
            frequency: setting.frequency,
            durationMs: result.duration_ms,
            recordsProcessed: result.records_processed,
            recordsInserted: result.records_inserted,
            recordsFailed: result.records_failed,
          },
        })
      } catch (logErr) {
        console.warn(`[CRON] Brig availability sync_logs insert failed:`, logErr)
      }

      try {
        await invalidateHotelCache(hotelId)
      } catch (e) {
        console.warn(`[CRON] invalidateHotelCache failed:`, e)
      }

      return {
        hotel_id: hotelId,
        module: "availability",
        success: result.success,
        records_inserted: result.records_inserted,
        records_failed: result.records_failed,
        duration_ms: result.duration_ms,
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      const nextRun = calculateNextRun(setting.frequency, setting.module)
      await supabase
        .from("pms_cron_settings")
        .update({
          last_status: "error",
          last_error: errMsg,
          last_run: now.toISOString(),
          next_run: nextRun.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq("id", setting.id)
      return {
        hotel_id: hotelId,
        module: "availability",
        success: false,
        error: errMsg,
      }
    }
  }

  try {
    await supabase
      .from("pms_cron_settings")
      .update({
        last_status: "running",
        last_run: now.toISOString(),
      })
      .eq("id", setting.id)

    console.log(`[CRON] Running Brig reservations sync for hotel ${hotelId}`)

    // Sync prenotazioni via Brig API.
    //
    // FIX 25/05/2026 (incident Cavallino HTTP 429 a pag.23):
    // Brig sandbox impone 100 req/giorno per le prenotazioni. Hotel con
    // storico voluminoso (Cavallino: 2300+ reservation = 23 pagine da 100)
    // bruciavano l'intera quota giornaliera in un solo cron run e tutti i
    // sync successivi della giornata fallivano con HTTP 429 finche' Brig
    // non resettava la quota a mezzanotte.
    //
    // syncBrigForHotel ora supporta `unchangedPageStreakLimit`: dopo K
    // pagine consecutive senza alcuna modifica (insert=0 + update=0),
    // esce. Default K=3 -> dopo il primo sync completo i run successivi
    // del cron consumano tipicamente 3-5 chiamate Brig invece di 23+.
    //
    // Il safety net dei full-sync periodici per cogliere modifiche
    // storiche puntuali e' demandato a un cron settimanale dedicato che
    // chiama questo path con forceFullSync: true (oggi non ancora
    // schedulato — TODO).
    // FIX 28/05/2026: full sweep notturno di sicurezza. Dopo il fix del
    // diff order-insensitive (lib/connectors/brig/sync.ts) l'early-exit
    // unchanged-streak finalmente scatta a regime (~3-4 pagine/run invece
    // di 38), ma se BRiG restituisse le prenotazioni in ordine che NON
    // mette le piu' recenti/modificate in testa, una nuova prenotazione in
    // fondo alla paginazione potrebbe non essere mai catturata dai run
    // incrementali. Una volta a notte (finestra 03:00-03:24 UTC) forziamo
    // un full sync: con frequency every_30_min/hourly cade ~1 volta sola,
    // costo ~39 chiamate, ampiamente dentro la quota giornaliera.
    // FIX 31/05/2026 (incident Cavallino: nessuna prenotazione scaricata
    // dal 28/05). Il trigger precedente era una FINESTRA ORARIA fissa
    // (`now.getUTCHours()===3 && minuti<25`). Ma il cron master gira ogni
    // 5 min e il run per-hotel e' gated da `next_run`; col raddoppio
    // notturno della cadenza (vedi calculateNextRun) NESSUN run del modulo
    // reservations e' MAI caduto nella finestra 03:00-03:24 UTC: gap reale
    // osservato ~02:05 -> ~04:00. Risultato: forceFullSync sempre false ->
    // l'early-exit unchanged-streak fermava a pag.3 (le prime 300
    // reservation che BRiG ritorna in ordine FISSO, non newest-first) ->
    // le prenotazioni nuove, che stanno in fondo alla paginazione, non
    // venivano MAI catturate. Ultimo sweep profondo: 28/05 10:20.
    //
    // Nuovo trigger TIMING-INDIPENDENTE: forziamo un full sweep se l'ultimo
    // full sweep andato a buon fine (marcato in sync_logs.metadata.fullSweep
    // = true) e' piu' vecchio di FULL_SWEEP_MAX_AGE_MS, oppure non e' mai
    // avvenuto. Valutato ad OGNI run con UNA sola query DB locale (zero
    // quota BRiG); il full sweep vero (~38 chiamate) scatta cosi' al massimo
    // ~1 volta/giorno, ampiamente dentro la quota. Il marker viene scritto
    // solo quando lo sweep completa davvero: il branch dailyQuotaExceeded
    // fa return prima dell'insert in sync_logs, quindi uno sweep troncato
    // dalla quota NON marca fullSweep e verra' riprovato al prossimo run.
    const FULL_SWEEP_MAX_AGE_MS = 20 * 60 * 60 * 1000
    // FIX 01/06/2026: se l'ultimo full sweep e' risultato INCOMPLETO (il gate
    // di completezza non ha raggiunto `totalItems` per via della deriva di
    // paginazione, vedi lib/connectors/brig/sync.ts), non aspettiamo 20h:
    // ritentiamo dopo 1h. Cosi' il backlog (~581 prenotazioni perse su
    // Cavallino) si chiude in poche ore invece di trascinarsi per giorni. Il
    // DB accumula tra i run, quindi ogni sweep parziale riduce il gap finche'
    // `complete=true`, dopodiche' si torna alla cadenza 20h.
    const INCOMPLETE_SWEEP_RETRY_MS = 60 * 60 * 1000
    let forceFullSync = false
    try {
      const { data: lastSweep } = await supabase
        .from("sync_logs")
        .select("started_at, metadata")
        .eq("hotel_id", hotelId)
        .eq("sync_type", "reservations")
        .eq("metadata->>fullSweep", "true")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      const lastSweepMs = lastSweep?.started_at
        ? new Date(lastSweep.started_at).getTime()
        : 0
      // `complete` assente nei log vecchi -> trattato come true (cadenza 20h).
      const lastSweepComplete =
        (lastSweep?.metadata as { complete?: boolean } | null)?.complete !== false
      const maxAgeMs = lastSweepComplete
        ? FULL_SWEEP_MAX_AGE_MS
        : INCOMPLETE_SWEEP_RETRY_MS
      forceFullSync = now.getTime() - lastSweepMs >= maxAgeMs
    } catch (e) {
      // Errore di lettura: NON forziamo (un run incrementale e' innocuo);
      // il prossimo run riprovera' la verifica.
      console.warn(
        `[CRON] Brig full-sweep age check failed for hotel ${hotelId}: ${String(e)}`,
      )
    }
    if (forceFullSync) {
      console.log(`[CRON] Brig full sweep (timing-independent) for hotel ${hotelId}`)
    }
    // FIX 06/06/2026 — FETCH PARTIZIONATO PER DATA (cura definitiva deriva).
    // BRiG ha confermato (verificato live sul sandbox) che i filtri data
    // funzionano col formato { from, operatorFrom, to, operatorTo }. Quando
    // forziamo un full sweep NON paginiamo piu' la lista globale (che si
    // ri-ordina tra le richieste -> ~15% prenotazioni mai lette su Cavallino):
    // scarichiamo per FINESTRE sul checkin. Ogni prenotazione ha un solo
    // checkin -> ogni finestra e' piccola e la sua paginazione e' stabile, quindi
    // l'unione delle finestre = dataset completo senza buchi.
    //
    // FIX 18/06/2026 — FINESTRE SETTIMANALI (era mensile). La deriva di
    // paginazione del feed esiste ANCHE dentro la finestra mensile: misurato su
    // Cavallino che luglio dichiara 223 prenotazioni ma la camminata completa ne
    // rende solo 172 (23% perso) -> prenotazioni mai scaricate -> occupancy
    // sotto il gestionale. La finestra SETTIMANALE (`partitionDays:7`) recupera
    // quei record (gap 51 -> 7) a costo quota quasi identico, e funge da backfill
    // nel tempo. Le finestre settimanali sono piccole (~1-2 pagine), quindi
    // alziamo il budget a 20 finestre/run: ~20-40 req/run (sotto i 100/giorno) e
    // il full sweep (~182 finestre su 42 mesi) converge in ~10 run con il
    // trigger INCOMPLETE_SWEEP_RETRY_MS (1h). Cursore in
    // pms_integrations.config.brigPartitionCursor (riprende dal punto esatto).
    const result = await syncBrigForHotel({
      hotelId,
      pageSize: 100,
      maxPages: 200,
      // unchangedPageStreakLimit: 3 (default) — solo per gli incrementali.
      forceFullSync,
      partitioned: forceFullSync,
      partitionDays: 7,
      maxPartitionsPerRun: 20,
    })

    // REFRESH NEAR-TERM (FIX 24/06/2026 — last-minute Cavallino/Bedzzle).
    // Ad OGNI run rinfresca per checkInDate la finestra oggi-2 → oggi+90 con
    // sweep partizionato settimanale EFFIMERO (non tocca il cursore del full
    // sweep). Cosi' le prenotazioni last-minute (ricevute oggi, check-in tra
    // pochi giorni) e i mesi prenotabili entrano subito, senza aspettare che
    // il full sweep (che cammina da -24 mesi) raggiunga il near-term o che
    // scada il trigger 20h. Diagnosi: BRiG filtrato per checkInDate rende il
    // dataset COMPLETO e deterministico (24/6: 58 confirmed live vs 39 a DB).
    // Costo quota: ~13 finestre settimanali x ~1-2 pagine ≈ 13-26 req/run,
    // sostenibile su quota di produzione (1000+/giorno). Se la quota si
    // esaurisce, il client va in 429 e dailyQuotaExceeded ferma tutto (gestito
    // sotto), senza loop. Salta se l'incrementale ha gia' esaurito la quota.
    // FIX 24/06/2026 (gap occupancy Cavallino) — REVISIONE quota-aware.
    // La quota BRiG REALE di Cavallino e' 200 req/giorno (verificato live dal
    // 429 "maximum number of requests [200]"), NON 1000+. Con cadenza
    // every_30_min (48 run/giorno) il budget e' ~4 chiamate/run: l'incrementale
    // ne usa gia' ~3, quindi il near-term DEVE costare ~1 chiamata/run.
    // Strategia: UNA sola finestra GIORNALIERA per run, fatta ROTARE da un
    // cursore effimero attraverso l'orizzonte [oggi-2, oggi+NEAR_TERM_DAYS).
    // Ogni giorno di checkin Cavallino sta in 1 pagina -> zero deriva. In
    // NEAR_TERM_DAYS run (~giornaliero) l'intero orizzonte viene rinfrescato,
    // a costo ~1 chiamata/run (~48/giorno) sostenibile sotto i 200. La coda
    // lontana e la storia restano coperte dal full sweep notturno (ora reso
    // affidabile dal RE-WALK RESILIENTE per-finestra in sync.ts).
    const NEAR_TERM_DAYS = 45
    const nearTermFrom = ymdUTC(addDaysUTCSimple(now, -2))
    const nearTermTo = ymdUTC(addDaysUTCSimple(now, NEAR_TERM_DAYS))
    let nearTerm: Awaited<ReturnType<typeof syncBrigForHotel>> | null = null
    if (!result.dailyQuotaExceeded) {
      nearTerm = await syncBrigForHotel({
        hotelId,
        pageSize: 100,
        maxPages: 200,
        partitioned: true,
        partitionRotating: true,
        partitionFrom: nearTermFrom,
        partitionTo: nearTermTo,
        partitionDays: 1,
        // 3 finestre giornaliere per run: il cursore ROTANTE dedicato
        // (brigNearTermCursor) avanza di 3 giorni a run e fa WRAP a fine
        // orizzonte. ~47 giorni / 3 ≈ 16 run per giro completo; con cadenza
        // 30 min (48 run/giorno) l'orizzonte e' rinfrescato ~3 volte/giorno a
        // costo ~3 chiamate/run, sotto la quota reale di 200 req/giorno.
        maxPartitionsPerRun: 3,
      })
      console.log(
        `[CRON] Brig near-term ROT hotel=${hotelId} range=[${nearTermFrom},${nearTermTo}] ` +
          `fetched=${nearTerm.totalFetched} ins=${nearTerm.totalInserted} upd=${nearTerm.totalUpdated}`,
      )
    }

    // Riconciliazione cancellazioni stale (FIX 04/06/2026): SOLO dopo un full
    // sweep PROVATAMENTE completo (forceFullSync && complete). Si basa su
    // `last_seen_at`, affidabile solo quando lo sweep ha potuto ri-avvistare le
    // prenotazioni vive: marca `is_stale_cancelled=true` quelle sparite dal feed
    // da > grace giorni (checkout futuro), con guardrail anti-catastrofe.
    // Zero quota BRiG (solo query DB locali).
    let staleTombstoned = 0
    if (forceFullSync && result.complete === true) {
      try {
        const rec = await reconcileBrigStaleCancellations(hotelId)
        staleTombstoned = rec.tombstoned
        if (rec.skippedUnsafe) {
          console.warn(
            `[CRON] Brig stale-cancel reconcile SKIP (unsafe) hotel=${hotelId} ` +
              `candidates=${rec.candidates} futureActive=${rec.futureActive}`,
          )
        } else if (rec.tombstoned > 0) {
          console.log(
            `[CRON] Brig stale-cancel reconcile hotel=${hotelId} tombstoned=${rec.tombstoned}`,
          )
        }
      } catch (e) {
        console.error(
          `[CRON] Brig stale-cancel reconcile failed hotel=${hotelId}:`,
          e instanceof Error ? e.message : String(e),
        )
      }
    }

    // ETL automatico post-sync se almeno qualche raw e' stato scritto
    // (logica identica a /api/admin/brig/sync per coerenza).
    const totalWritten =
      (result.totalInserted ?? 0) +
      (result.totalUpdated ?? 0) +
      (nearTerm?.totalInserted ?? 0) +
      (nearTerm?.totalUpdated ?? 0)
    let etlError: string | null = null
    if (totalWritten > 0) {
      try {
        const etlJobId = `cron-${Date.now()}`
        const processor = new BrigBookingsProcessor(hotelId, etlJobId)
        await processor.process()
      } catch (e) {
        etlError = e instanceof Error ? e.message : String(e)
        console.error(
          `[CRON] Brig ETL post-sync failed for hotel ${hotelId}:`,
          etlError,
        )
      }
    }

    // Aggiunto 25/05/2026: Brig non ha un endpoint availability, quindi
    // dobbiamo rederivare i counter di rms_availability_daily ogni volta
    // che cambia anche solo una reservation. Senza questa chiamata, le
    // pagine dashboard / production / objectives / analytics
    // mostrano availability obsoleta finche' non gira il cron del
    // modulo "availability" separato (che potrebbe non essere
    // configurato per l'hotel).
    // FIX 04/06/2026: rideriviamo anche quando la riconciliazione ha
    // tombstonato cancellazioni stale (staleTombstoned>0) pur senza nuovi
    // record scritti, altrimenti l'availability resterebbe gonfiata.
    if (totalWritten > 0 || staleTombstoned > 0) {
      try {
        const availJobId = `cron-brig-avail-after-res-${Date.now()}`
        const availProcessor = new BrigAvailabilityProcessor(hotelId, availJobId)
        await availProcessor.process()
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error(
          `[CRON] Brig availability derivation post-sync failed for hotel ${hotelId}:`,
          msg,
        )
      }
    }

    const nextRun = calculateNextRun(setting.frequency, setting.module)
    const hasErrors =
      (result.errors?.length ?? 0) > 0 ||
      (nearTerm?.errors?.length ?? 0) > 0 ||
      !!etlError
    const errorMsg = hasErrors
      ? [
          ...(result.errors ?? []),
          ...(nearTerm?.errors ?? []),
          etlError,
        ]
          .filter(Boolean)
          .join(" | ")
      : null

    // Quota giornaliera BRiG esaurita (FIX 25/05/2026 incident
    // Cavallino): segna marker `brig_quota_exhausted:<expiry>` in
    // last_error e rinvia next_run.
    // Con `last_status: "skipped"` viene escluso dal computo failure
    // che genera email "sync_modules_failure" (vedi filtro a riga
    // ~148 con `!r.skipped`).
    //
    // FIX 27/05/2026: il backoff originale "02:00 UTC del giorno dopo"
    // bloccava Cavallino per 13-22h anche quando BRiG aveva gia'
    // resettato la quota. Non sappiamo *quando* esattamente BRiG
    // resetta (potrebbe essere rolling 24h dal primo hit, mezzanotte
    // CEST, mezzanotte UTC, ...). Soluzione: backoff fisso +2h. La
    // prima call HTTP del prossimo run del cron e' il probe naturale:
    //  - se BRiG risponde 200 -> riprende normalmente
    //  - se BRiG risponde 429 -> dailyQuotaExceeded resta true e
    //    questo branch riprogramma di altre +2h
    // In pratica un hotel sblocca in 2-4h invece di restare fermo
    // tutto il giorno.
    if (
      result.dailyQuotaExceeded ||
      nearTerm?.dailyQuotaExceeded
    ) {
      const reset = new Date(now.getTime() + 2 * 60 * 60 * 1000)
      const resetIso = reset.toISOString()

      await supabase
        .from("pms_cron_settings")
        .update({
          last_status: "skipped",
          last_error: `brig_quota_exhausted:${resetIso}`,
          last_run: now.toISOString(),
          next_run: resetIso,
          updated_at: now.toISOString(),
        })
        .eq("id", setting.id)

      // Propaga il blocco anche agli altri moduli BRiG dello stesso
      // hotel cosi' che NESSUNO chiami BRiG fino al reset (ricordando
      // che la quota e' globale per hotel, non per modulo).
      await supabase
        .from("pms_cron_settings")
        .update({
          last_status: "skipped",
          last_error: `brig_quota_exhausted:${resetIso}`,
          next_run: resetIso,
          updated_at: now.toISOString(),
        })
        .eq("hotel_id", hotelId)
        .neq("id", setting.id)
        .lte("next_run", resetIso)

      console.log(
        `[CRON] Brig daily quota exhausted for hotel ${hotelId}: pausing all modules until ${resetIso}`,
      )

      return {
        hotel_id: hotelId,
        module: setting.module,
        success: false,
        skipped: true,
        error: `brig_quota_exhausted:${resetIso}`,
      }
    }

    await supabase
      .from("pms_cron_settings")
      .update({
        last_status: hasErrors ? "error" : "success",
        last_error: errorMsg,
        next_run: nextRun.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("id", setting.id)

    await supabase.from("sync_logs").insert({
      hotel_id: hotelId,
      sync_type: setting.module,
      status: hasErrors ? "error" : "completed",
      started_at: now.toISOString(),
      completed_at: new Date().toISOString(),
      records_processed: result.totalInserted + result.totalUpdated,
      records_failed: result.errors?.length || 0,
      error_message: errorMsg,
      trigger_type: "automatic",
      triggered_by: "cron",
      metadata: {
        module: setting.module,
        pms: "brig",
        frequency: setting.frequency,
        pagesFetched: result.pagesFetched,
        totalFetched: result.totalFetched,
        totalInserted: result.totalInserted,
        totalUpdated: result.totalUpdated,
        totalUnchanged: result.totalUnchanged,
        // Marca i full sweep andati a buon fine (early-exit bypassato e
        // paginazione completata: il branch dailyQuotaExceeded fa return
        // prima di arrivare qui). Usato dal trigger timing-independent
        // sopra per decidere se forzare il prossimo full sweep.
        fullSweep: forceFullSync,
        // Gate di completezza (FIX 01/06/2026): `complete=false` segnala che
        // i `_id` distinti raccolti (`distinctSeen`) non hanno raggiunto il
        // totale dichiarato da BRiG (`reportedTotal`) -> deriva di
        // paginazione, sweep da ritentare presto (vedi trigger sopra).
        reportedTotal: result.reportedTotal ?? 0,
        distinctSeen: result.distinctSeen ?? 0,
        completenessPasses: result.completenessPasses ?? 1,
        complete: result.complete ?? true,
        // Recupero resumabile (FIX 01/06/2026 round 3): stato del cursore.
        // `sweepActive` true -> recupero ancora in corso, ripartira' dal
        // prossimo run a `sweepNextPage`. `dbRowCount` = righe accumulate.
              sweepActive: result.sweepActive ?? false,
              sweepNextPage: result.sweepNextPage ?? null,
              dbRowCount: result.dbRowCount ?? null,
              // Fetch partizionato per data (FIX 06/06/2026): finestre mensili
              // processate in questo run e prossima finestra da percorrere
              // (null = range completato). Col full sweep attivo e' questo il
              // meccanismo effettivo, non piu' il cursore-pagine globale.
              partitionsProcessed: result.partitionsProcessed ?? null,
              partitionNextWindowStart: result.partitionNextWindowStart ?? null,
        // Riconciliazione cancellazioni stale (FIX 04/06/2026): quante
        // prenotazioni avvistate (last_seen bumpato) e quante tombstonate.
        staleSighted: result.staleSighted ?? 0,
        staleTombstoned,
      },
    })

    console.log(
      `[CRON] Brig reservations sync completed for hotel ${hotelId} ` +
        `(fetched=${result.totalFetched}, inserted=${result.totalInserted}, ` +
        `updated=${result.totalUpdated}` +
        (forceFullSync
          ? `, sweep passes=${result.completenessPasses ?? 1} ` +
            `distinct=${result.distinctSeen ?? 0}/${result.reportedTotal ?? 0} ` +
            `complete=${result.complete ?? true}`
          : "") +
        `)`,
    )

    return {
      hotel_id: hotelId,
      module: setting.module,
      success: !hasErrors,
      next_run: nextRun.toISOString(),
      records: result.totalInserted + result.totalUpdated,
      error: errorMsg,
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error(
      `[CRON] Brig reservations sync error for hotel ${hotelId}:`,
      errMsg,
    )
    const nextRun = calculateNextRun(setting.frequency, setting.module)
    await supabase
      .from("pms_cron_settings")
      .update({
        last_status: "error",
        last_error: errMsg,
        next_run: nextRun.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("id", setting.id)

    await supabase.from("sync_logs").insert({
      hotel_id: hotelId,
      sync_type: setting.module,
      status: "error",
      started_at: now.toISOString(),
      completed_at: new Date().toISOString(),
      records_processed: 0,
      records_failed: 1,
      error_message: errMsg,
      trigger_type: "automatic",
      triggered_by: "cron",
      metadata: { module: setting.module, pms: "brig", frequency: setting.frequency },
    })

    return {
      hotel_id: hotelId,
      module: setting.module,
      success: false,
      error: errMsg,
    }
  }
}

function calculateNextRun(frequency: string, module?: string): Date {
  const now = new Date()
  const frequencyMs: Record<string, number> = {
    every_15_min: 15 * 60 * 1000,
    every_30_min: 30 * 60 * 1000,
    hourly: 60 * 60 * 1000,
    every_6_hours: 6 * 60 * 60 * 1000,
    every_12_hours: 12 * 60 * 60 * 1000,
    daily: 24 * 60 * 60 * 1000,
    weekly: 7 * 24 * 60 * 60 * 1000,
  }
  let ms = frequencyMs[frequency] || frequencyMs.hourly

  // FIX 26/05/2026 — quota-aware schedule per Brig `reservations`.
  // Brig sandbox impone 100 req/giorno/hotel. Su Cavallino il consumo
  // medio per run e' ~3-5 chiamate (1 getRoomTypes + N pagine fino a
  // unchanged-streak). Con `every_15_min` h24 = 96 run x 3 = ~288 chiamate
  // -> 429 ogni mattina alle 7. Vogliamo cadenza fitta nelle ore
  // operative (08:00-23:30 Europe/Rome) e cadenza piu' larga di notte
  // quando le reservation non cambiano quasi mai.
  //
  // Politica:
  //  - 08:00-23:30 ora italiana: cadenza nominale (every_15_min = 4/h).
  //  - 23:30-08:00: raddoppio del periodo (every_15_min -> 30 min, ~2/h).
  //
  // Stima budget giornaliero con le impostazioni di Cavallino:
  //   diurno 15.5h * 4/h = 62 run,
  //   notturno 8.5h  * 2/h = 17 run,
  //   totale  ~79 run/giorno -> 79 * 1 getRoomTypes + ~79 pagine reservations
  //   = ~158 chiamate teoriche, ridotte a ~80-90 dall'unchanged-streak
  //   early-exit (vedi memoria 25/05/2026). Margine sufficiente sotto 100.
  //
  // Applichiamo il modificatore SOLO per:
  //  - module === 'reservations' (l'unico modulo Brig che consuma quota)
  //  - frequency in {every_15_min, every_30_min, hourly} (le 3 cadenze
  //    "fitte" dove ha senso diluire la notte; daily/weekly sono gia'
  //    larghe).
  //
  // Implementazione tz-safe: ricaviamo l'ora in Europe/Rome via
  // Intl.DateTimeFormat per non dipendere da TZ del runtime Vercel
  // (che e' UTC). Edge case mezzanotte: la fascia 23:30-08:00 cross-day
  // e' gestita con una OR sulla decisione `isNight`.
  if (
    module === "reservations" &&
    (frequency === "every_15_min" ||
      frequency === "every_30_min" ||
      frequency === "hourly")
  ) {
    const fmt = new Intl.DateTimeFormat("it-IT", {
      timeZone: "Europe/Rome",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    const parts = fmt.formatToParts(now)
    const hour = Number(parts.find(p => p.type === "hour")?.value ?? "0")
    const minute = Number(parts.find(p => p.type === "minute")?.value ?? "0")
    const minutesOfDay = hour * 60 + minute
    // Notturno = [23:30, 24:00) ∪ [00:00, 08:00)
    const isNight = minutesOfDay >= 23 * 60 + 30 || minutesOfDay < 8 * 60
    if (isNight) {
      ms = ms * 2
    }
  }

  return new Date(now.getTime() + ms)
}

function getDefaultStartDate(module: string): string {
  const date = new Date()
  switch (module) {
    case "production":
    case "fiscal_production":
      date.setDate(1)
      break
    case "bookings":
      date.setDate(date.getDate() - 90)
      break
    default:
      break
  }
  return date.toISOString().split("T")[0]
}

function getDefaultEndDate(module: string): string {
  const date = new Date()
  switch (module) {
    case "production":
    case "fiscal_production":
      date.setMonth(date.getMonth() + 1)
      date.setDate(0)
      break
    case "bookings":
      date.setDate(date.getDate() + 180)
      break
    default:
      date.setDate(date.getDate() + 90)
      break
  }
  return date.toISOString().split("T")[0]
}
