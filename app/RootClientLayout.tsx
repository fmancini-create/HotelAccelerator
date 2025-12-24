"use client"

import type React from "react"
import { Analytics } from "@vercel/analytics/next"
import Script from "next/script"
import { LanguageProvider } from "@/lib/language-context"
import { HotelSchema, LocalBusinessSchema } from "@/components/schema-org"
import { ChatWidget } from "@/components/chat-widget"

interface RootClientLayoutProps {
  children: React.ReactNode
  inter: { className: string; style: { fontFamily: string } }
  playfair: { style: { fontFamily: string } }
}

export default function RootClientLayout({ children, inter, playfair }: RootClientLayoutProps) {
  return (
    <html lang="it" className="bg-background">
      <head>
        {/* Schema.org structured data for SEO */}
        <HotelSchema />
        <LocalBusinessSchema />

        <Script id="google-tag-manager" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-MS49CVF2');`}
        </Script>

        <Script id="yandex-metrika" strategy="afterInteractive">
          {`(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
   m[i].l=1*new Date();
   for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
   k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
   (window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");

   ym(99240242, "init", {
        clickmap:true,
        trackLinks:true,
        accurateTrackBounce:true,
        webvisor:true,
        ecommerce:"dataLayer"
   });`}
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

        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-MS49CVF2"
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        <noscript>
          <div>
            <img src="https://mc.yandex.ru/watch/99240242" style={{ position: "absolute", left: "-9999px" }} alt="" />
          </div>
        </noscript>

        <LanguageProvider>
          {children}
          <ChatWidget />
        </LanguageProvider>
        <Analytics />
      </body>
    </html>
  )
}
