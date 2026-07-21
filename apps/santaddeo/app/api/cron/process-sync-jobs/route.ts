import { type NextRequest, NextResponse } from "next/server"
import { SyncJobService } from "@/lib/services/sync-job-service"
import { ScidooSyncService } from "@/lib/services/scidoo-sync-service"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get("authorization")
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("[v0] Processing pending sync jobs...")

    // Get pending sync jobs
    const pendingJobs = await SyncJobService.getPendingSyncJobs()

    console.log(`[v0] Found ${pendingJobs.length} pending sync jobs`)

    const results = []

    for (const job of pendingJobs) {
      try {
        console.log(`[v0] Processing sync job ${job.id} for hotel ${job.hotel_id}`)

        // Update status to in_progress
        await SyncJobService.updateSyncJobStatus(job.id, "in_progress")

        // Get PMS integration
        const supabase = await createClient()
        const { data: pmsIntegration } = await supabase
          .from("pms_integrations")
          .select("api_key")
          .eq("id", job.pms_integration_id)
          .single()

        if (!pmsIntegration || !pmsIntegration.api_key) {
          throw new Error("PMS integration not found or API key missing")
        }

        // Execute sync
        const result = await ScidooSyncService.syncAll(
          job.hotel_id,
          pmsIntegration.api_key,
          job.start_date,
          job.end_date,
        )

        if (result.success) {
          // Update status to completed
          await SyncJobService.updateSyncJobStatus(job.id, "completed", {
            room_types: result.roomTypes?.imported || 0,
            bookings: result.bookings?.imported || 0,
            availability: result.availability?.imported || 0,
          })

          results.push({ jobId: job.id, status: "completed" })
        } else {
          throw new Error(result.error || "Sync failed")
        }
      } catch (error) {
        console.error(`[v0] Error processing sync job ${job.id}:`, error)

        // Update status to failed
        await SyncJobService.updateSyncJobStatus(
          job.id,
          "failed",
          undefined,
          error instanceof Error ? error.message : "Unknown error",
        )

        results.push({
          jobId: job.id,
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error",
        })
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      results,
    })
  } catch (error) {
    console.error("[v0] Cron job error:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    )
  }
}
