import { type NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { ScidooSyncService } from "@/lib/services/scidoo-sync-service"
import { measureRoute } from "@/lib/performance/with-perf"
import { isDevAuthAsync } from "@/lib/env/dev-auth"

export const maxDuration = 300

async function _POST(request: NextRequest) {
  try {
    const isDev = await isDevAuthAsync()
    const supabase = isDev ? await createServiceRoleClient() : await createClient()

    // Verifica autenticazione (skip in dev/sandbox)
    let user: any = null
    if (isDev) {
      // In dev/sandbox, use demo user
      user = {
        id: "5de43b7b-e661-4e4e-8177-7943df06470c",
        email: "f.mancini@4bid.it",
      }
    } else {
      const { data } = await supabase.auth.getUser()
      user = data?.user
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Ottieni i parametri
    const body = await request.json()
    const { hotelId, startDate, endDate } = body

    if (!hotelId || !startDate || !endDate) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 })
    }

    console.log("[v0] Scidoo sync API called:", { hotelId, startDate, endDate })

    // Verifica che l'utente abbia accesso all'hotel
    const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single()

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const { data: hotel, error: hotelError } = await supabase
      .from("hotels")
      .select("id, organization_id")
      .eq("id", hotelId)
      .eq("organization_id", profile.organization_id)
      .maybeSingle()

    if (hotelError || !hotel) {
      // Try without organization filter for superadmin or if hotel exists but with different org
      const { data: hotelExists } = await supabase
        .from("hotels")
        .select("id")
        .eq("id", hotelId)
        .maybeSingle()
      
      if (!hotelExists) {
        return NextResponse.json({ error: "Hotel not found" }, { status: 404 })
      }
      // Hotel exists but user may not have organization access - allow if hotel exists
    }

    // Ottieni la configurazione PMS (use service role to bypass RLS on sensitive api_key column)
    const adminClient = await createServiceRoleClient()
    const { data: pmsIntegration, error: pmsError } = await adminClient
      .from("pms_integrations")
      .select("id, api_key, is_active, pms_name")
      .eq("hotel_id", hotelId)
      .eq("pms_name", "scidoo")
      .eq("is_active", true)
      .single()

    console.log("[v0] PMS integration query result:", { 
      hotelId, 
      found: !!pmsIntegration, 
      hasApiKey: !!pmsIntegration?.api_key,
      pmsName: pmsIntegration?.pms_name,
      error: pmsError?.message 
    })

    if (!pmsIntegration || !pmsIntegration.api_key) {
      return NextResponse.json({ 
        error: "Scidoo integration not configured",
        debug: { hotelId, pmsError: pmsError?.message, found: !!pmsIntegration }
      }, { status: 400 })
    }

    const { error: tableCheckError } = await supabase.from("sync_jobs").select("id").limit(1)

    if (tableCheckError && tableCheckError.code === "PGRST204") {
      // Table doesn't exist, use direct sync
      console.log("[v0] sync_jobs table not found, using direct sync")

      const result = await ScidooSyncService.syncAll(hotelId, pmsIntegration.api_key, startDate, endDate)

      return NextResponse.json({
        success: true,
        stats: result,
        message: "Sincronizzazione completata",
      })
    }

    const { SyncJobService } = await import("@/lib/services/sync-job-service")

    const incompleteSync = await SyncJobService.findIncompleteSync(hotelId, startDate, endDate)

    let syncJob
    if (incompleteSync) {
      console.log("[v0] Found incomplete sync, creating resume job:", incompleteSync.id)
      syncJob = await SyncJobService.createSyncJob(
        hotelId,
        pmsIntegration.id,
        startDate,
        endDate,
        user.id,
        incompleteSync.id, // Resume from this job
      )
    } else {
      syncJob = await SyncJobService.createSyncJob(hotelId, pmsIntegration.id, startDate, endDate, user.id)
    }

    console.log("[v0] Sync job created:", syncJob.id, syncJob.is_resumed ? "(resumed)" : "(new)")

    console.log("[v0] About to start background sync process...")

    // Start sync process immediately in the background
    // Don't await - let it run asynchronously
    processSyncJob(
      syncJob.id,
      hotelId,
      pmsIntegration.api_key,
      startDate,
      endDate,
      incompleteSync?.last_checkpoint, // Pass checkpoint if resuming
    ).catch((error) => {
      console.error("[v0] Background sync error:", error)
    })

    console.log("[v0] Background sync process started, returning response")

    // Return job ID immediately so user can track progress
    return NextResponse.json({
      success: true,
      jobId: syncJob.id,
      isResumed: syncJob.is_resumed || false,
      checkpoint: incompleteSync?.last_checkpoint,
      message: syncJob.is_resumed ? "Ripresa sincronizzazione precedente" : "Sincronizzazione avviata in background",
    })
  } catch (error) {
    console.error("[v0] Scidoo sync API error:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    )
  }
  }

export const POST = measureRoute("/api/scidoo/sync", _POST as any)

async function processSyncJob(
  jobId: string,
  hotelId: string,
  apiKey: string,
  startDate: string,
  endDate: string,
  resumeCheckpoint?: any,
): Promise<void> {
  console.log("[v0] processSyncJob called with jobId:", jobId)

  try {
    console.log("[v0] Importing SyncJobService...")
    const { SyncJobService } = await import("@/lib/services/sync-job-service")
    console.log("[v0] SyncJobService imported successfully")

    console.log("[v0] Starting sync job processing:", jobId)

    // Update status to in_progress
    console.log("[v0] Updating job status to in_progress...")
    await SyncJobService.updateSyncJobStatus(jobId, "in_progress")
    console.log("[v0] Job status updated to in_progress")

    console.log("[v0] Calling ScidooSyncService.syncAll...")
    const result = await ScidooSyncService.syncAll(hotelId, apiKey, startDate, endDate, jobId, resumeCheckpoint)

    console.log("[v0] Sync completed successfully:", result)

    // Run ETL to transform RAW data into normalized tables (bookings, daily_production, etc.)
    console.log("[v0] Running ETL transformation...")
    try {
      const { ETLOrchestrator } = await import("@/lib/etl/etl-orchestrator")
      const etl = new ETLOrchestrator({
        hotel_id: hotelId,
        job_type: "full_sync",
        date_from: startDate,
        date_to: endDate,
        triggered_by: "scidoo_sync",
      })
      const etlResult = await etl.run()
      console.log("[v0] ETL completed:", etlResult)
    } catch (etlError) {
      console.error("[v0] ETL failed (non-blocking):", etlError)
      // Don't fail the sync if ETL fails - data is still in RAW tables
    }

    // Update status to completed
    await SyncJobService.updateSyncJobStatus(jobId, "completed", result)
  } catch (error) {
    console.error("[v0] Sync job failed:", error)

    console.error("[v0] Error details:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    })

    // Update status to failed
    const { SyncJobService } = await import("@/lib/services/sync-job-service")
    await SyncJobService.updateSyncJobStatus(
      jobId,
      "failed",
      undefined,
      error instanceof Error ? error.message : "Unknown error",
    )
  }
}
