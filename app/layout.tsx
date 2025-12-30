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
  maximumScale: 5, // Allow zoom for accessibility
  userScalable: true,
  themeColor: "#0a0a0a",
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
  ],
  authors: [{ name: "HotelAccelerator", url: "https://hotelaccelerator.com" }],
  creator: "HotelAccelerator",
  publisher: "HotelAccelerator",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL("https://hotelaccelerator.com"),
  alternates: {
    canonical: "https://hotelaccelerator.com",
    languages: {
      "it-IT": "https://hotelaccelerator.com",
    },
  },
  openGraph: {
    type: "website",
    locale: "it_IT",
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
