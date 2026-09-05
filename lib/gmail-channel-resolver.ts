import type { SupabaseClient } from "@supabase/supabase-js"
import { readActivePropertyOverride } from "@/lib/platform-context"

export interface AccessibleGmailChannel {
  id: string
  email: string | null
  name: string | null
  reconnectRequired?: boolean
  lastSyncError?: string | null
}

/**
 * Lists every active Gmail channel the current user is allowed to operate on
 * inside the CURRENT tenant context.
 *
 * Resolution order (tenant-aware, multi-tenant safe):
 *  1. platform super_admin -> every active Gmail channel of the tenant selected
 *     with the global tenant switcher (never every mailbox across the platform)
 *  2. tenant admin/owner   -> every active Gmail channel of admin_users.property_id
 *  3. restricted member   -> explicitly granted channels, intersected with the
 *     member's property_id
 *
 * Returns an empty array if no tenant is selected or no channel is accessible.
 */
export async function listAccessibleGmailChannels(
  supabase: SupabaseClient,
  userId: string,
): Promise<AccessibleGmailChannel[]> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user || user.id !== userId) return []

  const [{ data: adminUser, error: adminError }, { data: collaborator, error: collaboratorError }] = await Promise.all([
    supabase
      .from("admin_users")
      .select("role, property_id, is_tenant_admin")
      .eq("id", userId)
      .maybeSingle(),
    user.email
      ? supabase
          .from("platform_collaborators")
          .select("role, is_active")
          .eq("email", user.email)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  if (adminError) throw new Error(`Gmail channel authorization unavailable: ${adminError.code || "database"}`)
  if (collaboratorError) {
    throw new Error(`Gmail platform authorization unavailable: ${collaboratorError.code || "database"}`)
  }

  const isPlatformSuperAdmin = collaborator?.role === "super_admin" && collaborator.is_active === true
  const activePropertyId = isPlatformSuperAdmin ? await readActivePropertyOverride() : null
  const propertyId = isPlatformSuperAdmin ? activePropertyId : adminUser?.property_id ?? null

  // A platform super admin without an explicitly selected tenant must never fall
  // back to their legacy/admin_users property: that would silently show 4BID (or
  // another tenant) while the global selector says something else.
  if (!propertyId) return []

  const isTenantAdmin =
    adminUser?.is_tenant_admin === true ||
    ["admin", "owner", "super_admin"].includes(String(adminUser?.role ?? ""))

  const mapRows = (rows: any[] | null | undefined): AccessibleGmailChannel[] =>
    (rows ?? []).map((r) => ({
      id: r.id,
      email: r.email_address ?? null,
      name: r.display_name ?? r.name ?? r.email_address ?? null,
      reconnectRequired: r.oauth_reconnect_required === true,
      lastSyncError: r.last_sync_error ?? null,
    }))

  // Admins can operate every Gmail mailbox, but ONLY inside the resolved tenant.
  if (isPlatformSuperAdmin || isTenantAdmin) {
    const { data, error } = await supabase
      .from("email_channels")
      .select("id, email_address, name, display_name, oauth_reconnect_required, last_sync_error")
      .eq("provider", "gmail")
      .eq("is_active", true)
      .eq("property_id", propertyId)
      .order("email_address")
    if (error) throw new Error(`Gmail tenant channel list unavailable: ${error.code || "database"}`)
    return mapRows(data)
  }

  // Restricted member: explicit grants only. The generic assignment table is
  // tenant-scoped at source; legacy grant tables are intersected with
  // email_channels.property_id below so they cannot leak another tenant.
  const [genericResult, permsResult, assignsResult] = await Promise.all([
    supabase
      .from("channel_user_assignments")
      .select("channel_id")
      .eq("property_id", propertyId)
      .eq("user_id", userId)
      .eq("channel_type", "email"),
    supabase.from("user_channel_permissions").select("channel_id").eq("user_id", userId),
    supabase.from("email_channel_assignments").select("channel_id").eq("user_id", userId),
  ])
  const permissionError = genericResult.error || permsResult.error || assignsResult.error
  if (permissionError) {
    throw new Error(`Gmail channel permissions unavailable: ${permissionError.code || "database"}`)
  }

  const grantedIds = Array.from(
    new Set(
      [...(genericResult.data ?? []), ...(permsResult.data ?? []), ...(assignsResult.data ?? [])]
        .map((r: any) => r.channel_id)
        .filter(Boolean),
    ),
  )

  if (grantedIds.length === 0) return []

  const { data, error } = await supabase
    .from("email_channels")
    .select("id, email_address, name, display_name, oauth_reconnect_required, last_sync_error")
    .in("id", grantedIds)
    .eq("provider", "gmail")
    .eq("is_active", true)
    .eq("property_id", propertyId)
    .order("email_address")
  if (error) throw new Error(`Gmail assigned channel list unavailable: ${error.code || "database"}`)

  return mapRows(data)
}

/**
 * Resolves the Gmail channel ID to operate on for the current user and tenant.
 *
 * If `requestedChannelId` is provided AND the user is allowed to access it in
 * the active tenant, that channel is used. Otherwise it falls back to the first
 * accessible channel of that same tenant. A requested ID from another tenant is
 * therefore never opened, even by a platform super admin working in tenant mode.
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
    // Requested but not accessible in the active tenant -> safe tenant-local fallback.
  }

  return { channelId: channels[0].id, reason: "default_first" }
}
