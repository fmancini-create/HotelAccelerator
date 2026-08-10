import type { NextRequest } from "next/server"
import { createClient, createClientWithToken } from "@/lib/supabase/server"
import { readActivePropertyOverride } from "@/lib/platform-context"

// SECURITY: il bypass dev deve attivarsi SOLO in sviluppo locale.
// Mai su preview pubbliche o produzione (host raggiungibili da terzi).
function isLocalDevHost(host: string): boolean {
  // Rimuovi eventuale porta (es. "localhost:3000") prima del confronto.
  const hostname = host.split(":")[0].trim().toLowerCase()
  return hostname === "localhost" || hostname === "127.0.0.1"
}

export async function getDevBypass(request?: NextRequest): Promise<boolean> {
  // Il bypass è consentito solo in ambiente di sviluppo locale.
  if (process.env.NODE_ENV !== "development") {
    return false
  }
  // Se è disponibile una request, l'host deve essere esattamente localhost/127.0.0.1.
  if (request) {
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || ""
    return isLocalDevHost(host)
  }
  // Senza request: consentito solo perché NODE_ENV === "development".
  return true
}

export async function getTokenFromRequest(request: NextRequest): Promise<string | undefined> {
  if (await getDevBypass(request)) {
    return "dev-dummy-token-for-preview"
  }

  const cookies = request.headers.get("cookie") || ""

  const authHeader = request.headers.get("authorization")
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7)
  }

  const tokenMatch = cookies.match(/sb-[a-zA-Z0-9]+-auth-token=([^;]+)/)
  const tokenMatch2 = cookies.match(/sb-[a-zA-Z0-9]+-auth-token\.0=([^;]+)/)
  const matchToUse = tokenMatch || tokenMatch2

  if (matchToUse) {
    try {
      let cookieValue = matchToUse[1]
      try { cookieValue = decodeURIComponent(cookieValue) } catch {}
      const decoded = JSON.parse(cookieValue)
      if (Array.isArray(decoded) && decoded[0]?.access_token) return decoded[0].access_token
      if (decoded?.access_token) return decoded.access_token
    } catch {}
  }

  return undefined
}

/**
 * Ottiene il property_id dell'utente autenticato dalla sessione
 * Usato nelle API routes admin per verificare l'accesso
 */
export async function getAuthenticatedPropertyId(request?: NextRequest): Promise<string> {
  if (await getDevBypass(request)) {
    return "c16ad260-2c34-4544-9909-5cd444773986"
  }

  const token = request ? await getTokenFromRequest(request) : undefined
  const supabase = token ? await createClientWithToken(token) : await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error("Non autenticato")
  }

  // Platform super_admin: resolve via cookie or ?property_id override.
  // This is the architecturally correct path for cross-tenant identities
  // (see lib/platform-context.ts and project instructions).
  const { data: collaborator } = await supabase
    .from("platform_collaborators")
    .select("role, is_active")
    .eq("email", user.email)
    .maybeSingle()

  if (collaborator?.role === "super_admin" && collaborator.is_active) {
    const override = readActivePropertyOverride(request)
    if (override) return override
    throw new Error("Super admin: nessun tenant selezionato. Usa il selettore tenant.")
  }

  // Tenant admin: property_id is scoped in admin_users.
  // `id` e `is_tenant_admin` servono alla guardia di area qui sotto: sono presi
  // nella stessa query, quindi non aggiungono un viaggio al database.
  const { data: adminUser, error: adminError } = await supabase
    .from("admin_users")
    .select("property_id, id, is_tenant_admin")
    .eq("id", user.id)
    .maybeSingle()

  if (adminError) {
    throw new Error("Errore nel recupero dei dati utente")
  }

  if (!adminUser?.property_id) {
    throw new Error("Utente non associato a nessuna struttura")
  }

  // GUARDIA DI AREA (vedi lib/auth/api-area-map.ts).
  // I permessi per area erano applicati solo alle pagine: le API non li
  // verificavano, quindi un membro senza il permesso di una sezione poteva
  // comunque chiamarne le rotte a mano. Il controllo vive qui, in un punto solo
  // attraversato da 91 chiamate, invece che ripetuto in decine di file dove
  // sarebbe facile dimenticarlo su una rotta nuova.
  await enforceAreaForRequest(request, {
    adminUserId: adminUser.id,
    propertyId: adminUser.property_id,
    isTenantAdmin: adminUser.is_tenant_admin === true,
    email: user.email ?? null,
  })

  return adminUser.property_id
}

/**
 * Applica (o solo osserva) il permesso di area per la rotta chiamata.
 *
 * Senza `request` non c'e' percorso, quindi non c'e' area da verificare: 15
 * rotte chiamano gli aiutanti senza passare la richiesta e restano quindi
 * NON osservate. Non e' un dettaglio nascosto: `npm run check:area-guard` le
 * elenca, perche' una guardia che manca un pezzo in silenzio e' peggio di una
 * guardia assente.
 *
 * L'import e' dinamico per non creare un ciclo fra i moduli
 * (area-access -> admin-access -> auth-property).
 */
