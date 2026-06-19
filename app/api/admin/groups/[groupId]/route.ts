import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { requireTenantAdmin, accessErrorStatus } from "@/lib/auth/admin-access"

export async function GET(request: NextRequest, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const { groupId } = await params
    const { propertyId } = await requireTenantAdmin(request)
    const supabase = createServiceClient()

    const { data: group, error } = await supabase
      .from("user_groups")
      .select("*")
      .eq("id", groupId)
      .eq("property_id", propertyId)
      .single()

    if (error) throw error

    return NextResponse.json({ group })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: accessErrorStatus(error) })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const { groupId } = await params
    const { propertyId } = await requireTenantAdmin(request)
    const supabase = createServiceClient()

    const { error } = await supabase.from("user_groups").delete().eq("id", groupId).eq("property_id", propertyId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: accessErrorStatus(error) })
  }
}
