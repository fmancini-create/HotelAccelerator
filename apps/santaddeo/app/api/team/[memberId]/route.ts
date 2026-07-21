import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// Helper: verify caller is admin or superadmin
async function verifyAdmin() {
  const supabase = await createClient()
  const supabaseAdmin = await createServiceRoleClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return { error: NextResponse.json({ error: "Non autenticato" }, { status: 401 }) }
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role, organization_id")
    .eq("id", user.id)
    .single()

  if (profileError || !profile) {
    return { error: NextResponse.json({ error: "Profilo non trovato" }, { status: 404 }) }
  }

  if (profile.role !== "property_admin" && profile.role !== "super_admin") {
    return { error: NextResponse.json({ error: "Non autorizzato" }, { status: 403 }) }
  }

  return { user, profile, supabaseAdmin }
}

// PATCH - Update team member (role, name, etc.)
export async function PATCH(request: Request, { params }: { params: Promise<{ memberId: string }> }) {
  try {
    const { memberId } = await params
    const result = await verifyAdmin()
    if ("error" in result && result.error instanceof NextResponse) {
      return result.error
    }
    const { profile, supabaseAdmin } = result as Awaited<ReturnType<typeof verifyAdmin>> & {
      profile: any
      supabaseAdmin: any
    }

    const body = await request.json()

    // Prevent changing own role
    if (profile.id === memberId && body.role) {
      return NextResponse.json({ error: "Non puoi modificare il tuo stesso ruolo" }, { status: 400 })
    }

    // Only super_admin can promote to super_admin
    if (body.role === "super_admin" && profile.role !== "super_admin") {
      return NextResponse.json({ error: "Solo i super admin possono promuovere a super admin" }, { status: 403 })
    }

    // Verify target member belongs to same organization (or superadmin can edit anyone)
    const { data: targetProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, role, organization_id")
      .eq("id", memberId)
      .single()

    if (!targetProfile) {
      return NextResponse.json({ error: "Membro non trovato" }, { status: 404 })
    }

    // ABSOLUTE PROTECTION: f.mancini@4bid.it super_admin can NEVER be downgraded
    // Other super_admins can be modified by super_admins
    const { data: targetEmail } = await supabaseAdmin.auth.admin.getUserById(memberId)
    const isProtectedSuperAdmin = targetEmail?.user?.email === "f.mancini@4bid.it"
    
    if (targetProfile.role === "super_admin") {
      // f.mancini@4bid.it can NEVER be downgraded
      if (isProtectedSuperAdmin && body.role && body.role !== "super_admin") {
        return NextResponse.json({ error: "Il ruolo super_admin di f.mancini@4bid.it non può essere modificato" }, { status: 403 })
      }
      // Only super_admin can edit super_admin profile data (name, etc.)
      if (profile.role !== "super_admin") {
        return NextResponse.json({ error: "Non puoi modificare un super admin" }, { status: 403 })
      }
    }

    // property_admin can only edit members in their own org
    if (profile.role === "property_admin" && targetProfile.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: "Non autorizzato a modificare questo membro" }, { status: 403 })
    }

    // Build update object - only allow safe fields
    const updateData: Record<string, any> = { updated_at: new Date().toISOString() }
    // Allow role change for all users EXCEPT the protected super_admin (f.mancini@4bid.it)
    if (body.role && !isProtectedSuperAdmin) updateData.role = body.role
    if (body.first_name !== undefined) updateData.first_name = body.first_name
    if (body.last_name !== undefined) updateData.last_name = body.last_name

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update(updateData)
      .eq("id", memberId)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ member: data })
  } catch (error) {
    console.error("Error updating team member:", error)
    return NextResponse.json({ error: "Errore interno del server" }, { status: 500 })
  }
}

// DELETE - Remove team member
export async function DELETE(request: Request, { params }: { params: Promise<{ memberId: string }> }) {
  try {
    const { memberId } = await params
    const result = await verifyAdmin()
    if ("error" in result && result.error instanceof NextResponse) {
      return result.error
    }
    const { profile, supabaseAdmin } = result as Awaited<ReturnType<typeof verifyAdmin>> & {
      profile: any
      supabaseAdmin: any
    }

    // Cannot remove yourself
    if (profile.id === memberId) {
      return NextResponse.json({ error: "Non puoi rimuovere te stesso" }, { status: 400 })
    }

    // Verify target member
    const { data: targetProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, role, organization_id")
      .eq("id", memberId)
      .single()

    if (!targetProfile) {
      return NextResponse.json({ error: "Membro non trovato" }, { status: 404 })
    }

    // ABSOLUTE PROTECTION: super_admin can NEVER be removed
    if (targetProfile.role === "super_admin") {
      return NextResponse.json({ error: "Un super admin non può essere rimosso dal sistema" }, { status: 403 })
    }

    // property_admin can only remove members in their own org
    if (profile.role === "property_admin" && targetProfile.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: "Non autorizzato a rimuovere questo membro" }, { status: 403 })
    }

    // 1. Delete from profiles table first
    const { error: profileDeleteError } = await supabaseAdmin
      .from("profiles")
      .delete()
      .eq("id", memberId)

    if (profileDeleteError) {
      console.error("[v0] Error deleting profile:", profileDeleteError.message)
      return NextResponse.json({ error: "Errore durante l'eliminazione del profilo: " + profileDeleteError.message }, { status: 500 })
    }

    // 2. Delete from auth.users (permanently removes the user)
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(memberId)

    if (authDeleteError) {
      console.error("[v0] Error deleting auth user:", authDeleteError.message)
      // Profile already deleted, log the auth error but still report partial success
      return NextResponse.json({ 
        success: true, 
        warning: "Profilo eliminato ma errore nella rimozione dell'account auth: " + authDeleteError.message 
      })
    }

    return NextResponse.json({ success: true, message: "Utente eliminato completamente dal sistema" })
  } catch (error) {
    console.error("Error removing team member:", error)
    return NextResponse.json({ error: "Errore interno del server" }, { status: 500 })
  }
}
