import type { MetadataRoute } from "next"
import { headers } from "next/headers"
import { getCurrentTenant, isPlatformDomain } from "@/lib/get-tenant"
import { FRONTEND_PAGES } from "@/lib/seo-utils"

const PLATFORM_PAGES = [
  { path: "/", changeFrequency: "weekly" as const, priority: 1.0 },
  { path: "/features/cms", changeFrequency: "monthly" as const, priority: 0.9 },
  { path: "/features/crm", changeFrequency: "monthly" as const, priority: 0.9 },
  { path: "/features/email-marketing", changeFrequency: "monthly" as const, priority: 0.9 },
  { path: "/features/inbox-omnicanale", changeFrequency: "monthly" as const, priority: 0.9 },
  { path: "/features/analytics", changeFrequency: "monthly" as const, priority: 0.9 },
  { path: "/features/ai-assistant", changeFrequency: "monthly" as const, priority: 0.9 },
  { path: "/request-access", changeFrequency: "monthly" as const, priority: 0.8 },
  { path: "/privacy", changeFrequency: "yearly" as const, priority: 0.3 },
  { path: "/terms", changeFrequency: "yearly" as const, priority: 0.3 },
]

const HREFLANG_MAPPING: Record<string, Record<string, string>> = {
  "/": { it: "/", en: "/en", de: "/de", fr: "/fr" },
  "/camere": { it: "/camere", en: "/en/rooms", de: "/de/zimmer", fr: "/fr/chambres" },
  "/ristorante": { it: "/ristorante", en: "/en/restaurant", de: "/de/restaurant", fr: "/fr/restaurant" },
  "/spa": { it: "/spa", en: "/en/spa", de: "/de/spa", fr: "/fr/spa" },
  "/servizi": { it: "/servizi", en: "/en/services", de: "/de/dienstleistungen", fr: "/fr/services" },
  "/gallery": { it: "/gallery", en: "/en/gallery", de: "/de/galerie", fr: "/fr/galerie" },
  "/dove-siamo": { it: "/dove-siamo", en: "/en/location", de: "/de/anfahrt", fr: "/fr/acces" },
  "/cantina-antinori": {
    it: "/cantina-antinori",
    en: "/en/antinori-winery",
    de: "/de/weingut-antinori",
    fr: "/fr/cave-antinori",
  },
  "/firenze": { it: "/firenze", en: "/en/florence", de: "/de/florenz", fr: "/fr/florence" },
  "/siena": { it: "/siena", en: "/en/siena", de: "/de/siena", fr: "/fr/sienne" },
}

/**
 * Sitemap dinamica multi-tenant con supporto hreflang
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const headersList = await headers()
  const host = headersList.get("host") || headersList.get("x-forwarded-host")
  const protocol = headersList.get("x-forwarded-proto") || "https"

  const isPlatform = await isPlatformDomain()

  if (isPlatform) {
    const baseUrl = `${protocol}://${host || "hotelaccelerator.com"}`

    return PLATFORM_PAGES.map((page) => ({
      url: `${baseUrl}${page.path}`,
      lastModified: new Date(),
      changeFrequency: page.changeFrequency,
      priority: page.priority,
    }))
  }

  // Sitemap per tenant domain
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

  return FRONTEND_PAGES.map((page) => {
    const hreflangMap = HREFLANG_MAPPING[page.path]

    // Crea alternates per le pagine che hanno mapping multilingua
    const alternates = hreflangMap
      ? {
          languages: Object.fromEntries(
            Object.entries(hreflangMap).map(([lang, path]) => [
              lang === "it" ? "it-IT" : lang === "en" ? "en-US" : lang === "de" ? "de-DE" : "fr-FR",
              `${baseUrl}${path}`,
            ]),
          ),
        }
      : undefined

    return {
      url: `${baseUrl}${page.path}`,
      lastModified: new Date(),
      changeFrequency: page.changeFrequency,
      priority: page.priority,
      ...(alternates && { alternates }),
    }
  })
}
