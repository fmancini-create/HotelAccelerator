import type { MetadataRoute } from "next"
import { headers } from "next/headers"
import { getCurrentTenant, isPlatformDomain } from "@/lib/get-tenant"

/**
 * Robots.txt dinamico multi-tenant con SEO ottimizzato
 * - Platform domain: indicizza landing pages
 * - Tenant domain: indicizza sito tenant se frontend_enabled
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const headersList = await headers()
  const host = headersList.get("host") || headersList.get("x-forwarded-host")
  const protocol = headersList.get("x-forwarded-proto") || "https"

  const isPlatform = await isPlatformDomain()

  if (isPlatform) {
    // Robots per dominio piattaforma (hotelaccelerator.com)
    const baseUrl = `${protocol}://${host || "hotelaccelerator.com"}`

    return {
      rules: [
        {
          userAgent: "*",
          allow: ["/", "/features/"],
          disallow: ["/admin/", "/api/", "/_next/", "/scripts/", "/super-admin/"],
        },
        {
          userAgent: "Googlebot",
          allow: ["/", "/features/"],
          disallow: ["/admin/", "/api/", "/_next/", "/scripts/", "/super-admin/"],
        },
      ],
      sitemap: `${baseUrl}/sitemap.xml`,
      host: baseUrl,
    }
  }

  // Robots per tenant domain
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

  let baseUrl: string
  if (host) {
    baseUrl = `${protocol}://${host}`
  } else if (tenant?.custom_domain) {
    baseUrl = `https://${tenant.custom_domain}`
  } else if (tenant?.subdomain) {
    baseUrl = `https://${tenant.subdomain}.hotelaccelerator.com`
  } else {
    baseUrl = "https://hotelaccelerator.com"
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
