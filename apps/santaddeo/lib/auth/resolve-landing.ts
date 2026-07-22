import type { SupabaseClient } from "@supabase/supabase-js"

export type LandingPath = "/superadmin" | "/auth/choose-profile" | "/sales" | "/dashboard"

export interface ResolvedLanding {
  path: LandingPath
  isSalesAgent: boolean
  hasTenantAccess: boolean
  isSuperAdmin: boolean
  /** Nomi delle strutture a cui l'utente ha accesso (max 3), per l'anteprima del selettore. */
  hotels: string[]
}

/** Ruoli che, da soli, implicano accesso alla dashboard di struttura (tenant). */
const TENANT_ROLES = new Set(["property_admin", "admin", "sub_user", "consultant"])

/**
 * Determina dove instradare un utente dopo il login.
 *
 * Regole:
 * - super_admin            -> /superadmin
 * - venditore + tenant     -> /auth/choose-profile  (deve scegliere l'area di lavoro)
 * - solo venditore         -> /sales
 * - tutto il resto         -> /dashboard
 *
 * "Accesso tenant" = almeno una riga in `user_property_map` OPPURE un ruolo tenant
 * (property_admin/admin/sub_user/consultant) OPPURE un'organizzazione assegnata.
 * NB: usiamo `user_property_map` (sorgente reale dell'accesso struttura), NON la
 * vecchia `hotel_users`.
 */
export async function resolveLanding(
  admin: SupabaseClient,
  userId: string,
): Promise<ResolvedLanding> {
  const [profileRes, salesAgentRes, propertyMapRes] = await Promise.all([
    admin.from("profiles").select("role, organization_id").eq("id", userId).maybeSingle(),
    admin.from("sales_agents").select("id, is_active").eq("user_id", userId).maybeSingle(),
    admin
      .from("user_property_map")
      .select("hotel_id, hotels(name)")
      .eq("user_id", userId)
      .limit(3),
  ])

  const role = profileRes.data?.role ?? null
  const organizationId = profileRes.data?.organization_id ?? null
  const propertyRows = propertyMapRes.data ?? []

  const isSuperAdmin = role === "super_admin"
  const isSalesAgent = role === "sales_agent" || salesAgentRes.data != null
  const hasTenantAccess =
    propertyRows.length > 0 ||
    (role != null && TENANT_ROLES.has(role)) ||
    organizationId != null

  const hotels = propertyRows
    .map((r) => (r.hotels as { name?: string } | null)?.name)
    .filter((n): n is string => Boolean(n))

  let path: LandingPath = "/dashboard"
  if (isSuperAdmin) {
    path = "/superadmin"
  } else if (isSalesAgent && hasTenantAccess) {
    path = "/auth/choose-profile"
  } else if (isSalesAgent) {
    path = "/sales"
  }

  return { path, isSalesAgent, hasTenantAccess, isSuperAdmin, hotels }
}
