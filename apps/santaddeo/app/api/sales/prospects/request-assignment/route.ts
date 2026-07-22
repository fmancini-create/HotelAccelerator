import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { notifyUsers, getSuperAdminUserIds } from "@/lib/notifications/notify"

export const dynamic = "force-dynamic"

/**
 * GET /api/sales/prospects/request-assignment
 *
 * Lista delle richieste di assegnazione fatte dall'agente corrente, ordinate
 * dalla piu' recente. Default: tutte. Filtra con ?status=pending|approved|rejected|cancelled.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceRoleClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 })

  const { data: agent } = await service
    .from("sales_agents")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle()
  if (!agent) {
    // Super_admin senza riga sales_agents: nessuna richiesta personale
    // (lui assegna direttamente). Risposta vuota invece di 404 per non
    // rompere la UI in /sales/leads quando un super_admin la naviga.
    return NextResponse.json({ requests: [] })
  }

  const { searchParams } = new URL(request.url)
  const statusFilter = searchParams.get("status")

  let q = service
    .from("prospect_assignment_requests")
    .select(
      "id, prospect_id, status, message, decision_notes, created_at, decided_at, prospects:prospect_id(id, name, city, province, region, category, stars)",
    )
    .eq("agent_id", agent.id)
    .order("created_at", { ascending: false })

  if (statusFilter) {
    q = q.eq("status", statusFilter)
  }

  const { data, error } = await q
  if (error) {
    console.error("[sales/request-assignment] GET error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ requests: data || [] })
}

/**
 * POST /api/sales/prospects/request-assignment
 * Body: { prospect_id: string, message?: string }
 *
 * Crea una richiesta di assegnazione. Validazioni:
 *   1. Il prospect non deve essere gia' assegnato (se assegnato a me: 409 already-mine,
 *      se assegnato ad altri: 409 taken)
 *   2. L'agente non deve avere gia' una richiesta pending per lo stesso prospect
 *      (vincolato anche dall'index unique parziale).
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceRoleClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 })

  const { data: agent } = await service
    .from("sales_agents")
    .select("id, display_name")
    .eq("user_id", user.id)
    .maybeSingle()
  if (!agent) return NextResponse.json({ error: "Agente non trovato" }, { status: 404 })

  let body: { prospect_id?: string; message?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON non valido" }, { status: 400 })
  }

  const prospectId = body.prospect_id?.trim()
  const message = body.message?.trim() || null
  if (!prospectId) {
    return NextResponse.json({ error: "prospect_id obbligatorio" }, { status: 400 })
  }

  // 1. Verifica stato del prospect
  const { data: prospect, error: pErr } = await service
    .from("prospects")
    .select("id, name, assigned_agent_id")
    .eq("id", prospectId)
    .maybeSingle()
  if (pErr) {
    console.error("[request-assignment] prospect lookup:", pErr)
    return NextResponse.json({ error: pErr.message }, { status: 500 })
  }
  if (!prospect) {
    return NextResponse.json({ error: "Prospect non trovato" }, { status: 404 })
  }
  if (prospect.assigned_agent_id === agent.id) {
    return NextResponse.json({ error: "Questo prospect e' gia' assegnato a te" }, { status: 409 })
  }
  if (prospect.assigned_agent_id) {
    return NextResponse.json(
      { error: "Questo prospect e' gia' assegnato ad un altro venditore" },
      { status: 409 },
    )
  }

  // 2. Verifica richieste pending esistenti
  const { data: existing } = await service
    .from("prospect_assignment_requests")
    .select("id, status")
    .eq("agent_id", agent.id)
    .eq("prospect_id", prospectId)
    .eq("status", "pending")
    .maybeSingle()
  if (existing) {
    return NextResponse.json(
      { error: "Hai gia' una richiesta in attesa per questo prospect", request_id: existing.id },
      { status: 409 },
    )
  }

  // 3. Insert
  const { data: created, error: insertError } = await service
    .from("prospect_assignment_requests")
    .insert({
      prospect_id: prospectId,
      agent_id: agent.id,
      message,
      status: "pending",
    })
    .select("id, prospect_id, status, message, created_at")
    .single()

  if (insertError) {
    console.error("[request-assignment] INSERT error:", insertError)
    // 23505 unique violation: corrisponde all'index parziale, gia' gestito sopra
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Notifica tutti i super_admin: nuova richiesta da approvare
  const adminUserIds = await getSuperAdminUserIds()
  if (adminUserIds.length > 0) {
    await notifyUsers(adminUserIds, {
      type: "assignment_request_pending",
      title: "Nuova richiesta di assegnazione",
      body: `${agent.display_name ?? "Un venditore"} ha richiesto l'assegnazione di ${prospect.name}.`,
      actionUrl: "/superadmin/assignment-requests",
    })
  }

  return NextResponse.json({ request: created })
}

/**
 * DELETE /api/sales/prospects/request-assignment?id=...
 * Cancella una propria richiesta pending (status -> 'cancelled'). Le richieste
 * gia' decise non possono essere cancellate.
 */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceRoleClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 })

  const { data: agent } = await service
    .from("sales_agents")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle()
  if (!agent) return NextResponse.json({ error: "Agente non trovato" }, { status: 404 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  if (!id) {
    return NextResponse.json({ error: "id obbligatorio" }, { status: 400 })
  }

  const { data: req, error: lookupError } = await service
    .from("prospect_assignment_requests")
    .select("id, agent_id, status")
    .eq("id", id)
    .maybeSingle()
  if (lookupError || !req) {
    return NextResponse.json({ error: "Richiesta non trovata" }, { status: 404 })
  }
  if (req.agent_id !== agent.id) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 })
  }
  if (req.status !== "pending") {
    return NextResponse.json(
      { error: "Solo le richieste pendenti possono essere annullate" },
      { status: 400 },
    )
  }

  const { error: updateError } = await service
    .from("prospect_assignment_requests")
    .update({ status: "cancelled", decided_at: new Date().toISOString() })
    .eq("id", id)
  if (updateError) {
    console.error("[request-assignment] DELETE error:", updateError)
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
