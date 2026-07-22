import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
    }

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()

    if (!profile || !["superadmin", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Accesso negato" }, { status: 403 })
    }

    const { data: codes, error } = await supabase
      .from("rms_canonical_codes")
      .select("*")
      .order("entity_type")
      .order("sort_order")

    if (error) {
      console.error("Error fetching RMS codes:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ codes: codes || [] })
  } catch (error) {
    console.error("Error:", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
    }

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()

    if (!profile || !["superadmin", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Accesso negato - Solo superadmin" }, { status: 403 })
    }

    const body = await request.json()
    const { entity_type, code, label, description } = body

    if (!entity_type || !code || !label) {
      return NextResponse.json({ error: "Campi obbligatori mancanti" }, { status: 400 })
    }

    // Get max sort_order for this entity type
    const { data: maxOrder } = await supabase
      .from("rms_canonical_codes")
      .select("sort_order")
      .eq("entity_type", entity_type)
      .order("sort_order", { ascending: false })
      .limit(1)
      .single()

    const newSortOrder = (maxOrder?.sort_order || 0) + 1

    const { data: newCode, error } = await supabase
      .from("rms_canonical_codes")
      .insert({
        entity_type,
        code: code.toUpperCase(),
        label,
        description,
        sort_order: newSortOrder,
        is_active: true,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "Codice già esistente per questo tipo" }, { status: 409 })
      }
      console.error("Error creating RMS code:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ code: newCode }, { status: 201 })
  } catch (error) {
    console.error("Error:", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}
