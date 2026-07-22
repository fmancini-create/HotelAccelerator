import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const supabaseAdmin = await createServiceRoleClient()

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
    }

    // Check user permissions
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role, organization_id")
      .eq("id", user.id)
      .single()

    if (!profile || (profile.role !== "property_admin" && profile.role !== "super_admin")) {
      return NextResponse.json(
        { error: "Solo gli amministratori possono cancellare inviti" },
        { status: 403 },
      )
    }

    // Delete the invitation
    const { error: deleteError } = await supabaseAdmin
      .from("user_invitations")
      .delete()
      .eq("id", id)

    if (deleteError) {
      console.error("[Invitation] Error deleting:", deleteError)
      return NextResponse.json(
        { error: "Errore durante la cancellazione dell'invito" },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Invitation] Error:", error)
    return NextResponse.json({ error: "Errore interno del server" }, { status: 500 })
  }
}
