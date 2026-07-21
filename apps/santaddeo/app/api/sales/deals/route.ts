import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"

export const dynamic = "force-dynamic"

// Stage con probabilità default
const STAGE_DEFAULTS: Record<string, number> = {
  lead: 10,
  contacted: 20,
  demo_scheduled: 40,
  demo_done: 50,
  proposal: 60,
  negotiation: 75,
  won: 100,
  lost: 0,
}

/**
 * GET /api/sales/deals
 * Lista deals per l'agente loggato (o tutti per superadmin)
 * Query params: ?stage=... (opzionale, filtra per stage)
 */
export async function GET(request: NextRequest) {
  const { user, supabase: authSupa } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { data: profile } = await authSupa
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single()

  const svc = await createServiceRoleClient()

  // Trova il sales_agent dell'utente
  const { data: agent } = await svc
    .from("sales_agents")
    .select("id, is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle()

  const isSuperAdmin = profile?.role === "super_admin"

  if (!isSuperAdmin && !agent) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const url = new URL(request.url)
  const stageFilter = url.searchParams.get("stage")
  const agentIdFilter = url.searchParams.get("agent_id") // solo per superadmin

  let query = svc
    .from("deals")
    .select(`
      *,
      agent:agent_id (id, display_name, email),
      hotel:hotel_id (id, name),
      lead:lead_id (id, name, email),
      prospect:prospect_id (id, name, city, region, status)
    `)
    .order("last_activity_at", { ascending: false })

  // Filtro per agente: superadmin vede tutti o filtra, agent vede solo i suoi
  if (isSuperAdmin && agentIdFilter) {
    query = query.eq("agent_id", agentIdFilter)
  } else if (!isSuperAdmin && agent) {
    query = query.eq("agent_id", agent.id)
  }

  // Filtro per stage
  if (stageFilter) {
    query = query.eq("stage", stageFilter)
  }

  const { data: deals, error } = await query

  if (error) {
    console.error("[sales/deals] GET error:", error)
    return NextResponse.json({ error: "db_error" }, { status: 500 })
  }

  // Calcola KPI pipeline
  const activeDeals = (deals || []).filter(d => !["won", "lost"].includes(d.stage))
  const pipelineTotal = activeDeals.reduce((sum, d) => sum + (Number(d.estimated_value) || 0), 0)
  const pipelineWeighted = activeDeals.reduce((sum, d) => {
    const value = Number(d.estimated_value) || 0
    const prob = Number(d.probability) || 0
    return sum + (value * prob / 100)
  }, 0)

  // Conversion rate ultimi 90gg
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
  const closedRecent = (deals || []).filter(d => 
    ["won", "lost"].includes(d.stage) && 
    d.closed_at && 
    new Date(d.closed_at) >= ninetyDaysAgo
  )
  const wonRecent = closedRecent.filter(d => d.stage === "won").length
  const conversionRate = closedRecent.length > 0 
    ? Math.round((wonRecent / closedRecent.length) * 100) 
    : 0

  return NextResponse.json({
    deals: deals || [],
    kpi: {
      pipeline_total: Math.round(pipelineTotal * 100) / 100,
      pipeline_weighted: Math.round(pipelineWeighted * 100) / 100,
      deals_active: activeDeals.length,
      conversion_rate_90d: conversionRate,
    },
  })
}

/**
 * POST /api/sales/deals
 * Crea nuovo deal
 */
export async function POST(request: NextRequest) {
  const { user, supabase: authSupa } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { data: profile } = await authSupa
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single()

  const svc = await createServiceRoleClient()

  // Trova il sales_agent dell'utente
  const { data: agent } = await svc
    .from("sales_agents")
    .select("id, is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle()

  const isSuperAdmin = profile?.role === "super_admin"

  if (!isSuperAdmin && !agent) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const body = await request.json()

  // Validazione
  if (!body.prospect_name?.trim()) {
    return NextResponse.json({ error: "prospect_name è obbligatorio" }, { status: 400 })
  }

  // Per superadmin che crea per un altro agente
  let targetAgentId = agent?.id
  if (isSuperAdmin && body.agent_id) {
    targetAgentId = body.agent_id
  }

  if (!targetAgentId) {
    return NextResponse.json({ error: "agent_id non determinato" }, { status: 400 })
  }

  const stage = body.stage || "lead"
  const defaultProbability = STAGE_DEFAULTS[stage] ?? 10

  // Se è collegato a un prospect, verifica che esista e (se non superadmin) sia assegnato all'agent
  if (body.prospect_id) {
    const { data: prospectCheck } = await svc
      .from("prospects")
      .select("id, assigned_agent_id")
      .eq("id", body.prospect_id)
      .maybeSingle()
    if (!prospectCheck) {
      return NextResponse.json({ error: "prospect_not_found" }, { status: 400 })
    }
    if (!isSuperAdmin && prospectCheck.assigned_agent_id && prospectCheck.assigned_agent_id !== agent?.id) {
      return NextResponse.json({ error: "prospect_not_assigned_to_you" }, { status: 403 })
    }
  }

  const { data: deal, error } = await svc
    .from("deals")
    .insert({
      agent_id: targetAgentId,
      hotel_id: body.hotel_id || null,
      lead_id: body.lead_id || null,
      prospect_id: body.prospect_id || null,
      prospect_name: body.prospect_name.trim(),
      prospect_email: body.prospect_email?.trim() || null,
      prospect_phone: body.prospect_phone?.trim() || null,
      prospect_hotel_name: body.prospect_hotel_name?.trim() || null,
      prospect_rooms: body.prospect_rooms || null,
      prospect_stars: body.prospect_stars || null,
      prospect_location: body.prospect_location?.trim() || null,
      stage,
      estimated_value: body.estimated_value || null,
      probability: body.probability ?? defaultProbability,
      expected_close_date: body.expected_close_date || null,
      next_follow_up_date: body.next_follow_up_date || null,
      notes: body.notes?.trim() || null,
    })
    .select()
    .single()

  if (error) {
    console.error("[sales/deals] POST error:", error)
    return NextResponse.json({ error: "db_error", details: error.message }, { status: 500 })
  }

  // Se il deal è collegato a un prospect, marca il prospect come "in_negotiation"
  // (a meno che non sia già won/lost). Aggiorna anche last_contact_at.
  if (deal.prospect_id) {
    const { data: currentProspect } = await svc
      .from("prospects")
      .select("status")
      .eq("id", deal.prospect_id)
      .maybeSingle()
    if (currentProspect && !["won", "lost"].includes(currentProspect.status || "")) {
      const { error: updErr } = await svc
        .from("prospects")
        .update({ status: "in_negotiation", last_contact_at: new Date().toISOString() })
        .eq("id", deal.prospect_id)
      if (updErr) {
        console.error("[sales/deals] prospect status sync error on create:", updErr.message)
      }
    }
  }

  return NextResponse.json({ deal })
}
