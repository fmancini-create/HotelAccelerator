import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"

export const dynamic = "force-dynamic"

/**
 * POST /api/sales/area-manager/assign-prospect
 *
 * Body: { prospect_id: uuid, target_agent_id: uuid }
 *
 * Riassegna un prospect ad un altro agente DEL PROPRIO TEAM. L'unica azione
 * di scrittura concessa al capo area sui dati dei figli. Validazioni:
 *  - target_agent_id deve avere parent_agent_id === capo area corrente
 *  - prospect deve essere assegnato a un agente del team (oppure non
 *    assegnato e disponibile in pool) — qui scegliamo di accettare anche
 *    riassegnazione di prospect ATTUALMENTE assegnati a se stesso (il capo
 *    area come agente diretto).
 */
export async function POST(request: Request) {
  const { user, supabase: authSupa } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { data: profile } = await authSupa
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single()

  const svc = await createServiceRoleClient()
  let body: { prospect_id?: string; target_agent_id?: string; as_area_manager?: string } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }
  const prospectId = body.prospect_id
  const targetAgentId = body.target_agent_id
  if (!prospectId || !targetAgentId) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 })
  }

  // Risolvi il capo area che sta chiedendo
  let callerAreaManagerId: string | null = null
  if (profile?.role === "super_admin" && body.as_area_manager) {
    callerAreaManagerId = body.as_area_manager
  } else {
    const { data: me } = await svc
      .from("sales_agents")
      .select("id, is_area_manager, is_active")
      .eq("user_id", user.id)
      .maybeSingle()
    if (!me || !me.is_active || !me.is_area_manager) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }
    callerAreaManagerId = me.id
  }

  // Valida target agent
  const { data: target } = await svc
    .from("sales_agents")
    .select("id, parent_agent_id, is_active, display_name")
    .eq("id", targetAgentId)
    .maybeSingle()

  if (!target || !target.is_active) {
    return NextResponse.json({ error: "target_not_found_or_inactive" }, { status: 404 })
  }

  // Il target deve essere: (a) un agente del team OPPURE (b) il capo area
  // stesso (puo' tenersi il prospect come agente diretto).
  const isOwnTeamMember = target.parent_agent_id === callerAreaManagerId
  const isSelf = target.id === callerAreaManagerId
  if (!isOwnTeamMember && !isSelf) {
    return NextResponse.json({ error: "target_not_in_team" }, { status: 403 })
  }

  // Valida prospect: deve appartenere ad un membro del team o al capo area
  const { data: prospect } = await svc
    .from("prospects")
    .select("id, name, assigned_agent_id")
    .eq("id", prospectId)
    .maybeSingle()

  if (!prospect) {
    return NextResponse.json({ error: "prospect_not_found" }, { status: 404 })
  }

  if (prospect.assigned_agent_id) {
    const { data: currentOwner } = await svc
      .from("sales_agents")
      .select("id, parent_agent_id")
      .eq("id", prospect.assigned_agent_id)
      .maybeSingle()
    const isOwnerInTeam =
      currentOwner &&
      (currentOwner.parent_agent_id === callerAreaManagerId ||
        currentOwner.id === callerAreaManagerId)
    if (!isOwnerInTeam) {
      return NextResponse.json({ error: "prospect_not_in_team_scope" }, { status: 403 })
    }
  }

  // Esegui riassegnazione
  const { error: updErr } = await svc
    .from("prospects")
    .update({
      assigned_agent_id: targetAgentId,
      assignment_date: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", prospectId)

  if (updErr) {
    console.error("[area-manager/assign-prospect] update error:", updErr)
    return NextResponse.json({ error: "db_error" }, { status: 500 })
  }

  // Log attivita' (best-effort, non blocchiamo se la tabella ha schema diverso)
  try {
    await svc.from("prospect_activities").insert({
      prospect_id: prospectId,
      activity_type: "reassigned",
      notes: `Riassegnato a ${target.display_name} dal capo area`,
      created_by: user.id,
    })
  } catch (e) {
    console.warn("[area-manager/assign-prospect] activity log failed:", e)
  }

  return NextResponse.json({
    ok: true,
    prospect_id: prospectId,
    target_agent_id: targetAgentId,
    target_display_name: target.display_name,
  })
}
