import type React from "react"
import type { Metadata, Viewport } from "next"
import { Playfair_Display, Inter } from "next/font/google"
import "./globals.css"
import RootClientLayout from "./RootClientLayout"

const playfair = Playfair_Display({
  subsets: ["latin"],
  display: "swap",
})

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
})

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
}

export const metadata: Metadata = {
  title: {
    default: "HotelAccelerator - Software Gestionale per Hotel | CRM, CMS, Email Marketing, AI",
    template: "%s | HotelAccelerator",
  },
  description:
    "La piattaforma SaaS all-in-one per hotel e strutture ricettive: CMS per siti web, CRM per gestione clienti, Email Marketing automatizzato, Inbox Omnicanale e AI Assistant. Aumenta le prenotazioni dirette fino al 35%.",
  keywords: [
    "software gestionale hotel",
    "crm hotel",
    "cms hotel",
    "email marketing hotel",
    "inbox omnicanale hotel",
    "software prenotazioni hotel",
    "gestionale strutture ricettive",
    "saas hotel",
    "intelligenza artificiale hotel",
    "marketing automation hotel",
    "chatbot hotel",
    "analytics hotel",
    "prenotazioni dirette hotel",
    "fidelizzazione ospiti",
    "hotel management software",
    "hospitality software",
    "booking engine hotel",
    "channel manager hotel",
    "revenue management hotel",
  ],
  authors: [{ name: "HotelAccelerator", url: "https://hotelaccelerator.com" }],
  creator: "HotelAccelerator",
  publisher: "HotelAccelerator",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.jpg", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.jpg", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
    other: [
      {
        rel: "mask-icon",
        url: "/icon.svg",
        color: "#0d9488",
      },
    ],
  },
  metadataBase: new URL("https://hotelaccelerator.com"),
  alternates: {
    canonical: "https://hotelaccelerator.com",
    languages: {
      "it-IT": "https://hotelaccelerator.com",
      "en-US": "https://hotelaccelerator.com/en",
      "de-DE": "https://hotelaccelerator.com/de",
      "fr-FR": "https://hotelaccelerator.com/fr",
    },
  },
  openGraph: {
    type: "website",
    locale: "it_IT",
    alternateLocale: ["en_US", "de_DE", "fr_FR"],
    url: "https://hotelaccelerator.com",
    siteName: "HotelAccelerator",
    title: "HotelAccelerator - La Piattaforma Completa per Hotel",
    description:
      "CMS, CRM, Email Marketing, Inbox Omnicanale e AI in un'unica soluzione. Aumenta le prenotazioni dirette fino al 35%.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "HotelAccelerator - Software Gestionale per Hotel",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "HotelAccelerator - Software Gestionale per Hotel",
    description: "La piattaforma SaaS all-in-one per hotel: CRM, CMS, Email Marketing, Inbox Omnicanale e AI.",
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
  verification: {
    google: "your-google-verification-code",
  },
  category: "technology",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "HotelAccelerator",
  },
  applicationName: "HotelAccelerator",
  other: {
    "llms-txt": "https://hotelaccelerator.com/llms.txt",
    "msapplication-TileColor": "#0d9488",
    "msapplication-config": "/browserconfig.xml",
  },
    generator: 'v0.app'
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <RootClientLayout inter={inter} playfair={playfair}>
      {children}
    </RootClientLayout>
  )
}
