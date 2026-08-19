import type { MetadataRoute } from "next"
import { headers } from "next/headers"
import { getCurrentTenant, isPlatformDomain } from "@/lib/get-tenant"

const PLATFORM_URL = "https://www.hotelaccelerator.com"

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
    return {
      rules: [
        {
          userAgent: "*",
          allow: ["/", "/features/", "/request-access", "/privacy", "/terms"],
          disallow: ["/admin/", "/api/", "/scripts/", "/super-admin/"],
        },
      ],
      sitemap: `${PLATFORM_URL}/sitemap.xml`,
      host: PLATFORM_URL,
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
        disallow: ["/admin/", "/api/", "/scripts/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
