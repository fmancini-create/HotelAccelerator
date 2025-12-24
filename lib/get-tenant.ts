import { headers } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { DEFAULT_PROPERTY_ID } from "@/lib/tenant"

export interface CurrentTenant {
  id: string
  name: string
  slug: string
  subdomain: string | null
  custom_domain: string | null
  frontend_enabled: boolean
  logo_url: string | null
  settings: Record<string, unknown>
}

/**
 * Ottiene il tenant corrente dal middleware header o fallback a default
 * Da usare nei Server Components
 */
export async function getCurrentTenant(): Promise<CurrentTenant | null> {
  const headersList = await headers()
  const tenantIdentifier = headersList.get("x-tenant-identifier")
  const tenantType = headersList.get("x-tenant-type")

  // Se non c'è identificatore, siamo su dominio admin -> usa default
  if (!tenantIdentifier) {
    return getDefaultTenant()
  }

  const supabase = await createClient()

  // Cerca per subdomain o custom_domain
  const column = tenantType === "custom_domain" ? "custom_domain" : "subdomain"

  const { data, error } = await supabase
    .from("properties")
    .select("id, name, slug, subdomain, custom_domain, frontend_enabled, logo_url, settings")
    .eq(column, tenantIdentifier)
    .eq("frontend_enabled", true)
    .single()

  if (error || !data) {
    console.error("[v0] Tenant not found:", tenantIdentifier, error)
    return null
  }

  return data as CurrentTenant
}

/**
 * Ottiene il tenant di default (Villa I Barronci)
 */
async function getDefaultTenant(): Promise<CurrentTenant | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("properties")
    .select("id, name, slug, subdomain, custom_domain, frontend_enabled, logo_url, settings")
    .eq("id", DEFAULT_PROPERTY_ID)
    .single()

  if (error || !data) {
    console.error("[v0] Default tenant not found:", error)
    return null
  }

  return data as CurrentTenant
}

/**
 * Verifica se il tenant corrente ha il frontend abilitato
 */
export async function isFrontendEnabled(): Promise<boolean> {
  const tenant = await getCurrentTenant()
  return tenant?.frontend_enabled ?? false
}
