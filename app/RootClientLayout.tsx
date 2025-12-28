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
const YANDEX_METRICA_ID = "106059423"

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

        {/* Yandex.Metrika counter */}
        <Script id="yandex-metrika" strategy="afterInteractive">
          {`
            (function(m,e,t,r,i,k,a){
              m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
              m[i].l=1*new Date();
              for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
              k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
            })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym');
            ym(${YANDEX_METRICA_ID}, 'init', {
              clickmap: true,
              trackLinks: true,
              accurateTrackBounce: true,
              webvisor: true,
              ecommerce: "dataLayer"
            });
          `}
        </Script>
        <noscript>
          <div>
            <img
              src={`https://mc.yandex.ru/watch/${YANDEX_METRICA_ID}`}
              style={{ position: "absolute", left: "-9999px" }}
              alt=""
            />
          </div>
        </noscript>
        {/* /Yandex.Metrika counter */}
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
