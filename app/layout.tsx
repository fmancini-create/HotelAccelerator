import type React from "react"
import type { Metadata, Viewport } from "next"
import { Geist } from "next/font/google"
import "./globals.css"
import "./santaddeo-ui-parity.css"
import RootClientLayout from "./RootClientLayout"
import { headers } from "next/headers"

const geist = Geist({
  subsets: ["latin"],
  display: "swap",
})

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: "#0a0a0a",
}

export const metadata: Metadata = {
  title: {
    default: "Software gestionale per hotel con CRM, PMS, Revenue e AI | HotelAccelerator",
    template: "%s | HotelAccelerator",
  },
  description:
    "Piattaforma gestionale modulare per hotel con CRM, Inbox omnicanale, WhatsApp, telefonia, PMS, revenue management, controllo di gestione, manutenzioni, HR, analytics e AI.",
  keywords: [
    "software gestionale hotel",
    "software hotel all in one",
    "crm hotel",
    "inbox omnicanale hotel",
    "whatsapp hotel",
    "centralino hotel",
    "pms hotel integrazione",
    "revenue management hotel",
    "software revenue hotel",
    "controllo di gestione hotel",
    "software manutenzioni hotel",
    "software hr hotel",
    "email marketing hotel",
    "analytics hotel",
    "intelligenza artificiale hotel",
    "gestionale strutture ricettive",
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
    title: "Software gestionale per hotel con CRM, PMS, Revenue e AI | HotelAccelerator",
    description:
      "CRM, Inbox, WhatsApp, telefonia, PMS, revenue, controllo economico, manutenzioni, HR e AI in una piattaforma modulare per hotel.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "HotelAccelerator - piattaforma gestionale modulare per hotel",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Software gestionale per hotel con CRM, PMS, Revenue e AI | HotelAccelerator",
    description: "Piattaforma modulare per relazione ospite, vendite, revenue, operatività e controllo dell'hotel.",
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
