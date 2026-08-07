"use client"

import { useEffect, useState } from "react"
import Script from "next/script"
import { Analytics } from "@vercel/analytics/next"

const STORAGE_KEY = "hotelaccelerator-cookie-consent-v1"
const GA_MEASUREMENT_ID = "G-DT2601Q58K"
const YANDEX_METRICA_ID = "106059423"

type Consent = { analytics: boolean; marketing: boolean }

function savedAnalyticsConsent() {
  try {
    return Boolean((JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null") as Consent | null)?.analytics)
  } catch {
    return false
  }
}

export function ConsentAwareAnalytics() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    setEnabled(savedAnalyticsConsent())
    const update = (event: Event) => setEnabled(Boolean((event as CustomEvent<Consent>).detail?.analytics))
    window.addEventListener("hotelaccelerator:cookie-consent", update)
    return () => window.removeEventListener("hotelaccelerator:cookie-consent", update)
  }, [])

  if (!enabled) return null
  return <>
    <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} strategy="afterInteractive" />
    <Script id="tenant-google-analytics" strategy="afterInteractive">{`
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${GA_MEASUREMENT_ID}');
    `}</Script>
    <Script id="tenant-yandex-metrika" strategy="afterInteractive">{`
      (function(m,e,t,r,i,k,a){
        m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
        m[i].l=1*new Date();
        k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
      })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym');
      ym(${YANDEX_METRICA_ID}, 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: true, ecommerce: 'dataLayer' });
    `}</Script>
    <Analytics />
  </>
}
