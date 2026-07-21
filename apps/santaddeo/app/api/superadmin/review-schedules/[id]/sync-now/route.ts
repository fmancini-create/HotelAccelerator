import { type NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { ApifyReviewService } from "@/lib/services/apify-review-service"
import { isDevAuthAsync } from "@/lib/env/dev-auth"

/**
 * POST /api/superadmin/review-schedules/[id]/sync-now
 *
 * Forza una sync immediata per quel singolo canale, bypassando lo schedule.
 * Aggiorna il record review_platform_schedules e logga la run con
 * trigger_source='manual_super_admin'.
 *
 * Limitato a 5 minuti (maxDuration) come tutti gli endpoint di sync Apify.
 */
export const maxDuration = 300

async function requireSuperAdmin() {
  const isDev = await isDevAuthAsync()
  if (isDev) return { ok: true as const }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, status: 401, error: "Unauthorized" }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  if (!profile || (profile.role !== "super_admin" && profile.role !== "superadmin")) {
    return { ok: false as const, status: 403, error: "Forbidden" }
  }
  return { ok: true as const }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const admin = await createServiceRoleClient()

  const { data: sched, error: schedErr } = await admin
    .from("review_platform_schedules")
    .select(
      "id, hotel_id, platform, avg_days_between_reviews, manual_override_days, consecutive_empty_runs, total_syncs, total_reviews_found"
    )
    .eq("id", id)
    .maybeSingle()

  if (schedErr) return NextResponse.json({ error: schedErr.message }, { status: 500 })
  if (!sched) return NextResponse.json({ error: "Schedule not found" }, { status: 404 })

  const runIns = await admin
    .from("review_sync_runs")
    .insert({
      schedule_id: sched.id,
      hotel_id: sched.hotel_id,
      platform: sched.platform,
      status: "running",
      trigger_source: "manual_super_admin",
    })
    .select("id")
    .single()
  const runId = runIns.data?.id ?? null

  try {
    const result = await ApifyReviewService.syncSinglePlatformForHotel(
      sched.hotel_id,
      sched.platform as Parameters<typeof ApifyReviewService.syncSinglePlatformForHotel>[1]
    )

    const newCount = result.newCount ?? 0
    const cadenceDays =
      Number(sched.manual_override_days ?? sched.avg_days_between_reviews) || 7
    const nextSyncAt = new Date(Date.now() + cadenceDays * 24 * 3600 * 1000)

    await admin
      .from("review_platform_schedules")
      .update({
        last_sync_at: new Date().toISOString(),
        last_review_found_at:
          newCount > 0 ? new Date().toISOString() : undefined,
        next_sync_at: nextSyncAt.toISOString(),
        consecutive_empty_runs: newCount > 0 ? 0 : sched.consecutive_empty_runs,
        total_syncs: sched.total_syncs + 1,
        total_reviews_found: sched.total_reviews_found + newCount,
      })
      .eq("id", sched.id)

    if (runId) {
      await admin
        .from("review_sync_runs")
        .update({
          finished_at: new Date().toISOString(),
          status: result.success
            ? newCount > 0
              ? "success"
              : "success_empty"
            : "error",
          new_reviews_count: newCount,
          total_reviews_seen: result.reviewCount ?? 0,
          error_message: result.success ? null : result.message,
          next_sync_set_to: nextSyncAt.toISOString(),
        })
        .eq("id", runId)
    }

    return NextResponse.json({
      ok: true,
      success: result.success,
      newReviews: newCount,
      totalSeen: result.reviewCount ?? 0,
      message: result.message,
      nextSyncAt: nextSyncAt.toISOString(),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    if (runId) {
      await admin
        .from("review_sync_runs")
        .update({
          finished_at: new Date().toISOString(),
          status: "error",
          error_message: msg,
        })
        .eq("id", runId)
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
