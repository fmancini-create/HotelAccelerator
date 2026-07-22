import { type NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"

/**
 * POST /api/sales/prospects/[id]/release
 *
 * Permette all'agente proprietario (o al capo area che vede il prospect
 * di un suo agente) di rilasciare volontariamente il prospect, rendendolo
 * disponibile per altri venditori. Logga la transizione con
 * reason='agent_release' nel trigger DB.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 })

  const service = await createServiceRoleClient()
  const { data: agent } = await service
    .from("sales_agents")
    .select("id, parent_agent_id, is_area_manager")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle()
  if (!agent) return NextResponse.json({ error: "Agente non trovato" }, { status: 404 })

  let body: any = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }
  const notes: string | undefined = body?.notes

  const { data: prospect } = await service
    .from("prospects")
    .select("id, assigned_agent_id")
    .eq("id", id)
    .maybeSingle()
  if (!prospect) return NextResponse.json({ error: "Prospect non trovato" }, { status: 404 })
  if (!prospect.assigned_agent_id) {
    return NextResponse.json({ error: "Prospect gia' libero" }, { status: 400 })
  }

  // Autorizzazione: proprietario diretto, oppure capo area del proprietario.
  let allowed = prospect.assigned_agent_id === agent.id
  if (!allowed && agent.is_area_manager) {
    const { data: child } = await service
      .from("sales_agents")
      .select("id, parent_agent_id")
      .eq("id", prospect.assigned_agent_id)
      .maybeSingle()
    if (child?.parent_agent_id === agent.id) allowed = true
  }
  if (!allowed) {
    return NextResponse.json({ error: "Non autorizzato a rilasciare questo prospect" }, { status: 403 })
  }

  const releasedAgentId = prospect.assigned_agent_id

  const { error: updErr } = await service
    .from("prospects")
    .update({
      assigned_agent_id: null,
      assignment_date: null,
      assignment_expires_at: null,
      status: "unassigned",
    })
    .eq("id", id)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  // Patcha la riga history appena chiusa dal trigger con reason esplicito
  const since = new Date(Date.now() - 5000).toISOString()
  await service
    .from("prospect_assignment_history")
    .update({
      unassign_reason: "agent_release",
      unassign_notes: notes ?? null,
      unassigned_by: user.id,
    })
    .eq("prospect_id", id)
    .eq("agent_id", releasedAgentId)
    .gte("unassigned_at", since)

  return NextResponse.json({ success: true })
}
