import { headers } from "next/headers"
import { createClient } from "@/lib/supabase/server"

export interface CurrentTenant {
  id: string
  name: string
  slug: string
  subdomain: string | null
  custom_domain: string | null
  frontend_enabled: boolean
  logo_url: string | null
  settings: Record<string, unknown>
  seo_title?: string
  seo_description?: string
  seo_og_image?: string
  seo_keywords?: string[]
}

/**
 * Ottiene il tenant corrente dal middleware header
 * Da usare nei Server Components per il FRONTEND pubblico
 *
 * NOTA: Questo è per il routing pubblico (subdomain/custom_domain).
 * Per operazioni admin con autenticazione, usa getAuthenticatedPropertyId()
 */
export async function getCurrentTenant(): Promise<CurrentTenant | null> {
  const headersList = await headers()
  const tenantIdentifier = headersList.get("x-tenant-identifier")
  const tenantType = headersList.get("x-tenant-type")

  if (!tenantIdentifier) {
    return null
  }

  const supabase = await createClient()

  // Cerca per subdomain o custom_domain
  const column = tenantType === "custom_domain" ? "custom_domain" : "subdomain"

  const { data, error } = await supabase
    .from("properties")
    .select(
      "id, name, slug, subdomain, custom_domain, frontend_enabled, logo_url, settings, seo_title, seo_description, seo_og_image, seo_keywords",
    )
    .eq(column, tenantIdentifier)
    .eq("frontend_enabled", true)
    .maybeSingle()

  if (error) {
    console.error("[TENANT] Error fetching tenant:", tenantIdentifier, error)
    return null
  }

  if (!data) {
    return null
  }

  return data as CurrentTenant
}

/**
 * Verifica se siamo sul dominio piattaforma (non tenant)
 */
export async function isPlatformDomain(): Promise<boolean> {
  const headersList = await headers()
  return headersList.get("x-is-platform-domain") === "true"
}

/**
 * Verifica se il tenant corrente ha il frontend abilitato
 */
export async function isFrontendEnabled(): Promise<boolean> {
  const tenant = await getCurrentTenant()
  return tenant?.frontend_enabled ?? false
}
