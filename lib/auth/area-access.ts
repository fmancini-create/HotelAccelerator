import type { NextRequest } from "next/server"
import { redirect } from "next/navigation"
import { createServiceClient } from "@/lib/supabase/server"
import { getCallerIdentity, AccessError } from "@/lib/auth/admin-access"
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
 * Guardia di area per le ROTTE API — gemella di `requireAreaPage`.
 *
 * Nasce dal difetto descritto nel commento di `requireAreaPage` stesso: le
 * pagine erano presidiate, le API no. Un membro senza il permesso "CRM" non
 * vedeva la sezione, ma poteva chiamare `/api/admin/crm/contacts` a mano.
 *
 * DUE MODALITA'
 *  - "observe" (predefinita): calcola la decisione e la registra, ma NON
 *    blocca mai. Serve a misurare su traffico vero chi verrebbe respinto,
 *    prima di attivare. Un presidio attivato alla cieca puo' essere
 *    sempre-rosso e bloccare utenti legittimi.
 *  - "enforce": lancia AccessError(403) quando l'area non e' concessa.
 * Si sceglie con la variabile d'ambiente `AREA_GUARD_MODE`.
 *
 * IN CASO DI ERRORE DEL DATABASE LASCIA PASSARE, di proposito. Un guasto in
 * lettura non deve spegnere l'applicazione per tutti: la pagina e' comunque
 * gia' presidiata e le query restano vincolate al `property_id`. L'evento
 * viene registrato in modo esplicito per non passare inosservato.
 */
export type AreaGuardMode = "observe" | "enforce"

export function getAreaGuardMode(): AreaGuardMode {
  return process.env.AREA_GUARD_MODE === "enforce" ? "enforce" : "observe"
}

export interface AreaDecision {
  areaKey: string
  allowed: boolean
  /** Perche' e' stata presa questa decisione (utile nella misura). */
  reason: "admin" | "baseline" | "granted" | "not-granted" | "no-identity" | "db-error"
  mode: AreaGuardMode
  email: string | null
}

/**
 * Calcola la decisione di accesso a un'area SENZA applicarla.
 * Esposta a parte per poter misurare e provare la logica in isolamento.
 */
export async function evaluateAreaAccess(areaKey: string, request?: NextRequest): Promise<AreaDecision> {
  const mode = getAreaGuardMode()

  let identity: Awaited<ReturnType<typeof getCallerIdentity>> = null
  try {
    identity = await getCallerIdentity(request)
  } catch {
    return { areaKey, allowed: true, reason: "db-error", mode, email: null }
  }

  if (!identity) {
    // Non autenticato: se ne occupa il controllo di autenticazione della rotta,
    // non questa guardia. Nessun parere.
    return { areaKey, allowed: true, reason: "no-identity", mode, email: null }
  }

  const email = identity.email

  if (identity.isSuperAdmin || identity.isTenantAdmin) {
    return { areaKey, allowed: true, reason: "admin", mode, email }
  }

  if (BASELINE_AREA_KEYS.includes(areaKey)) {
    return { areaKey, allowed: true, reason: "baseline", mode, email }
  }

  if (!identity.propertyId || !identity.adminUserId) {
    return { areaKey, allowed: false, reason: "not-granted", mode, email }
  }

  try {
    const areas = await getMemberEffectiveAreas(identity.propertyId, identity.adminUserId)
    const allowed = areas.includes(areaKey)
    return { areaKey, allowed, reason: allowed ? "granted" : "not-granted", mode, email }
  } catch {
    return { areaKey, allowed: true, reason: "db-error", mode, email }
  }
}

/**
 * Applica la guardia di area a una rotta API.
 * In "observe" registra e lascia passare; in "enforce" lancia AccessError(403).
 */
export async function requireAreaApi(areaKey: string, request?: NextRequest): Promise<AreaDecision> {
  const decision = await evaluateAreaAccess(areaKey, request)

  if (!decision.allowed) {
    // Riga stabile e cercabile nei log: e' la misura su cui si decide se e
    // quando passare a "enforce".
    console.log(
      `[v0] area-guard ${decision.mode} area=${decision.areaKey} allowed=false ` +
        `reason=${decision.reason} email=${decision.email ?? "?"}`,
    )
  }

  if (decision.mode === "enforce" && !decision.allowed) {
    throw new AccessError(`Accesso negato: area "${areaKey}" non concessa`, 403)
  }

  return decision
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
