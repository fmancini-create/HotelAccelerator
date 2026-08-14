"use client"

import { useEffect } from "react"

/**
 * Segnala che un operatore e' davanti al pannello.
 *
 * Non disegna nulla: serve solo a far sapere al sistema che c'e' qualcuno al
 * banco. Quando non arriva nessun battito, l'assistente risponde da solo alle
 * chat dal sito invece di preparare bozze che nessuno approverebbe.
 */
export function OperatorPresenceBeacon({ intervalloMs = 60_000 }: { intervalloMs?: number }) {
  useEffect(() => {
    let vivo = true
    let timer: ReturnType<typeof setTimeout> | undefined

    const battito = async () => {
      // Scheda in secondo piano: non serve dichiararsi presenti se l'operatore
      // sta guardando altro. Alla riapertura il battito riprende subito.
      if (document.visibilityState !== "visible") return
      try {
        await fetch("/api/admin/presence", { method: "POST", cache: "no-store" })
      } catch {
        // Rete assente: il silenzio e' il segnale giusto, l'assistente subentra.
      }
    }

    const ciclo = async () => {
      if (!vivo) return
      await battito()
      // `setTimeout` a catena invece di `setInterval`: se una richiesta e' lenta
      // non se ne accumulano altre in coda dietro di lei.
      timer = setTimeout(ciclo, intervalloMs)
    }

    void ciclo()
    const alRitorno = () => {
      if (document.visibilityState === "visible") void battito()
    }
    document.addEventListener("visibilitychange", alRitorno)

    return () => {
      vivo = false
      if (timer) clearTimeout(timer)
      document.removeEventListener("visibilitychange", alRitorno)
    }
  }, [intervalloMs])

  return null
}
