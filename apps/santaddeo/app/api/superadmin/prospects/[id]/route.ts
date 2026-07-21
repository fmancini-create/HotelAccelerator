import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"

// GET: Dettaglio singolo prospect
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createServiceRoleClient()
    
    const { data: prospect, error } = await supabase
      .from("prospects")
      .select(`
        *,
        assigned_agent:sales_agents!prospects_assigned_agent_id_fkey(
          id,
          display_name,
          email
        )
      `)
      .eq("id", id)
      .single()
    
    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Prospect non trovato" }, { status: 404 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    // Carica anche eventuali deals collegati
    const { data: deals } = await supabase
      .from("deals")
      .select("id, stage, value, created_at")
      .eq("prospect_id", id)
      .order("created_at", { ascending: false })
    
    return NextResponse.json({ prospect, deals: deals || [] })
  } catch (error) {
    console.error("Error in prospect GET:", error)
    return NextResponse.json(
      { error: "Errore interno del server" },
      { status: 500 }
    )
  }
}

// PATCH: Aggiorna prospect
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createServiceRoleClient()
    
    // Verifica superadmin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 })
    }
    
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()
    
    if (profile?.role !== "super_admin") {
      return NextResponse.json({ error: "Accesso negato" }, { status: 403 })
    }
    
    const body = await request.json()
    
    // Rimuovi campi non aggiornabili
    const { id: _, created_at, normalized_name, ...updateData } = body
    
    const { data: prospect, error } = await supabase
      .from("prospects")
      .update(updateData)
      .eq("id", id)
      .select()
      .single()
    
    if (error) {
      console.error("Error updating prospect:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ prospect })
  } catch (error) {
    console.error("Error in prospect PATCH:", error)
    return NextResponse.json(
      { error: "Errore interno del server" },
      { status: 500 }
    )
  }
}

// DELETE: Elimina prospect
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createServiceRoleClient()
    
    // Verifica superadmin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 })
    }
    
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()
    
    if (profile?.role !== "super_admin") {
      return NextResponse.json({ error: "Accesso negato" }, { status: 403 })
    }
    
    const { error } = await supabase
      .from("prospects")
      .delete()
      .eq("id", id)
    
    if (error) {
      console.error("Error deleting prospect:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error in prospect DELETE:", error)
    return NextResponse.json(
      { error: "Errore interno del server" },
      { status: 500 }
    )
  }
}
