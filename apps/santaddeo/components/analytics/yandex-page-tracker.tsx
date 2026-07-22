"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { useEffect } from "react"

/**
 * Yandex Metrica page tracker per Next.js App Router.
 *
 * Problema: nel App Router le navigation client-side NON triggerano un full
 * page reload. Yandex Metrica registrerebbe SOLO il pageview iniziale, e
 * tutte le navigazioni successive sarebbero invisibili. Stesso pattern usato
 * per Google Analytics in App Router.
 *
 * Soluzione: usePathname + useSearchParams per intercettare i route change
 * e chiamare manualmente `ym(id, 'hit', url, { title, referer })`.
 *
 * Counter ID hardcoded perche' è pubblico (presente nello snippet del layout).
 */
const YANDEX_COUNTER_ID = 106920957

declare global {
  interface Window {
    // Yandex Metrika global, definito dallo snippet in app/layout.tsx
    ym?: (counterId: number, action: string, ...args: unknown[]) => void
  }
}

export function YandexPageTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (typeof window === "undefined") return
    if (typeof window.ym !== "function") {
      // Yandex non ancora caricato (script async): ym() viene definito dallo
      // snippet inline come stub PRIMA del network load, quindi questo branch
      // non dovrebbe scattare. Se scatta, l'utente ha un adblocker o CSP che
      // blocca lo snippet inline.
      return
    }

    const search = searchParams?.toString()
    const url = pathname + (search ? `?${search}` : "")
    const referer = typeof document !== "undefined" ? document.referrer : ""

    try {
      window.ym(YANDEX_COUNTER_ID, "hit", url, {
        title: typeof document !== "undefined" ? document.title : "",
        referer,
      })
    } catch (e) {
      // Non bloccare la navigazione per errori di tracking.
      console.warn("[v0] yandex hit failed:", (e as Error).message)
    }
  }, [pathname, searchParams])

  return null
}
