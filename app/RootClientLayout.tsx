"use client"

import type React from "react"
import Script from "next/script"
import { Analytics } from "@vercel/analytics/next"
import { LanguageProvider } from "@/lib/language-context"

interface RootClientLayoutProps {
  children: React.ReactNode
  inter: { className: string; style: { fontFamily: string } }
  playfair: { style: { fontFamily: string } }
}

const GA_MEASUREMENT_ID = "G-DT2601Q58K"

export default function RootClientLayout({ children, inter, playfair }: RootClientLayoutProps) {
  return (
    <html lang="it" className="bg-background">
      <head>
        {/* Google Analytics (gtag.js) */}
        <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} strategy="afterInteractive" />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}');
          `}
        </Script>
      </head>
      <body
        className={`${inter.className} antialiased safe-area-top safe-area-bottom`}
        style={{ fontFamily: inter.style.fontFamily }}
      >
        <style jsx global>{`
          .font-serif {
            font-family: ${playfair.style.fontFamily};
          }
        `}</style>

        <LanguageProvider>{children}</LanguageProvider>
        <Analytics />
      </body>
    </html>
  )
}
