import type { MetadataRoute } from "next"
import { headers } from "next/headers"
import { getCurrentTenant, isPlatformDomain } from "@/lib/get-tenant"

/**
 * Robots.txt dinamico multi-tenant con SEO ottimizzato per AI
 * Supporta: Googlebot, Bingbot, ChatGPT, Claude, Perplexity
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const headersList = await headers()
  const host = headersList.get("host") || headersList.get("x-forwarded-host")
  const protocol = headersList.get("x-forwarded-proto") || "https"

  const isPlatform = await isPlatformDomain()

  if (isPlatform) {
    const baseUrl = `${protocol}://${host || "hotelaccelerator.com"}`

    return {
      rules: [
        {
          userAgent: "*",
          allow: ["/", "/features/", "/llms.txt", "/llms-full.txt"],
          disallow: ["/admin/", "/api/", "/_next/", "/scripts/", "/super-admin/"],
        },
        {
          userAgent: "Googlebot",
          allow: ["/", "/features/", "/llms.txt"],
          disallow: ["/admin/", "/api/", "/_next/", "/scripts/"],
        },
        {
          userAgent: "GPTBot",
          allow: ["/", "/features/", "/llms.txt", "/llms-full.txt"],
          disallow: ["/admin/", "/api/"],
        },
        {
          userAgent: "Claude-Web",
          allow: ["/", "/features/", "/llms.txt", "/llms-full.txt"],
          disallow: ["/admin/", "/api/"],
        },
        {
          userAgent: "PerplexityBot",
          allow: ["/", "/features/", "/llms.txt", "/llms-full.txt"],
          disallow: ["/admin/", "/api/"],
        },
        {
          userAgent: "Google-Extended",
          allow: ["/", "/features/", "/llms.txt", "/llms-full.txt"],
          disallow: ["/admin/", "/api/"],
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
      rules: [{ userAgent: "*", disallow: ["/"] }],
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
        allow: ["/", "/llms.txt", "/llms-full.txt"],
        disallow: ["/admin/", "/api/", "/_next/", "/scripts/"],
      },
      {
        userAgent: "GPTBot",
        allow: ["/", "/llms.txt", "/llms-full.txt"],
        disallow: ["/admin/", "/api/"],
      },
      {
        userAgent: "Claude-Web",
        allow: ["/", "/llms.txt", "/llms-full.txt"],
        disallow: ["/admin/", "/api/"],
      },
      {
        userAgent: "PerplexityBot",
        allow: ["/", "/llms.txt", "/llms-full.txt"],
        disallow: ["/admin/", "/api/"],
      },
      {
        userAgent: "Google-Extended",
        allow: ["/", "/llms.txt", "/llms-full.txt"],
        disallow: ["/admin/", "/api/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
