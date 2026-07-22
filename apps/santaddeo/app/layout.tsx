import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"
import { ClientOnlyProviders } from "@/components/layout/client-only-providers"
import { CookieConsent } from "@/components/cookie-consent"
import AnalyticsScripts from "@/components/analytics-scripts"
import { ClientToaster } from "@/components/layout/client-toaster"
// Import direct.ts at app root — installs the DEV→PROD intercept on module load.
// This patches any old HMR-cached module that tries to connect to the deleted DEV DB.
import "@/lib/supabase/direct"

const _geist = Geist({ subsets: ["latin"], variable: "--font-geist" })
const _geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://www.santaddeo.com/#organization",
      "name": "4 BID S.r.l.",
      "alternateName": "SANTADDEO",
      "url": "https://www.santaddeo.com",
      "logo": "https://www.santaddeo.com/logo-santaddeo.png",
      "description": "Revenue Management System per tutte le strutture ricettive: hotel, agriturismi, campeggi, glamping, villaggi turistici, B&B e resort. 24 anni di esperienza, oltre 70 strutture affiancate in Toscana e Centro Italia.",
      "foundingDate": "2012",
      "areaServed": { "@type": "Country", "name": "Italia" },
      "knowsAbout": ["Revenue Management", "Pricing Dinamico", "Hotel Management", "Yield Management", "RevPAR Optimization"],
      // SEO 06/05/2026: profili social ufficiali per Google Knowledge Graph e
      // attribuzione brand. Aggiungere altri canali (es. YouTube, Instagram)
      // qui appena disponibili.
      "sameAs": [
        "https://www.linkedin.com/company/4bid-srl",
        "https://www.facebook.com/santaddeo",
      ],
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://www.santaddeo.com/#software",
      "name": "SANTADDEO",
      "applicationCategory": "BusinessApplication",
      "operatingSystem": "Web",
      "description": "Revenue Management System con pricing dinamico, dashboard KPI in tempo reale, integrazione PMS e algoritmi di occupazione per ogni tipo di struttura ricettiva: hotel, agriturismi, campeggi, glamping, villaggi turistici e B&B.",
      "offers": { "@type": "Offer", "price": "0", "priceCurrency": "EUR", "description": "Dashboard KPI gratuita per sempre. Collegamento PMS e monitoraggio performance inclusi senza costi." },
      "creator": { "@id": "https://www.santaddeo.com/#organization" },
      "featureList": ["Pricing dinamico basato su occupazione", "Dashboard KPI in tempo reale", "Integrazione PMS multi-adapter", "Alert intelligenti", "Analisi competitiva", "Report automatici", "Fasce di occupazione configurabili", "Algoritmo K-driven avanzato"],
    },
    {
      "@type": "WebSite",
      "@id": "https://www.santaddeo.com/#website",
      "url": "https://www.santaddeo.com",
      "name": "SANTADDEO",
      "publisher": { "@id": "https://www.santaddeo.com/#organization" },
      "inLanguage": "it-IT",
    },
  ],
}

