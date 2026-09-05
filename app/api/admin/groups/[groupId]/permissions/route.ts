import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { requireTenantAdmin, accessErrorStatus } from "@/lib/auth/admin-access"
import { GRANTABLE_AREA_KEYS } from "@/lib/platform/areas"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { tempoAmmesso } from "@/lib/auth/auto-logout"

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

    const [{ data: permissions, error }, { data: areaRows }, { data: callRule }] = await Promise.all([
      supabase.from("group_channel_permissions").select("*").eq("group_id", groupId),
      supabase
        .from("group_area_permissions")
        .select("area_key")
        .eq("property_id", propertyId)
        .eq("group_id", groupId),
      supabase
        .from("group_call_access")
        .select("visibility_scope, can_read_transcripts, can_listen_recordings")
        .eq("property_id", propertyId)
        .eq("group_id", groupId)
        .maybeSingle(),
    ])

    if (error) throw error

    const areas = (areaRows ?? [])
      .map((r: { area_key: string }) => r.area_key)
      .filter((k: string) => GRANTABLE_AREA_KEYS.has(k))

    return NextResponse.json({
      permissions: permissions || [],
      areas,
      autoLogoutMinutes: (group as any).auto_logout_minutes ?? null,
      callAccess: callRule
        ? {
            inherit: false,
            visibility_scope: callRule.visibility_scope,
            can_read_transcripts: callRule.can_read_transcripts !== false,
            can_listen_recordings: callRule.can_listen_recordings === true,
            selected_user_ids: [],
            selected_group_ids: [],
          }
        : {
            inherit: false,
            visibility_scope: "own",
            can_read_transcripts: true,
            can_listen_recordings: false,
            selected_user_ids: [],
            selected_group_ids: [],
          },
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

    await supabase.from("group_channel_permissions").delete().eq("group_id", groupId)

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

    if (body?.callAccess) {
      const callAccess = body.callAccess as any
      const allowedScopes = new Set(["own", "groups", "all"])
      const visibilityScope = allowedScopes.has(callAccess.visibility_scope) ? callAccess.visibility_scope : "own"
      const { error: callErr } = await supabase.from("group_call_access").upsert(
        {
          property_id: propertyId,
          group_id: groupId,
          visibility_scope: visibilityScope,
          can_read_transcripts: callAccess.can_read_transcripts !== false,
          can_listen_recordings: callAccess.can_listen_recordings === true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "property_id,group_id" },
      )
      if (callErr) throw callErr
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    return NextResponse.json({ error: error.message }, { status: accessErrorStatus(error) })
  }
}
