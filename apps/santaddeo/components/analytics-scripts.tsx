"use client"

import Script from "next/script"
import { useEffect, useState } from "react"

/**
 * Analytics scripts (GA + Yandex Metrika) renderizzati SOLO dopo il mount
 * lato client.
 *
 * Perche' questo pattern: in v0 preview / Next.js dev, mescolare <Script
 * strategy="afterInteractive"> con <noscript> dentro il <body> di un
 * Server Component causava un hydration mismatch (server rendeva un
 * <Suspense> in posizione corrispondente a <noscript> sul client). La
 * causa esatta sta nel modo in cui il streaming RSC inserisce Suspense
 * boundaries attorno ai Scripts, e variava tra l'output SSR e l'idratazione.
 *
 * Soluzione: useEffect-gated render. Server e prima passata client
 * ritornano `null` (= zero diff). Dopo l'hydration il useEffect flippa
 * `mounted=true` e gli script vengono iniettati. Costa ~1 microtask di
 * ritardo nel caricamento scripts (irrilevante per analytics, che e' best-effort).
 *
 * Il counter Yandex (106920957) e' quello corretto del pannello 4BID;
 * il config history e' documentato nel commento del layout precedente.
 */
export default function AnalyticsScripts() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return (
    <>
      <Script id="google-consent-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('consent', 'default', {
            'ad_storage': 'denied',
            'analytics_storage': 'denied',
            'ad_user_data': 'denied',
            'ad_personalization': 'denied',
            'wait_for_update': 500
          });
        `}
      </Script>
      <Script
        async
        src="https://www.googletagmanager.com/gtag/js?id=G-PWD822BQFP"
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-PWD822BQFP');
        `}
      </Script>
      <Script id="yandex-metrica" strategy="afterInteractive">
        {`
          (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
          m[i].l=1*new Date();
          for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r)return;}
          k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
          (window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");
          ym(106920957,"init",{clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:true});
        `}
      </Script>
      {/*
        noscript fallback per browser senza JS e per la verifica installazione
        dal pannello Yandex. Anche questo si monta solo dopo l'hydration:
        sembra paradossale ma e' coerente — l'intero pacchetto analytics
        e' trattato come "client-only", quindi anche il pixel di fallback.
        Per browser senza JS reali (rarissimi), Yandex ha comunque l'analisi
        server-side via referrer e altri hit. Il counter principale lavora
        attraverso lo script Yandex sopra.
      */}
      <noscript>
        <div>
          <img
            src="https://mc.yandex.ru/watch/106920957"
            style={{ position: "absolute", left: "-9999px" }}
            alt=""
          />
        </div>
      </noscript>
    </>
  )
}
