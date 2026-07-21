import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"

export const dynamic = "force-dynamic"

/**
 * GET /api/sales/area-manager/team/[agentId]
 *
 * Drill-down read-only sui dati di un agente del team del capo area
 * corrente. Ritorna prospects, hotels associati e ledger commissioni
 * dell'agente specificato.
 *
 * Sicurezza: l'agentId richiesto DEVE avere parent_agent_id === capo area
 * corrente, altrimenti 403. Il super_admin puo' bypassare con
 * ?as_area_manager=<uuid> per impersonation.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params
  const { user, supabase: authSupa } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { data: profile } = await authSupa
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single()

  const svc = await createServiceRoleClient()
  const url = new URL(request.url)
  const asAreaManager = url.searchParams.get("as_area_manager")

  // Risolvi il capo area che sta chiedendo
  let callerAreaManagerId: string | null = null
  if (profile?.role === "super_admin" && asAreaManager) {
    callerAreaManagerId = asAreaManager
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

  // Verifica che l'agente richiesto faccia parte del team del capo area
  const { data: targetAgent } = await svc
    .from("sales_agents")
    .select("id, display_name, email, parent_agent_id, default_commission_percentage, is_active, created_at")
    .eq("id", agentId)
    .maybeSingle()

  if (!targetAgent) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }
  if (targetAgent.parent_agent_id !== callerAreaManagerId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  // Prospects assegnati all'agente
  const { data: prospects } = await svc
    .from("prospects")
    .select("id, name, city, province, region, stars, rooms_count, status, last_contact_at, assignment_date")
    .eq("assigned_agent_id", agentId)
    .order("updated_at", { ascending: false })
    .range(0, 499)

  // Hotels associati
  const { data: hotelLinks } = await svc
    .from("sales_agent_hotels")
    .select("hotel_id, lead_status, commission_percentage, activated_at, created_at, hotels:hotel_id(id, name, is_active)")
    .eq("sales_agent_id", agentId)
    .order("created_at", { ascending: false })

  const hotels = (hotelLinks ?? []).map((a: any) => ({
    hotel_id: a.hotel_id,
    hotel_name: a.hotels?.name ?? "(senza nome)",
    is_active: a.hotels?.is_active ?? false,
    lead_status: a.lead_status,
    commission_percentage: a.commission_percentage,
    activated_at: a.activated_at,
    created_at: a.created_at,
  }))

  // Ledger commissioni
  const { data: ledger } = await svc
    .from("sales_commissions_ledger")
    .select(
      "id, hotel_id, period_year, period_month, period_start, base_amount_eur, commission_percentage, amount_eur, status, accrued_at, earned_at, paid_at, voided_at",
    )
    .eq("sales_agent_id", agentId)
    .order("period_start", { ascending: false })
    .range(0, 999)

  const ledgerHotelIds = [...new Set((ledger ?? []).map((r) => r.hotel_id))] as string[]
  let hotelNamesById: Record<string, string> = {}
  if (ledgerHotelIds.length > 0) {
    const { data: hs } = await svc.from("hotels").select("id, name").in("id", ledgerHotelIds)
    hotelNamesById = Object.fromEntries((hs ?? []).map((h) => [h.id, h.name]))
  }

  // KPI aggregati
  let totalAccrued = 0
  let totalEarned = 0
  let totalPaid = 0
  for (const r of ledger ?? []) {
    const amt = Number(r.amount_eur ?? 0)
    if (r.status === "paid") totalPaid += amt
    else if (r.status === "earned") totalEarned += amt
    else if (r.status === "accrued") totalAccrued += amt
  }

  return NextResponse.json({
    agent: {
      id: targetAgent.id,
      display_name: targetAgent.display_name,
      email: targetAgent.email,
      default_commission_percentage: targetAgent.default_commission_percentage,
      is_active: targetAgent.is_active,
      created_at: targetAgent.created_at,
    },
    kpi: {
      prospects_count: (prospects ?? []).length,
      hotels_count: hotels.length,
      total_accrued_eur: round2(totalAccrued),
      total_earned_eur: round2(totalEarned),
      total_paid_eur: round2(totalPaid),
      total_maturato_eur: round2(totalAccrued + totalEarned + totalPaid),
    },
    prospects: (prospects ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      city: p.city,
      province: p.province,
      region: p.region,
      stars: p.stars,
      rooms_count: p.rooms_count,
      status: p.status,
      last_contact_at: p.last_contact_at,
      assignment_date: p.assignment_date,
    })),
    hotels,
    ledger: (ledger ?? []).map((r: any) => ({
      id: r.id,
      hotel_id: r.hotel_id,
      hotel_name: hotelNamesById[r.hotel_id] ?? "(struttura rimossa)",
      period_year: r.period_year,
      period_month: r.period_month,
      period_start: r.period_start,
      base_amount_eur: Number(r.base_amount_eur ?? 0),
      commission_percentage: Number(r.commission_percentage ?? 0),
      amount_eur: Number(r.amount_eur ?? 0),
      status: r.status,
      accrued_at: r.accrued_at,
      earned_at: r.earned_at,
      paid_at: r.paid_at,
      voided_at: r.voided_at,
    })),
  })
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}
