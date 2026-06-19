import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { requireTenantAdmin, accessErrorStatus } from "@/lib/auth/admin-access"

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params
    // Deleting users is reserved to tenant admins / super admins.
    const caller = await requireTenantAdmin(request)
    const propertyId = caller.propertyId
    const supabase = createServiceClient()

    // Prevent an admin from deleting their own account (would lock themselves out).
    if (caller.adminUserId && caller.adminUserId === userId) {
      return NextResponse.json({ error: "Non puoi eliminare il tuo account" }, { status: 400 })
    }

    // Verify user belongs to this property
    const { data: user, error: checkError } = await supabase
      .from("admin_users")
      .select("id, email, property_id")
      .eq("id", userId)
      .eq("property_id", propertyId)
      .single()

    if (checkError || !user) {
      return NextResponse.json({ error: "Utente non trovato" }, { status: 404 })
    }

    // Delete admin_users record
    const { error } = await supabase.from("admin_users").delete().eq("id", userId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: accessErrorStatus(error) })
  }
}
