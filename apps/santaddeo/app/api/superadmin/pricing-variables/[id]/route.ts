import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

// Support both PUT and PATCH for compatibility
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return PATCH(request, context)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (body.variable_key !== undefined)
      updateData.variable_key = body.variable_key.toLowerCase().replace(/\s+/g, "_")
    if (body.label !== undefined) updateData.label = body.label
    if (body.description !== undefined) updateData.description = body.description
    if (body.category !== undefined) updateData.category = body.category
    if (body.data_type !== undefined) updateData.data_type = body.data_type
    if (body.unit !== undefined) updateData.unit = body.unit || null
    if (body.min_value !== undefined) updateData.min_value = body.min_value
    if (body.max_value !== undefined) updateData.max_value = body.max_value
    if (body.default_value !== undefined) updateData.default_value = body.default_value
    if (body.weight_min !== undefined) updateData.weight_min = body.weight_min
    if (body.weight_max !== undefined) updateData.weight_max = body.weight_max
    if (body.default_weight !== undefined) updateData.default_weight = body.default_weight
    if (body.is_active !== undefined) updateData.is_active = body.is_active
    if (body.sort_order !== undefined) updateData.sort_order = body.sort_order

    const { data: updatedVariable, error } = await supabase
      .from("pricing_variables")
      .update(updateData)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Una variabile con questa chiave esiste gia" },
          { status: 409 }
        )
      }
      console.error("Error updating pricing variable:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ variable: updatedVariable })
  } catch (error) {
    console.error("Error:", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    const { error } = await supabase
      .from("pricing_variables")
      .delete()
      .eq("id", id)

    if (error) {
      console.error("Error deleting pricing variable:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error:", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}
