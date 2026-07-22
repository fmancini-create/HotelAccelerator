import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { notifyUser } from "@/lib/notifications/notify"

export const dynamic = "force-dynamic"

/**
 * PATCH /api/superadmin/prospects/assignment-requests/[id]
 * Body: { action: 'approve' | 'reject', decision_notes?: string }
 *
 * Approve:
 *   - Verifica che il prospect sia ancora unassigned (race-safe: usa
 *     `.update({assigned_agent_id, status:'assigned'}).eq('assigned_agent_id', null)`).
 *   - Se l'UPDATE matcha 0 righe (ossia il prospect e' stato preso da un altro agent
 *     nel frattempo), la richiesta viene comunque marcata come 'rejected' con motivazione
 *     "Prospect gia' assegnato durante l'approvazione" e l'API ritorna 409.
 *   - Auto-rifiuta TUTTE le altre richieste pending sullo stesso prospect (decision_notes
 *     "Prospect assegnato ad altro venditore"), per pulizia.
 *
 * Reject:
 *   - Marca la richiesta come 'rejected' + decision_notes (opzionale).
 *   - Non tocca il prospect.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const service = await createServiceRoleClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 })

  const { data: profile } = await service
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()
  if (profile?.role !== "super_admin") {
    return NextResponse.json({ error: "Solo super_admin" }, { status: 403 })
  }

  let body: { action?: string; decision_notes?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON non valido" }, { status: 400 })
  }

  const action = body.action
  const decisionNotes = body.decision_notes?.trim() || null

  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "action deve essere approve|reject" }, { status: 400 })
  }

  const { data: req, error: lookupError } = await service
    .from("prospect_assignment_requests")
    .select("id, prospect_id, agent_id, status, prospect:prospect_id(name), agent:agent_id(user_id, display_name)")
    .eq("id", id)
    .maybeSingle()
  if (lookupError || !req) {
    return NextResponse.json({ error: "Richiesta non trovata" }, { status: 404 })
  }
  if (req.status !== "pending") {
    return NextResponse.json(
      { error: `La richiesta non e' pending (stato attuale: ${req.status})` },
      { status: 409 },
    )
  }

  const now = new Date().toISOString()

  if (action === "reject") {
    const { error: updateError } = await service
      .from("prospect_assignment_requests")
      .update({
        status: "rejected",
        decision_notes: decisionNotes,
        decided_at: now,
        decided_by: user.id,
      })
      .eq("id", id)
    if (updateError) {
      console.error("[assignment-requests/PATCH] reject:", updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }
    // Notifica al venditore: richiesta rifiutata
    const agentUserId = (req as any).agent?.user_id
    const prospectName = (req as any).prospect?.name ?? "struttura"
    if (agentUserId) {
      await notifyUser({
        userId: agentUserId,
        type: "assignment_request_rejected",
        title: "Richiesta di assegnazione rifiutata",
        body: decisionNotes
          ? `${prospectName} non ti è stata assegnata. Motivo: ${decisionNotes}`
          : `${prospectName} non ti è stata assegnata.`,
        actionUrl: "/sales/leads",
      })
    }
    return NextResponse.json({ ok: true, action: "rejected" })
  }

  // === APPROVE ===
  // Race-safe: assegna SOLO se ancora unassigned.
  const { data: updatedProspect, error: assignError } = await service
    .from("prospects")
    .update({
      assigned_agent_id: req.agent_id,
      assignment_date: now,
      status: "assigned",
    })
    .eq("id", req.prospect_id)
    .is("assigned_agent_id", null)
    .select("id, assigned_agent_id")
    .maybeSingle()

  if (assignError) {
    console.error("[assignment-requests/PATCH] assign error:", assignError)
    return NextResponse.json({ error: assignError.message }, { status: 500 })
  }

  if (!updatedProspect) {
    // Race lost: il prospect era gia' assegnato ad un altro agente nel frattempo
    await service
      .from("prospect_assignment_requests")
      .update({
        status: "rejected",
        decision_notes: decisionNotes
          ? `${decisionNotes} (auto: prospect gia' assegnato durante l'approvazione)`
          : "Prospect gia' assegnato durante l'approvazione",
        decided_at: now,
        decided_by: user.id,
      })
      .eq("id", id)
    return NextResponse.json(
      { error: "Prospect gia' assegnato ad altro venditore — richiesta auto-rifiutata" },
      { status: 409 },
    )
  }

  // OK: marca la nostra richiesta come approved
  const { error: approveError } = await service
    .from("prospect_assignment_requests")
    .update({
      status: "approved",
      decision_notes: decisionNotes,
      decided_at: now,
      decided_by: user.id,
    })
    .eq("id", id)
  if (approveError) {
    console.error("[assignment-requests/PATCH] approve update:", approveError)
    return NextResponse.json({ error: approveError.message }, { status: 500 })
  }

  // Auto-rifiuta le altre pending per lo stesso prospect (pulizia)
  const { data: autoRejected } = await service
    .from("prospect_assignment_requests")
    .update({
      status: "rejected",
      decision_notes: "Prospect assegnato ad altro venditore",
      decided_at: now,
      decided_by: user.id,
    })
    .eq("prospect_id", req.prospect_id)
    .eq("status", "pending")
    .neq("id", id)
    .select("agent:agent_id(user_id)")

  // Notifica al venditore approvato
  const agentUserId = (req as any).agent?.user_id
  const prospectName = (req as any).prospect?.name ?? "struttura"
  if (agentUserId) {
    await notifyUser({
      userId: agentUserId,
      type: "assignment_request_approved",
      title: "Richiesta di assegnazione approvata",
      body: `${prospectName} è ora assegnata a te. Inizia a contattarla!`,
      actionUrl: `/sales/prospects/${req.prospect_id}`,
    })
  }

  // Notifica i venditori auto-rifiutati (altre richieste sullo stesso prospect)
  for (const row of (autoRejected as any[]) ?? []) {
    const uid = row?.agent?.user_id
    if (uid && uid !== agentUserId) {
      await notifyUser({
        userId: uid,
        type: "assignment_request_rejected",
        title: "Richiesta di assegnazione non disponibile",
        body: `${prospectName} è stata assegnata ad un altro venditore.`,
        actionUrl: "/sales/leads",
      })
    }
  }

  return NextResponse.json({ ok: true, action: "approved" })
}
