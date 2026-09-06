import type { MetadataRoute } from "next"
import { headers } from "next/headers"
import { getCurrentTenant, isPlatformDomain } from "@/lib/get-tenant"
import { FRONTEND_PAGES } from "@/lib/seo-utils"

const PLATFORM_PAGES = [
  { path: "/", changeFrequency: "weekly" as const, priority: 1.0 },
  { path: "/features", changeFrequency: "weekly" as const, priority: 0.95 },
  { path: "/features/crm", changeFrequency: "monthly" as const, priority: 0.9 },
  { path: "/crm-hotel-confronto", changeFrequency: "monthly" as const, priority: 0.9 },
  { path: "/features/inbox-omnicanale", changeFrequency: "monthly" as const, priority: 0.9 },
  { path: "/features/whatsapp-hotel", changeFrequency: "monthly" as const, priority: 0.9 },
  { path: "/features/telefono-hotel", changeFrequency: "monthly" as const, priority: 0.9 },
  { path: "/features/pms-hotel", changeFrequency: "monthly" as const, priority: 0.9 },
  { path: "/features/revenue-management", changeFrequency: "monthly" as const, priority: 0.9 },
  { path: "/features/calendario-domanda", changeFrequency: "monthly" as const, priority: 0.85 },
  { path: "/features/controllo-gestione-hotel", changeFrequency: "monthly" as const, priority: 0.9 },
  { path: "/features/manutenzioni-hotel", changeFrequency: "monthly" as const, priority: 0.9 },
  { path: "/features/hr-hotel", changeFrequency: "monthly" as const, priority: 0.85 },
  { path: "/features/email-marketing", changeFrequency: "monthly" as const, priority: 0.85 },
  { path: "/features/analytics", changeFrequency: "monthly" as const, priority: 0.85 },
  { path: "/features/ai-assistant", changeFrequency: "monthly" as const, priority: 0.9 },
  { path: "/features/cms", changeFrequency: "monthly" as const, priority: 0.85 },
  { path: "/request-access", changeFrequency: "monthly" as const, priority: 0.8 },
  { path: "/privacy", changeFrequency: "yearly" as const, priority: 0.3 },
  { path: "/terms", changeFrequency: "yearly" as const, priority: 0.3 },
]

const PLATFORM_URL = "https://www.hotelaccelerator.com"
const PLATFORM_LAST_MODIFIED = new Date("2026-09-06")

/**
 * Sitemap dinamica multi-tenant con supporto piattaforma
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const headersList = await headers()
  const host = headersList.get("host") || headersList.get("x-forwarded-host")
  const protocol = headersList.get("x-forwarded-proto") || "https"

  const isPlatform = await isPlatformDomain()

  if (isPlatform) {
    return PLATFORM_PAGES.map((page) => ({
      url: `${PLATFORM_URL}${page.path}`,
      lastModified: PLATFORM_LAST_MODIFIED,
      changeFrequency: page.changeFrequency,
      priority: page.priority,
    }))
  }

  let baseUrl: string
  if (host) {
    baseUrl = `${protocol}://${host}`
  } else {
    const tenant = await getCurrentTenant()
    if (tenant?.custom_domain) {
      baseUrl = `https://${tenant.custom_domain}`
    } else if (tenant?.subdomain) {
      baseUrl = `https://${tenant.subdomain}.hotelaccelerator.com`
    } else {
      baseUrl = "https://hotelaccelerator.com"
    }
  }

  return FRONTEND_PAGES.map((page) => ({
    url: `${baseUrl}${page.path}`,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }))
}
