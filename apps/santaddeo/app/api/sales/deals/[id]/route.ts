import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"

export const dynamic = "force-dynamic"

/**
 * GET /api/sales/deals/[id]
 * Dettaglio singolo deal
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { user, supabase: authSupa } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { data: profile } = await authSupa
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single()

  const svc = await createServiceRoleClient()

  const { data: agent } = await svc
    .from("sales_agents")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle()

  const isSuperAdmin = profile?.role === "super_admin"

  const { data: deal, error } = await svc
    .from("deals")
    .select(`
      *,
      agent:agent_id (id, display_name, email),
      hotel:hotel_id (id, name),
      lead:lead_id (id, name, email),
      prospect:prospect_id (id, name, city, region, status)
    `)
    .eq("id", id)
    .single()

  if (error || !deal) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  // Check permessi: superadmin o owner
  if (!isSuperAdmin && deal.agent_id !== agent?.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  return NextResponse.json({ deal })
}

/**
 * PATCH /api/sales/deals/[id]
 * Aggiorna deal (tutti i campi)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { user, supabase: authSupa } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { data: profile } = await authSupa
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single()

  const svc = await createServiceRoleClient()

  const { data: agent } = await svc
    .from("sales_agents")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle()

  const isSuperAdmin = profile?.role === "super_admin"

  // Verifica esistenza e permessi (carica anche stage e prospect_id per il sync prospect)
  const { data: existing } = await svc
    .from("deals")
    .select("id, agent_id, stage, prospect_id")
    .eq("id", id)
    .single()

  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  if (!isSuperAdmin && existing.agent_id !== agent?.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const body = await request.json()

  // Costruisci oggetto update con solo i campi passati
  const updates: Record<string, unknown> = {}

  const allowedFields = [
    "hotel_id", "lead_id", "prospect_id", "prospect_name", "prospect_email", "prospect_phone",
    "prospect_hotel_name", "prospect_rooms", "prospect_stars", "prospect_location",
    "stage", "estimated_value", "probability", "expected_close_date",
    "next_follow_up_date", "lost_reason", "notes",
  ]

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field]
    }
  }

  // Se c'è un'azione, aggiorna last_activity_at
  if (Object.keys(updates).length > 0) {
    updates.last_activity_at = new Date().toISOString()
  }

  const { data: deal, error } = await svc
    .from("deals")
    .update(updates)
    .eq("id", id)
    .select(`
      *,
      agent:agent_id (id, display_name, email),
      hotel:hotel_id (id, name),
      lead:lead_id (id, name, email),
      prospect:prospect_id (id, name, city, region, status)
    `)
    .single()

  if (error) {
    console.error("[sales/deals] PATCH error:", error)
    return NextResponse.json({ error: "db_error", details: error.message }, { status: 500 })
  }

  // Auto-sync stato prospect collegato in base allo stage del deal
  await syncProspectStatusFromDeal(svc, existing.prospect_id || (updates.prospect_id as string | null), existing.stage, deal.stage)

  return NextResponse.json({ deal })
}

/**
 * Sincronizza lo stato del prospect quando lo stage del deal cambia.
 * - won → prospect.status = "won" (cliente acquisito)
 * - lost → prospect.status = "lost" (perso)
 * - altri stage attivi → prospect.status = "in_negotiation"
 * Non scrive nulla se nessun prospect collegato o se lo stato è già quello target.
 */
async function syncProspectStatusFromDeal(
  svc: ReturnType<typeof createServiceRoleClient> extends Promise<infer T> ? T : never,
  prospectId: string | null | undefined,
  previousStage: string | null,
  newStage: string | null,
) {
  if (!prospectId || !newStage || previousStage === newStage) return

  let targetStatus: string | null = null
  if (newStage === "won") targetStatus = "won"
  else if (newStage === "lost") targetStatus = "lost"
  else if (["contacted", "demo_scheduled", "demo_done", "proposal", "negotiation"].includes(newStage)) {
    targetStatus = "in_negotiation"
  }
  if (!targetStatus) return

  const { data: current } = await svc
    .from("prospects")
    .select("status")
    .eq("id", prospectId)
    .maybeSingle()
  if (!current || current.status === targetStatus) return

  const { error: updErr } = await svc
    .from("prospects")
    .update({ status: targetStatus, last_contact_at: new Date().toISOString() })
    .eq("id", prospectId)
  if (updErr) {
    console.error("[sales/deals] syncProspectStatusFromDeal error:", updErr.message)
  }
}

// Esporta helper per usarlo anche dall'endpoint stage
export { syncProspectStatusFromDeal }

/**
 * DELETE /api/sales/deals/[id]
 * Elimina deal
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { user, supabase: authSupa } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { data: profile } = await authSupa
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single()

  const svc = await createServiceRoleClient()

  const { data: agent } = await svc
    .from("sales_agents")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle()

  const isSuperAdmin = profile?.role === "super_admin"

  // Verifica esistenza e permessi
  const { data: existing } = await svc
    .from("deals")
    .select("id, agent_id")
    .eq("id", id)
    .single()

  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  if (!isSuperAdmin && existing.agent_id !== agent?.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const { error } = await svc
    .from("deals")
    .delete()
    .eq("id", id)

  if (error) {
    console.error("[sales/deals] DELETE error:", error)
    return NextResponse.json({ error: "db_error" }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
