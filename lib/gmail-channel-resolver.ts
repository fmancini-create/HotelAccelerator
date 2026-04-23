import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Resolves the Gmail channel ID accessible to the current user.
 *
 * Resolution order (tenant-aware, multi-tenant safe):
 *  1. super_admin         -> first active Gmail channel across the platform
 *  2. is_tenant_admin     -> first active Gmail channel of the admin's property_id
 *  3. user_channel_permissions
 *  4. email_channel_assignments
 *
 * Returns `null` if no channel is accessible.
 */
export async function resolveGmailChannelId(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ channelId: string | null; reason: string }> {
  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("role, property_id, is_tenant_admin")
    .eq("id", userId)
    .maybeSingle()

  // 1. Super admin: any active Gmail channel
  if (adminUser?.role === "super_admin") {
    const { data: channel } = await supabase
      .from("email_channels")
      .select("id")
      .eq("provider", "gmail")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()

    return { channelId: channel?.id ?? null, reason: "super_admin" }
  }

  // 2. Tenant admin: any active Gmail channel of their property
  if (adminUser?.is_tenant_admin && adminUser.property_id) {
    const { data: channel } = await supabase
      .from("email_channels")
      .select("id")
      .eq("provider", "gmail")
      .eq("is_active", true)
      .eq("property_id", adminUser.property_id)
      .limit(1)
      .maybeSingle()

    if (channel?.id) {
      return { channelId: channel.id, reason: "tenant_admin" }
    }
  }

  // 3. Explicit per-user channel permission
  const { data: channelPermission } = await supabase
    .from("user_channel_permissions")
    .select("channel_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle()

  if (channelPermission?.channel_id) {
    return { channelId: channelPermission.channel_id, reason: "user_channel_permissions" }
  }

  // 4. Legacy per-user email channel assignment
  const { data: channelAssignment } = await supabase
    .from("email_channel_assignments")
    .select("channel_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle()

  if (channelAssignment?.channel_id) {
    return { channelId: channelAssignment.channel_id, reason: "email_channel_assignments" }
  }

  return { channelId: null, reason: "no_access" }
}
