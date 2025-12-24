import { createClient } from "@/lib/supabase/server"

export interface TenantInfo {
  id: string
  name: string
  slug: string
  subdomain: string | null
  custom_domain: string | null
  frontend_enabled: boolean
  logo_url: string | null
  settings: Record<string, unknown>
}

// Cache per evitare lookup ripetuti (TTL 5 minuti)
const tenantCache = new Map<string, { tenant: TenantInfo | null; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minuti

/**
 * Risolve il tenant dal hostname
 * Supporta:
 * - Subdomain: barronci.hotelaccelerator.com
 * - Custom domain: www.villaibarronci.com
 * - Development: localhost (usa DEFAULT_PROPERTY_ID)
 */
export async function resolveTenantFromHost(hostname: string): Promise<TenantInfo | null> {
  // Check cache
  const cached = tenantCache.get(hostname)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.tenant
  }

  const supabase = await createClient()
  let tenant: TenantInfo | null = null

  // 1. Prova custom domain esatto
  const { data: byDomain } = await supabase
    .from("properties")
    .select("id, name, slug, subdomain, custom_domain, frontend_enabled, logo_url, settings")
    .eq("custom_domain", hostname)
    .eq("frontend_enabled", true)
    .single()

  if (byDomain) {
    tenant = byDomain as TenantInfo
  } else {
    // 2. Estrai subdomain (es. barronci.hotelaccelerator.com -> barronci)
    const subdomain = extractSubdomain(hostname)
    if (subdomain) {
      const { data: bySubdomain } = await supabase
        .from("properties")
        .select("id, name, slug, subdomain, custom_domain, frontend_enabled, logo_url, settings")
        .eq("subdomain", subdomain)
        .eq("frontend_enabled", true)
        .single()

      if (bySubdomain) {
        tenant = bySubdomain as TenantInfo
      }
    }
  }

  // Salva in cache
  tenantCache.set(hostname, { tenant, timestamp: Date.now() })

  return tenant
}

/**
 * Estrae il subdomain dal hostname
 * barronci.hotelaccelerator.com -> barronci
 * www.hotelaccelerator.com -> null
 * localhost:3000 -> null
 */
function extractSubdomain(hostname: string): string | null {
  // Rimuovi porta
  const host = hostname.split(":")[0]

  // Domini base della piattaforma
  const baseDomains = ["hotelaccelerator.com", "hotelaccelerator.app", "vercel.app"]

  for (const base of baseDomains) {
    if (host.endsWith(`.${base}`)) {
      const subdomain = host.replace(`.${base}`, "")
      // Ignora www
      if (subdomain !== "www" && subdomain !== "app" && subdomain !== "admin") {
        return subdomain
      }
    }
  }

  return null
}

/**
 * Determina il tipo di route dal pathname
 */
export function getRouteType(pathname: string): "admin" | "api" | "frontend" {
  if (pathname.startsWith("/admin")) return "admin"
  if (pathname.startsWith("/api")) return "api"
  return "frontend"
}

/**
 * Verifica se l'hostname è il dominio admin principale
 */
export function isAdminDomain(hostname: string): boolean {
  const host = hostname.split(":")[0]
  return (
    host === "hotelaccelerator.com" ||
    host === "www.hotelaccelerator.com" ||
    host === "app.hotelaccelerator.com" ||
    host === "admin.hotelaccelerator.com" ||
    host === "localhost" ||
    host.endsWith(".vercel.app")
  )
}

/**
 * Invalida cache per un tenant specifico o tutto
 */
export function invalidateTenantCache(hostname?: string): void {
  if (hostname) {
    tenantCache.delete(hostname)
  } else {
    tenantCache.clear()
  }
}
