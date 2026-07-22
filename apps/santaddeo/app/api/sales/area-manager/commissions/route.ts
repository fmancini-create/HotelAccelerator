import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"

export const dynamic = "force-dynamic"

/**
 * GET /api/sales/area-manager/commissions
 *
 * Ledger override del capo area corrente. Ritorna:
 *  - kpi: pending / paid / mese corrente / ultimi 12 mesi
 *  - by_month: breakdown mensile
 *  - ledger: righe sales_area_manager_commissions con nome agente sorgente
 *
 * Filtri opzionali:
 *  - ?status=pending|paid|voided
 *  - ?source_agent_id=<uuid>
 *  - ?from=YYYY-MM
 *  - ?to=YYYY-MM
 */
export async function GET(request: Request) {
  const { user, supabase: authSupa } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { data: profile } = await authSupa
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single()

  const svc = await createServiceRoleClient()
  const url = new URL(request.url)
  const override = url.searchParams.get("area_manager_id")

  let areaManagerId: string | null = null
  if (profile?.role === "super_admin" && override) {
    areaManagerId = override
  } else {
    const { data: me } = await svc
      .from("sales_agents")
      .select("id, is_area_manager, is_active")
      .eq("user_id", user.id)
      .maybeSingle()
    if (!me || !me.is_active || !me.is_area_manager) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }
    areaManagerId = me.id
  }

  const statusFilter = url.searchParams.get("status")
  const sourceAgentFilter = url.searchParams.get("source_agent_id")
  const fromMonth = url.searchParams.get("from")
  const toMonth = url.searchParams.get("to")

  let q = svc
    .from("sales_area_manager_commissions")
    .select(
      "id, source_agent_id, source_ledger_entry_id, hotel_id, period_year, period_month, source_amount_eur, override_percentage, amount_eur, currency, status, paid_at, voided_at, voided_reason, created_at",
    )
    .eq("area_manager_id", areaManagerId)
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false })

  if (statusFilter && ["pending", "paid", "voided"].includes(statusFilter)) {
    q = q.eq("status", statusFilter)
  }
  if (sourceAgentFilter) q = q.eq("source_agent_id", sourceAgentFilter)
  if (fromMonth) {
    const [y, m] = fromMonth.split("-").map((n) => Number.parseInt(n, 10))
    if (!Number.isNaN(y) && !Number.isNaN(m)) {
      q = q.or(
        `period_year.gt.${y},and(period_year.eq.${y},period_month.gte.${m})`,
      )
    }
  }
  if (toMonth) {
    const [y, m] = toMonth.split("-").map((n) => Number.parseInt(n, 10))
    if (!Number.isNaN(y) && !Number.isNaN(m)) {
      q = q.or(
        `period_year.lt.${y},and(period_year.eq.${y},period_month.lte.${m})`,
      )
    }
  }

  const { data: rows, error } = await q.range(0, 1999)
  if (error) {
    console.error("[area-manager/commissions] db error:", error)
    return NextResponse.json({ error: "db_error" }, { status: 500 })
  }

  const ledger = rows ?? []

  // Risolvi i nomi agenti sorgente + hotel in batch
  const agentIds = [...new Set(ledger.map((r) => r.source_agent_id))] as string[]
  const hotelIds = [...new Set(ledger.map((r) => r.hotel_id))] as string[]
  const [agentsRes, hotelsRes] = await Promise.all([
    agentIds.length > 0
      ? svc.from("sales_agents").select("id, display_name").in("id", agentIds)
      : Promise.resolve({ data: [] as Array<{ id: string; display_name: string | null }> }),
    hotelIds.length > 0
      ? svc.from("hotels").select("id, name").in("id", hotelIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
  ])
  const agentsById = Object.fromEntries(
    (agentsRes.data ?? []).map((a) => [a.id, a.display_name ?? "(senza nome)"]),
  )
  const hotelsById = Object.fromEntries(
    (hotelsRes.data ?? []).map((h) => [h.id, h.name]),
  )

  // KPI aggregati (su TUTTO, ignorando i filtri per consistenza)
  const { data: all } = await svc
    .from("sales_area_manager_commissions")
    .select("amount_eur, status, period_year, period_month")
    .eq("area_manager_id", areaManagerId)
    .range(0, 9999)

  const now = new Date()
  const curY = now.getUTCFullYear()
  const curM = now.getUTCMonth() + 1
  let totalPending = 0
  let totalPaid = 0
  let monthCurrent = 0
  let last12 = 0
  const monthlyMap = new Map<string, { pending: number; paid: number; total: number }>()
  const cutoff12 = new Date(now)
  cutoff12.setUTCMonth(cutoff12.getUTCMonth() - 11)

  for (const r of (all ?? []) as any[]) {
    const amt = Number(r.amount_eur ?? 0)
    if (r.status === "paid") totalPaid += amt
    else if (r.status === "pending") totalPending += amt
    if (r.status !== "voided") {
      if (r.period_year === curY && r.period_month === curM) monthCurrent += amt
      const rowDate = new Date(Date.UTC(r.period_year, r.period_month - 1, 1))
      if (rowDate >= cutoff12) last12 += amt
    }
    const key = `${r.period_year}-${String(r.period_month).padStart(2, "0")}`
    const cur = monthlyMap.get(key) ?? { pending: 0, paid: 0, total: 0 }
    if (r.status === "paid") cur.paid += amt
    else if (r.status === "pending") cur.pending += amt
    if (r.status !== "voided") cur.total += amt
    monthlyMap.set(key, cur)
  }

  const by_month = [...monthlyMap.entries()]
    .map(([key, v]) => ({
      key,
      year: Number.parseInt(key.split("-")[0]!, 10),
      month: Number.parseInt(key.split("-")[1]!, 10),
      pending: round2(v.pending),
      paid: round2(v.paid),
      total: round2(v.total),
    }))
    .sort((a, b) => (a.key < b.key ? 1 : -1))
    .slice(0, 24)

  return NextResponse.json({
    kpi: {
      total_pending_eur: round2(totalPending),
      total_paid_eur: round2(totalPaid),
      month_current_eur: round2(monthCurrent),
      last_12_months_eur: round2(last12),
    },
    by_month,
    ledger: ledger.map((r) => ({
      id: r.id,
      source_agent_id: r.source_agent_id,
      source_agent_name: agentsById[r.source_agent_id] ?? "(agente rimosso)",
      hotel_id: r.hotel_id,
      hotel_name: hotelsById[r.hotel_id] ?? "(struttura rimossa)",
      period_year: r.period_year,
      period_month: r.period_month,
      source_amount_eur: Number(r.source_amount_eur ?? 0),
      override_percentage: Number(r.override_percentage ?? 0),
      amount_eur: Number(r.amount_eur ?? 0),
      currency: r.currency,
      status: r.status,
      paid_at: r.paid_at,
      voided_at: r.voided_at,
      voided_reason: r.voided_reason,
      created_at: r.created_at,
    })),
  })
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}
