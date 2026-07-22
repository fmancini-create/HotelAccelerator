import { type NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"

/**
 * API super-admin per gestire la cadenza adattiva di sync recensioni.
 *
 *  GET    -> lista di review_platform_schedules con join hotels + ultimi 5 run
 *  PATCH  -> aggiorna manual_override_days, is_dormant (wake/sleep), avg_days
 *
 * Auth: super_admin only. Bypass in dev/v0 preview (isDevAuthAsync).
 */

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

export async function GET(_request: NextRequest) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const admin = await createServiceRoleClient()

  const { data: schedules, error } = await admin
    .from("review_platform_schedules")
    .select(
      `
      id, hotel_id, platform, avg_days_between_reviews, manual_override_days,
      next_sync_at, last_sync_at, last_review_found_at, consecutive_empty_runs,
      is_dormant, dormant_since, dormant_reason, total_syncs, total_reviews_found,
      hotels:hotel_id ( name, is_active )
    `
    )
    .order("hotel_id", { ascending: true })
    .order("platform", { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Carichiamo gli ultimi 5 run per ogni schedule per il dettaglio espandibile
  const ids = (schedules ?? []).map((s) => s.id)
  const { data: runs } = ids.length
    ? await admin
        .from("review_sync_runs")
        .select(
          "id, schedule_id, started_at, finished_at, status, new_reviews_count, total_reviews_seen, error_message, trigger_source"
        )
        .in("schedule_id", ids)
        .order("started_at", { ascending: false })
        .limit(500)
    : { data: [] }

  const runsBySchedule: Record<string, any[]> = {}
  for (const r of runs ?? []) {
    if (!runsBySchedule[r.schedule_id!]) runsBySchedule[r.schedule_id!] = []
    if (runsBySchedule[r.schedule_id!].length < 5) {
      runsBySchedule[r.schedule_id!].push(r)
    }
  }

  return NextResponse.json({
    schedules: (schedules ?? []).map((s: any) => ({
      ...s,
      hotel_name: s.hotels?.name ?? "?",
      hotel_active: s.hotels?.is_active ?? false,
      recent_runs: runsBySchedule[s.id] ?? [],
    })),
  })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json()
  const { id, manual_override_days, is_dormant, action } = body

  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  const admin = await createServiceRoleClient()
  const update: Record<string, any> = {}

  // Action: "wake" -> resetta dormienza e fissa next_sync_at = now
  if (action === "wake") {
    update.is_dormant = false
    update.dormant_since = null
    update.dormant_reason = null
    update.consecutive_empty_runs = 0
    update.next_sync_at = new Date().toISOString()
  } else if (action === "sleep") {
    update.is_dormant = true
    update.dormant_since = new Date().toISOString()
    update.dormant_reason = "manual_disable"
  } else {
    // Editing manuale dei campi (override cadenza)
    if (manual_override_days !== undefined) {
      if (manual_override_days === null) {
        update.manual_override_days = null
      } else {
        const n = Number(manual_override_days)
        if (!Number.isFinite(n) || n < 1 || n > 30) {
          return NextResponse.json(
            { error: "manual_override_days must be 1..30 or null" },
            { status: 400 }
          )
        }
        update.manual_override_days = n
      }
    }
    if (is_dormant !== undefined) update.is_dormant = Boolean(is_dormant)
  }

  const { error } = await admin
    .from("review_platform_schedules")
    .update(update)
    .eq("id", id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
