"use client"

import { useEffect } from "react"
import { HotelProvider } from "@/lib/contexts/hotel-context"
import { DEMO_HOTEL, getDemoMock } from "@/lib/sales/demo/mock-api"

/**
 * Provider della DEMO venditori.
 *
 * 1. Installa un interceptor su `window.fetch` che risponde con dati finti
 *    per le chiamate `/api/...` (vedi lib/sales/demo/mock-api.ts), cosi' i
 *    componenti REALI del prodotto montati nelle pagine demo si popolano con
 *    dati demo senza che venga toccata alcuna route di produzione.
 * 2. Avvolge tutto in <HotelProvider/> con un hotel finto, perche' diversi
 *    componenti reali leggono la struttura selezionata via useHotel().
 *
 * Timing/lifecycle: il patch di fetch viene installato SINCRONICAMENTE durante
 * il render di <DemoProviders/> (il render del padre precede gli effetti dei
 * figli, quindi e' gia' attivo quando le pagine demo lanciano le loro fetch) e
 * viene RIPRISTINATO nella cleanup dell'effetto, ossia quando si esce dalla
 * sezione demo. Il patch e' idempotente (guard `patched`). Questo evita che il
 * fetch finto sopravviva a una navigazione soft verso la dashboard reale.
 */

// L'interceptor monkey-patcha `window.fetch` a livello globale. DEVE essere
// installato durante il render del provider (prima che i figli montino i loro
// effetti di fetch) e RIPRISTINATO quando si esce dalla demo, altrimenti una
// navigazione soft (es. "Esci dalla demo" -> /dashboard, o il tasto Indietro)
// lascerebbe attivo il fetch finto: la dashboard reale riceverebbe dati mock
// (shape errata -> errori) e le mutazioni diventerebbero no-op. Ex bug: errore
// dashboard all'uscita dal tour.
let patched = false
let originalFetch: typeof window.fetch | null = null

function installFetchInterceptor() {
  if (patched || typeof window === "undefined") return
  patched = true

  originalFetch = window.fetch.bind(window)
  const realFetch = originalFetch

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url

    // Intercetta solo le GET verso /api/ gestite dal registry mock.
    const method = (init?.method || (typeof input !== "string" && !(input instanceof URL) ? input.method : "GET") || "GET").toUpperCase()
    if (url && url.includes("/api/")) {
      try {
        const mock = getDemoMock(url)
        if (mock !== undefined) {
          return new Response(JSON.stringify(mock), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        }
        // Mutazioni (POST/PUT/DELETE) verso API in demo: no-op silenzioso,
        // cosi' azioni come "Sincronizza" non esplodono ne' colpiscono il DB.
        if (method !== "GET") {
          return new Response(JSON.stringify({ ok: true, demo: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        }
        // GET non mappata: log per estendere il registry; passa al reale.
        console.log("[v0] demo fetch non mockata:", method, url)
      } catch (e) {
        console.log("[v0] demo interceptor error:", (e as Error)?.message)
      }
    }

    return realFetch(input, init)
  }
}

function restoreFetchInterceptor() {
  if (typeof window === "undefined" || !patched) return
  if (originalFetch) window.fetch = originalFetch
  patched = false
  originalFetch = null
}

export function DemoProviders({ children }: { children: React.ReactNode }) {
  // Install SINCRONO durante il render: il render del padre precede il mount e
  // gli effetti dei figli, quindi l'interceptor e' gia' attivo quando le pagine
  // demo lanciano le loro fetch. Idempotente (guard `patched`).
  installFetchInterceptor()

  useEffect(() => {
    // Ri-assicura l'installazione in caso di re-ingresso nella demo dopo che un
    // precedente unmount aveva ripristinato il fetch reale.
    installFetchInterceptor()
    // CRITICO: al unmount della sezione demo (uscita verso /dashboard, tasto
    // Indietro, ecc.) ripristina il `window.fetch` reale.
    return () => restoreFetchInterceptor()
  }, [])

  return (
    <HotelProvider
      initialData={{
        selectedHotel: DEMO_HOTEL,
        allHotels: [DEMO_HOTEL],
        isSuperAdmin: false,
        isDeveloper: false,
        isImpersonating: false,
      }}
    >
      {children}
    </HotelProvider>
  )
}
