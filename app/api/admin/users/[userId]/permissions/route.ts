import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { requireTenantAdmin, accessErrorStatus } from "@/lib/auth/admin-access"
import { GRANTABLE_AREA_KEYS } from "@/lib/platform/areas"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { risolviTempoDisconnessione, tempoAmmesso } from "@/lib/auth/auto-logout"

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

  const { data: emailChannels } = await supabase
    .from("email_channels")
    .select("id, name, display_name, email_address")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: true })

  for (const c of emailChannels ?? []) {
    channels.push({
      channel_type: "email",
      channel_id: c.id,
      channel_name: c.display_name || c.name || c.email_address || "Email",
    })
  }

  const { data: messagingChannels } = await supabase
    .from("messaging_channels")
    .select("id, channel_type, display_name")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: true })

  for (const c of messagingChannels ?? []) {
    channels.push({
      channel_type: c.channel_type,
      channel_id: c.id,
      channel_name: c.display_name || c.channel_type,
    })
  }

  return channels
}

async function loadCallAccess(
  supabase: ReturnType<typeof createServiceClient>,
  propertyId: string,
  userId: string,
) {
  const [rule, selectedUsers, selectedGroups, users, groups, memberships] = await Promise.all([
    supabase
      .from("user_call_access")
      .select("visibility_scope, can_read_transcripts, can_listen_recordings")
      .eq("property_id", propertyId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("user_call_access_users")
      .select("target_user_id")
      .eq("property_id", propertyId)
      .eq("viewer_user_id", userId),
    supabase
      .from("user_call_access_groups")
      .select("target_group_id")
      .eq("property_id", propertyId)
      .eq("viewer_user_id", userId),
    supabase.from("admin_users").select("id, name, email").eq("property_id", propertyId).order("name"),
    supabase.from("user_groups").select("id, name").eq("property_id", propertyId).order("name"),
    supabase
      .from("user_group_members")
      .select("group_id, user_groups!inner(property_id, name)")
      .eq("user_id", userId)
      .eq("user_groups.property_id", propertyId),
  ])

  const ownGroupIds = (memberships.data ?? []).map((m: any) => String(m.group_id))
  let inherited: null | { visibility_scope: string; can_read_transcripts: boolean; can_listen_recordings: boolean } = null
  if (!rule.data && ownGroupIds.length > 0) {
    const { data: groupRules } = await supabase
      .from("group_call_access")
      .select("visibility_scope, can_read_transcripts, can_listen_recordings")
      .eq("property_id", propertyId)
      .in("group_id", ownGroupIds)
    const rank: Record<string, number> = { own: 0, groups: 1, all: 2 }
    const sorted = [...(groupRules ?? [])].sort((a: any, b: any) => (rank[b.visibility_scope] ?? 0) - (rank[a.visibility_scope] ?? 0))
    if (sorted.length > 0) {
      inherited = {
        visibility_scope: sorted[0].visibility_scope,
        can_read_transcripts: sorted.some((r: any) => r.can_read_transcripts !== false),
        can_listen_recordings: sorted.some((r: any) => r.can_listen_recordings === true),
      }
    }
  }

  return {
    explicit: rule.data
      ? {
          visibility_scope: rule.data.visibility_scope,
          can_read_transcripts: rule.data.can_read_transcripts !== false,
          can_listen_recordings: rule.data.can_listen_recordings === true,
          selected_user_ids: (selectedUsers.data ?? []).map((r: any) => r.target_user_id),
          selected_group_ids: (selectedGroups.data ?? []).map((r: any) => r.target_group_id),
        }
      : null,
    inherited,
    defaults: inherited ?? {
      visibility_scope: "own",
      can_read_transcripts: true,
      can_listen_recordings: false,
    },
    users: users.data ?? [],
    groups: groups.data ?? [],
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params
    const { propertyId } = await requireTenantAdmin(request)
    const supabase = createServiceClient()

    const { data: user } = await supabase
      .from("admin_users")
      .select("id, name, email, role, is_tenant_admin, property_id, auto_logout_minutes")
      .eq("id", userId)
      .eq("property_id", propertyId)
      .maybeSingle()

    if (!user) return NextResponse.json({ error: "Utente non trovato" }, { status: 404 })

    const channels = await listTenantChannels(supabase, propertyId)

    const { data: assignments } = await supabase
      .from("channel_user_assignments")
      .select("channel_type, channel_id, can_send, can_receive, receives_notifications")
      .eq("property_id", propertyId)
      .eq("user_id", userId)

    type AssignmentRow = {
      channel_type: string
      channel_id: string
      can_send: boolean | null
      can_receive: boolean | null
      receives_notifications: boolean | null
    }
    const byKey = new Map<string, AssignmentRow>(
      ((assignments ?? []) as AssignmentRow[]).map((a) => [`${a.channel_type}:${a.channel_id}`, a]),
    )

    const permissions = channels.map((ch) => {
      const existing = byKey.get(`${ch.channel_type}:${ch.channel_id}`)
      return {
        ...ch,
        assigned: Boolean(existing),
        can_receive: existing?.can_receive ?? true,
        can_send: existing?.can_send ?? true,
        receives_notifications: existing?.receives_notifications ?? true,
      }
    })

    const { data: areaRows } = await supabase
      .from("user_area_permissions")
      .select("area_key")
      .eq("property_id", propertyId)
      .eq("user_id", userId)
    const areas = (areaRows ?? [])
      .map((r: { area_key: string }) => r.area_key)
      .filter((k: string) => GRANTABLE_AREA_KEYS.has(k))

    const { data: appartenenze } = await supabase
      .from("user_group_members")
      .select("user_groups!inner(name, auto_logout_minutes)")
      .eq("user_id", userId)

    const gruppiTempo = (appartenenze ?? [])
      .map((a: any) => a.user_groups)
      .filter((g: any) => g && typeof g.auto_logout_minutes === "number")
      .map((g: any) => ({ nome: g.name as string, minuti: g.auto_logout_minutes as number }))

    const autoLogout = {
      valoreUtente: (user as any).auto_logout_minutes ?? null,
      gruppi: gruppiTempo,
      risolto: risolviTempoDisconnessione({
        valoreUtente: (user as any).auto_logout_minutes,
        gruppi: gruppiTempo,
      }),
    }

    const callAccess = await loadCallAccess(supabase, propertyId, userId)
    return NextResponse.json({ user, permissions, areas, autoLogout, callAccess })
  } catch (error: any) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    return NextResponse.json({ error: error.message }, { status: accessErrorStatus(error) })
  }
}

