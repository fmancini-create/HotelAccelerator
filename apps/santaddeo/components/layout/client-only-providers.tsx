"use client"

import dynamic from "next/dynamic"

// All these components require browser APIs -- loaded only client-side.
// This wrapper is a Client Component, which IS allowed to use ssr: false.

const AuthHashHandler = dynamic(
  () => import("@/components/auth/auth-hash-handler").then(m => m.AuthHashHandler),
  { ssr: false }
)
const WebVitalsReporter = dynamic(
  () => import("@/components/performance/web-vitals").then(m => m.WebVitalsReporter),
  { ssr: false }
)
const GlobalChatWidget = dynamic(
  () => import("@/components/layout/global-chat-widget").then(m => m.GlobalChatWidget),
  { ssr: false }
)
const PageGuideButton = dynamic(
  () => import("@/components/layout/page-guide-button").then(m => m.PageGuideButton),
  { ssr: false }
)
// Yandex page tracker: chiama ym(counter, 'hit', url) sui route change client-side.
// Senza questo, App Router perde tutte le navigazioni interne dopo il primo load.
const YandexPageTracker = dynamic(
  () => import("@/components/analytics/yandex-page-tracker").then(m => m.YandexPageTracker),
  { ssr: false }
)

interface ClientOnlyProvidersProps {
  isDev?: boolean
}

export function ClientOnlyProviders({ isDev = false }: ClientOnlyProvidersProps) {
  // Note: "Failed to fetch" suppression for v0 preview is handled by an inline
  // <script> in layout.tsx that runs before ANY module parsing. No useEffect needed.

  // FIX 02/05/2026: rimosso `vercel.app` dalla lista preview.
  // Quel check disabilitava il PageGuideButton anche sul dominio Vercel custom
  // di produzione (l'icona della chat guida spariva su santaddeo.com prima
  // che il custom domain fosse propagato, e su tutte le preview-deploy attive).
  // Inoltre, dopo lo switch a /api/page-guide/whoami (server-side), non e' piu'
  // necessario disabilitare la guida nei preview perche' non istanzia piu' un
  // Supabase browser client. Manteniamo solo i veri preview di v0/sandbox.
  const isV0Preview = typeof window !== "undefined" && (
    window.location.hostname.includes("vusercontent.net") ||
    window.location.hostname.includes("vercel.run") ||
    window.location.hostname.includes("v0.dev") ||
    window.location.hostname.startsWith("preview-")
  )
  
  const enableWebVitals = !isDev
  const enableChatWidget = !isDev
  // PageGuide ora puo' girare anche in preview (auth e' tutta server-side via
  // /api/page-guide/whoami). Disabilitato solo nelle sandbox v0 dove le fetch
  // verso route /api locali non sempre arrivano al server reale.
  const enablePageGuide = !isV0Preview
  // Yandex tracker attivo solo in produzione (stessa policy di Yandex script in layout.tsx).
  const enableYandexTracker = !isDev && !isV0Preview

  return (
    <>
      <AuthHashHandler />
      {enableWebVitals && <WebVitalsReporter logToConsole={false} logToEndpoint={true} />}
      {enableChatWidget && <GlobalChatWidget />}
      {enablePageGuide && <PageGuideButton />}
      {enableYandexTracker && <YandexPageTracker />}
    </>
  )
}
