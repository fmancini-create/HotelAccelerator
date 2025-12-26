import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"

export async function GET(request: NextRequest, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const { groupId } = await params
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = await createClient()

    const { data: group, error } = await supabase
      .from("user_groups")
      .select("*")
      .eq("id", groupId)
      .eq("property_id", propertyId)
      .single()

    if (error) throw error

    return NextResponse.json({ group })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const { groupId } = await params
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = await createClient()

    const { error } = await supabase.from("user_groups").delete().eq("id", groupId).eq("property_id", propertyId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
