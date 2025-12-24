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
  themeColor: "#8b7355",
}

export const metadata: Metadata = {
  title: "Resort Spa Toscana Agriturismo San Casciano Val di Pesa",
  description:
    "Villa I Barronci Resort & Spa - Tra le colline del Chianti, la tua vacanza di lusso in Toscana: villa d'epoca con piscina, Area Relax e parco privato",
  keywords: [
    "resort spa toscana",
    "agriturismo san casciano",
    "villa chianti",
    "piscina panoramica toscana",
    "hotel lusso toscana",
    "spa chianti",
    "vacanza toscana",
  ],
  authors: [{ name: "Villa I Barronci Resort & Spa" }],
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
    siteName: "Villa I Barronci Resort & Spa",
    title: "Resort Spa Toscana Agriturismo San Casciano Val di Pesa",
    description:
      "Tra le colline del Chianti, la tua vacanza di lusso in Toscana: villa d'epoca con piscina, Area Relax e parco privato",
    images: [
      {
        url: "https://ibarronci.com/wp-content/uploads/2023/08/Villa-I-Barronci-Panoramica.jpg",
        width: 1200,
        height: 630,
        alt: "Villa I Barronci Resort & Spa",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Resort Spa Toscana Agriturismo San Casciano Val di Pesa",
    description:
      "Tra le colline del Chianti, la tua vacanza di lusso in Toscana: villa d'epoca con piscina, Area Relax e parco privato",
    images: ["https://ibarronci.com/wp-content/uploads/2023/08/Villa-I-Barronci-Panoramica.jpg"],
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
