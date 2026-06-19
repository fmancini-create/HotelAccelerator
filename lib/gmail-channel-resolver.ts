import type { SupabaseClient } from "@supabase/supabase-js"

export interface AccessibleGmailChannel {
  id: string
  email: string | null
  name: string | null
}

/**
 * Lists every active Gmail channel the current user is allowed to operate on.
 *
 * Resolution order (tenant-aware, multi-tenant safe):
 *  1. super_admin       -> every active Gmail channel across the platform
 *  2. is_tenant_admin   -> every active Gmail channel of the admin's property_id
 *  3. user_channel_permissions + email_channel_assignments (explicit grants)
 *
 * Returns an empty array if no channel is accessible.
 */
export async function listAccessibleGmailChannels(
  supabase: SupabaseClient,
  userId: string,
): Promise<AccessibleGmailChannel[]> {
  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("role, property_id, is_tenant_admin")
    .eq("id", userId)
    .maybeSingle()

  const mapRows = (rows: any[] | null | undefined): AccessibleGmailChannel[] =>
    (rows ?? []).map((r) => ({
      id: r.id,
      email: r.email_address ?? null,
      name: r.display_name ?? r.name ?? r.email_address ?? null,
    }))

  // 1. Super admin: every active Gmail channel
  if (adminUser?.role === "super_admin") {
    const { data } = await supabase
      .from("email_channels")
      .select("id, email_address, name, display_name")
      .eq("provider", "gmail")
      .eq("is_active", true)
      .order("email_address")
    return mapRows(data)
  }

  // 2. Tenant admin: every active Gmail channel of their property
  if (adminUser?.is_tenant_admin && adminUser.property_id) {
    const { data } = await supabase
      .from("email_channels")
      .select("id, email_address, name, display_name")
      .eq("provider", "gmail")
      .eq("is_active", true)
      .eq("property_id", adminUser.property_id)
      .order("email_address")
    const rows = mapRows(data)
    if (rows.length > 0) return rows
  }

  // 3. Explicit per-user grants. Primary source is the generic
  //    `channel_user_assignments` (channel_type='email'); legacy tables are kept
  //    as fallback so nothing breaks before/while backfilling.
  const [{ data: generic }, { data: perms }, { data: assigns }] = await Promise.all([
    supabase
      .from("channel_user_assignments")
      .select("channel_id")
      .eq("user_id", userId)
      .eq("channel_type", "email"),
    supabase.from("user_channel_permissions").select("channel_id").eq("user_id", userId),
    supabase.from("email_channel_assignments").select("channel_id").eq("user_id", userId),
  ])

  const grantedIds = Array.from(
    new Set(
      [...(generic ?? []), ...(perms ?? []), ...(assigns ?? [])]
        .map((r: any) => r.channel_id)
        .filter(Boolean),
    ),
  )

  if (grantedIds.length === 0) return []

  const { data } = await supabase
    .from("email_channels")
    .select("id, email_address, name, display_name")
    .in("id", grantedIds)
    .eq("provider", "gmail")
    .eq("is_active", true)
    .order("email_address")

  return mapRows(data)
}

/**
 * Resolves the Gmail channel ID to operate on for the current user.
 *
 * If `requestedChannelId` is provided AND the user is allowed to access it,
 * that channel is used. Otherwise it falls back to the first accessible channel.
 * This keeps mailbox selection user-driven while remaining tenant-safe: a user
 * can never operate on a mailbox they don't have access to.
 */
export async function resolveGmailChannelId(
  supabase: SupabaseClient,
  userId: string,
  requestedChannelId?: string | null,
): Promise<{ channelId: string | null; reason: string }> {
  const channels = await listAccessibleGmailChannels(supabase, userId)

  if (channels.length === 0) {
    return { channelId: null, reason: "no_access" }
  }

  if (requestedChannelId) {
    const match = channels.find((c) => c.id === requestedChannelId)
    if (match) {
      return { channelId: match.id, reason: "requested" }
    }
    // requested but not accessible -> fall through to default (never leak access)
  }

  return { channelId: channels[0].id, reason: "default_first" }
}
