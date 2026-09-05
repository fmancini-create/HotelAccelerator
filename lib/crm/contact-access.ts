import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { CallerIdentity } from "@/lib/auth/admin-access"

export type ContactVisibility = "tenant" | "private" | "groups"

export type ContactAccess = {
  unrestricted: boolean
  viewerUserId: string | null
  groupContactIds: string[]
}

export async function resolveContactAccess(
  db: SupabaseClient,
  identity: CallerIdentity & { propertyId: string },
): Promise<ContactAccess> {
  if (identity.isSuperAdmin || identity.isTenantAdmin) {
    return { unrestricted: true, viewerUserId: identity.adminUserId, groupContactIds: [] }
  }

  const viewerUserId = identity.adminUserId
  if (!viewerUserId) return { unrestricted: false, viewerUserId: null, groupContactIds: [] }

  const { data: memberships } = await db
    .from("user_group_members")
    .select("group_id, user_groups!inner(property_id)")
    .eq("user_id", viewerUserId)
    .eq("user_groups.property_id", identity.propertyId)

  const groupIds = [...new Set((memberships ?? []).map((r: any) => String(r.group_id)).filter(Boolean))]
  if (groupIds.length === 0) return { unrestricted: false, viewerUserId, groupContactIds: [] }

  const { data: shared } = await db
    .from("contact_visibility_groups")
    .select("contact_id")
    .eq("property_id", identity.propertyId)
    .in("group_id", groupIds)

  return {
    unrestricted: false,
    viewerUserId,
    groupContactIds: [...new Set((shared ?? []).map((r: any) => String(r.contact_id)).filter(Boolean))],
  }
}

export function applyContactAccess<T>(query: T, access: ContactAccess): T {
  if (access.unrestricted) return query
  const clauses = ["visibility_scope.eq.tenant"]
  if (access.viewerUserId) clauses.push(`owner_user_id.eq.${access.viewerUserId}`)
  if (access.groupContactIds.length > 0) {
    clauses.push(`and(visibility_scope.eq.groups,id.in.(${access.groupContactIds.join(",")}))`)
  }
  return (query as unknown as { or: (filter: string) => T }).or(clauses.join(","))
}

export function canReadContactRecord(contact: Record<string, unknown>, access: ContactAccess): boolean {
  if (access.unrestricted) return true
  const scope = String(contact.visibility_scope ?? "tenant")
  if (scope === "tenant") return true
  if (access.viewerUserId && String(contact.owner_user_id ?? "") === access.viewerUserId) return true
  return scope === "groups" && access.groupContactIds.includes(String(contact.id ?? ""))
}

export function normalizeRequestedContactVisibility(
  source: unknown,
  requested: unknown,
  viewerUserId: string | null,
): ContactVisibility {
  const sourceName = String(source ?? "manual").toLowerCase()
  if (sourceName !== "manual") return "tenant"
  const value = String(requested ?? "tenant")
  if (!viewerUserId) return "tenant"
  return value === "private" || value === "groups" ? value : "tenant"
}
