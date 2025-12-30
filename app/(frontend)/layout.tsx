import type React from "react"
import type { Metadata } from "next"
import Script from "next/script"
import { getCurrentTenant, isPlatformDomain } from "@/lib/get-tenant"
import { getCurrentDomain } from "@/lib/seo-utils"
import { ChatWidget } from "@/components/chat-widget"
import { HotelSchema, LocalBusinessSchema } from "@/components/schema-org"

export async function generateMetadata(): Promise<Metadata> {
  const isPlatform = await isPlatformDomain()
  if (isPlatform) {
    return {
      title: "HotelAccelerator - Piattaforma SaaS per Hotel",
      description: "La piattaforma all-in-one per hotel: CMS, CRM, Email Marketing, Inbox Omnicanale e AI.",
    }
  }

  const tenant = await getCurrentTenant()
  const domain = await getCurrentDomain()

  if (!tenant) {
    return {
      title: "Sito non trovato",
      description: "Nessun sito configurato per questo dominio",
    }
  }

  const tenantName = tenant?.name || "Hotel"
  const seoTitle = tenant?.seo_title || tenantName
  const seoDescription =
    tenant?.seo_description ||
    `Benvenuti a ${tenantName}. Prenota direttamente sul sito ufficiale per le migliori tariffe garantite.`
  const seoOgImage = tenant?.seo_og_image
  const seoKeywords = tenant?.seo_keywords

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
  const isPlatform = await isPlatformDomain()

  console.log("[v0] FrontendLayout - isPlatform:", isPlatform)

  if (isPlatform) {
    return <>{children}</>
  }

  const tenant = await getCurrentTenant()

  console.log("[v0] FrontendLayout - tenant:", tenant?.name || "null")

  if (!tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md px-4">
          <h1 className="text-2xl font-bold mb-2">Sito non trovato</h1>
          <p className="text-muted-foreground mb-4">Nessun sito è configurato per questo dominio.</p>
          <p className="text-sm text-muted-foreground">
            Se sei il proprietario, accedi al pannello di controllo per configurare il dominio.
          </p>
        </div>
      </div>
    )
  }

  // Se il frontend è disabilitato per questo tenant
  if (!tenant.frontend_enabled) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Sito non disponibile</h1>
          <p className="text-muted-foreground">Il frontend per questa struttura non è attivo.</p>
        </div>
      </div>
    )
  }

  return (
    <div data-tenant-id={tenant.id} data-tenant-slug={tenant.slug}>
      <HotelSchema />
      <LocalBusinessSchema />

      <Script id="google-tag-manager" strategy="afterInteractive">
        {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-MS49CVF2');`}
      </Script>

      <Script id="yandex-metrika" strategy="afterInteractive">
        {`(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
   m[i].l=1*new Date();
   for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
   k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
   (window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");

   ym(99240242, "init", {
        clickmap:true,
        trackLinks:true,
        accurateTrackBounce:true,
        webvisor:true,
        ecommerce:"dataLayer"
   });`}
      </Script>

      <noscript>
        <iframe
          src="https://www.googletagmanager.com/ns.html?id=GTM-MS49CVF2"
          height="0"
          width="0"
          style={{ display: "none", visibility: "hidden" }}
        />
      </noscript>
      <noscript>
        <div>
          <img src="https://mc.yandex.ru/watch/99240242" style={{ position: "absolute", left: "-9999px" }} alt="" />
        </div>
      </noscript>

      {children}

      <ChatWidget />
    </div>
  )
}
