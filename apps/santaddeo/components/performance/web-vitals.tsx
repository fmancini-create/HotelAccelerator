"use client"

import { useEffect, useCallback, useRef } from "react"
import { onLCP, onINP, onCLS, onFCP, onTTFB, type Metric } from "web-vitals"

// 14/07/2026: riscritto per usare il pacchetto ufficiale `web-vitals` di
// Google al posto degli observer manuali. Differenze sostanziali:
//  - INP: prima usavamo la durata MAX di qualunque evento (sovrastimava);
//    ora e' il calcolo ufficiale (percentile 98 delle interazioni reali,
//    con attribution corretta di input delay + processing + presentation).
//  - CLS: prima accumulavamo TUTTI i layout shift della pagina e potevamo
//    inviare piu' report per sessione (a ogni cambio tab); ora usa le
//    "session windows" ufficiali (max finestra 5s con gap 1s) e la
//    libreria invia solo i delta quando il valore cambia.
//  - LCP/FCP/TTFB: identici concettualmente, ma con tutti gli edge case
//    gestiti dalla libreria (bfcache restore, prerendering, ecc.).
// Manteniamo: campionamento 20%, batching con sendBeacon, filtro
// tab-in-background durante la navigazione (evita LCP/TTFB falsati).

// Generate a unique session ID per page load
const SESSION_ID = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)

// Sampling rate: 0.2 = 20% of sessions report vitals
const SAMPLING_RATE = 0.2

// Deterministic: once decided for this session, it stays
const IS_SAMPLED = Math.random() < SAMPLING_RATE

// Valori oltre questi limiti sono considerati artefatti (tab in background,
// throttling estremo) e scartati per non inquinare le medie.
const maxRealisticValues: Record<string, number> = {
  TTFB: 30000, // 30 seconds max
  LCP: 60000, // 60 seconds max
  FCP: 60000, // 60 seconds max
  INP: 10000, // 10 seconds max
  CLS: 10, // CLS is unitless
}

export function WebVitalsReporter({
  logToConsole = true,
  logToEndpoint = false,
  endpointUrl = "/api/perf/vitals",
}: {
  logToConsole?: boolean
  logToEndpoint?: boolean
  endpointUrl?: string
}) {
  const wasHiddenDuringNavRef = useRef(false)
  const navigationTimeRef = useRef(0)
  const initializedRef = useRef(false)
  const bufferRef = useRef<any[]>([])
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // La libreria puo' emettere piu' volte la stessa metrica (delta update,
  // es. CLS che cresce). Teniamo solo l'ULTIMO valore per metrica nel
  // buffer, cosi in DB arriva un solo report per metrica per sessione.
  const latestByMetricRef = useRef<Map<string, any>>(new Map())

  const flushBuffer = useCallback((url: string) => {
    const metrics = Array.from(latestByMetricRef.current.values())
    if (metrics.length === 0) return
    latestByMetricRef.current = new Map()
    bufferRef.current = []
    // Use sendBeacon for reliability (works even during page unload)
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, JSON.stringify({ batch: metrics }))
    } else {
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch: metrics }),
        keepalive: true,
      }).catch(() => {})
    }
  }, [])

  const reportMetric = useCallback(
    (metric: Metric) => {
      const path = window.location.pathname

      // LCP/FCP/TTFB misurati con tab in background durante la navigazione
      // sono falsati (il browser de-prioritizza il rendering): scartali.
      if (wasHiddenDuringNavRef.current && metric.name !== "CLS" && metric.name !== "INP") {
        if (logToConsole) {
          console.log(`[WEB_VITALS] ${metric.name}: SKIPPED (tab was in background during navigation)`)
        }
        return
      }

      const max = maxRealisticValues[metric.name]
      if (max != null && metric.value > max) {
        if (logToConsole) {
          console.log(`[WEB_VITALS] ${metric.name}: ${Math.round(metric.value)} SKIPPED (unrealistic outlier)`)
        }
        return
      }

      if (logToConsole) {
        const display = metric.name === "CLS" ? metric.value.toFixed(3) : `${Math.round(metric.value)}ms`
        console.log(`[WEB_VITALS] ${metric.name}: ${display} (${metric.rating})`)
      }

      if (logToEndpoint && IS_SAMPLED) {
        // Sovrascrive il valore precedente della stessa metrica: al flush
        // parte solo il piu' recente (finale) per ogni metrica.
        latestByMetricRef.current.set(metric.name, {
          name: metric.name,
          value: metric.value,
          rating: metric.rating,
          timestamp: new Date().toISOString(),
          path,
          session_id: SESSION_ID,
          sampled: true,
          navigationTime: navigationTimeRef.current,
          foreground: !wasHiddenDuringNavRef.current,
        })
        // Debounced flush after 15 seconds (max 1 POST per 15s)
        if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
        flushTimerRef.current = setTimeout(() => flushBuffer(endpointUrl), 15000)
      }
    },
    [logToConsole, logToEndpoint, endpointUrl, flushBuffer],
  )

  useEffect(() => {
    if (!initializedRef.current) {
      wasHiddenDuringNavRef.current = document.visibilityState === "hidden"
      navigationTimeRef.current = performance.now()
      initializedRef.current = true

      // Registrazione ufficiale. reportAllChanges: false (default) = la
      // libreria emette la metrica quando e' definitiva o quando la pagina
      // va in background; per CLS/INP emette aggiornamenti che noi
      // dedupplichiamo tenendo solo l'ultimo valore.
      onTTFB(reportMetric)
      onFCP(reportMetric)
      onLCP(reportMetric)
      onCLS(reportMetric)
      onINP(reportMetric)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        // Flush buffered metrics when tab hides (web-vitals emette CLS/INP
        // finali proprio su questo evento, prima del nostro flush).
        flushBuffer(endpointUrl)
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("pagehide", handleVisibilityChange)

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("pagehide", handleVisibilityChange)
    }
  }, [reportMetric, flushBuffer, endpointUrl])

  return null
}
