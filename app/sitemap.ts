import type { MetadataRoute } from "next"
import { headers } from "next/headers"
import { getCurrentTenant } from "@/lib/get-tenant"
import { FRONTEND_PAGES } from "@/lib/seo-utils"

/**
 * Sitemap dinamica multi-tenant
 * Genera URL con il dominio corrente (custom_domain o subdomain)
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Ottieni dominio corrente dalla request
  const headersList = await headers()
  const host = headersList.get("host") || headersList.get("x-forwarded-host")
  const protocol = headersList.get("x-forwarded-proto") || "https"

  let baseUrl: string

  if (host) {
    // Usa il dominio dalla request
    baseUrl = `${protocol}://${host}`
  } else {
    // Fallback: usa dominio tenant dal DB
    const tenant = await getCurrentTenant()
    if (tenant?.custom_domain) {
      baseUrl = `https://${tenant.custom_domain}`
    } else if (tenant?.subdomain) {
      baseUrl = `https://${tenant.subdomain}.hotelaccelerator.com`
    } else {
      baseUrl = "https://hotelaccelerator.com"
    }
  }

  // Genera sitemap con URL del dominio corrente
  return FRONTEND_PAGES.map((page) => ({
    url: `${baseUrl}${page.path}`,
    lastModified: new Date(),
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }))
}
