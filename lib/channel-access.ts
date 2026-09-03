import type { NextRequest } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createClient, createClientWithToken } from "@/lib/supabase/server"
import { getDevBypass, getTokenFromRequest } from "@/lib/auth-property"
import {
  hasChannelCapability,
  resolveEffectiveChannelGrants,
  type ChannelCapability,
  type EffectiveChannelGrant,
  type TenantChannelRef,
} from "@/lib/auth/channel-permissions"

/**
 * Channel access resolution, shared by the unified inbox and the channel routes.
 *
 * An admin sees every channel of the tenant. A restricted member sees the union
 * of channels assigned directly to them and channels inherited from groups.
 * Everything is intersected with the tenant's real channel inventory so a stale
 * or foreign permission row cannot open another tenant's channel.
 */
export interface ChannelAccess {
  isAdmin: boolean
  adminUserId: string | null
  email: string | null
  /** Authenticated Supabase client, reusable by the caller. */
  supabase: SupabaseClient
}

export async function getChannelAccess(request?: NextRequest): Promise<ChannelAccess> {
  if (await getDevBypass(request)) {
    const supabase = await createClient()
    return { isAdmin: true, adminUserId: null, email: null, supabase }
  }

  const token = request ? await getTokenFromRequest(request) : undefined
  const supabase = token ? await createClientWithToken(token) : await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { isAdmin: false, adminUserId: null, email: null, supabase }

  const { data: collaborator } = await supabase
    .from("platform_collaborators")
    .select("role, is_active")
    .eq("email", user.email)
    .maybeSingle()

  if (collaborator?.role === "super_admin" && collaborator.is_active) {
    return { isAdmin: true, adminUserId: null, email: user.email ?? null, supabase }
  }

  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("id, role, is_tenant_admin")
    .eq("email", user.email)
    .maybeSingle()

  if (!adminUser) return { isAdmin: false, adminUserId: null, email: user.email ?? null, supabase }

  const isAdmin = adminUser.is_tenant_admin === true || ["admin", "owner", "super_admin"].includes(String(adminUser.role))
  return { isAdmin, adminUserId: adminUser.id, email: user.email ?? null, supabase }
}

export interface AccessibleChannelIds {
  emailChannelIds: string[]
  messagingChannelIds: string[]
  chatChannelIds: string[]
}

async function listTenantChannels(supabase: SupabaseClient, propertyId: string): Promise<TenantChannelRef[]> {
  const [emailResult, messagingResult, chatResult] = await Promise.all([
    supabase.from("email_channels").select("id").eq("property_id", propertyId),
    supabase.from("messaging_channels").select("id, channel_type").eq("property_id", propertyId),
    supabase.from("embed_scripts").select("id").eq("property_id", propertyId),
  ])

  const channels: TenantChannelRef[] = []
  for (const row of emailResult.data ?? []) channels.push({ channel_type: "email", channel_id: row.id })
  for (const row of messagingResult.data ?? []) channels.push({ channel_type: row.channel_type, channel_id: row.id })
  for (const row of chatResult.data ?? []) channels.push({ channel_type: "chat", channel_id: row.id })
  return channels
}

/** Effective grants for a restricted member, including group inheritance. */
export async function getEffectiveChannelGrants(
  supabase: SupabaseClient,
  propertyId: string,
  adminUserId: string,
): Promise<EffectiveChannelGrant[]> {
  const [{ data: directAssignments }, { data: memberships }, tenantChannels] = await Promise.all([
    supabase
      .from("channel_user_assignments")
      .select("channel_type, channel_id, can_send, can_receive")
      .eq("property_id", propertyId)
      .eq("user_id", adminUserId),
    supabase.from("user_group_members").select("group_id").eq("user_id", adminUserId),
    listTenantChannels(supabase, propertyId),
  ])

  const groupIds = (memberships ?? []).map((row: { group_id: string }) => row.group_id).filter(Boolean)
  let groupPermissions: any[] = []
  if (groupIds.length > 0) {
    const { data } = await supabase
      .from("group_channel_permissions")
      .select("channel_type, channel_id, can_read, can_write, can_manage")
      .eq("property_id", propertyId)
      .in("group_id", groupIds)
    groupPermissions = data ?? []
  }

  return resolveEffectiveChannelGrants({
    tenantChannels,
    directAssignments: directAssignments ?? [],
    groupPermissions,
  })
}

/** Reads only channel IDs, for list filtering in Inbox/dashboard APIs. */
export async function getAccessibleChannelIds(
  supabase: SupabaseClient,
  propertyId: string,
  adminUserId: string,
): Promise<AccessibleChannelIds> {
  const grants = await getEffectiveChannelGrants(supabase, propertyId, adminUserId)
  const result: AccessibleChannelIds = { emailChannelIds: [], messagingChannelIds: [], chatChannelIds: [] }

  for (const row of grants) {
    if (!row.can_read) continue
    if (row.channel_type === "email") result.emailChannelIds.push(row.channel_id)
    else if (row.channel_type === "chat") result.chatChannelIds.push(row.channel_id)
    else result.messagingChannelIds.push(row.channel_id)
  }
  return result
}

/** Capability-aware email authorization. Admins always pass. */
export async function canAccessEmailChannel(
  access: ChannelAccess,
  propertyId: string,
  channelId: string,
  capability: ChannelCapability = "read",
): Promise<boolean> {
  if (access.isAdmin) return true
  if (!access.adminUserId) return false
  const grants = await getEffectiveChannelGrants(access.supabase, propertyId, access.adminUserId)
  return hasChannelCapability(grants, "email", channelId, capability)
}
