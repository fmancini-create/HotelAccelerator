import type { SupabaseClient } from "@supabase/supabase-js"
import type { CallerIdentity } from "@/lib/auth/admin-access"

export type CrmWorkspaceAccess = {
  id: string
  property_id: string
  name: string
  slug: string
  kind: string
  description: string | null
  icon: string | null
  color: string | null
  mode: "generic" | "hotel_date_requests"
  is_default: boolean
  is_active: boolean
  sort_order: number
  can_write: boolean
}

/**
 * Workspace CRM visibili al chiamante nel tenant attivo.
 *
 * Regola:
 * - tenant admin / superadmin: tutti i workspace attivi del tenant;
 * - membro CRM: un workspace senza righe in crm_workspace_groups e' pubblico
 *   all'interno del tenant; se ha gruppi, serve appartenenza ad almeno uno.
 *
 * La membership non accetta mai property_id dal browser: property e utente
 * arrivano dall'identita' server-side gia' verificata.
 */
export async function listAccessibleCrmWorkspaces(
  db: SupabaseClient,
  identity: CallerIdentity & { propertyId: string },
): Promise<CrmWorkspaceAccess[]> {
  const { data: workspaces, error } = await db
    .from("crm_workspaces")
    .select("id,property_id,name,slug,kind,description,icon,color,mode,is_default,is_active,sort_order")
    .eq("property_id", identity.propertyId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
  if (error) throw error
  if (!workspaces?.length) return []

  if (identity.isSuperAdmin || identity.isTenantAdmin) {
    return workspaces.map((w) => ({ ...w, can_write: true })) as CrmWorkspaceAccess[]
  }

  const workspaceIds = workspaces.map((w) => w.id as string)
  const { data: restrictions, error: restrictionsError } = await db
    .from("crm_workspace_groups")
    .select("workspace_id,group_id,can_read,can_write")
    .eq("property_id", identity.propertyId)
    .in("workspace_id", workspaceIds)
  if (restrictionsError) throw restrictionsError

  const byWorkspace = new Map<string, Array<{ group_id: string; can_read: boolean; can_write: boolean }>>()
  for (const row of restrictions ?? []) {
    const list = byWorkspace.get(row.workspace_id as string) ?? []
    list.push({
      group_id: row.group_id as string,
      can_read: row.can_read !== false,
      can_write: row.can_write !== false,
    })
    byWorkspace.set(row.workspace_id as string, list)
  }

  const adminUserId = identity.adminUserId
  const memberGroupIds = new Set<string>()
  if (adminUserId) {
    const allGroupIds = Array.from(new Set((restrictions ?? []).map((r) => r.group_id as string)))
    if (allGroupIds.length) {
      const { data: memberships, error: membershipError } = await db
        .from("user_group_members")
        .select("group_id")
        .eq("user_id", adminUserId)
        .in("group_id", allGroupIds)
      if (membershipError) throw membershipError
      for (const membership of memberships ?? []) memberGroupIds.add(membership.group_id as string)
    }
  }

  return workspaces.flatMap((workspace) => {
    const rules = byWorkspace.get(workspace.id as string) ?? []
    if (rules.length === 0) return [{ ...workspace, can_write: true } as CrmWorkspaceAccess]
    const matched = rules.filter((rule) => memberGroupIds.has(rule.group_id) && rule.can_read)
    if (!matched.length) return []
    return [{ ...workspace, can_write: matched.some((rule) => rule.can_write) } as CrmWorkspaceAccess]
  })
}

export async function requireCrmWorkspaceAccess(
  db: SupabaseClient,
  identity: CallerIdentity & { propertyId: string },
  workspaceId: string,
  write = false,
): Promise<CrmWorkspaceAccess> {
  const workspace = (await listAccessibleCrmWorkspaces(db, identity)).find((item) => item.id === workspaceId)
  if (!workspace) throw new Error("Workspace CRM non disponibile per questo utente.")
  if (write && !workspace.can_write) throw new Error("Workspace CRM disponibile in sola lettura.")
  return workspace
}
