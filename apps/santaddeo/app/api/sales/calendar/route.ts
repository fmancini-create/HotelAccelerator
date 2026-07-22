import { type NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import {
  resolveCalendarViewer,
  resolveTargetAgentId,
  resolveTargetAgentIds,
} from "@/lib/sales/calendar-scope"

export const dynamic = "force-dynamic"

/**
 * GET /api/sales/calendar?from=ISO&to=ISO[&agent_id=]
 * Ritorna eventi del venditore (task pianificati + attivita' storiche) compresi
 * tra `from` (incluso) e `to` (escluso). Il filtro lavora su:
 *  - happened_at per attivita' storiche (task_status NULL)
 *  - due_at per task pianificati (task_status NOT NULL)
 *
 * `agent_id` permette di ispezionare il calendario di un altro venditore:
 * il super_admin può vedere chiunque, il CAPO AREA solo i membri del proprio
 * team (vedi lib/sales/calendar-scope). Se omesso, default = sé stesso.
 *
 * NB: cap 500 elementi per range -> il client dovrebbe interrogare al massimo
 * un mese alla volta. Per ranges piu' ampi paginare con piu' fetch.
 */
export async function GET(request: NextRequest) {
  const { user } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const svc = await createServiceRoleClient()

  const url = new URL(request.url)
  const fromIso = url.searchParams.get("from")
  const toIso = url.searchParams.get("to")
  const overrideAgentId = url.searchParams.get("agent_id")
  // Multi-overlay: CSV di agent_id da sovrapporre. Ha precedenza su `agent_id`.
  const overrideAgentIds = (url.searchParams.get("agent_ids") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

  if (!fromIso || !toIso) {
    return NextResponse.json({ error: "from_to_required" }, { status: 400 })
  }
  const from = new Date(fromIso)
  const to = new Date(toIso)
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return NextResponse.json({ error: "invalid_range" }, { status: 400 })
  }

  const viewer = await resolveCalendarViewer(svc, user.id)

  // Risolve l'insieme di agenti da mostrare (autorizzati). Con `agent_ids` usa
  // la variante multipla; altrimenti il singolo `agent_id` (default: sé stesso).
  let agentIds: string[]
  if (overrideAgentIds.length > 0) {
    agentIds = await resolveTargetAgentIds(svc, viewer, overrideAgentIds)
  } else {
    const scope = await resolveTargetAgentId(svc, viewer, overrideAgentId)
    if ("forbidden" in scope) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }
    agentIds = scope.agentId ? [scope.agentId] : []
  }

  if (agentIds.length === 0) {
    return NextResponse.json({ items: [] })
  }

  // Due query separate (uniformata in OR sarebbe lenta su due indici diversi):
  // 1) task pending/done/cancelled in finestra: filter su due_at
  // 2) attivita' storiche: filter su happened_at + task_status IS NULL
  const fromIsoZ = from.toISOString()
  const toIsoZ = to.toISOString()

  const [tasksRes, activitiesRes] = await Promise.all([
    svc
      .from("prospect_activities")
      .select(
        "id, prospect_id, agent_id, type, title, description, outcome, happened_at, due_at, task_status, completed_at, prospect:prospect_id(id, name, city)",
      )
      .in("agent_id", agentIds)
      .not("task_status", "is", null)
      .gte("due_at", fromIsoZ)
      .lt("due_at", toIsoZ)
      .order("due_at", { ascending: true })
      .limit(500),
    svc
      .from("prospect_activities")
      .select(
        "id, prospect_id, agent_id, type, title, description, outcome, happened_at, due_at, task_status, completed_at, prospect:prospect_id(id, name, city)",
      )
      .in("agent_id", agentIds)
      .is("task_status", null)
      .gte("happened_at", fromIsoZ)
      .lt("happened_at", toIsoZ)
      .order("happened_at", { ascending: true })
      .limit(500),
  ])

  if (tasksRes.error) {
    console.error("[calendar/GET] tasks error:", tasksRes.error)
    return NextResponse.json({ error: tasksRes.error.message }, { status: 500 })
  }
  if (activitiesRes.error) {
    console.error("[calendar/GET] activities error:", activitiesRes.error)
    return NextResponse.json({ error: activitiesRes.error.message }, { status: 500 })
  }

  const items = [...(tasksRes.data ?? []), ...(activitiesRes.data ?? [])]
  return NextResponse.json({ items, agent_ids: agentIds })
}
