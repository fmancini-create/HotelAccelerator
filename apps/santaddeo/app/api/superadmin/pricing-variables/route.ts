import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || !["superadmin", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Accesso negato" }, { status: 403 })
    }

    const { data: variables, error } = await supabase
      .from("pricing_variables")
      .select("*")
      .order("sort_order")
      .order("label")

    if (error) {
      console.error("Error fetching pricing variables:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ variables: variables || [] })
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

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || !["superadmin", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Accesso negato - Solo superadmin" }, { status: 403 })
    }

    const body = await request.json()
    const {
      variable_key,
      label,
      description,
      category,
      data_type,
      unit,
      min_value,
      max_value,
      default_value,
      weight_min,
      weight_max,
      default_weight,
      is_active,
      sort_order,
    } = body

    if (!variable_key || !label || !category) {
      return NextResponse.json(
        { error: "variable_key, label e category sono obbligatori" },
        { status: 400 }
      )
    }

    // Get max sort_order if not provided
    let finalSortOrder = sort_order
    if (finalSortOrder === undefined || finalSortOrder === null) {
      const { data: maxOrder } = await supabase
        .from("pricing_variables")
        .select("sort_order")
        .order("sort_order", { ascending: false })
        .limit(1)
        .single()

      finalSortOrder = (maxOrder?.sort_order || 0) + 1
    }

    const { data: newVariable, error } = await supabase
      .from("pricing_variables")
      .insert({
        variable_key: variable_key.toLowerCase().replace(/\s+/g, "_"),
        label,
        description: description || null,
        category: category || "general",
        data_type: data_type || "numeric",
        unit: unit || null,
        min_value: min_value ?? null,
        max_value: max_value ?? null,
        default_value: default_value || null,
        weight_min: weight_min ?? 0,
        weight_max: weight_max ?? 10,
        default_weight: default_weight ?? 5,
        is_active: is_active !== false,
        sort_order: finalSortOrder,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Una variabile con questa chiave esiste gia" },
          { status: 409 }
        )
      }
      console.error("Error creating pricing variable:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ variable: newVariable }, { status: 201 })
  } catch (error) {
    console.error("Error:", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}
