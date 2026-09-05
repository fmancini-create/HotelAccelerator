import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { requireTenantAdmin, accessErrorStatus } from "@/lib/auth/admin-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params
    const caller = await requireTenantAdmin(request)
    const propertyId = caller.propertyId
    const supabase = createServiceClient()

    if (caller.adminUserId && caller.adminUserId === userId) {
      return NextResponse.json({ error: "Non puoi eliminare il tuo account" }, { status: 400 })
    }

    // La presenza nel tenant è definita dalla membership, non dal tenant primario
    // legacy dentro admin_users.
    const { data: membership, error: membershipLookupError } = await supabase
      .from("tenant_user_memberships")
      .select("user_id")
      .eq("property_id", propertyId)
      .eq("user_id", userId)
      .maybeSingle()
    if (membershipLookupError) throw membershipLookupError
    if (!membership) {
      return NextResponse.json({ error: "Utente non trovato" }, { status: 404 })
    }

    const { error: deleteMembershipError } = await supabase
      .from("tenant_user_memberships")
      .delete()
      .eq("property_id", propertyId)
      .eq("user_id", userId)
    if (deleteMembershipError) throw deleteMembershipError

    // Se la persona lavora anche in un altro tenant, NON cancellare né la sua
    // identità admin_users né l'account Auth. In caso contrario il pulsante
    // "Elimina" in 4BID potrebbe distruggere anche l'accesso a Villa I Barronci.
    const { count, error: remainingError } = await supabase
      .from("tenant_user_memberships")
      .select("user_id", { count: "exact", head: true })
      .eq("user_id", userId)
    if (remainingError) throw remainingError

    if ((count ?? 0) === 0) {
      const { error: deleteIdentityError } = await supabase.from("admin_users").delete().eq("id", userId)
      if (deleteIdentityError) throw deleteIdentityError
      await supabase.auth.admin.deleteUser(userId).catch(() => {})
      return NextResponse.json({ success: true, removed_account: true })
    }

    return NextResponse.json({ success: true, removed_membership: true })
  } catch (error: any) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    return NextResponse.json({ error: error.message }, { status: accessErrorStatus(error) })
  }
}
