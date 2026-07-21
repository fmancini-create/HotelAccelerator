import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireSuperadmin } from "@/lib/sales/superadmin-guard"
import { fetchAllPaginatedOrLog } from "@/lib/supabase/paginate"

export const dynamic = "force-dynamic"

/**
 * GET /api/superadmin/sales/performance
 *
 * Mini-dashboard KPI venditori: una sola call ritorna, per ogni sales_agent,
 * i KPI piu' salienti per capire "chi lavora bene e chi no":
 *  - data registrazione, ultimo login, giorni dall'ultimo login
 *  - tot prospect assegnati / lavorati / convertiti
 *  - tot lead, strutture attivate, demo programmate
 *  - attivita' ultimi 30gg + giorni attivi (proxy "utilizzo piattaforma")
 *  - task in sospeso, deal aperti/vinti
 *  - uno score di engagement 0-100 trasparente (login + attivita' + lavoro)
 *
 * APPROCCIO: carichiamo le tabelle correlate una volta (paginando dove i
 * volumi possono superare il cap PostgREST di 1000 righe, es. prospects) e
 * aggreghiamo in JS per evitare N+1 query per-agente.
 */
export async function GET() {
  const guard = await requireSuperadmin()
  if ("error" in guard) return guard.error

  const svc = await createServiceRoleClient()

  const now = new Date()
  const since30 = new Date(now)
  since30.setDate(since30.getDate() - 30)
  const since7 = new Date(now)
  since7.setDate(since7.getDate() - 7)
  const since30Iso = since30.toISOString()

  // 1. Agenti + profile collegato (registrazione, ultimo login, stato).
  const { data: rawAgents, error: agErr } = await svc
    .from("sales_agents")
    .select(
      `id, user_id, display_name, email, default_commission_percentage,
       is_active, created_at,
       profiles:user_id (id, email, first_name, last_name, created_at, last_login_at, is_active)`,
    )
    .order("created_at", { ascending: true })

  if (agErr) {
    console.error("[superadmin/sales/performance] agents error:", agErr)
    return NextResponse.json({ error: "db_error", details: agErr.message }, { status: 500 })
  }

  const agents = rawAgents ?? []

  // 2. Tabelle correlate caricate una volta sola.
  //    prospects ~861 oggi (vicino al cap 1000) -> paginazione obbligatoria.
  const [prospectRows, leadRows, hotelRows, activityRows, demoRows, dealRows] =
    await Promise.all([
      fetchAllPaginatedOrLog<{
        assigned_agent_id: string | null
        status: string | null
        last_contact_at: string | null
      }>(
        () =>
          svc
            .from("prospects")
            .select("assigned_agent_id, status, last_contact_at")
            .not("assigned_agent_id", "is", null),
        "perf-prospects",
      ),
      svc
        .from("sales_leads")
        .select("sales_agent_id, converted_at")
        .then((r) => r.data ?? []),
      svc
        .from("sales_agent_hotels")
        .select("sales_agent_id, activated_at")
        .then((r) => r.data ?? []),
      svc
        .from("prospect_activities")
        .select("agent_id, happened_at, task_status, completed_at")
        .gte("happened_at", since30Iso)
        .then((r) => r.data ?? []),
      svc
        .from("demo_requests")
        .select("agent_id, status, created_at")
        .then((r) => r.data ?? []),
      svc
        .from("deals")
        .select("agent_id, stage")
        .then((r) => r.data ?? []),
    ])

  // 3. Indici di aggregazione per agent_id.
  type ProspectAgg = { total: number; worked: number; converted: number }
  const prospectByAgent = new Map<string, ProspectAgg>()
  for (const p of prospectRows) {
    const id = p.assigned_agent_id
    if (!id) continue
    const cur = prospectByAgent.get(id) ?? { total: 0, worked: 0, converted: 0 }
    cur.total += 1
    // "lavorato" = uscito dallo stato iniziale "assigned" oppure con un contatto.
    if ((p.status && p.status !== "assigned") || p.last_contact_at) cur.worked += 1
    if (p.status === "converted" || p.status === "won") cur.converted += 1
    prospectByAgent.set(id, cur)
  }

  const leadByAgent = new Map<string, { total: number; converted: number }>()
  for (const l of leadRows as any[]) {
    const id = l.sales_agent_id
    if (!id) continue
    const cur = leadByAgent.get(id) ?? { total: 0, converted: 0 }
    cur.total += 1
    if (l.converted_at) cur.converted += 1
    leadByAgent.set(id, cur)
  }

  const hotelByAgent = new Map<string, { total: number; activated: number }>()
  for (const h of hotelRows as any[]) {
    const id = h.sales_agent_id
    if (!id) continue
    const cur = hotelByAgent.get(id) ?? { total: 0, activated: 0 }
    cur.total += 1
    if (h.activated_at) cur.activated += 1
    hotelByAgent.set(id, cur)
  }

  // Attivita' ultimi 30gg: conteggio + giorni distinti attivi (proxy utilizzo).
  const activityByAgent = new Map<
    string,
    { count30: number; count7: number; activeDays: Set<string>; tasksDone30: number }
  >()
  for (const a of activityRows as any[]) {
    const id = a.agent_id
    if (!id) continue
    const cur =
      activityByAgent.get(id) ??
      { count30: 0, count7: 0, activeDays: new Set<string>(), tasksDone30: 0 }
    const when = a.happened_at ? new Date(a.happened_at) : null
    // Solo attivita' svolte (task_status null) contano come "azioni".
    if (a.task_status == null) {
      cur.count30 += 1
      if (when && when >= since7) cur.count7 += 1
      if (when) cur.activeDays.add(when.toISOString().slice(0, 10))
    }
    if (a.task_status === "done") cur.tasksDone30 += 1
    activityByAgent.set(id, cur)
  }

  const demoByAgent = new Map<string, number>()
  for (const d of demoRows as any[]) {
    const id = d.agent_id
    if (!id) continue
    demoByAgent.set(id, (demoByAgent.get(id) ?? 0) + 1)
  }

  const dealByAgent = new Map<string, { open: number; won: number; lost: number }>()
  for (const d of dealRows as any[]) {
    const id = d.agent_id
    if (!id) continue
    const cur = dealByAgent.get(id) ?? { open: 0, won: 0, lost: 0 }
    if (d.stage === "won") cur.won += 1
    else if (d.stage === "lost") cur.lost += 1
    else cur.open += 1
    dealByAgent.set(id, cur)
  }

  // 4. Task pendenti per agente (count-only, no cap): una query aggregata.
  const { data: pendingTaskRows } = await svc
    .from("prospect_activities")
    .select("agent_id")
    .eq("task_status", "pending")
    .limit(10000)
  const pendingByAgent = new Map<string, number>()
  for (const t of pendingTaskRows ?? []) {
    const id = (t as any).agent_id
    if (!id) continue
    pendingByAgent.set(id, (pendingByAgent.get(id) ?? 0) + 1)
  }

  // 5. Compongo le righe KPI + score engagement trasparente.
  const dayMs = 24 * 60 * 60 * 1000
  const rows = agents.map((a: any) => {
    const profile = a.profiles ?? null
    const registeredAt = profile?.created_at ?? a.created_at ?? null
    const lastLoginAt = profile?.last_login_at ?? null
    const daysSinceLogin =
      lastLoginAt != null
        ? Math.floor((now.getTime() - new Date(lastLoginAt).getTime()) / dayMs)
        : null

    const pa = prospectByAgent.get(a.id) ?? { total: 0, worked: 0, converted: 0 }
    const la = leadByAgent.get(a.id) ?? { total: 0, converted: 0 }
    const ha = hotelByAgent.get(a.id) ?? { total: 0, activated: 0 }
    const act = activityByAgent.get(a.id)
    const activities30 = act?.count30 ?? 0
    const activities7 = act?.count7 ?? 0
    const activeDays30 = act?.activeDays.size ?? 0
    const demos = demoByAgent.get(a.id) ?? 0
    const deals = dealByAgent.get(a.id) ?? { open: 0, won: 0, lost: 0 }
    const tasksPending = pendingByAgent.get(a.id) ?? 0

    const workedRatio = pa.total > 0 ? pa.worked / pa.total : 0
    const conversionRate = pa.total > 0 ? pa.converted / pa.total : 0

    // Score 0-100 trasparente (somma di 3 componenti):
    //  - login recency (max 40): <=2gg=40, <=7gg=30, <=14gg=18, <=30gg=8, else 0
    //  - utilizzo 30gg     (max 30): min(activeDays30,15)/15 * 30
    //  - lavoro            (max 30): workedRatio*15 + min(activities30/40,1)*15
    let loginScore = 0
    if (daysSinceLogin != null) {
      if (daysSinceLogin <= 2) loginScore = 40
      else if (daysSinceLogin <= 7) loginScore = 30
      else if (daysSinceLogin <= 14) loginScore = 18
      else if (daysSinceLogin <= 30) loginScore = 8
    }
    const usageScore = Math.min(activeDays30, 15) / 15 * 30
    const workScore = workedRatio * 15 + Math.min(activities30 / 40, 1) * 15
    const engagementScore = Math.round(loginScore + usageScore + workScore)

    return {
      agent_id: a.id,
      display_name:
        a.display_name ||
        [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() ||
        a.email ||
        null,
      email: profile?.email ?? a.email ?? null,
      is_active: a.is_active !== false && profile?.is_active !== false,
      registered_at: registeredAt,
      last_login_at: lastLoginAt,
      days_since_login: daysSinceLogin,
      default_commission_percentage: a.default_commission_percentage ?? null,
      prospects_total: pa.total,
      prospects_worked: pa.worked,
      prospects_converted: pa.converted,
      worked_ratio: Math.round(workedRatio * 1000) / 1000,
      conversion_rate: Math.round(conversionRate * 1000) / 1000,
      leads_total: la.total,
      leads_converted: la.converted,
      hotels_activated: ha.activated,
      hotels_total: ha.total,
      activities_30d: activities30,
      activities_7d: activities7,
      active_days_30d: activeDays30,
      demos_total: demos,
      tasks_pending: tasksPending,
      deals_open: deals.open,
      deals_won: deals.won,
      engagement_score: Math.max(0, Math.min(100, engagementScore)),
    }
  })

  // 6. Totali aggregati per le card riepilogo in testa alla dashboard.
  const totals = {
    agents: rows.length,
    active_agents: rows.filter((r) => r.is_active).length,
    logged_last_7d: rows.filter((r) => r.days_since_login != null && r.days_since_login <= 7)
      .length,
    prospects_total: rows.reduce((s, r) => s + r.prospects_total, 0),
    prospects_worked: rows.reduce((s, r) => s + r.prospects_worked, 0),
    prospects_converted: rows.reduce((s, r) => s + r.prospects_converted, 0),
    leads_total: rows.reduce((s, r) => s + r.leads_total, 0),
    hotels_activated: rows.reduce((s, r) => s + r.hotels_activated, 0),
  }

  return NextResponse.json({ generated_at: now.toISOString(), totals, agents: rows })
}
