"use client"

import type React from "react"
import { Analytics } from "@vercel/analytics/next"
import { LanguageProvider } from "@/lib/language-context"

interface RootClientLayoutProps {
  children: React.ReactNode
  inter: { className: string; style: { fontFamily: string } }
  playfair: { style: { fontFamily: string } }
}

export default function RootClientLayout({ children, inter, playfair }: RootClientLayoutProps) {
  return (
    <html lang="it" className="bg-background">
      <head>{/* Schema.org structured data for SEO */}</head>
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
