import type React from "react"
import type { Metadata, Viewport } from "next"
import { Geist } from "next/font/google"
import "./globals.css"
import RootClientLayout from "./RootClientLayout"
import { headers } from "next/headers"

// Typography aligned to Santaddeo (master grafico): Geist everywhere.
// Kept the RootClientLayout props shape (inter/playfair) to avoid touching
// components in this step — both now resolve to Geist, so legacy
// `font-serif` headings render in Geist as in Santaddeo.
const geist = Geist({
  subsets: ["latin"],
  display: "swap",
})

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5, // Allow zoom for accessibility
  userScalable: true,
  themeColor: "#0a0a0a",
}

export const metadata: Metadata = {
  title: {
    default: "Software gestionale modulare per hotel | HotelAccelerator",
    template: "%s | HotelAccelerator",
  },
  description:
    "Inbox Gmail, CRM alberghiero, CMS, tracking e AI assistita in moduli attivati in base al tenant e alle integrazioni realmente configurate.",
  keywords: [
    "software gestionale hotel",
    "crm hotel",
    "cms hotel",
    "campagne email hotel",
    "inbox hotel",
    "gestione messaggi hotel",
    "gestionale strutture ricettive",
    "saas hotel",
    "intelligenza artificiale hotel",
    "knowledge base hotel",
    "ai assistita hotel",
    "analytics hotel",
    "tracking sito hotel",
  ],
  authors: [{ name: "HotelAccelerator", url: "https://www.hotelaccelerator.com" }],
  creator: "HotelAccelerator",
  publisher: "HotelAccelerator",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL("https://www.hotelaccelerator.com"),
  alternates: {
    canonical: "https://www.hotelaccelerator.com",
    languages: {
      "it-IT": "https://www.hotelaccelerator.com",
    },
  },
  openGraph: {
    type: "website",
    locale: "it_IT",
    url: "https://www.hotelaccelerator.com",
    siteName: "HotelAccelerator",
    title: "Software gestionale modulare per hotel | HotelAccelerator",
    description:
      "Inbox Gmail, CRM alberghiero, CMS, tracking e AI assistita, con stato delle funzioni e verifiche dichiarati.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "HotelAccelerator - software gestionale modulare per hotel",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Software gestionale modulare per hotel | HotelAccelerator",
    description: "Inbox Gmail, CRM, CMS, tracking e AI assistita con attivazione guidata.",
    images: ["/og-image.png"],
  },
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
  category: "technology",
  /*
   * Icone del marchio, DICHIARATE qui invece di usare la convenzione a file
   * (app/icon.png). Motivo: le icone da convenzione valgono per ogni rotta
   * sotto questo layout e un layout figlio non puo' toglierle — il razzo di
   * HotelAccelerator sarebbe finito nella scheda del browser anche sui siti
   * pubblici dei CLIENTI, che da qui ereditano i metadati. Dichiarandole si
   * possono sovrascrivere per i tenant (vedi app/(frontend)/layout.tsx).
   *
   * Prima di questa modifica il prodotto non aveva alcuna favicon: non
   * esistevano ne' app/icon.*, ne' favicon.ico. I file che sembravano
   * icone (public/apple-icon.png, public/icon*.svg) erano il logo di v0.
   */
  icons: {
    icon: [{ url: "/favicon-hotelaccelerator.png", type: "image/png", sizes: "512x512" }],
    apple: [{ url: "/apple-icon-hotelaccelerator.png", sizes: "180x180" }],
  },
  manifest: "/manifest.json",
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const requestHeaders = await headers()
  const isTenantSite = Boolean(requestHeaders.get("x-tenant-identifier"))
  return (
    <RootClientLayout inter={geist} playfair={geist} isTenantSite={isTenantSite}>
      {children}
    </RootClientLayout>
  )
}
