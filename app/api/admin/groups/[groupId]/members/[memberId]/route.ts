import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { requireTenantAdmin, accessErrorStatus } from "@/lib/auth/admin-access"

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string; memberId: string }> },
) {
  try {
    const { groupId, memberId } = await params
    const { propertyId } = await requireTenantAdmin(request)
    const supabase = createServiceClient()

    // Verify group belongs to property
    const { data: group } = await supabase
      .from("user_groups")
      .select("id")
      .eq("id", groupId)
      .eq("property_id", propertyId)
      .single()

    if (!group) {
      return NextResponse.json({ error: "Gruppo non trovato" }, { status: 404 })
    }

    const { error } = await supabase.from("user_group_members").delete().eq("id", memberId).eq("group_id", groupId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: accessErrorStatus(error) })
  }
}
