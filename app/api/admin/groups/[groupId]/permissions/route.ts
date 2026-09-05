import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { requireTenantAdmin, accessErrorStatus } from "@/lib/auth/admin-access"
import { GRANTABLE_AREA_KEYS } from "@/lib/platform/areas"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { tempoAmmesso } from "@/lib/auth/auto-logout"

interface ChannelDescriptor {
  channel_type: string
  channel_id: string
  channel_name: string
}

async function listTenantChannels(
  supabase: ReturnType<typeof createServiceClient>,
  propertyId: string,
): Promise<ChannelDescriptor[]> {
  const channels: ChannelDescriptor[] = []

  const [{ data: emailChannels }, { data: messagingChannels }, { data: chatChannels }] = await Promise.all([
    supabase
      .from("email_channels")
      .select("id, name, display_name, email_address")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: true }),
    supabase
      .from("messaging_channels")
      .select("id, channel_type, display_name")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: true }),
    supabase
      .from("embed_scripts")
      .select("id, name")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: true }),
  ])

  for (const c of emailChannels ?? []) {
    channels.push({
      channel_type: "email",
      channel_id: c.id,
      channel_name: c.display_name || c.name || c.email_address || "Email",
    })
  }
  for (const c of messagingChannels ?? []) {
    channels.push({
      channel_type: c.channel_type,
      channel_id: c.id,
      channel_name: c.display_name || c.channel_type,
    })
  }
  for (const c of chatChannels ?? []) {
    channels.push({ channel_type: "chat", channel_id: c.id, channel_name: c.name || "Chat Widget" })
  }

  return channels
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const { groupId } = await params
    const { propertyId } = await requireTenantAdmin(request)
    const supabase = createServiceClient()

    const { data: group } = await supabase
      .from("user_groups")
      .select("id, auto_logout_minutes")
      .eq("id", groupId)
      .eq("property_id", propertyId)
      .single()

    if (!group) return NextResponse.json({ error: "Gruppo non trovato" }, { status: 404 })

    const [{ data: permissions, error }, { data: areaRows }, channels] = await Promise.all([
      supabase.from("group_channel_permissions").select("*").eq("group_id", groupId).eq("property_id", propertyId),
      supabase
        .from("group_area_permissions")
        .select("area_key")
        .eq("property_id", propertyId)
        .eq("group_id", groupId),
      listTenantChannels(supabase, propertyId),
    ])

    if (error) throw error

    const areas = (areaRows ?? [])
      .map((r: { area_key: string }) => r.area_key)
      .filter((k: string) => GRANTABLE_AREA_KEYS.has(k))

    return NextResponse.json({
      permissions: permissions || [],
      channels,
      areas,
      autoLogoutMinutes: (group as any).auto_logout_minutes ?? null,
    })
  } catch (error: any) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    return NextResponse.json({ error: error.message }, { status: accessErrorStatus(error) })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const { groupId } = await params
    const { propertyId } = await requireTenantAdmin(request)
    const supabase = createServiceClient()
    const body = await request.json()
    const permissions = Array.isArray(body?.permissions) ? body.permissions : []

    const { data: group } = await supabase
      .from("user_groups")
      .select("id")
      .eq("id", groupId)
      .eq("property_id", propertyId)
      .single()

    if (!group) return NextResponse.json({ error: "Gruppo non trovato" }, { status: 404 })

    const channels = await listTenantChannels(supabase, propertyId)
    const validChannels = new Set(channels.map((c) => `${c.channel_type}:${c.channel_id}`))

    const permissionsToInsert = permissions
      .filter((p: any) => p?.can_read || p?.can_write || p?.can_manage)
      .filter((p: any) => p?.channel_id == null || validChannels.has(`${p.channel_type}:${p.channel_id}`))
      .map((p: any) => ({
        property_id: propertyId,
        group_id: groupId,
        channel_type: String(p.channel_type),
        channel_id: p.channel_id || null,
        can_read: p.can_read === true || p.can_write === true || p.can_manage === true,
        can_write: p.can_write === true,
        can_manage: p.can_manage === true,
      }))

    await supabase
      .from("group_channel_permissions")
      .delete()
      .eq("group_id", groupId)
      .eq("property_id", propertyId)

    if (permissionsToInsert.length > 0) {
      const { error } = await supabase.from("group_channel_permissions").insert(permissionsToInsert)
      if (error) throw error
    }

    if (Array.isArray(body?.areas)) {
      const areaKeys: string[] = Array.from(
        new Set(
          (body.areas as unknown[]).filter((k): k is string => typeof k === "string" && GRANTABLE_AREA_KEYS.has(k)),
        ),
      )

      await supabase
        .from("group_area_permissions")
        .delete()
        .eq("group_id", groupId)
        .eq("property_id", propertyId)

      if (areaKeys.length > 0) {
        const areaRows = areaKeys.map((area_key) => ({ property_id: propertyId, group_id: groupId, area_key }))
        const { error: areaErr } = await supabase.from("group_area_permissions").insert(areaRows)
        if (areaErr) throw areaErr
      }
    }

    if ("autoLogoutMinutes" in body) {
      const grezzo = (body as any).autoLogoutMinutes
      if (grezzo !== null && !tempoAmmesso(grezzo)) {
        return NextResponse.json({ error: "Tempo di disconnessione non valido" }, { status: 400 })
      }
      const { error: logoutErr } = await supabase
        .from("user_groups")
        .update({ auto_logout_minutes: grezzo })
        .eq("id", groupId)
        .eq("property_id", propertyId)
      if (logoutErr) throw logoutErr
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    return NextResponse.json({ error: error.message }, { status: accessErrorStatus(error) })
  }
}
