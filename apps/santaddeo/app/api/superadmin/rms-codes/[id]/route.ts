import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()

    if (!profile || !["superadmin", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Accesso negato - Solo superadmin" }, { status: 403 })
    }

    const body = await request.json()
    const updateData: any = { updated_at: new Date().toISOString() }

    if (body.label !== undefined) updateData.label = body.label
    if (body.description !== undefined) updateData.description = body.description
    if (body.is_active !== undefined) updateData.is_active = body.is_active
    if (body.sort_order !== undefined) updateData.sort_order = body.sort_order

    const { data: updatedCode, error } = await supabase
      .from("rms_canonical_codes")
      .update(updateData)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      console.error("Error updating RMS code:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ code: updatedCode })
  } catch (error) {
    console.error("Error:", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()

    if (!profile || !["superadmin", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Accesso negato - Solo superadmin" }, { status: 403 })
    }

    // Check if code is in use
    const { data: codeData } = await supabase
      .from("rms_canonical_codes")
      .select("code, entity_type")
      .eq("id", id)
      .single()

    if (codeData) {
      const { count } = await supabase
        .from("pms_rms_mappings")
        .select("*", { count: "exact", head: true })
        .eq("rms_code", codeData.code)

      if (count && count > 0) {
        return NextResponse.json(
          {
            error: `Impossibile eliminare: codice usato in ${count} mappature`,
          },
          { status: 409 },
        )
      }
    }

    const { error } = await supabase.from("rms_canonical_codes").delete().eq("id", id)

    if (error) {
      console.error("Error deleting RMS code:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error:", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}
