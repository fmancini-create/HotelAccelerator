import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireSuperadmin } from "@/lib/sales/superadmin-guard"

export const dynamic = "force-dynamic"

/**
 * GET /api/superadmin/sales/agents/[id]
 *
 * Dettaglio agente: dati base, strutture associate (con permessi e %),
 * commissioni nel ledger.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireSuperadmin()
  if ("error" in guard) return guard.error
  const { id } = await ctx.params

  const svc = await createServiceRoleClient()

  const [{ data: agent }, { data: associations }, { data: ledger }, { data: leads }] = await Promise.all([
    svc
      .from("sales_agents")
      .select("*, profiles:user_id (id, email, first_name, last_name)")
      .eq("id", id)
      .maybeSingle(),
    svc
      .from("sales_agent_hotels")
      .select(
        `
        id,
        hotel_id,
        commission_percentage,
        commission_basis,
        lead_status,
        can_view_subscription,
        can_view_payments,
        can_view_metrics,
        can_view_full_dashboard,
        attached_at,
        attached_via,
        activated_at,
        notes,
        hotels:hotel_id (id, name, is_active, organization_id)
      `,
      )
      .eq("sales_agent_id", id)
      .order("attached_at", { ascending: false }),
    svc
      .from("sales_commissions_ledger")
      .select("*")
      .eq("sales_agent_id", id)
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false }),
    svc
      .from("sales_leads")
      .select("id, first_name, last_name, email, hotel_name, phone, status, email_sent_at, registered_at, converted_at, created_at, source")
      .eq("sales_agent_id", id)
      .order("created_at", { ascending: false })
      .limit(200),
  ])

  if (!agent) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  return NextResponse.json({
    agent,
    associations: associations ?? [],
    ledger: ledger ?? [],
    leads: leads ?? [],
  })
}

/**
 * PATCH /api/superadmin/sales/agents/[id]
 *
 * Aggiorna i dati dell'agente: % default, permessi globali, attivo/disattivo,
 * note. NON modifica il profile.role (per quello c'e' /api/superadmin/users).
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireSuperadmin()
  if ("error" in guard) return guard.error
  const { id } = await ctx.params

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 })

  const allowed: Record<string, true> = {
    display_name: true,
    email: true,
    phone: true,
    default_commission_percentage: true,
    global_can_view_subscription: true,
    global_can_view_payments: true,
    global_can_view_metrics: true,
    global_can_view_full_dashboard: true,
    is_active: true,
    notes: true,
    // Identita' mittente CRM: alias @santaddeo.com verificato su Workspace da
    // cui partono le email del venditore (From). Vuoto = fallback noreply.
    sender_email: true,
    sender_name: true,
    // Hierarchy / area manager fields. Le validazioni "no multi-level" e
    // "parent_agent_id deve puntare a un is_area_manager=true" sono
    // applicate a livello DB tramite check constraint + trigger
    // (vedi migration sales_area_manager_hierarchy).
    is_area_manager: true,
    parent_agent_id: true,
    area_manager_override_pct: true,
  }
  const update: Record<string, any> = {}
  for (const k of Object.keys(body)) {
    if (allowed[k]) update[k] = body[k]
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no_updatable_fields" }, { status: 400 })
  }

  // Normalizzazione: stringa vuota -> null per parent_agent_id e override pct
  if (update.parent_agent_id === "") update.parent_agent_id = null
  if (update.area_manager_override_pct === "" || update.area_manager_override_pct === undefined) {
    if ("area_manager_override_pct" in update) update.area_manager_override_pct = null
  }

  // Coerenza: se l'agente diventa area_manager, parent_agent_id deve essere null.
  if (update.is_area_manager === true) {
    update.parent_agent_id = null
  }

  // Identita' mittente: normalizza e valida. Stringa vuota -> null (fallback
  // noreply). Se valorizzato, deve essere un indirizzo @santaddeo.com perche'
  // solo quel dominio e' inviabile in modo affidabile dal nostro SMTP.
  if ("sender_email" in update) {
    const raw = (update.sender_email ?? "").toString().trim().toLowerCase()
    if (!raw) {
      update.sender_email = null
    } else if (!/^[^\s@]+@santaddeo\.com$/.test(raw)) {
      return NextResponse.json(
        { error: "invalid_sender_email", message: "L'indirizzo mittente deve essere un @santaddeo.com." },
        { status: 400 },
      )
    } else {
      update.sender_email = raw
    }
  }
  if ("sender_name" in update) {
    const raw = (update.sender_name ?? "").toString().trim()
    update.sender_name = raw || null
  }

  const svc = await createServiceRoleClient()
  const { data: agent, error } = await svc
    .from("sales_agents")
    .update(update)
    .eq("id", id)
    .select()
    .single()

  if (error) {
    console.error("[superadmin/sales/agents/PATCH] error:", error)
    return NextResponse.json({ error: "db_error", details: error.message }, { status: 500 })
  }
  return NextResponse.json({ agent })
}

/**
 * DELETE /api/superadmin/sales/agents/[id]
 *
 * Elimina l'agente (CASCADE su sales_agent_hotels, sales_leads, ledger
 * via FK). Il profile rimane (role va manualmente cambiato dall'admin
 * users). Operazione distruttiva: richiede ?confirm=1.
 */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireSuperadmin()
  if ("error" in guard) return guard.error
  const { id } = await ctx.params
  const url = new URL(req.url)
  if (url.searchParams.get("confirm") !== "1") {
    return NextResponse.json({ error: "confirm_required" }, { status: 400 })
  }

  const svc = await createServiceRoleClient()
  const { error } = await svc.from("sales_agents").delete().eq("id", id)
  if (error) {
    console.error("[superadmin/sales/agents/DELETE] error:", error)
    return NextResponse.json({ error: "db_error", details: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
