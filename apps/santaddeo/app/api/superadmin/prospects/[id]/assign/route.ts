import { type NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"

function resolveExpiry(input: { expires_at?: string | null; duration_days?: number | null }) {
  if (input.expires_at) {
    const d = new Date(input.expires_at)
    if (Number.isNaN(d.getTime())) throw new Error("expires_at non valido")
    return { expires_at: d.toISOString(), duration_days: input.duration_days ?? null }
  }
  if (input.duration_days === null || input.duration_days === 0) {
    return { expires_at: null, duration_days: null }
  }
  const days = typeof input.duration_days === "number" ? input.duration_days : 60
  if (days < 1 || days > 365) throw new Error("duration_days fuori range (1-365)")
  const expiry = new Date()
  expiry.setUTCDate(expiry.getUTCDate() + days)
  return { expires_at: expiry.toISOString(), duration_days: days }
}

/**
 * POST /api/superadmin/prospects/[id]/assign
 *
 * Assegna un singolo prospect a un agente con scadenza.
 * Se il prospect e' gia' assegnato a un altro agente -> 409 con dettagli;
 * il superadmin deve rispedire con force=true + force_reason per confermare.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 })

  const service = await createServiceRoleClient()
  const { data: profile } = await service.from("profiles").select("role").eq("id", user.id).maybeSingle()
  if (profile?.role !== "super_admin") {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Body non valido" }, { status: 400 })
  }

  const { agent_id, force, force_reason } = body || {}
  if (!agent_id) return NextResponse.json({ error: "agent_id obbligatorio" }, { status: 400 })

  let expiry
  try {
    expiry = resolveExpiry({ expires_at: body?.expires_at, duration_days: body?.duration_days })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }

  // Carica prospect corrente + agente attuale
  const { data: prospect, error: pErr } = await service
    .from("prospects")
    .select(
      "id, name, assigned_agent_id, assigned_agent:sales_agents!prospects_assigned_agent_id_fkey(id, display_name)",
    )
    .eq("id", id)
    .maybeSingle()
  if (pErr || !prospect) return NextResponse.json({ error: "Prospect non trovato" }, { status: 404 })

  const currentAgentId = prospect.assigned_agent_id

  if (currentAgentId && currentAgentId !== agent_id && !force) {
    return NextResponse.json(
      {
        error: "already_assigned",
        current_agent: prospect.assigned_agent,
        message: "Il prospect e' gia' assegnato. Conferma con force=true + force_reason per sovrascrivere.",
      },
      { status: 409 },
    )
  }

  if (force && currentAgentId && currentAgentId !== agent_id) {
    if (!force_reason || force_reason.trim().length < 5) {
      return NextResponse.json(
        { error: "force_reason richiesto (min 5 caratteri)" },
        { status: 400 },
      )
    }
  }

  // Verifica agente attivo
  const { data: agent } = await service
    .from("sales_agents")
    .select("id, display_name, is_active")
    .eq("id", agent_id)
    .maybeSingle()
  if (!agent || !agent.is_active) {
    return NextResponse.json({ error: "Agente non trovato o inattivo" }, { status: 404 })
  }

  const { error: updErr } = await service
    .from("prospects")
    .update({
      assigned_agent_id: agent_id,
      assignment_date: new Date().toISOString(),
      assignment_expires_at: expiry.expires_at,
      assignment_duration_days: expiry.duration_days,
      assignment_expired_at: null,
      status: "assigned",
    })
    .eq("id", id)

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  // Patcha history: assigned_by + reason del transfer forzato
  if (force && currentAgentId && currentAgentId !== agent_id && force_reason) {
    const since = new Date(Date.now() - 5000).toISOString()
    await service
      .from("prospect_assignment_history")
      .update({
        unassign_reason: "forced_by_admin",
        unassign_notes: force_reason,
        unassigned_by: user.id,
      })
      .eq("prospect_id", id)
      .eq("agent_id", currentAgentId)
      .gte("unassigned_at", since)
  }
  await service
    .from("prospect_assignment_history")
    .update({ assigned_by: user.id })
    .eq("prospect_id", id)
    .eq("agent_id", agent_id)
    .is("unassigned_at", null)

  return NextResponse.json({
    success: true,
    expires_at: expiry.expires_at,
    duration_days: expiry.duration_days,
    forced: !!force && !!currentAgentId && currentAgentId !== agent_id,
  })
}

/**
 * DELETE /api/superadmin/prospects/[id]/assign
 * Unassign manuale (super-admin).
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 })

  const service = await createServiceRoleClient()
  const { data: profile } = await service.from("profiles").select("role").eq("id", user.id).maybeSingle()
  if (profile?.role !== "super_admin") {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 })
  }

  const { error } = await service
    .from("prospects")
    .update({
      assigned_agent_id: null,
      assignment_date: null,
      assignment_expires_at: null,
      status: "unassigned",
    })
    .eq("id", id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
