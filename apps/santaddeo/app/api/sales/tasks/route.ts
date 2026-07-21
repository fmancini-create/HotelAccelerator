import { type NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"

export const dynamic = "force-dynamic"

/**
 * GET /api/sales/tasks
 * Lista task del venditore loggato (o del super_admin via ?agent_id=).
 *
 * Query params:
 *  - status: 'pending' | 'done' | 'cancelled' | 'all'  (default: 'pending')
 *  - range: 'today' | 'week' | 'overdue' | 'upcoming' | 'all'  (default: 'all')
 *  - limit: numero massimo task (default 200, max 500)
 *  - agent_id: solo per super_admin per ispezione
 *
 * Ritorna anche un riepilogo con i contatori per range (utile per badge nav).
 */
export async function GET(request: NextRequest) {
  const { user, supabase: authSupa } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { data: profile } = await authSupa
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()
  const isSuperAdmin = profile?.role === "super_admin"

  const svc = await createServiceRoleClient()

  const url = new URL(request.url)
  const overrideAgentId = url.searchParams.get("agent_id")
  const status = url.searchParams.get("status") || "pending"
  const range = url.searchParams.get("range") || "all"
  const limit = Math.min(Number(url.searchParams.get("limit") || 200), 500)

  let agentId: string | null = null
  if (isSuperAdmin && overrideAgentId) {
    agentId = overrideAgentId
  } else {
    const { data: agent } = await svc
      .from("sales_agents")
      .select("id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle()
    if (!agent) {
      // Super_admin senza riga sales_agents: torna vuoto invece di 404
      // (vedi pattern usato per la search dei prospect).
      return NextResponse.json({
        tasks: [],
        counters: { today: 0, overdue: 0, week: 0, upcoming: 0, total_pending: 0 },
      })
    }
    agentId = agent.id
  }

  // Calcolo le bounds dei range in base alla timezone server (UTC qui;
  // la UI rende i timestamp nella tz del browser). I cutoff sono pensati
  // come "fine giornata locale": uso le boundary semplificate via UTC
  // perche' i task hanno granularita' al minuto, non c'e' bisogno di
  // essere precisi al fuso del singolo agent.
  const now = new Date()
  const startOfTodayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0),
  )
  const endOfTodayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59),
  )
  const endOfWeekUtc = new Date(endOfTodayUtc)
  endOfWeekUtc.setUTCDate(endOfWeekUtc.getUTCDate() + 6) // prossimi 7 giorni

  // Query base
  let q = svc
    .from("prospect_activities")
    .select(
      "id, prospect_id, agent_id, type, title, description, outcome, happened_at, due_at, task_status, completed_at, created_at, updated_at, prospect:prospect_id(id, name, city, status), agent:agent_id(id, display_name)",
    )
    .eq("agent_id", agentId)
    .not("task_status", "is", null)
    .order("due_at", { ascending: true })
    .limit(limit)

  if (status !== "all") {
    q = q.eq("task_status", status)
  }
  if (range === "today") {
    q = q.gte("due_at", startOfTodayUtc.toISOString()).lte("due_at", endOfTodayUtc.toISOString())
  } else if (range === "overdue") {
    q = q.lt("due_at", now.toISOString()).eq("task_status", "pending")
  } else if (range === "week") {
    q = q.gte("due_at", startOfTodayUtc.toISOString()).lte("due_at", endOfWeekUtc.toISOString())
  } else if (range === "upcoming") {
    q = q.gt("due_at", endOfTodayUtc.toISOString())
  }

  const { data: tasks, error } = await q
  if (error) {
    console.error("[my-tasks] GET error:", error.message)
    return NextResponse.json({ error: "db_error" }, { status: 500 })
  }

  // Contatori globali (sempre per status='pending') per i badge nav/dashboard.
  // Uso count: 'exact' head:true per evitare data transfer.
  const counters = await Promise.all([
    svc
      .from("prospect_activities")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", agentId)
      .eq("task_status", "pending")
      .gte("due_at", startOfTodayUtc.toISOString())
      .lte("due_at", endOfTodayUtc.toISOString()),
    svc
      .from("prospect_activities")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", agentId)
      .eq("task_status", "pending")
      .lt("due_at", now.toISOString()),
    svc
      .from("prospect_activities")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", agentId)
      .eq("task_status", "pending")
      .gte("due_at", startOfTodayUtc.toISOString())
      .lte("due_at", endOfWeekUtc.toISOString()),
    svc
      .from("prospect_activities")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", agentId)
      .eq("task_status", "pending")
      .gt("due_at", endOfTodayUtc.toISOString()),
    svc
      .from("prospect_activities")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", agentId)
      .eq("task_status", "pending"),
  ])

  return NextResponse.json({
    tasks: tasks || [],
    counters: {
      today: counters[0].count || 0,
      overdue: counters[1].count || 0,
      week: counters[2].count || 0,
      upcoming: counters[3].count || 0,
      total_pending: counters[4].count || 0,
    },
  })
}
