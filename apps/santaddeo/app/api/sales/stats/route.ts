import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"

export const dynamic = "force-dynamic"

/**
 * GET /api/sales/stats
 *
 * Statistiche aggregate per il venditore corrente. Una sola call ritorna
 * tutte le serie/aggregazioni necessarie alla pagina /sales/stats per
 * evitare 6+ round-trip dal client. Le query usano `count: "exact", head: true`
 * dove possibile (no PostgREST 1000-cap, vedi memoria stats prospects).
 *
 * Permessi: come /api/sales/dashboard. Super_admin puo' passare ?agent_id=
 * per ispezionare le stats di uno specifico venditore.
 *
 * Filtri: ?period=1m|3m|6m|12m (default 3m). Il filtro impatta solo le
 * "metriche di periodo" (deal won, attivita' per settimana, commissioni).
 * Le metriche di stato corrente (prospect totali, deal aperti per stage)
 * sono sempre live.
 */
export async function GET(request: Request) {
  const { user, supabase: authSupa } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { data: profile } = await authSupa
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single()

  if (!profile || (profile.role !== "sales_agent" && profile.role !== "super_admin")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const svc = await createServiceRoleClient()
  const { searchParams } = new URL(request.url)
  const periodParam = (searchParams.get("period") ?? "3m").toLowerCase()
  const monthsBack =
    periodParam === "1m" ? 1 : periodParam === "6m" ? 6 : periodParam === "12m" ? 12 : 3

  // Risoluzione agente: super_admin puo' passare ?agent_id, altrimenti
  // si usa l'agent_id legato all'utente.
  let agentId: string | null = null
  if (profile.role === "super_admin") {
    const requested = searchParams.get("agent_id")
    if (requested) {
      const { data: agentRow } = await svc
        .from("sales_agents")
        .select("id")
        .eq("id", requested)
        .maybeSingle()
      if (agentRow) agentId = agentRow.id
    }
  }
  if (!agentId) {
    const { data: ownAgent } = await svc
      .from("sales_agents")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle()
    agentId = ownAgent?.id ?? null
  }
  if (!agentId) {
    return NextResponse.json({ error: "agent_not_found" }, { status: 404 })
  }

  const now = new Date()
  const periodStart = new Date(now)
  periodStart.setMonth(periodStart.getMonth() - monthsBack)
  const periodStartIso = periodStart.toISOString()

  // === KPI count-only (head:true: niente data transfer, niente cap 1000) ===
  const [
    prospectTotalRes,
    prospectByStatusRes,
    dealsOpenRes,
    dealsWonPeriodRes,
    dealsLostPeriodRes,
    activitiesPeriodRes,
    tasksPendingRes,
    tasksCompletedPeriodRes,
  ] = await Promise.all([
    svc
      .from("prospects")
      .select("*", { count: "exact", head: true })
      .eq("assigned_agent_id", agentId),
    svc
      .from("prospects")
      .select("status")
      .eq("assigned_agent_id", agentId)
      .limit(5000),
    svc
      .from("deals")
      .select("id, stage, estimated_value, created_at")
      .eq("agent_id", agentId)
      .not("stage", "in", "(won,lost)")
      .limit(2000),
    svc
      .from("deals")
      .select("id, estimated_value, closed_at")
      .eq("agent_id", agentId)
      .eq("stage", "won")
      .gte("closed_at", periodStartIso)
      .limit(2000),
    svc
      .from("deals")
      .select("id")
      .eq("agent_id", agentId)
      .eq("stage", "lost")
      .gte("closed_at", periodStartIso)
      .limit(2000),
    svc
      .from("prospect_activities")
      .select("id, type, happened_at")
      .eq("agent_id", agentId)
      .is("task_status", null)
      .gte("happened_at", periodStartIso)
      .limit(5000),
    svc
      .from("prospect_activities")
      .select("*", { count: "exact", head: true })
      .eq("agent_id", agentId)
      .eq("task_status", "pending"),
    svc
      .from("prospect_activities")
      .select("*", { count: "exact", head: true })
      .eq("agent_id", agentId)
      .eq("task_status", "done")
      .gte("completed_at", periodStartIso),
  ])

  // Distribuzione prospect per stato
  const prospectByStatus: Record<string, number> = {}
  for (const row of prospectByStatusRes.data ?? []) {
    const k = row.status ?? "unknown"
    prospectByStatus[k] = (prospectByStatus[k] ?? 0) + 1
  }

  // Distribuzione deal aperti per stage + somma estimated_value
  const dealsByStage: Record<string, { count: number; value: number }> = {}
  for (const d of dealsOpenRes.data ?? []) {
    const k = d.stage ?? "unknown"
    if (!dealsByStage[k]) dealsByStage[k] = { count: 0, value: 0 }
    dealsByStage[k].count += 1
    dealsByStage[k].value += Number(d.estimated_value ?? 0)
  }

  // Activity per settimana (ISO week, ultime 8 settimane)
  // Indipendentemente dal periodo selezionato, la timeline attivita' resta a
  // 8 settimane per leggibilita' del grafico.
  const eightWeeksAgo = new Date(now)
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 7 * 8)
  const eightWeeksAgoIso = eightWeeksAgo.toISOString()

  const { data: activities8w } = await svc
    .from("prospect_activities")
    .select("type, happened_at")
    .eq("agent_id", agentId)
    .is("task_status", null)
    .gte("happened_at", eightWeeksAgoIso)
    .limit(5000)

  // Costruisco le 8 settimane (luned\u00ec come inizio settimana)
  const activitiesByWeek: Array<{
    week: string
    label: string
    call: number
    email: number
    visit: number
    meeting: number
    note: number
  }> = []
  for (let i = 7; i >= 0; i--) {
    const ws = new Date(now)
    ws.setDate(ws.getDate() - 7 * i)
    // Sposta a luned\u00ec
    const day = ws.getDay() || 7
    ws.setDate(ws.getDate() - (day - 1))
    ws.setHours(0, 0, 0, 0)
    const weekKey = ws.toISOString().slice(0, 10)
    activitiesByWeek.push({
      week: weekKey,
      label: `${ws.getDate()}/${String(ws.getMonth() + 1).padStart(2, "0")}`,
      call: 0,
      email: 0,
      visit: 0,
      meeting: 0,
      note: 0,
    })
  }
  for (const a of activities8w ?? []) {
    const d = new Date(a.happened_at as string)
    const day = d.getDay() || 7
    d.setDate(d.getDate() - (day - 1))
    d.setHours(0, 0, 0, 0)
    const key = d.toISOString().slice(0, 10)
    const bucket = activitiesByWeek.find((b) => b.week === key)
    if (bucket && (a.type as keyof typeof bucket) in bucket) {
      ;(bucket as any)[a.type as string] += 1
    }
  }

  // === MRR cumulato dalle strutture attivate dell'agente (12 mesi) ===
  // sales_agent_hotels.activated_at indica quando la struttura passa a "attiva"
  // grazie a quel venditore. Sommando estimated_value (o un proxy) per mese
  // si ottiene un MRR cumulato.
  const twelveMonthsAgo = new Date(now)
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
  twelveMonthsAgo.setDate(1)
  twelveMonthsAgo.setHours(0, 0, 0, 0)

  const { data: agentHotels } = await svc
    .from("sales_agent_hotels")
    .select("hotel_id, activated_at, attached_at, lead_status")
    .eq("sales_agent_id", agentId)
    .not("activated_at", "is", null)
    .gte("activated_at", twelveMonthsAgo.toISOString())
    .limit(1000)

  // Carico i piani delle strutture attive dell'agente per stimare MRR
  const hotelIds = Array.from(new Set((agentHotels ?? []).map((h) => h.hotel_id).filter(Boolean)))
  let hotelMrrMap: Record<string, number> = {}
  if (hotelIds.length > 0) {
    const { data: subs } = await svc
      .from("accelerator_subscriptions")
      .select("hotel_id, monthly_fee, status")
      .in("hotel_id", hotelIds as string[])
      .eq("status", "active")
      .limit(2000)
    for (const s of subs ?? []) {
      hotelMrrMap[s.hotel_id as string] = Number(s.monthly_fee ?? 0)
    }
  }

  // Costruisco serie 12 mesi: per ciascun mese, MRR cumulato delle strutture
  // attivate fino a quel mese (incluso).
  const mrrByMonth: Array<{ month: string; label: string; mrr: number; new_count: number }> = []
  for (let i = 11; i >= 0; i--) {
    const ms = new Date(now)
    ms.setMonth(ms.getMonth() - i)
    ms.setDate(1)
    ms.setHours(0, 0, 0, 0)
    const me = new Date(ms)
    me.setMonth(me.getMonth() + 1)
    const monthKey = `${ms.getFullYear()}-${String(ms.getMonth() + 1).padStart(2, "0")}`
    const monthLabel = ms.toLocaleDateString("it-IT", { month: "short", year: "2-digit" })
    let cumulative = 0
    let newThisMonth = 0
    for (const h of agentHotels ?? []) {
      const a = new Date(h.activated_at as string)
      if (a < me) cumulative += hotelMrrMap[h.hotel_id as string] ?? 0
      if (a >= ms && a < me) newThisMonth += 1
    }
    mrrByMonth.push({
      month: monthKey,
      label: monthLabel,
      mrr: Math.round(cumulative * 100) / 100,
      new_count: newThisMonth,
    })
  }

  // === Commissioni per mese (12 mesi) ===
  const { data: commissions } = await svc
    .from("sales_commissions_ledger")
    .select("amount_eur, status, period_year, period_month")
    .eq("sales_agent_id", agentId)
    .gte("period_start", twelveMonthsAgo.toISOString().slice(0, 10))
    .limit(2000)

  // 4 stati: accrued (maturata) | earned (liquidabile) | paid (liquidata)
  // | voided (annullata). Per il grafico mostriamo paid, earned e accrued
  // come 3 livelli stacked (dal piu' "sicuro" al piu' "rischioso").
  const commissionsByMonth: Array<{
    month: string
    label: string
    paid: number
    earned: number
    accrued: number
    // pending = earned + accrued, retrocompat con l'attuale UI
    pending: number
  }> = []
  for (let i = 11; i >= 0; i--) {
    const ms = new Date(now)
    ms.setMonth(ms.getMonth() - i)
    const monthKey = `${ms.getFullYear()}-${String(ms.getMonth() + 1).padStart(2, "0")}`
    const monthLabel = ms.toLocaleDateString("it-IT", { month: "short", year: "2-digit" })
    let paid = 0
    let earned = 0
    let accrued = 0
    for (const c of commissions ?? []) {
      if (c.period_year === ms.getFullYear() && c.period_month === ms.getMonth() + 1) {
        const amt = Number(c.amount_eur ?? 0)
        if (c.status === "paid") paid += amt
        else if (c.status === "earned") earned += amt
        else if (c.status === "accrued") accrued += amt
      }
    }
    commissionsByMonth.push({
      month: monthKey,
      label: monthLabel,
      paid: Math.round(paid * 100) / 100,
      earned: Math.round(earned * 100) / 100,
      accrued: Math.round(accrued * 100) / 100,
      pending: Math.round((earned + accrued) * 100) / 100,
    })
  }

  // === Top prospect "stale": senza contatto da piu' di 30gg ===
  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const { data: staleProspects } = await svc
    .from("prospects")
    .select("id, name, city, last_contact_at, status")
    .eq("assigned_agent_id", agentId)
    .or(
      `last_contact_at.is.null,last_contact_at.lt.${thirtyDaysAgo.toISOString()}`,
    )
    .neq("status", "lost")
    .order("last_contact_at", { ascending: true, nullsFirst: true })
    .limit(8)

  // === Aggregati per KPI ===
  const dealsWonCount = (dealsWonPeriodRes.data ?? []).length
  const dealsWonValue = (dealsWonPeriodRes.data ?? []).reduce(
    (a: number, d: any) => a + Number(d.estimated_value ?? 0),
    0,
  )
  const dealsLostCount = (dealsLostPeriodRes.data ?? []).length
  const totalClosedCount = dealsWonCount + dealsLostCount
  const winRate = totalClosedCount > 0 ? dealsWonCount / totalClosedCount : 0

  const activitiesPeriodCount = (activitiesPeriodRes.data ?? []).length
  const activitiesByType: Record<string, number> = {}
  for (const a of activitiesPeriodRes.data ?? []) {
    activitiesByType[a.type] = (activitiesByType[a.type] ?? 0) + 1
  }

  const dealsOpenCount = (dealsOpenRes.data ?? []).length
  const dealsOpenValue = (dealsOpenRes.data ?? []).reduce(
    (a: number, d: any) => a + Number(d.estimated_value ?? 0),
    0,
  )

  // Tasso conversione prospect -> won (sui prospect totali assegnati)
  const prospectTotal = prospectTotalRes.count ?? 0
  const conversionRate = prospectTotal > 0 ? dealsWonCount / prospectTotal : 0

  return NextResponse.json({
    period: { months: monthsBack, from: periodStartIso, to: now.toISOString() },
    agent_id: agentId,
    kpi: {
      prospect_total: prospectTotal,
      deals_open_count: dealsOpenCount,
      deals_open_value: Math.round(dealsOpenValue * 100) / 100,
      deals_won_count: dealsWonCount,
      deals_won_value: Math.round(dealsWonValue * 100) / 100,
      deals_lost_count: dealsLostCount,
      win_rate: Math.round(winRate * 1000) / 1000,
      conversion_rate: Math.round(conversionRate * 1000) / 1000,
      activities_count: activitiesPeriodCount,
      tasks_pending: tasksPendingRes.count ?? 0,
      tasks_completed_period: tasksCompletedPeriodRes.count ?? 0,
      mrr_current: mrrByMonth[mrrByMonth.length - 1]?.mrr ?? 0,
    },
    prospect_by_status: prospectByStatus,
    deals_by_stage: dealsByStage,
    activities_by_type: activitiesByType,
    activities_by_week: activitiesByWeek,
    mrr_by_month: mrrByMonth,
    commissions_by_month: commissionsByMonth,
    stale_prospects: staleProspects ?? [],
  })
}
