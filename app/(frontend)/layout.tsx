import type React from "react"
import type { Metadata } from "next"
import { getCurrentTenant } from "@/lib/get-tenant"
import { getCurrentDomain } from "@/lib/seo-utils"
import { notFound } from "next/navigation"

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getCurrentTenant()
  const domain = await getCurrentDomain()

  // Usa campi SEO dal database se disponibili
  const tenantName = tenant?.name || "HotelAccelerator"
  const seoTitle = tenant?.seo_title || tenantName
  const seoDescription =
    tenant?.seo_description ||
    `Benvenuti a ${tenantName}. Prenota direttamente sul sito ufficiale per le migliori tariffe garantite.`
  const seoOgImage = tenant?.seo_og_image
  const seoKeywords = tenant?.seo_keywords

  // Costruisci URL immagine OG
  const ogImages = seoOgImage ? [`${domain}${seoOgImage.startsWith("/") ? seoOgImage : `/${seoOgImage}`}`] : undefined

  return {
    title: {
      default: seoTitle,
      template: `%s | ${seoTitle}`,
    },
    description: seoDescription,
    ...(seoKeywords && { keywords: seoKeywords }),
    metadataBase: new URL(domain),
    alternates: {
      canonical: domain,
    },
    openGraph: {
      title: seoTitle,
      description: seoDescription,
      url: domain,
      siteName: tenantName,
      locale: "it_IT",
      type: "website",
      ...(ogImages && { images: ogImages }),
    },
    twitter: {
      card: "summary_large_image",
      title: seoTitle,
      description: seoDescription,
      ...(ogImages && { images: ogImages }),
    },
    robots: {
      index: true,
      follow: true,
    },
  }
}

export default async function FrontendLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const tenant = await getCurrentTenant()

  // Se il tenant non esiste o frontend disabilitato, 404
  if (!tenant || !tenant.frontend_enabled) {
    notFound()
  }

  return (
    <div data-tenant-id={tenant.id} data-tenant-slug={tenant.slug}>
      {children}
    </div>
  )
}
