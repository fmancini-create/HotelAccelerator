import { type NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"

export const dynamic = "force-dynamic"

/**
 * GET /api/superadmin/calendar?from=ISO&to=ISO[&agent_id=]
 *
 * Vista "vedi tutto" del super admin: aggrega le attività/task di TUTTI i
 * venditori nella finestra, ciascuna arricchita col nome dell'agente. Sola
 * lettura. Filtro opzionale `agent_id` per isolare un venditore.
 *
 * Finestra:
 *  - task pianificati (task_status NOT NULL) -> filtro su due_at
 *  - attività storiche (task_status NULL)    -> filtro su happened_at
 *
 * NB: cap 1000 elementi per query (super admin aggrega più agenti). Il client
 * interroga al massimo un mese alla volta.
 */
export async function GET(request: NextRequest) {
  const { user, supabase: authSupa } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { data: profile } = await authSupa
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()
  if (profile?.role !== "super_admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const url = new URL(request.url)
  const fromIso = url.searchParams.get("from")
  const toIso = url.searchParams.get("to")
  const agentFilter = url.searchParams.get("agent_id")
  if (!fromIso || !toIso) {
    return NextResponse.json({ error: "from_to_required" }, { status: 400 })
  }
  const from = new Date(fromIso)
  const to = new Date(toIso)
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return NextResponse.json({ error: "invalid_range" }, { status: 400 })
  }

  const svc = await createServiceRoleClient()
  const fromIsoZ = from.toISOString()
  const toIsoZ = to.toISOString()

  const baseSelect =
    "id, prospect_id, agent_id, type, title, description, outcome, happened_at, due_at, task_status, completed_at, prospect:prospect_id(id, name, city)"

  const buildTasks = () => {
    let q = svc
      .from("prospect_activities")
      .select(baseSelect)
      .not("task_status", "is", null)
      .gte("due_at", fromIsoZ)
      .lt("due_at", toIsoZ)
      .order("due_at", { ascending: true })
      .limit(1000)
    if (agentFilter) q = q.eq("agent_id", agentFilter)
    return q
  }
  const buildActivities = () => {
    let q = svc
      .from("prospect_activities")
      .select(baseSelect)
      .is("task_status", null)
      .gte("happened_at", fromIsoZ)
      .lt("happened_at", toIsoZ)
      .order("happened_at", { ascending: true })
      .limit(1000)
    if (agentFilter) q = q.eq("agent_id", agentFilter)
    return q
  }

  const [tasksRes, activitiesRes, agentsRes] = await Promise.all([
    buildTasks(),
    buildActivities(),
    svc.from("sales_agents").select("id, display_name, email").order("display_name", { ascending: true }),
  ])

  if (tasksRes.error) {
    console.error("[superadmin/calendar] tasks error:", tasksRes.error)
    return NextResponse.json({ error: tasksRes.error.message }, { status: 500 })
  }
  if (activitiesRes.error) {
    console.error("[superadmin/calendar] activities error:", activitiesRes.error)
    return NextResponse.json({ error: activitiesRes.error.message }, { status: 500 })
  }

  const agents = agentsRes.data ?? []
  const agentById = new Map(agents.map((a) => [a.id, a.display_name || a.email || "Venditore"]))

  const items = [...(tasksRes.data ?? []), ...(activitiesRes.data ?? [])].map((it) => ({
    ...it,
    agent_name: it.agent_id ? agentById.get(it.agent_id) ?? "Venditore" : null,
  }))

  return NextResponse.json({
    items,
    agents: agents.map((a) => ({ id: a.id, name: a.display_name || a.email || "Venditore" })),
  })
}
