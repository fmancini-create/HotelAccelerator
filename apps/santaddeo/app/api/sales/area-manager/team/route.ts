import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"

export const dynamic = "force-dynamic"

/**
 * GET /api/sales/area-manager/team
 *
 * Restituisce la lista degli agenti del team del capo area corrente con
 * KPI aggregati (numero strutture associate, MRR pipeline, commissioni mese
 * generate, totale override generato per il capo area).
 *
 * Permessi:
 *  - sales_agent con is_area_manager=true (vede il proprio team)
 *  - super_admin con ?area_manager_id=... (impersonation per debug)
 *
 * Modello dati di riferimento:
 *  - sales_agents.parent_agent_id punta al capo area (se non NULL)
 *  - sales_agents.is_area_manager=true identifica i capi area
 *  - sales_area_manager_commissions: ledger override 15% (vedi migration
 *    sales_area_manager_hierarchy)
 */
export async function GET(request: Request) {
  const { user, supabase: authSupa } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { data: profile } = await authSupa
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single()

  const url = new URL(request.url)
  const override = url.searchParams.get("area_manager_id")
  const svc = await createServiceRoleClient()

  // Risolvi l'area manager target: utente corrente (se area manager) oppure
  // il param override (solo per super_admin).
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

  if (!areaManagerId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  // Carica info capo area (display + override pct effettiva).
  const { data: areaManager } = await svc
    .from("sales_agents")
    .select("id, display_name, email, area_manager_override_pct")
    .eq("id", areaManagerId)
    .maybeSingle()

  if (!areaManager) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  // Override pct effettiva (override del capo area oppure default sistema).
  let effectivePct = areaManager.area_manager_override_pct
  if (effectivePct == null) {
    const { data: setting } = await svc
      .from("sales_system_settings")
      .select("value_numeric")
      .eq("key", "area_manager_default_pct")
      .maybeSingle()
    effectivePct = setting?.value_numeric ?? 15
  }

  // Lista agenti del team.
  const { data: teamRaw } = await svc
    .from("sales_agents")
    .select("id, display_name, email, default_commission_percentage, is_active, created_at")
    .eq("parent_agent_id", areaManagerId)
    .order("display_name", { ascending: true })

  const team = teamRaw ?? []
  const agentIds = team.map((a) => a.id)

  // KPI per ogni agente: numero hotel associati, commissioni totali (non voided).
  const kpiByAgent: Record<
    string,
    {
      hotels_count: number
      commission_month_eur: number
      commission_total_maturato_eur: number
      override_generated_total_eur: number
      override_generated_month_eur: number
    }
  > = {}

  for (const a of team) {
    kpiByAgent[a.id] = {
      hotels_count: 0,
      commission_month_eur: 0,
      commission_total_maturato_eur: 0,
      override_generated_total_eur: 0,
      override_generated_month_eur: 0,
    }
  }

  if (agentIds.length > 0) {
    const now = new Date()
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      .toISOString()
      .slice(0, 10)

    // Conteggio hotel per agente
    const { data: hotelCounts } = await svc
      .from("sales_agent_hotels")
      .select("sales_agent_id")
      .in("sales_agent_id", agentIds)
    for (const row of hotelCounts ?? []) {
      kpiByAgent[row.sales_agent_id].hotels_count += 1
    }

    // Commissioni ledger agenti
    const { data: ledger } = await svc
      .from("sales_commissions_ledger")
      .select("sales_agent_id, amount_eur, status, period_start")
      .in("sales_agent_id", agentIds)
      .neq("status", "voided")
      .range(0, 9999)
    for (const r of ledger ?? []) {
      const amt = Number(r.amount_eur ?? 0)
      kpiByAgent[r.sales_agent_id].commission_total_maturato_eur += amt
      if (r.period_start && r.period_start >= startOfMonth) {
        kpiByAgent[r.sales_agent_id].commission_month_eur += amt
      }
    }

    // Override generato per il capo area, breakdown per agente
    const { data: overrideRows } = await svc
      .from("sales_area_manager_commissions")
      .select("source_agent_id, amount_eur, status, period_year, period_month")
      .eq("area_manager_id", areaManagerId)
      .neq("status", "voided")
      .range(0, 9999)
    for (const r of overrideRows ?? []) {
      const amt = Number(r.amount_eur ?? 0)
      if (kpiByAgent[r.source_agent_id]) {
        kpiByAgent[r.source_agent_id].override_generated_total_eur += amt
        if (
          r.period_year === now.getUTCFullYear() &&
          r.period_month === now.getUTCMonth() + 1
        ) {
          kpiByAgent[r.source_agent_id].override_generated_month_eur += amt
        }
      }
    }
  }

  // Totali aggregati capo area
  let totalOverrideMonth = 0
  let totalOverrideTotal = 0
  for (const id of agentIds) {
    totalOverrideMonth += kpiByAgent[id].override_generated_month_eur
    totalOverrideTotal += kpiByAgent[id].override_generated_total_eur
  }

  return NextResponse.json({
    area_manager: {
      id: areaManager.id,
      display_name: areaManager.display_name,
      email: areaManager.email,
      override_percentage: Number(effectivePct),
      override_is_custom: areaManager.area_manager_override_pct != null,
    },
    totals: {
      team_size: team.length,
      override_month_eur: round2(totalOverrideMonth),
      override_total_eur: round2(totalOverrideTotal),
    },
    team: team.map((a) => ({
      id: a.id,
      display_name: a.display_name,
      email: a.email,
      is_active: a.is_active,
      default_commission_percentage: a.default_commission_percentage,
      ...kpiByAgent[a.id],
      commission_month_eur: round2(kpiByAgent[a.id].commission_month_eur),
      commission_total_maturato_eur: round2(
        kpiByAgent[a.id].commission_total_maturato_eur,
      ),
      override_generated_total_eur: round2(kpiByAgent[a.id].override_generated_total_eur),
      override_generated_month_eur: round2(kpiByAgent[a.id].override_generated_month_eur),
    })),
  })
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}
