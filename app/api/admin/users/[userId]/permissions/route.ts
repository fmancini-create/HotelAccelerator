import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { requireTenantAdmin, accessErrorStatus } from "@/lib/auth/admin-access"

/**
 * Per-user channel permissions.
 *
 * GET  -> lists every channel of the tenant (email + messaging) together with
 *         the current assignment for the given user (can_receive / can_send /
 *         receives_notifications). Channels with no row are returned as "unassigned".
 * PUT  -> replaces the user's assignments in `channel_user_assignments` (the
 *         unified table consumed by inbox access enforcement & the Gmail resolver).
 *
 * Admin-only (requireTenantAdmin). Everything is scoped to the caller's tenant.
 */

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

export async function GET(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params
    const { propertyId } = await requireTenantAdmin(request)
    const supabase = createServiceClient()

    // Ensure the target user belongs to this tenant.
    const { data: user } = await supabase
      .from("admin_users")
      .select("id, name, email, role, is_tenant_admin, property_id")
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

    return NextResponse.json({ user, permissions })
  } catch (error: any) {
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

    // Replace the full set of this user's assignments for the tenant.
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

    return NextResponse.json({ success: true, count: rows.length })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: accessErrorStatus(error) })
  }
}
