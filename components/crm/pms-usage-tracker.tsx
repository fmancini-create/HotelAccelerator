"use client"

import { useEffect, useRef } from "react"

type Source = "remote_browser" | "direct_iframe" | null

const HEARTBEAT_MS = 30_000

async function send(method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>, keepalive = false) {
  try {
    await fetch("/api/crm/pms-usage", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive,
      cache: "no-store",
    })
  } catch {
    // La telemetria non deve mai impedire all'operatore di usare il PMS.
  }
}

/**
 * Conta il tempo in cui la pagina PMS resta in primo piano. Non prova a leggere
 * il contenuto dell'iframe e non salva dati del gestionale.
 */
export function PmsUsageTracker({ source }: { source: Source }) {
  const sessionIdRef = useRef<string | null>(null)
  const lastTickRef = useRef<number>(0)

  useEffect(() => {
    if (!source) return

    const sessionId = crypto.randomUUID()
    sessionIdRef.current = sessionId
    lastTickRef.current = performance.now()
    void send("POST", { clientSessionId: sessionId, source })

    const tick = () => {
      const now = performance.now()
      const elapsed = Math.max(0, Math.min(45, Math.round((now - lastTickRef.current) / 1000)))
      lastTickRef.current = now
      const active = document.visibilityState === "visible" && document.hasFocus()
      void send("PATCH", { clientSessionId: sessionId, activeSeconds: active ? elapsed : 0 })
    }

    const timer = window.setInterval(tick, HEARTBEAT_MS)
    const onVisibility = () => tick()
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("focus", onVisibility)
    window.addEventListener("blur", onVisibility)

    const onPageHide = () => {
      void send("DELETE", { clientSessionId: sessionId, closeReason: "page_leave" }, true)
    }
    window.addEventListener("pagehide", onPageHide)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("focus", onVisibility)
      window.removeEventListener("blur", onVisibility)
      window.removeEventListener("pagehide", onPageHide)
      void send("DELETE", { clientSessionId: sessionId, closeReason: "source_change" }, true)
      if (sessionIdRef.current === sessionId) sessionIdRef.current = null
    }
  }, [source])

  return null
}
