import { headers } from "next/headers"
import { getCurrentTenant } from "@/lib/get-tenant"

export interface TenantSEO {
  seo_title?: string | null
  seo_description?: string | null
  seo_og_image?: string | null
  seo_keywords?: string | null
}

/**
 * Ottiene il dominio corrente dalla request
 * Priorità: custom_domain > subdomain > default
 */
export async function getCurrentDomain(): Promise<string> {
  const headersList = await headers()
  const host = headersList.get("host") || headersList.get("x-forwarded-host")
  const protocol = headersList.get("x-forwarded-proto") || "https"

  if (host) {
    return `${protocol}://${host}`
  }

  // Fallback: usa dominio tenant
  const tenant = await getCurrentTenant()
  if (tenant?.custom_domain) {
    return `https://${tenant.custom_domain}`
  }
  if (tenant?.subdomain) {
    return `https://${tenant.subdomain}.hotelaccelerator.com`
  }

  return "https://hotelaccelerator.com"
}

/**
 * Genera canonical URL per la pagina corrente
 */
export async function getCanonicalUrl(pathname = "/"): Promise<string> {
  const domain = await getCurrentDomain()
  const cleanPath = pathname.startsWith("/") ? pathname : `/${pathname}`
  return `${domain}${cleanPath}`
}

/**
 * Genera metadata SEO completi per una pagina tenant
 * Usa i campi SEO dal database se disponibili
 */
export async function generateTenantMetadata(options: {
  title?: string
  description?: string
  pathname?: string
  images?: string[]
  noIndex?: boolean
}): Promise<{
  title: string
  description: string
  keywords?: string
  metadataBase: URL
  alternates: { canonical: string }
  openGraph: {
    title: string
    description: string
    url: string
    siteName: string
    locale: string
    type: string
    images?: string[]
  }
  twitter: {
    card: string
    title: string
    description: string
    images?: string[]
  }
  robots?: { index: boolean; follow: boolean }
}> {
  const tenant = await getCurrentTenant()
  const domain = await getCurrentDomain()
  const pathname = options.pathname || "/"
  const canonicalUrl = `${domain}${pathname}`

  // Usa campi SEO dal database se disponibili
  const tenantName = tenant?.name || "HotelAccelerator"
  const seoTitle = tenant?.seo_title || tenantName
  const seoDescription = tenant?.seo_description || `Benvenuti a ${tenantName}`
  const seoOgImage = tenant?.seo_og_image
  const seoKeywords = tenant?.seo_keywords

  // Titolo: usa override options, altrimenti seo_title dal DB
  const title = options.title ? `${options.title} | ${seoTitle}` : seoTitle
  const description = options.description || seoDescription

  // Immagini: usa override options, altrimenti seo_og_image dal DB
  const images = options.images?.length
    ? options.images
    : seoOgImage
      ? [`${domain}${seoOgImage.startsWith("/") ? seoOgImage : `/${seoOgImage}`}`]
      : undefined

  return {
    title,
    description,
    ...(seoKeywords && { keywords: seoKeywords }),
    metadataBase: new URL(domain),
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: tenantName,
      locale: "it_IT",
      type: "website",
      ...(images && { images }),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(images && { images }),
    },
    ...(options.noIndex && {
      robots: { index: false, follow: false },
    }),
  }
}

/**
 * Lista delle pagine frontend pubbliche per sitemap
 */
export const FRONTEND_PAGES = [
  // Italian (default)
  { path: "", priority: 1.0, changeFrequency: "weekly" as const },
  { path: "/camere", priority: 0.9, changeFrequency: "weekly" as const },
  { path: "/camere/economy", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/camere/tuscan-style", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/camere/suite", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/camere/dependance", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/camere/dependance-deluxe", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/ristorante", priority: 0.8, changeFrequency: "weekly" as const },
  { path: "/spa", priority: 0.8, changeFrequency: "weekly" as const },
  { path: "/servizi", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/gallery", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/dove-siamo", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/cantina-antinori", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/firenze", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/siena", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/strada-del-chianti", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/piscina-jacuzzi", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/offerte-speciali", priority: 0.6, changeFrequency: "weekly" as const },
  { path: "/prenota-esperienze", priority: 0.6, changeFrequency: "weekly" as const },
  { path: "/richiesta-informazioni", priority: 0.5, changeFrequency: "monthly" as const },
  { path: "/lavora-con-noi", priority: 0.4, changeFrequency: "monthly" as const },

  // English
  { path: "/en", priority: 1.0, changeFrequency: "weekly" as const },
  { path: "/en/rooms", priority: 0.9, changeFrequency: "weekly" as const },
  { path: "/en/rooms/economy", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/en/rooms/suite", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/en/rooms/tuscan-style", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/en/rooms/dependance", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/en/rooms/dependance-deluxe", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/en/restaurant", priority: 0.8, changeFrequency: "weekly" as const },
  { path: "/en/spa", priority: 0.8, changeFrequency: "weekly" as const },
  { path: "/en/services", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/en/gallery", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/en/location", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/en/antinori-winery", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/en/florence", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/en/siena", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/en/chianti-road", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/en/pool-jacuzzi", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/en/special-offers", priority: 0.6, changeFrequency: "weekly" as const },
  { path: "/en/book-experiences", priority: 0.6, changeFrequency: "weekly" as const },
  { path: "/en/information-request", priority: 0.5, changeFrequency: "monthly" as const },
  { path: "/en/careers", priority: 0.4, changeFrequency: "monthly" as const },

  // German
  { path: "/de", priority: 1.0, changeFrequency: "weekly" as const },
  { path: "/de/zimmer", priority: 0.9, changeFrequency: "weekly" as const },
  { path: "/de/zimmer/economy", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/de/zimmer/suite", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/de/restaurant", priority: 0.8, changeFrequency: "weekly" as const },
  { path: "/de/spa", priority: 0.8, changeFrequency: "weekly" as const },
  { path: "/de/dienstleistungen", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/de/galerie", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/de/anfahrt", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/de/weingut-antinori", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/de/florenz", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/de/siena", priority: 0.7, changeFrequency: "monthly" as const },

  // French
  { path: "/fr", priority: 1.0, changeFrequency: "weekly" as const },
  { path: "/fr/chambres", priority: 0.9, changeFrequency: "weekly" as const },
  { path: "/fr/chambres/economy", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/fr/chambres/suite", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/fr/restaurant", priority: 0.8, changeFrequency: "weekly" as const },
  { path: "/fr/spa", priority: 0.8, changeFrequency: "weekly" as const },
  { path: "/fr/services", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/fr/galerie", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/fr/acces", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/fr/cave-antinori", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/fr/florence", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/fr/sienne", priority: 0.7, changeFrequency: "monthly" as const },
]