export const metadata: Metadata = {
  metadataBase: new URL("https://www.santaddeo.com"),
  title: {
    default: "SANTADDEO | Revenue Management System per Strutture Ricettive",
    // 19/05/2026: rimosso suffisso "| SANTADDEO" dal template perche'
    // tutte le pagine figlie hanno gia' "| SANTADDEO" nel proprio title.
    // Risultato precedente: <title>X | SANTADDEO | SANTADDEO</title> in
    // tutte le 22 pagine pubbliche. Ora il template e' un passthrough:
    // ogni pagina controlla il title esatto.
    template: "%s",
  },
  description: "SANTADDEO e' il Revenue Management System italiano progettato per ogni struttura ricettiva: hotel, agriturismi, campeggi, glamping, villaggi turistici, B&B e resort. Ottimizza le tariffe, massimizza l'occupazione e aumenta il RevPAR con algoritmi di pricing dinamico e integrazione PMS.",
  keywords: [
    "revenue management", "revenue management system", "RMS strutture ricettive", "RMS hotel",
    "pricing dinamico", "pricing dinamico hotel", "pricing dinamico agriturismo", "pricing dinamico camping",
    "tariffe alberghiere", "gestione tariffe", "gestione tariffe hotel", "gestione tariffe agriturismo",
    "RevPAR", "occupancy rate", "hotel pricing",
    "revenue management Italia", "software hotel", "software agriturismo", "software camping", "software glamping",
    "gestione hotel", "gestione agriturismo", "gestione camping", "gestione villaggio turistico",
    "agriturismo revenue", "camping revenue", "glamping revenue", "villaggio revenue",
    "strutture ricettive", "hotel accelerator",
    "ottimizzazione tariffe", "yield management", "4 BID",
  ],
  authors: [{ name: "4 BID S.r.l.", url: "https://www.santaddeo.com" }],
  creator: "4 BID S.r.l.",
  publisher: "4 BID S.r.l.",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png" }],
    apple: [{ url: "/favicon.png", type: "image/png" }],
  },
  openGraph: {
    title: "SANTADDEO | Revenue Management System per Strutture Ricettive",
    description: "Ottimizza le tariffe della tua struttura ricettiva con algoritmi di pricing dinamico, dashboard KPI in tempo reale e integrazione PMS. Adatto a hotel, agriturismi, campeggi, glamping, villaggi, B&B e resort. Creato da 4 BID, 24 anni di esperienza nel settore hospitality.",
    siteName: "SANTADDEO",
    type: "website",
    locale: "it_IT",
    url: "https://www.santaddeo.com",
    images: [
      {
        url: "https://www.santaddeo.com/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "SANTADDEO - Revenue Management System per Strutture Ricettive",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SANTADDEO | Revenue Management per Strutture Ricettive",
    description: "Massimizza il revenue della tua struttura ricettiva con pricing dinamico e integrazione PMS. Per hotel, agriturismi, campeggi, glamping, villaggi e B&B.",
    images: ["https://www.santaddeo.com/og-image.jpg"],
  },
  alternates: {
    canonical: "https://www.santaddeo.com",
  },
  category: "technology",
  other: {
    "script:ld+json": JSON.stringify(jsonLd),
    // AI/LLM Optimization meta tags
    "ai:content_type": "business_software",
    "ai:target_audience": "hotel_managers,agriturismo_owners,camping_owners,glamping_owners,villaggio_managers,bnb_owners,revenue_managers,hospitality_professionals",
    "ai:primary_topic": "revenue_management,hospitality_pricing,hospitality_technology",
    "ai:language": "it",
    "ai:business_model": "freemium_saas",
    "ai:company": "4_BID_SRL",
    "ai:product": "SANTADDEO_RMS",
  },
  generator: "v0.app",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Environment check for dev mode optimization
  // In v0 preview, NODE_ENV is "production" but VERCEL_ENV is "preview" or undefined.
  // We must also disable analytics scripts to avoid the "script tag in React" error.
  // IMPORTANT: In production (VERCEL_ENV === "production"), analytics MUST be enabled!
  const isProduction = process.env.VERCEL_ENV === "production"
  const isDev = !isProduction && (
    process.env.NODE_ENV === "development" 
    || process.env.NEXT_PUBLIC_DEV_MODE === "true"
    || process.env.VERCEL_ENV === "preview"
    || !process.env.VERCEL_ENV
  )
  
  return (
    <html lang="it">
      <head>
        {/* AI/LLM Discovery - llms.txt standard */}
        <link rel="alternate" type="text/plain" href="/llms.txt" title="LLM Information" />
        <link rel="alternate" type="text/plain" href="/llms-full.txt" title="LLM Full Documentation" />
      </head>
      <body className={`${_geist.variable} ${_geistMono.variable} font-sans antialiased`}>
        {children}
        <ClientOnlyProviders isDev={isDev} />
        <CookieConsent />
        <Analytics />
        {/*
          Sonner Toaster montato qui (20/05/2026): senza questo i toast.success/error
          chiamati in tutta la dashboard super admin (es. handleTestEtl, handleCreateVersion,
          handleActivateBinding, ecc.) venivano invocati ma non venivano mai renderizzati,
          quindi l'utente vedeva i pulsanti "Test", "Crea versione", "Attiva" come "fanno
          niente". Posizione bottom-right standard, theme=light per coerenza con la UI.

          23/05/2026: caricato via wrapper client-only `ClientToaster` (dynamic ssr:false).
          Sonner internamente in alcune versioni renderizza un <Suspense> server-side e
          una <section aria-label="Notifications"> client-side: la differenza causava
          hydration mismatch sul subtree di <body>. Mantenendolo client-only il toast
          continua a funzionare ovunque ma non finisce nell'HTML SSR.
        */}
        <ClientToaster />
        {/*
          Analytics scripts: gated client-only via AnalyticsScripts (useEffect-mounted).
          Risolve l'hydration mismatch dove server renderizzava un <Suspense> in
          posizione del <noscript> sul client (causato dallo streaming RSC che
          inserisce Suspense boundaries attorno ai <Script strategy="afterInteractive">).
          La condizione !isDev resta come prima per saltare gli script in dev
          locale / preview, evitando rumore su GA/Yandex.
        */}
        {!isDev && <AnalyticsScripts />}
      </body>
    </html>
  )
}
