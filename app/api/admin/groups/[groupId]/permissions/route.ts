import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { requireTenantAdmin, accessErrorStatus } from "@/lib/auth/admin-access"
import { GRANTABLE_AREA_KEYS } from "@/lib/platform/areas"

export async function GET(request: NextRequest, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const { groupId } = await params
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

    const { data: permissions, error } = await supabase
      .from("group_channel_permissions")
      .select("*")
      .eq("group_id", groupId)

    if (error) throw error

    const { data: areaRows } = await supabase
      .from("group_area_permissions")
      .select("area_key")
      .eq("property_id", propertyId)
      .eq("group_id", groupId)
    const areas = (areaRows ?? [])
      .map((r: { area_key: string }) => r.area_key)
      .filter((k: string) => GRANTABLE_AREA_KEYS.has(k))

    return NextResponse.json({ permissions: permissions || [], areas })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: accessErrorStatus(error) })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const { groupId } = await params
    const { propertyId } = await requireTenantAdmin(request)
    const supabase = createServiceClient()
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

    // Area permissions for the group (only present when client sends `areas`).
    if (Array.isArray(body?.areas)) {
      const areaKeys: string[] = Array.from(
        new Set(
          (body.areas as unknown[]).filter((k): k is string => typeof k === "string" && GRANTABLE_AREA_KEYS.has(k)),
        ),
      )

      await supabase.from("group_area_permissions").delete().eq("group_id", groupId)

      if (areaKeys.length > 0) {
        const areaRows = areaKeys.map((area_key) => ({ property_id: propertyId, group_id: groupId, area_key }))
        const { error: areaErr } = await supabase.from("group_area_permissions").insert(areaRows)
        if (areaErr) throw areaErr
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: accessErrorStatus(error) })
  }
}
