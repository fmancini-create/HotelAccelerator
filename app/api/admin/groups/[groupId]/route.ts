import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { requireTenantAdmin, accessErrorStatus } from "@/lib/auth/admin-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"

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
    // Diniego della guardia di area: 403, non il 500 generico qui sotto.
    if (isAreaDenied(error)) return areaDeniedResponse(error)
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
    // Diniego della guardia di area: 403, non il 500 generico qui sotto.
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    return NextResponse.json({ error: error.message }, { status: accessErrorStatus(error) })
  }
}
