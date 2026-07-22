import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireSuperadmin } from "@/lib/sales/superadmin-guard"
import { expandCityQuery } from "@/lib/sales/city-aliases"

export const dynamic = "force-dynamic"

// GET: Lista prospects con filtri e paginazione
export async function GET(request: NextRequest) {
  try {
    // Verifica super_admin tramite cookie session
    const guard = await requireSuperadmin()
    if ("error" in guard) return guard.error
    
    const supabase = await createServiceRoleClient()
    
    const { searchParams } = new URL(request.url)
    
    // Parametri filtro
    const region = searchParams.get("region")
    const province = searchParams.get("province")
    const city = searchParams.get("city")
    const postalCode = searchParams.get("postal_code")
    const category = searchParams.get("category")
    const stars = searchParams.get("stars")
    const status = searchParams.get("status")
    const agentId = searchParams.get("agent_id")
    const search = searchParams.get("search")

    // ids: selezione esplicita (es. dalla mappa). Accetta sia ?ids=a,b,c
    // sia repeated ?ids=a&ids=b&ids=c. Vuoto/missing => nessun filtro.
    const idsParam = searchParams.getAll("ids")
    const ids =
      idsParam.length > 0
        ? idsParam.flatMap((v) => v.split(",")).map((s) => s.trim()).filter(Boolean)
        : []
    
    // Paginazione
    const page = parseInt(searchParams.get("page") || "1")
    const pageSize = parseInt(searchParams.get("page_size") || "50")
    const offset = (page - 1) * pageSize
    
    // Query base
    let query = supabase
      .from("prospects")
      .select(`
        *,
        assigned_agent:sales_agents!prospects_assigned_agent_id_fkey(
          id,
          display_name,
          email
        )
      `, { count: "exact" })
    
    // Applica filtri
    if (region) query = query.eq("region", region)
    if (province) query = query.eq("province", province)
    if (city) {
      // Espande IT <-> EN (es: "Firenze" cerca anche "Florence") e fa OR di ilike
      const variants = expandCityQuery(city)
      if (variants.length === 1) {
        query = query.ilike("city", `%${variants[0]}%`)
      } else {
        const orFilter = variants.map((v) => `city.ilike.%${v}%`).join(",")
        query = query.or(orFilter)
      }
    }
    if (postalCode) query = query.eq("postal_code", postalCode.trim())
    if (category) query = query.eq("category", category)
    if (stars) query = query.eq("stars", parseInt(stars))
    if (status) query = query.eq("status", status)
    if (agentId === "unassigned") {
      query = query.is("assigned_agent_id", null)
    } else if (agentId) {
      query = query.eq("assigned_agent_id", agentId)
    }
    if (search) {
      query = query.or(`name.ilike.%${search}%,city.ilike.%${search}%,email.ilike.%${search}%`)
    }
    if (ids && ids.length > 0) {
      // PostgREST tronca le URL molto lunghe: cap a 1000 ID e' coerente
      // col limite di selezione della mappa.
      query = query.in("id", ids.slice(0, 1000))
    }
    
    // Ordinamento e paginazione
    query = query
      .order("region", { ascending: true })
      .order("name", { ascending: true })
      .range(offset, offset + pageSize - 1)
    
    const { data: prospects, error, count } = await query
    
    if (error) {
      console.error("Error fetching prospects:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    // Statistiche rapide con count:exact per evitare il cap 1000 di PostgREST
    const ALL_STATUSES = [
      "unassigned", "assigned", "contacted", "meeting_scheduled",
      "proposal_sent", "converted", "not_interested"
    ]
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
    
    return NextResponse.json({
      prospects,
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize),
      },
      stats: {
        total: count || 0,
        byStatus: statusCounts,
      },
    })
  } catch (error) {
    console.error("Error in prospects GET:", error)
    return NextResponse.json(
      { error: "Errore interno del server" },
      { status: 500 }
    )
  }
}

// POST: Crea nuovo prospect (manuale)
export async function POST(request: NextRequest) {
  try {
    // Verifica super_admin tramite cookie session
    const guard = await requireSuperadmin()
    if ("error" in guard) return guard.error
    
    const supabase = await createServiceRoleClient()
    const body = await request.json()
    
    // Validazione base
    if (!body.name || !body.category) {
      return NextResponse.json(
        { error: "Nome e categoria sono obbligatori" },
        { status: 400 }
      )
    }
    
    const { data: prospect, error } = await supabase
      .from("prospects")
      .insert({
        name: body.name,
        category: body.category,
        stars: body.stars || null,
        address: body.address || null,
        city: body.city || null,
        province: body.province || null,
        region: body.region || null,
        postal_code: body.postal_code || null,
        phone: body.phone || null,
        email: body.email || null,
        website: body.website || null,
        rooms_count: body.rooms_count || null,
        notes: body.notes || null,
        data_source: "manual",
      })
      .select()
      .single()
    
    if (error) {
      console.error("Error creating prospect:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ prospect }, { status: 201 })
  } catch (error) {
    console.error("Error in prospects POST:", error)
    return NextResponse.json(
      { error: "Errore interno del server" },
      { status: 500 }
    )
  }
}
