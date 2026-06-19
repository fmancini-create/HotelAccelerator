import type { NextRequest } from "next/server"
import { redirect } from "next/navigation"
import { createServiceClient } from "@/lib/supabase/server"
import { getCallerIdentity } from "@/lib/auth/admin-access"
import { BASELINE_AREA_KEYS, GRANTABLE_AREA_KEYS } from "@/lib/platform/areas"

/**
 * Area-level access control.
 *
 * Orthogonal to channel permissions: this decides which top-level SECTIONS of
 * the admin app a user can see/open. Admins (super_admin / tenant admin) get
 * every area. Regular members get the baseline areas plus whatever has been
 * explicitly granted to them directly (`user_area_permissions`) or via a group
 * they belong to (`group_area_permissions` + `user_group_members`).
 */

/**
 * Computes the set of area keys a tenant member can access. Only grantable
 * areas are honored from the DB (defense-in-depth: a stale row for an
 * admin-only/baseline key can't change behavior). Baseline keys are always
 * included.
 */
export async function getMemberEffectiveAreas(propertyId: string, adminUserId: string): Promise<string[]> {
  const supabase = createServiceClient()
  const effective = new Set<string>(BASELINE_AREA_KEYS)

  // Direct user grants.
  const { data: userAreas } = await supabase
    .from("user_area_permissions")
    .select("area_key")
    .eq("property_id", propertyId)
    .eq("user_id", adminUserId)

  for (const row of userAreas ?? []) {
    if (GRANTABLE_AREA_KEYS.has(row.area_key)) effective.add(row.area_key)
  }

  // Grants inherited from the user's groups.
  const { data: memberships } = await supabase
    .from("user_group_members")
    .select("group_id")
    .eq("user_id", adminUserId)

  const groupIds = (memberships ?? []).map((m: { group_id: string }) => m.group_id).filter(Boolean)
  if (groupIds.length > 0) {
    const { data: groupAreas } = await supabase
      .from("group_area_permissions")
      .select("area_key")
      .eq("property_id", propertyId)
      .in("group_id", groupIds)

    for (const row of groupAreas ?? []) {
      if (GRANTABLE_AREA_KEYS.has(row.area_key)) effective.add(row.area_key)
    }
  }

  return Array.from(effective)
}

/**
 * Returns the effective area keys for the current caller, or "*" semantics via
 * `isAdmin`. Used by /api/platform/me and any server consumer.
 */
export async function getEffectiveAreasForCaller(
  request?: NextRequest,
): Promise<{ isAdmin: boolean; areas: string[] }> {
  const identity = await getCallerIdentity(request)
  if (!identity) return { isAdmin: false, areas: [] }
  if (identity.isSuperAdmin || identity.isTenantAdmin) {
    return { isAdmin: true, areas: [] } // admin => all areas (no filtering)
  }
  if (!identity.propertyId || !identity.adminUserId) {
    return { isAdmin: false, areas: [...BASELINE_AREA_KEYS] }
  }
  const areas = await getMemberEffectiveAreas(identity.propertyId, identity.adminUserId)
  return { isAdmin: false, areas }
}

/**
 * Server-side guard for a grantable area page (use in a route segment
 * `layout.tsx`). Admins always pass. A member passes only if the area is in
 * their effective set; otherwise they are redirected to the dashboard.
 * Unauthenticated users go to the login gate.
 *
 * Hiding nav items is not enough — without this, a member could open the
 * section by typing the URL. The underlying APIs should still enforce their
 * own access; this is the UI line of defense.
 */
export async function requireAreaPage(areaKey: string): Promise<void> {
  const identity = await getCallerIdentity()

  if (!identity) {
    redirect("/admin")
  }

  if (identity.isSuperAdmin || identity.isTenantAdmin) {
    return
  }

  if (!identity.propertyId || !identity.adminUserId) {
    redirect("/admin/dashboard")
  }

  // Baseline areas are always allowed.
  if (BASELINE_AREA_KEYS.includes(areaKey)) return

  const areas = await getMemberEffectiveAreas(identity.propertyId, identity.adminUserId)
  if (!areas.includes(areaKey)) {
    redirect("/admin/dashboard")
  }
}
