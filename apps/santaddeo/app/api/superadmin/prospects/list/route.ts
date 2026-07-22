import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireSuperadmin } from "@/lib/sales/superadmin-guard"
import { expandCityQuery } from "@/lib/sales/city-aliases"

export const dynamic = "force-dynamic"

/**
 * POST: Lista prospects con filtri, paginazione e selezione esplicita di ID.
 *
 * Perche' POST e non GET: la pagina superadmin permette di selezionare
 * decine di migliaia di prospect e usare "Mostra solo selezionati". Passare
 * gli ID in query-string (?ids=...) genera URL da decine di KB che il server
 * rifiuta (URL troppo lunga) -> la fetch fallisce, la tabella mostra "Errore
 * nel caricamento" e le statistiche cadono a 0. Mettendo filtri e ids nel
 * BODY il limite di lunghezza URL non si applica piu'.
 */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireSuperadmin()
    if ("error" in guard) return guard.error

    const supabase = await createServiceRoleClient()

    const body = await request.json().catch(() => ({}))

    const region: string | undefined = body.region || undefined
    const province: string | undefined = body.province || undefined
    const city: string | undefined = body.city || undefined
    const postalCode: string | undefined = body.postal_code || undefined
    const category: string | undefined = body.category || undefined
    const stars: string | number | undefined = body.stars ?? undefined
    const status: string | undefined = body.status || undefined
    const agentId: string | undefined = body.agent_id || undefined
    const search: string | undefined = body.search || undefined

    // ids: array di selezione esplicita (es. dalla mappa o "mostra solo
    // selezionati"). Nessun cap a 1000: ora viaggiano nel body.
    const ids: string[] = Array.isArray(body.ids)
      ? body.ids.map((s: unknown) => String(s).trim()).filter(Boolean)
      : []

    const page = Number.parseInt(String(body.page ?? "1"), 10) || 1
    const pageSize = Number.parseInt(String(body.page_size ?? "50"), 10) || 50
    const offset = (page - 1) * pageSize

    let query = supabase
      .from("prospects")
      .select(
        `
        *,
        assigned_agent:sales_agents!prospects_assigned_agent_id_fkey(
          id,
          display_name,
          email
        )
      `,
        { count: "exact" },
      )

    if (region) query = query.eq("region", region)
    if (province) query = query.eq("province", province)
    if (city) {
      const variants = expandCityQuery(city)
      if (variants.length === 1) {
        query = query.ilike("city", `%${variants[0]}%`)
      } else {
        const orFilter = variants.map((v) => `city.ilike.%${v}%`).join(",")
        query = query.or(orFilter)
      }
    }
    if (postalCode) query = query.eq("postal_code", String(postalCode).trim())
    if (category) query = query.eq("category", category)
    if (stars !== undefined && stars !== null && stars !== "") {
      query = query.eq("stars", Number.parseInt(String(stars), 10))
    }
    if (status) query = query.eq("status", status)
    if (agentId === "unassigned") {
      query = query.is("assigned_agent_id", null)
    } else if (agentId) {
      query = query.eq("assigned_agent_id", agentId)
    }
    if (search) {
      query = query.or(`name.ilike.%${search}%,city.ilike.%${search}%,email.ilike.%${search}%`)
    }
    if (ids.length > 0) {
      query = query.in("id", ids)
    }

    query = query
      .order("region", { ascending: true })
      .order("name", { ascending: true })
      .range(offset, offset + pageSize - 1)

    const { data: prospects, error, count } = await query

    if (error) {
      console.error("Error fetching prospects (list):", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Statistiche globali per stato (head+count per evitare il cap 1000)
    const ALL_STATUSES = [
      "unassigned", "assigned", "contacted", "meeting_scheduled",
      "proposal_sent", "converted", "not_interested",
    ]
    const statusCounts: Record<string, number> = {}
    await Promise.all(
      ALL_STATUSES.map(async (s) => {
        const { count: c } = await supabase
          .from("prospects")
          .select("*", { count: "exact", head: true })
          .eq("status", s)
        statusCounts[s] = c || 0
      }),
    )

    // Totale globale (indipendente dai filtri) per la card "Totale Prospect"
    const { count: grandTotal } = await supabase
      .from("prospects")
      .select("*", { count: "exact", head: true })

    return NextResponse.json({
      prospects,
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize),
      },
      stats: {
        total: grandTotal || 0,
        byStatus: statusCounts,
      },
    })
  } catch (error) {
    console.error("Error in prospects list POST:", error)
    return NextResponse.json({ error: "Errore interno del server" }, { status: 500 })
  }
}
