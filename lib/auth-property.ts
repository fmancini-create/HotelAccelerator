import type { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * Ottiene il property_id dell'utente autenticato dalla sessione
 * Usato nelle API routes admin per verificare l'accesso
 */
export async function getAuthenticatedPropertyId(request: NextRequest): Promise<string> {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error("Non autenticato")
  }

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
export async function getAuthenticatedUser(request: NextRequest) {
  const supabase = await createClient()

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
 * Ottiene l'email dell'utente autenticato
 */
export async function getAuthenticatedUserEmail(): Promise<string> {
  const supabase = await createClient()

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
export async function getAuthenticatedPropertyIdWithSuperAdminOverride(request: NextRequest): Promise<string> {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error("Non autenticato")
  }

  // Check if user is a super admin
  const { data: collaborator } = await supabase
    .from("platform_collaborators")
    .select("role, is_active")
    .eq("email", user.email)
    .maybeSingle()

  // If super admin and property_id is provided in query, use that
  if (collaborator?.role === "super_admin" && collaborator?.is_active) {
    const url = new URL(request.url)
    const overridePropertyId = url.searchParams.get("property_id")
    if (overridePropertyId) {
      return overridePropertyId
    }
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
 * Ottiene il property_id dalla sessione (alias for getAuthenticatedPropertyId)
 */
export async function getPropertyFromSession(request: NextRequest): Promise<string> {
  return getAuthenticatedPropertyId(request)
}

/**
 * Ottiene la property corrente (alias for getAuthenticatedPropertyId)
 */
export async function getCurrentProperty(request: NextRequest): Promise<string> {
  return getAuthenticatedPropertyId(request)
}

export { getAuthenticatedPropertyId as default }
