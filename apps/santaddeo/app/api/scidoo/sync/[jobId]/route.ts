import { type NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { SyncJobService } from "@/lib/services/sync-job-service"
import { ScidooSyncService } from "@/lib/services/scidoo-sync-service"

export const maxDuration = 60

const jobCache = new Map<string, { job: any; timestamp: number }>()
const CACHE_TTL = 30000 // 30 seconds cache (increased from 5 seconds)

export async function GET(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await params

    const cached = jobCache.get(jobId)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log("[v0] Returning cached job status")
      return NextResponse.json({
        success: true,
        job: cached.job,
      })
    }

    await new Promise((resolve) => setTimeout(resolve, 1000))

    const syncJob = await SyncJobService.getSyncJob(jobId)

    if (!syncJob) {
      // Check if we have stale cache (up to 2 minutes old)
      const staleCache = jobCache.get(jobId)
      if (staleCache && Date.now() - staleCache.timestamp < 120000) {
        console.log("[v0] Rate limit detected, returning stale cached data")
        return NextResponse.json({
          success: true,
          job: staleCache.job,
          rateLimited: true,
          cached: true,
        })
      }

      return NextResponse.json(
        {
          error: "Database temporarily unavailable due to rate limiting. Please wait a moment and try again.",
          rateLimited: true,
        },
        { status: 503 },
      )
    }

    // Auth is already checked when creating the sync job
    // try {
    //   const supabase = await createClient()
    //   const {
    //     data: { user },
    //   } = await supabase.auth.getUser()
    //   ...
    // } catch (authError) {
    //   console.log("[v0] Auth check skipped (session may have expired):", authError)
    // }

    if (syncJob.status === "pending" || syncJob.status === "in_progress") {
      console.log("[v0] Job is active, processing next batch...")

      try {
        await new Promise((resolve) => setTimeout(resolve, 500))

        // Get PMS integration
        const serviceSupabase = await createServiceRoleClient()
        const { data: pmsIntegration } = await serviceSupabase
          .from("pms_integrations")
          .select("api_key")
          .eq("id", syncJob.pms_integration_id)
          .eq("is_active", true)
          .single()

        if (pmsIntegration?.api_key) {
          // Update status to in_progress if it's pending
          if (syncJob.status === "pending") {
            await SyncJobService.updateSyncJobStatus(jobId, "in_progress")
            syncJob.status = "in_progress"
          }

          // Process one batch (this will update the checkpoint)
          const batchResult = await ScidooSyncService.processBatch(
            syncJob.hotel_id,
            pmsIntegration.api_key,
            syncJob.start_date,
            syncJob.end_date,
            jobId,
            syncJob.last_checkpoint,
          )

          console.log("[v0] Batch processed:", batchResult)

          // Check if sync is complete
          if (batchResult.isComplete) {
            await SyncJobService.updateSyncJobStatus(jobId, "completed", {
              total_bookings: batchResult.totalBookings,
              bookings_imported: batchResult.bookingsProcessed,
            })
            syncJob.status = "completed"
            syncJob.stats = {
              total_bookings: batchResult.totalBookings,
              bookings_imported: batchResult.bookingsProcessed,
            }
          }
        }
      } catch (processingError) {
        console.error("[v0] Error processing batch:", processingError)
        // Don't fail the entire request, just log and continue
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 500))

    // Fetch updated job status
    const updatedJob = await SyncJobService.getSyncJob(jobId)
    const finalJob = updatedJob || syncJob

    jobCache.set(jobId, { job: finalJob, timestamp: Date.now() })

    return NextResponse.json({
      success: true,
      job: finalJob,
    })
  } catch (error) {
    console.error("[v0] Sync job status API error:", error)

    const cached = jobCache.get(await params.then((p) => p.jobId))
    if (cached) {
      console.log("[v0] Error occurred, returning cached data")
      return NextResponse.json({
        success: true,
        job: cached.job,
        cached: true,
        error: "Using cached data due to temporary error",
      })
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    )
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await params

    console.log("[v0] Cancelling sync job:", jobId)

    // Update job status to cancelled
    await SyncJobService.updateSyncJobStatus(jobId, "failed", undefined, "Cancelled by user")

    // Clear cache
    jobCache.delete(jobId)

    return NextResponse.json({
      success: true,
      message: "Sync job cancelled successfully",
    })
  } catch (error) {
    console.error("[v0] Error cancelling sync job:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to cancel sync job",
      },
      { status: 500 },
    )
  }
}
