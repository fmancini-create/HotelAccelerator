import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { expandCityQuery } from "@/lib/sales/city-aliases"

export const dynamic = "force-dynamic"

// GET: Lista prospects assegnati all'agente corrente
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const serviceSupabase = await createServiceRoleClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 })
    }
    
    // Get agent record
    const { data: agent, error: agentError } = await serviceSupabase
      .from("sales_agents")
      .select("id")
      .eq("user_id", user.id)
      .single()
    
    if (agentError || !agent) {
      return NextResponse.json({ error: "Agente non trovato" }, { status: 404 })
    }
    
    const { searchParams } = new URL(request.url)
    
    // Parametri filtro
    const category = searchParams.get("category")
    const stars = searchParams.get("stars")
    const status = searchParams.get("status")
    const search = searchParams.get("search")
    const city = searchParams.get("city")
    const postalCode = searchParams.get("postal_code")
    const page = parseInt(searchParams.get("page") || "1")
    const pageSize = parseInt(searchParams.get("page_size") || "25")
    const offset = (page - 1) * pageSize
    
    // Query prospects assegnati a questo agente
    let query = serviceSupabase
      .from("prospects")
      .select("*", { count: "exact" })
      .eq("assigned_agent_id", agent.id)
    
    if (category && category !== "all") query = query.eq("category", category)
    if (stars && stars !== "all") query = query.eq("stars", parseInt(stars))
    if (status && status !== "all") query = query.eq("status", status)
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
    if (search) {
      query = query.or(`name.ilike.%${search}%,city.ilike.%${search}%`)
    }
    
    query = query
      .order("assignment_date", { ascending: false, nullsFirst: false })
      .range(offset, offset + pageSize - 1)
    
    const { data: prospects, error, count } = await query
    
    if (error) {
      console.error("Error fetching agent prospects:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    // Stats per questo agente
    const { data: allProspects } = await serviceSupabase
      .from("prospects")
      .select("status")
      .eq("assigned_agent_id", agent.id)
    
    const stats = {
      total: allProspects?.length || 0,
      assigned: allProspects?.filter(p => p.status === "assigned").length || 0,
      contacted: allProspects?.filter(p => p.status === "contacted").length || 0,
      converted: allProspects?.filter(p => p.status === "converted").length || 0,
    }
    
    return NextResponse.json({
      prospects,
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize),
      },
      stats,
    })
  } catch (error) {
    console.error("Error in sales prospects GET:", error)
    return NextResponse.json(
      { error: "Errore interno del server" },
      { status: 500 }
    )
  }
}

// PATCH: Aggiorna status di un prospect (solo il proprio)
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const serviceSupabase = await createServiceRoleClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 })
    }
    
    // Get agent record
    const { data: agent } = await serviceSupabase
      .from("sales_agents")
      .select("id")
      .eq("user_id", user.id)
      .single()
    
    if (!agent) {
      return NextResponse.json({ error: "Agente non trovato" }, { status: 404 })
    }
    
    const body = await request.json()
    const { prospect_id, status, notes, last_contact_at } = body
    
    if (!prospect_id) {
      return NextResponse.json({ error: "prospect_id obbligatorio" }, { status: 400 })
    }
    
    // Verifica che il prospect sia assegnato a questo agente
    const { data: prospect, error: checkError } = await serviceSupabase
      .from("prospects")
      .select("id, assigned_agent_id")
      .eq("id", prospect_id)
      .single()
    
    if (checkError || !prospect) {
      return NextResponse.json({ error: "Prospect non trovato" }, { status: 404 })
    }
    
    if (prospect.assigned_agent_id !== agent.id) {
      return NextResponse.json({ error: "Non autorizzato a modificare questo prospect" }, { status: 403 })
    }
    
    // Build update object
    const updateData: any = {}
    if (status) updateData.status = status
    if (notes !== undefined) updateData.notes = notes
    if (last_contact_at) {
      updateData.last_contact_at = last_contact_at
      updateData.contact_attempts = (prospect as any).contact_attempts + 1
    }
    
    const { data: updated, error: updateError } = await serviceSupabase
      .from("prospects")
      .update(updateData)
      .eq("id", prospect_id)
      .select()
      .single()
    
    if (updateError) {
      console.error("Error updating prospect:", updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }
    
    return NextResponse.json({ prospect: updated })
  } catch (error) {
    console.error("Error in sales prospects PATCH:", error)
    return NextResponse.json(
      { error: "Errore interno del server" },
      { status: 500 }
    )
  }
}
