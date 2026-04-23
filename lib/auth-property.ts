import type { NextRequest } from "next/server"
import { createClient, createClientWithToken } from "@/lib/supabase/server"
import { readActivePropertyOverride } from "@/lib/platform-context"

function isDevOrPreviewHost(host: string): boolean {
  return (
    host.includes("vercel.run") ||
    host.includes("localhost") ||
    host.includes("127.0.0.1") ||
    host.includes("vusercontent.net")
  )
}

async function getDevBypass(request?: NextRequest): Promise<boolean> {
  // Se request è disponibile, leggi l'host da lì
  if (request) {
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || ""
    return isDevOrPreviewHost(host)
  }
  // Senza request (chiamata senza argomenti): usa env var o NODE_ENV
  // In produzione NEXT_PUBLIC_APP_URL sarà un dominio reale
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || ""
  if (appUrl && !isDevOrPreviewHost(appUrl)) return false
  // Fallback: NODE_ENV
  return process.env.NODE_ENV === "development"
}

async function getTokenFromRequest(request: NextRequest): Promise<string | undefined> {
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
  const { data: adminUser, error: adminError } = await supabase
    .from("admin_users")
    .select("property_id")
    .eq("email", user.email)
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
    .eq("email", user.email)
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
  // DEV/PREVIEW BYPASS
  if (request) {
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || ""
    const isDevOrPreview = host.includes("vercel.run") || 
                           host.includes("localhost") || 
                           host.includes("127.0.0.1") ||
                           host.includes("vusercontent.net")
    if (isDevOrPreview) {
      return "dev@hotelaccelerator.local"
    }
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
    .eq("email", user.email)
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