interface PermissionInput {
  channel_type: string
  channel_id: string
  assigned: boolean
  can_receive?: boolean
  can_send?: boolean
  receives_notifications?: boolean
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params
    const { propertyId } = await requireTenantAdmin(request)
    const supabase = createServiceClient()

    const { data: user } = await supabase
      .from("admin_users")
      .select("id, property_id")
      .eq("id", userId)
      .eq("property_id", propertyId)
      .maybeSingle()

    if (!user) return NextResponse.json({ error: "Utente non trovato" }, { status: 404 })

    const body = await request.json().catch(() => ({}))
    const input: PermissionInput[] = Array.isArray(body?.permissions) ? body.permissions : []

    await supabase
      .from("channel_user_assignments")
      .delete()
      .eq("property_id", propertyId)
      .eq("user_id", userId)

    const rows = input
      .filter((p) => p.assigned && p.channel_type && p.channel_id)
      .map((p) => ({
        property_id: propertyId,
        channel_type: p.channel_type,
        channel_id: p.channel_id,
        user_id: userId,
        assignment_type: "member",
        can_receive: p.can_receive ?? true,
        can_send: p.can_send ?? true,
        receives_notifications: p.receives_notifications ?? true,
      }))

    if (rows.length > 0) {
      const { error } = await supabase.from("channel_user_assignments").insert(rows)
      if (error) throw error
    }