async function enforceAreaForRequest(
  request: NextRequest | undefined,
  member: { adminUserId: string; propertyId: string; isTenantAdmin: boolean; email: string | null },
): Promise<void> {
  console.log(`[v0] guard-debug entrata request=${!!request} admin=${member.isTenantAdmin} email=${member.email}`)
  if (!request) return

  // Gli amministratori del tenant hanno ogni area: nessuna query aggiuntiva.
  if (member.isTenantAdmin) return

  try {
    const { resolveApiArea } = await import("@/lib/auth/api-area-map")
    const percorso = new URL(request.url).pathname
    const areaKey = resolveApiArea(percorso)
    console.log(`[v0] guard-debug percorso=${percorso} area=${areaKey}`)
    if (!areaKey) return

    const { BASELINE_AREA_KEYS } = await import("@/lib/platform/areas")
    if (BASELINE_AREA_KEYS.includes(areaKey)) return

    const { getMemberEffectiveAreas, getAreaGuardMode } = await import("@/lib/auth/area-access")
    const aree = await getMemberEffectiveAreas(member.propertyId, member.adminUserId)
    if (aree.includes(areaKey)) return

    const mode = getAreaGuardMode()
    console.log(
      `[v0] area-guard ${mode} area=${areaKey} allowed=false reason=not-granted email=${member.email ?? "?"}`,
    )

    if (mode === "enforce") {
      throw new AreaAccessDenied(areaKey)
    }
  } catch (error) {
    // Rilancia solo il diniego voluto. Qualsiasi altro guasto (database
    // irraggiungibile, import fallito) NON deve spegnere l'applicazione: la
    // pagina resta comunque presidiata e le query restano vincolate al
    // property_id. Registrato per non passare inosservato.
    if (error instanceof AreaAccessDenied) throw error
    console.log(`[v0] area-guard errore non bloccante: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** Diniego di area. Le rotte lo mappano a 403 tramite accessErrorStatus. */
export class AreaAccessDenied extends Error {
  status = 403
  constructor(areaKey: string) {
    super(`Accesso negato: area "${areaKey}" non concessa`)
    this.name = "AreaAccessDenied"
  }
}

/**
 * Ottiene l'utente autenticato e il suo property_id
 */
export async function getAuthenticatedUser(request?: NextRequest) {
  if (await getDevBypass(request)) {
    return {
      id: "dev-user-id",
      property_id: "c16ad260-2c34-4544-9909-5cd444773986",
      role: "admin",
      name: "Dev Admin",
    }
  }

  const token = request ? await getTokenFromRequest(request) : undefined
  const supabase = token ? await createClientWithToken(token) : await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error("Non autenticato")
  }

  const { data: adminUser, error: adminError } = await supabase
    .from("admin_users")
    .select("id, property_id, role, name")
    .eq("id", user.id)
    .maybeSingle()

  if (adminError || !adminUser) {
    throw new Error("Utente non trovato")
  }

  return {
    userId: user.id,
    adminUserId: adminUser.id,
    propertyId: adminUser.property_id,
    role: adminUser.role,
    fullName: adminUser.name,
  }
}

/**
 * Ottiene l'email dell'utente autenticato
 */
export async function getAuthenticatedUserEmail(request?: NextRequest): Promise<string> {
  // DEV BYPASS (solo sviluppo locale, logica centralizzata in getDevBypass)
  if (await getDevBypass(request)) {
    return "dev@hotelaccelerator.local"
  }

  const token = request ? await getTokenFromRequest(request) : undefined
  const supabase = token ? await createClientWithToken(token) : await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user || !user.email) {
    throw new Error("Non autenticato")
  }

  return user.email
}

/**
 * Ottiene il property_id con override per super admin
 * I super admin possono operare su qualsiasi property se specificato nel query param
 */
export async function getAuthenticatedPropertyIdWithSuperAdminOverride(request?: NextRequest): Promise<string> {
  if (await getDevBypass(request)) {
    return "c16ad260-2c34-4544-9909-5cd444773986"
  }

  const token = request ? await getTokenFromRequest(request) : undefined
  const supabase = token ? await createClientWithToken(token) : await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error("Non autenticato")
  }

  // Check if user is a platform super admin
  const { data: collaborator } = await supabase
    .from("platform_collaborators")
    .select("role, is_active")
    .eq("email", user.email)
    .maybeSingle()

  // Super admins resolve via explicit ?property_id, else via active-tenant cookie.
  if (collaborator?.role === "super_admin" && collaborator?.is_active) {
    const override = readActivePropertyOverride(request)
    if (override) return override
  }

  // Otherwise, get the user's own property_id
  const { data: adminUser, error: adminError } = await supabase
    .from("admin_users")
    .select("property_id")
    .eq("id", user.id)
    .maybeSingle()

  if (adminError) {
    throw new Error("Errore nel recupero dei dati utente")
  }

  if (!adminUser?.property_id) {
    throw new Error("Utente non associato a nessuna struttura")
  }

  return adminUser.property_id
}

/**
 * Aggiunge property_id a un oggetto per insert/update
 * Helper per multitenancy
 */
export function withPropertyId<T extends Record<string, unknown>>(
  data: T,
  propertyId: string,
): T & { property_id: string } {
  return { ...data, property_id: propertyId }
}

/**
 * Ottiene il property_id dalla sessione (alias for getAuthenticatedPropertyId)
 */
export async function getPropertyFromSession(request?: NextRequest): Promise<string> {
  return getAuthenticatedPropertyId(request)
}

/**
 * Ottiene la property corrente (alias for getAuthenticatedPropertyId)
 */
export async function getCurrentProperty(request?: NextRequest): Promise<string> {
  return getAuthenticatedPropertyId(request)
}

export { getAuthenticatedPropertyId as default }
