import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"

export async function GET(request: NextRequest, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const { groupId } = await params
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = await createClient()

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

    const { data: permissions, error } = await supabase
      .from("group_channel_permissions")
      .select("*")
      .eq("group_id", groupId)

    if (error) throw error

    return NextResponse.json({ permissions: permissions || [] })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const { groupId } = await params
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = await createClient()
    const body = await request.json()

    const { permissions } = body

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

    // Delete existing permissions
    await supabase.from("group_channel_permissions").delete().eq("group_id", groupId)

    // Insert new permissions (only if at least one permission is true)
    const permissionsToInsert = permissions
      .filter((p: any) => p.can_read || p.can_write || p.can_manage)
      .map((p: any) => ({
        property_id: propertyId,
        group_id: groupId,
        channel_type: p.channel_type,
        channel_id: p.channel_id || null,
        can_read: p.can_read,
        can_write: p.can_write,
        can_manage: p.can_manage,
      }))

    if (permissionsToInsert.length > 0) {
      const { error } = await supabase.from("group_channel_permissions").insert(permissionsToInsert)

      if (error) throw error
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
