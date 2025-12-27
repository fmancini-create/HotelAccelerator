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
  maximumScale: 1, // Prevents zoom on input focus on iOS
  userScalable: false,
  themeColor: "#0a0a0a",
}

export const metadata: Metadata = {
  title: {
    default: "HotelAccelerator - Piattaforma SaaS per Hotel",
    template: "%s | HotelAccelerator",
  },
  description:
    "La piattaforma all-in-one per hotel: CMS, CRM, Email Marketing, Inbox Omnicanale e AI. Aumenta le prenotazioni dirette.",
  keywords: [
    "hotel management",
    "saas hotel",
    "crm hotel",
    "email marketing hotel",
    "prenotazioni dirette",
    "software hotel",
  ],
  authors: [{ name: "HotelAccelerator" }],
  alternates: {
    canonical: "https://www.ibarronci.com",
    languages: {
      "it-IT": "https://www.ibarronci.com",
      "en-US": "https://www.ibarronci.com/en",
      "de-DE": "https://www.ibarronci.com/de",
      "fr-FR": "https://www.ibarronci.com/fr",
    },
  },
  openGraph: {
    type: "website",
    locale: "it_IT",
    url: "https://www.ibarronci.com",
    siteName: "HotelAccelerator",
    title: "HotelAccelerator - Piattaforma SaaS per Hotel",
    description: "La piattaforma all-in-one per hotel: CMS, CRM, Email Marketing, Inbox Omnicanale e AI.",
  },
  twitter: {
    card: "summary_large_image",
    title: "HotelAccelerator - Piattaforma SaaS per Hotel",
    description: "La piattaforma all-in-one per hotel: CMS, CRM, Email Marketing, Inbox Omnicanale e AI.",
  },
  robots: {
    index: true,
    follow: true,
  },
  verification: {
    google: "your-google-verification-code",
  },
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
