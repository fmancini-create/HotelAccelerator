import { createClient, createServiceRoleClient } from "@/lib/supabase/server"

export interface SyncJobCheckpoint {
  last_booking_id?: string
  last_processed_at?: string
  bookings_processed: number
  last_batch: number
  total_bookings?: number
  room_types_synced?: boolean
  bookings_fetched?: boolean
  retry_after?: number
  date_chunks?: Array<{ start: string; end: string }>
  current_chunk_index?: number
  current_chunk_bookings?: number
  current_chunk_total?: number
  current_chunk_processed?: number
}

export interface SyncJob {
  id: string
  hotel_id: string
  pms_integration_id: string
  status: "pending" | "in_progress" | "completed" | "failed"
  start_date: string
  end_date: string
  started_at?: string
  completed_at?: string
  error_message?: string
  stats?: {
    room_types?: number
    bookings?: number
    availability?: number
    total_bookings?: number
    bookings_imported?: number
  }
  last_checkpoint?: SyncJobCheckpoint
  resume_from_job_id?: string
  is_resumed?: boolean
  created_at: string
  updated_at: string
}

export class SyncJobService {
  /**
   * Find an incomplete sync job that can be resumed
   */
  static async findIncompleteSync(hotelId: string, startDate: string, endDate: string): Promise<SyncJob | null> {
    const supabase = await createServiceRoleClient()

    console.log("[v0] Checking for incomplete sync jobs to resume:", { hotelId, startDate, endDate })

    const { data, error } = await supabase
      .from("sync_jobs")
      .select("*")
      .eq("hotel_id", hotelId)
      .eq("start_date", startDate)
      .eq("end_date", endDate)
      .in("status", ["in_progress", "failed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error("[v0] Error finding incomplete sync:", error)
      return null
    }

    if (data) {
      console.log("[v0] Found incomplete sync job to resume:", data.id, "Status:", data.status)
    } else {
      console.log("[v0] No incomplete sync found, will start fresh")
    }

    return data
  }

  /**
   * Create a new sync job
   */
  static async createSyncJob(
    hotelId: string,
    pmsIntegrationId: string,
    startDate: string,
    endDate: string,
    userId?: string,
    resumeFromJobId?: string,
  ): Promise<SyncJob> {
    const supabase = await createClient()

    const jobData: any = {
      hotel_id: hotelId,
      pms_integration_id: pmsIntegrationId,
      status: "pending",
      start_date: startDate,
      end_date: endDate,
      created_by: userId,
    }

    if (resumeFromJobId) {
      jobData.resume_from_job_id = resumeFromJobId
      jobData.is_resumed = true
      console.log("[v0] Creating resumed sync job from:", resumeFromJobId)
    }

    const { data, error } = await supabase.from("sync_jobs").insert(jobData).select().single()

    if (error) {
      console.error("[v0] Error creating sync job:", error)
      throw new Error(`Failed to create sync job: ${error.message}`)
    }

    console.log("[v0] Sync job created:", data.id, resumeFromJobId ? "(resumed)" : "(new)")
    return data
  }

  /**
   * Update checkpoint during sync
   */
  static async updateCheckpoint(jobId: string, checkpoint: SyncJobCheckpoint): Promise<void> {
    const supabase = await createServiceRoleClient()

    const stats = {
      total_bookings: checkpoint.total_bookings || 0,
      bookings_imported: checkpoint.bookings_processed || 0,
    }

    const { error } = await supabase
      .from("sync_jobs")
      .update({
        last_checkpoint: checkpoint,
        stats: stats, // Update stats for progress bar
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId)

    if (error) {
      console.error("[v0] Error updating checkpoint:", error)
      // Don't throw - checkpoint updates are non-critical
    } else {
      console.log(`[v0] Checkpoint updated for job ${jobId}:`, checkpoint.bookings_processed, "bookings processed")
    }
  }

  /**
   * Get sync job by ID
   */
  static async getSyncJob(jobId: string): Promise<SyncJob | null> {
    const supabase = await createServiceRoleClient()

    try {
      await new Promise((resolve) => setTimeout(resolve, 100))

      const { data, error } = await supabase.from("sync_jobs").select("*").eq("id", jobId).single()

      if (error) {
        const isRateLimitError =
          error.message?.includes("Too Many Requests") ||
          error.message?.includes("Too Many R") ||
          error.message?.includes("429") ||
          error.message?.includes("Unexpected token") ||
          error.message?.includes("not valid JSON")

        if (isRateLimitError) {
          return null
        }

        console.error("[v0] Error fetching sync job:", error)
        return null
      }

      return data
    } catch (error: any) {
      const errorMessage = error?.message || String(error)
      const errorName = error?.name || ""

      // Check for rate limit errors (HTML response instead of JSON)
      // This catches SyntaxError when Supabase returns HTML "Too Many Requests" page
      const isRateLimitError =
        errorName === "SyntaxError" ||
        errorMessage.includes("Too Many Requests") ||
        errorMessage.includes("Too Many R") ||
        errorMessage.includes("429") ||
        errorMessage.includes("Unexpected token") ||
        errorMessage.includes("not valid JSON") ||
        errorMessage.includes("Unexpected end of JSON")

      if (isRateLimitError) {
        // Return null to trigger cache fallback in the route
        return null
      }

      // Log unexpected errors
      console.error("[v0] Unexpected error fetching sync job:", errorMessage)
      return null
    }
  }

  /**
   * Get recent sync jobs for a hotel
   */
  static async getRecentSyncJobs(hotelId: string, limit = 10): Promise<SyncJob[]> {
    const supabase = await createServiceRoleClient()

    const { data, error } = await supabase
      .from("sync_jobs")
      .select("*")
      .eq("hotel_id", hotelId)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) {
      console.error("[v0] Error fetching sync jobs:", error)
      return []
    }

    return data || []
  }

  /**
   * Update sync job status
   */
  static async updateSyncJobStatus(
    jobId: string,
    status: "in_progress" | "completed" | "failed",
    stats?: SyncJob["stats"],
    errorMessage?: string,
  ): Promise<void> {
    const supabase = await createServiceRoleClient()

    const updates: any = {
      status,
      updated_at: new Date().toISOString(),
    }

    if (status === "in_progress") {
      updates.started_at = new Date().toISOString()
    } else if (status === "completed" || status === "failed") {
      updates.completed_at = new Date().toISOString()
    }

    if (stats) {
      updates.stats = stats
    }

    if (errorMessage) {
      updates.error_message = errorMessage
    }

    const { error } = await supabase.from("sync_jobs").update(updates).eq("id", jobId)

    if (error) {
      console.error("[v0] Error updating sync job:", error)
      throw new Error(`Failed to update sync job: ${error.message}`)
    }

    console.log(`[v0] Sync job ${jobId} updated to status: ${status}`)
  }

  /**
   * Get pending sync jobs (for background worker)
   */
  static async getPendingSyncJobs(): Promise<SyncJob[]> {
    const supabase = await createServiceRoleClient()

    const { data, error } = await supabase
      .from("sync_jobs")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(10)

    if (error) {
      console.error("[v0] Error fetching pending sync jobs:", error)
      return []
    }

    return data || []
  }
}
