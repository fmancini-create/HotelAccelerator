import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Box 9 — Sync error logger.
 * Logs individual sync errors to the `sync_errors` table with deduplication:
 *   - If the same (hotel_id, sync_type, record_id) error already exists (and is unresolved),
 *     we increment `occurrence_count` and update `last_seen_at`.
 *   - Otherwise we insert a new row.
 * Also auto-resolves old errors that haven't recurred in 7 days.
 */

interface SyncErrorEntry {
  record_id?: string
  error_message: string
  error_details?: Record<string, unknown>
  raw_data?: Record<string, unknown>
  severity?: "warning" | "error" | "critical"
}

export async function logSyncErrors(
  supabase: SupabaseClient,
  hotelId: string,
  syncType: string,
  pmsName: string,
  errors: SyncErrorEntry[]
) {
  if (!errors || errors.length === 0) return

  for (const err of errors) {
    const recordId = err.record_id || null

    if (recordId) {
      // Try upsert: if same unresolved error exists, bump occurrence_count
      const { data: existing } = await supabase
        .from("sync_errors")
        .select("id, occurrence_count")
        .eq("hotel_id", hotelId)
        .eq("sync_type", syncType)
        .eq("record_id", recordId)
        .eq("resolved", false)
        .maybeSingle()

      if (existing) {
        await supabase
          .from("sync_errors")
          .update({
            occurrence_count: (existing.occurrence_count || 1) + 1,
            last_seen_at: new Date().toISOString(),
            error_message: err.error_message,
            error_details: err.error_details || null,
            severity: err.severity || "warning",
          })
          .eq("id", existing.id)
        continue
      }
    }

    // Insert new error
    await supabase.from("sync_errors").insert({
      hotel_id: hotelId,
      sync_type: syncType,
      pms_name: pmsName,
      record_id: recordId,
      error_message: err.error_message,
      error_details: err.error_details || null,
      raw_data: err.raw_data || null,
      severity: err.severity || "warning",
      occurrence_count: 1,
      first_seen_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    })
  }
}

/**
 * Auto-resolve errors not seen in 7+ days.
 * Call this periodically (e.g. after each sync run).
 */
export async function autoResolveStaleSyncErrors(supabase: SupabaseClient, hotelId: string) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  await supabase
    .from("sync_errors")
    .update({ resolved: true, resolved_at: new Date().toISOString() })
    .eq("hotel_id", hotelId)
    .eq("resolved", false)
    .lt("last_seen_at", sevenDaysAgo)
}

/**
 * Get recurring errors (occurrence_count >= threshold) for notification.
 * Box 9: sistema di notifica errori ricorrenti.
 */
export async function getRecurringSyncErrors(
  supabase: SupabaseClient,
  hotelId: string,
  threshold = 3
) {
  const { data } = await supabase
    .from("sync_errors")
    .select("*")
    .eq("hotel_id", hotelId)
    .eq("resolved", false)
    .gte("occurrence_count", threshold)
    .order("last_seen_at", { ascending: false })

  return data || []
}
