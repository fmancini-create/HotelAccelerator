import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

// Tutti gli status possibili (sincronizzato con UI prospects-manager.tsx STATUSES).
const ALL_STATUSES = [
  "unassigned",
  "assigned",
  "contacted",
  "meeting_scheduled",
  "negotiating",
  "converted",
  "declined",
  "not_interested",
] as const

// Tutte le categorie possibili.
const ALL_CATEGORIES = [
  "hotel",
  "bb",
  "agriturismo",
  "resort",
  "casa_vacanze",
  "affittacamere",
  "ostello",
  "altro",
] as const

// Helper: paginazione completa per superare il cap PostgREST di 1000 righe.
// Ritorna solo la colonna richiesta su tutti i record.
async function fetchAllRows(
  supabase: Awaited<ReturnType<typeof createServiceRoleClient>>,
  column: "region",
  total: number,
): Promise<{ region: string | null }[]> {
  const PAGE = 1000
  const results: { region: string | null }[] = []
  for (let offset = 0; offset < total; offset += PAGE) {
    const { data, error } = await supabase
      .from("prospects")
      .select(column)
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    if (data) results.push(...(data as { region: string | null }[]))
    if (!data || data.length < PAGE) break
  }
  return results
}

// GET: Statistiche aggregate per dashboard prospects.
// Usa count:exact head:true per evitare il cap PostgREST di 1000 righe.
export async function GET(_request: NextRequest) {
  try {
    const supabase = await createServiceRoleClient()
    
    // 1) Totale prospects (count exact)
    const { count: total } = await supabase
      .from("prospects")
      .select("*", { count: "exact", head: true })
    
    const totalCount = total || 0
    
    // 2) Per status: una count query per ogni status (head:true = nessun data transfer)
    const statusCounts: Record<string, number> = {}
    await Promise.all(
      ALL_STATUSES.map(async (s) => {
        const { count } = await supabase
          .from("prospects")
          .select("*", { count: "exact", head: true })
          .eq("status", s)
        statusCounts[s] = count || 0
      })
    )
    
    // 3) Per categoria: idem
    const categoryCounts: Record<string, number> = {}
    await Promise.all(
      ALL_CATEGORIES.map(async (c) => {
        const { count } = await supabase
          .from("prospects")
          .select("*", { count: "exact", head: true })
          .eq("category", c)
        categoryCounts[c] = count || 0
      })
    )
    
    // 4) Top regioni: paginiamo tutte le regioni e contiamo in JS
    // (alternativa: una count query per ogni regione italiana, ma sono ~20 e la paginazione è più semplice)
    const allRegionRows = await fetchAllRows(supabase, "region", totalCount)
    const regionCounts: Record<string, number> = {}
    for (const r of allRegionRows) {
      if (r.region) {
        regionCounts[r.region] = (regionCounts[r.region] || 0) + 1
      }
    }
    const topRegions = Object.entries(regionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([region, count]) => ({ region, count }))
    
    // 5) Per agente: solo i prospect assegnati a un agente.
    // Sono pochi rispetto al totale, possiamo recuperarli paginando con safety cap.
    const ASSIGNED_PAGE = 1000
    const assignedRows: Array<{
      assigned_agent_id: string
      status: string
      sales_agents: { display_name: string | null } | null
    }> = []
    for (let offset = 0; offset < 100000; offset += ASSIGNED_PAGE) {
      const { data, error } = await supabase
        .from("prospects")
        .select(
          "assigned_agent_id, status, sales_agents!prospects_assigned_agent_id_fkey(display_name)"
        )
        .not("assigned_agent_id", "is", null)
        .range(offset, offset + ASSIGNED_PAGE - 1)
      if (error) {
        console.error("[v0] Error fetching assigned prospects:", error)
        break
      }
      if (!data || data.length === 0) break
      assignedRows.push(...(data as typeof assignedRows))
      if (data.length < ASSIGNED_PAGE) break
    }
    
    const agentStats: Record<string, { name: string; assigned: number; converted: number }> = {}
    for (const p of assignedRows) {
      const agentId = p.assigned_agent_id
      if (!agentStats[agentId]) {
        agentStats[agentId] = {
          name: p.sales_agents?.display_name || "Sconosciuto",
          assigned: 0,
          converted: 0,
        }
      }
      agentStats[agentId].assigned++
      if (p.status === "converted") {
        agentStats[agentId].converted++
      }
    }
    
    return NextResponse.json({
      total: totalCount,
      byStatus: statusCounts,
      byCategory: categoryCounts,
      topRegions,
      byAgent: Object.values(agentStats),
    })
  } catch (error) {
    console.error("[v0] Error in prospects stats GET:", error)
    return NextResponse.json(
      { error: "Errore interno del server" },
      { status: 500 }
    )
  }
}
