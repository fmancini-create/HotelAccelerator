import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

/**
 * GET /api/sales/prospects/search?q=...
 *
 * Ricerca globale (stile Google) sulla tabella prospects, riservata ai venditori
 * autenticati. Restituisce fino a 20 risultati con "stato lato agente":
 *   - free        : non assegnato e nessuna richiesta pending
 *   - mine        : gia' assegnato all'agente corrente
 *   - taken       : assegnato ad altro agente (ritorna anche assigned_agent.display_name)
 *   - requested   : prospect non assegnato, ma l'agente ha gia' una richiesta pending
 *   - rejected    : ultima richiesta dell'agente per questo prospect e' stata rifiutata
 *
 * Match ILIKE su name/city/email/website. Per ogni risultato carichiamo:
 *   - i dati base del prospect (display)
 *   - il nome dell'agente assegnatario (se presente)
 *   - lo stato della richiesta dell'agente corrente (se presente)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const service = await createServiceRoleClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 })
    }

    // Verifichiamo il role: il super_admin puo' usare la search bar in
    // modalita' "view-only" (vede tutti i prospect, ma niente richieste —
    // lui assegna direttamente da /superadmin/prospects). Gli altri
    // ruoli devono avere una riga sales_agents.
    const { data: profile } = await service
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()
    const isSuperAdmin = profile?.role === "super_admin"

    const { data: agent } = await service
      .from("sales_agents")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle()
    if (!agent && !isSuperAdmin) {
      return NextResponse.json({ error: "Agente non trovato" }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const q = (searchParams.get("q") || "").trim()
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50)

    if (q.length < 2) {
      // Niente ricerca con meno di 2 char (rumorosa, troppe righe)
      return NextResponse.json({ results: [] })
    }

    // Escape % and _ per sicurezza ILIKE
    const escaped = q.replace(/[\\%_]/g, (m) => `\\${m}`)
    const pattern = `%${escaped}%`

    const { data: prospects, error: searchError } = await service
      .from("prospects")
      .select(
        "id, name, category, stars, city, province, region, address, phone, email, website, assigned_agent_id, assignment_expires_at, status",
      )
      .or(
        `name.ilike.${pattern},city.ilike.${pattern},email.ilike.${pattern},website.ilike.${pattern}`,
      )
      .order("name", { ascending: true })
      .limit(limit)

    if (searchError) {
      console.error("[sales/prospects/search] error:", searchError)
      return NextResponse.json({ error: searchError.message }, { status: 500 })
    }

    if (!prospects || prospects.length === 0) {
      return NextResponse.json({ results: [] })
    }

    // Carica display_name di TUTTI gli agenti assegnatari presenti nei
    // risultati. In modalita' agente filtriamo l'agente corrente (lui
    // diventa "mine"); in modalita' super_admin carichiamo tutti.
    const otherAgentIds = Array.from(
      new Set(
        prospects
          .map((p) => p.assigned_agent_id)
          .filter((id): id is string => !!id && id !== agent?.id),
      ),
    )

    let agentMap: Record<string, { display_name: string | null }> = {}
    if (otherAgentIds.length > 0) {
      const { data: others } = await service
        .from("sales_agents")
        .select("id, display_name")
        .in("id", otherAgentIds)
      ;(others || []).forEach((a) => {
        agentMap[a.id] = { display_name: a.display_name }
      })
    }

    // Carica ultime richieste dell'agente corrente per questi prospects.
    // In modalita' super_admin saltiamo (lui non fa richieste).
    const prospectIds = prospects.map((p) => p.id)
    const requestMap: Record<string, any> = {}
    if (agent) {
      const { data: myRequests } = await service
        .from("prospect_assignment_requests")
        .select("id, prospect_id, status, decision_notes, created_at, decided_at")
        .eq("agent_id", agent.id)
        .in("prospect_id", prospectIds)
        .order("created_at", { ascending: false })
      ;(myRequests || []).forEach((r) => {
        if (!requestMap[r.prospect_id]) requestMap[r.prospect_id] = r
      })
    }

    const results = prospects.map((p) => {
      const req = requestMap[p.id]
      let agentState: "free" | "mine" | "taken" | "requested" | "rejected" = "free"
      if (agent && p.assigned_agent_id === agent.id) {
        agentState = "mine"
      } else if (p.assigned_agent_id) {
        agentState = "taken"
      } else if (req?.status === "pending") {
        agentState = "requested"
      } else if (req?.status === "rejected") {
        agentState = "rejected"
      }
      return {
        id: p.id,
        name: p.name,
        category: p.category,
        stars: p.stars,
        city: p.city,
        province: p.province,
        region: p.region,
        address: p.address,
        phone: p.phone,
        email: p.email,
        website: p.website,
        assignment_expires_at: p.assignment_expires_at,
        assigned_agent_name:
          p.assigned_agent_id && p.assigned_agent_id !== agent?.id
            ? agentMap[p.assigned_agent_id]?.display_name || "Altro venditore"
            : null,
        agentState,
        last_request: req
          ? {
              id: req.id,
              status: req.status,
              decision_notes: req.decision_notes,
              created_at: req.created_at,
              decided_at: req.decided_at,
            }
          : null,
      }
    })

    return NextResponse.json({ results, query: q, is_super_admin: isSuperAdmin })
  } catch (error) {
    console.error("[sales/prospects/search] FATAL:", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}
