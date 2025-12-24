import type { MetadataRoute } from "next"
import { headers } from "next/headers"
import { getCurrentTenant } from "@/lib/get-tenant"

/**
 * Robots.txt dinamico multi-tenant
 * Punta alla sitemap del dominio corrente
 * Blocca indicizzazione se frontend_enabled = false
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  // Ottieni tenant per verificare frontend_enabled
  const tenant = await getCurrentTenant()

  if (!tenant || !tenant.frontend_enabled) {
    return {
      rules: [
        {
          userAgent: "*",
          disallow: ["/"],
        },
      ],
    }
  }

  // Ottieni dominio corrente dalla request
  const headersList = await headers()
  const host = headersList.get("host") || headersList.get("x-forwarded-host")
  const protocol = headersList.get("x-forwarded-proto") || "https"

  let baseUrl: string

  if (host) {
    baseUrl = `${protocol}://${host}`
  } else {
    if (tenant?.custom_domain) {
      baseUrl = `https://${tenant.custom_domain}`
    } else if (tenant?.subdomain) {
      baseUrl = `https://${tenant.subdomain}.hotelaccelerator.com`
    } else {
      baseUrl = "https://hotelaccelerator.com"
    }
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/api/", "/_next/", "/scripts/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