    if (Array.isArray(body?.areas)) {
      const areaKeys: string[] = Array.from(
        new Set((body.areas as unknown[]).filter((k): k is string => typeof k === "string" && GRANTABLE_AREA_KEYS.has(k))),
      )

      await supabase
        .from("user_area_permissions")
        .delete()
        .eq("property_id", propertyId)
        .eq("user_id", userId)

      if (areaKeys.length > 0) {
        const areaRows = areaKeys.map((area_key) => ({ property_id: propertyId, user_id: userId, area_key }))
        const { error: areaErr } = await supabase.from("user_area_permissions").insert(areaRows)
        if (areaErr) throw areaErr
      }
    }

    if ("autoLogoutMinutes" in body) {
      const grezzo = (body as any).autoLogoutMinutes
      if (grezzo !== null && !tempoAmmesso(grezzo)) {
        return NextResponse.json({ error: "Tempo di disconnessione non valido" }, { status: 400 })
      }
      const { error: logoutErr } = await supabase
        .from("admin_users")
        .update({ auto_logout_minutes: grezzo })
        .eq("id", userId)
        .eq("property_id", propertyId)
      if (logoutErr) throw logoutErr
    }

    if ("callAccess" in body) {
      const callAccess = body.callAccess as any
      await Promise.all([
        supabase.from("user_call_access_users").delete().eq("property_id", propertyId).eq("viewer_user_id", userId),
        supabase.from("user_call_access_groups").delete().eq("property_id", propertyId).eq("viewer_user_id", userId),
      ])

      if (!callAccess || callAccess.inherit === true) {
        await supabase.from("user_call_access").delete().eq("property_id", propertyId).eq("user_id", userId)
      } else {
        const allowedScopes = new Set(["own", "groups", "selected", "all"])
        const visibilityScope = allowedScopes.has(callAccess.visibility_scope) ? callAccess.visibility_scope : "own"
        const { error: ruleError } = await supabase.from("user_call_access").upsert(
          {
            property_id: propertyId,
            user_id: userId,
            visibility_scope: visibilityScope,
            can_read_transcripts: callAccess.can_read_transcripts !== false,
            can_listen_recordings: callAccess.can_listen_recordings === true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "property_id,user_id" },
        )
        if (ruleError) throw ruleError

        if (visibilityScope === "selected") {
          const selectedUserIds = Array.isArray(callAccess.selected_user_ids)
            ? [...new Set(callAccess.selected_user_ids.filter((id: unknown): id is string => typeof id === "string"))]
            : []
          const selectedGroupIds = Array.isArray(callAccess.selected_group_ids)
            ? [...new Set(callAccess.selected_group_ids.filter((id: unknown): id is string => typeof id === "string"))]
            : []

          if (selectedUserIds.length > 0) {
            const { data: validUsers } = await supabase
              .from("admin_users")
              .select("id")
              .eq("property_id", propertyId)
              .in("id", selectedUserIds)
            const validIds: string[] = (validUsers ?? [])
              .map((u: any) => String(u.id))
              .filter((id: string) => id !== userId)
            if (validIds.length > 0) {
              const { error } = await supabase.from("user_call_access_users").insert(
                validIds.map((target_user_id: string) => ({ property_id: propertyId, viewer_user_id: userId, target_user_id })),
              )
              if (error) throw error
            }
          }

          if (selectedGroupIds.length > 0) {
            const { data: validGroups } = await supabase
              .from("user_groups")
              .select("id")
              .eq("property_id", propertyId)
              .in("id", selectedGroupIds)
            const validIds: string[] = (validGroups ?? []).map((g: any) => String(g.id))
            if (validIds.length > 0) {
              const { error } = await supabase.from("user_call_access_groups").insert(
                validIds.map((target_group_id: string) => ({ property_id: propertyId, viewer_user_id: userId, target_group_id })),
              )
              if (error) throw error
            }
          }
        }
      }
    }

    return NextResponse.json({ success: true, count: rows.length })
  } catch (error: any) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    return NextResponse.json({ error: error.message }, { status: accessErrorStatus(error) })
  }
}
