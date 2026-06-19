import type { NextRequest } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createClient, createClientWithToken } from "@/lib/supabase/server"
import { getDevBypass, getTokenFromRequest } from "@/lib/auth-property"

/**
 * Channel access resolution, shared by the unified inbox and the Gmail routes.
 *
 * An "admin" sees every channel of the tenant. A "restricted" user sees only the
 * channels explicitly assigned to them in `channel_user_assignments`.
 *
 * Admin = dev/preview bypass, platform super_admin, or tenant admin
 * (`is_tenant_admin` true, or role in admin/owner/super_admin).
 */
export interface ChannelAccess {
  isAdmin: boolean
  adminUserId: string | null
  email: string | null
  /** Authenticated Supabase client, reusable by the caller. */
  supabase: SupabaseClient
}

export async function getChannelAccess(request?: NextRequest): Promise<ChannelAccess> {
  // Dev/preview bypass -> treat as admin (sees everything), matching auth-property.
  if (await getDevBypass(request)) {
    const supabase = await createClient()
    return { isAdmin: true, adminUserId: null, email: null, supabase }
  }

  const token = request ? await getTokenFromRequest(request) : undefined
  const supabase = token ? await createClientWithToken(token) : await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { isAdmin: false, adminUserId: null, email: null, supabase }
  }

  // Platform super_admin -> full access.
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

  if (!adminUser) {
    return { isAdmin: false, adminUserId: null, email: user.email ?? null, supabase }
  }

  const isAdmin =
    adminUser.is_tenant_admin === true ||
    ["admin", "owner", "super_admin"].includes(String(adminUser.role))

  return { isAdmin, adminUserId: adminUser.id, email: user.email ?? null, supabase }
}

export interface AccessibleChannelIds {
  emailChannelIds: string[]
  messagingChannelIds: string[]
  chatChannelIds: string[]
}

/**
 * Reads the channels explicitly assigned to a (restricted) user.
 * `channel_type` mapping:
 *  - 'email'           -> emailChannelIds   (email_channels.id)
 *  - 'chat'            -> chatChannelIds     (embed_scripts.id)
 *  - everything else   -> messagingChannelIds (messaging_channels.id: whatsapp/telegram/...)
 */
export async function getAccessibleChannelIds(
  supabase: SupabaseClient,
  propertyId: string,
  adminUserId: string,
): Promise<AccessibleChannelIds> {
  const { data } = await supabase
    .from("channel_user_assignments")
    .select("channel_type, channel_id")
    .eq("property_id", propertyId)
    .eq("user_id", adminUserId)

  const result: AccessibleChannelIds = {
    emailChannelIds: [],
    messagingChannelIds: [],
    chatChannelIds: [],
  }

  for (const row of data ?? []) {
    if (!row.channel_id) continue
    if (row.channel_type === "email") result.emailChannelIds.push(row.channel_id)
    else if (row.channel_type === "chat") result.chatChannelIds.push(row.channel_id)
    else result.messagingChannelIds.push(row.channel_id)
  }

  return result
}

/**
 * True if the caller may operate on a specific email channel: admins always
 * can; a restricted member can only act on channels explicitly assigned to
 * them. Use to gate per-channel email routes (settings, labels, sync, update).
 */
export async function canAccessEmailChannel(
  access: ChannelAccess,
  propertyId: string,
  channelId: string,
): Promise<boolean> {
  if (access.isAdmin) return true
  if (!access.adminUserId) return false
  const ids = await getAccessibleChannelIds(access.supabase, propertyId, access.adminUserId)
  return ids.emailChannelIds.includes(channelId)
}
