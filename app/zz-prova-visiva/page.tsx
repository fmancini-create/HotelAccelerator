"use client"

/*
 * PAGINA TEMPORANEA, DA RIMUOVERE.
 *
 * Serve solo a guardare con gli occhi il componente VERO
 * (`ProcedureImparate`) con dati finti: la pagina reale sta dietro l'accesso e
 * senza sessione il browser finisce su /admin.
 *
 * Non si ricopia la grafica: si intercetta la sola chiamata di rete, cosi' cio'
 * che si vede e' il componente di produzione e non una sua imitazione.
 */

import { useEffect, useState } from "react"
import { ProcedureImparate } from "@/components/crm/procedure-imparate"

const FINTE = {
  sogliaPredefinita: 5,
  procedure: [
    {
      id: "1",
      pms_type: "scidoo",
      title: "Registrazione arrivo con documento",
      occurrences: 7,
      risk: "basso",
      status: "autonoma",
      autonomy_threshold: 5,
      steps_summary: [{ campo: "documento", value_kind: "testo" }],
      first_seen_at: "2026-08-01T09:00:00Z",
      last_seen_at: "2026-08-19T17:20:00Z",
    },
    {
      id: "2",
      pms_type: "scidoo",
      title: "Spostamento camera per guasto",
      occurrences: 3,
      risk: "medio",
      status: "proposta",
      autonomy_threshold: 5,
      steps_summary: [{ campo: "camera", value_kind: "codice" }],
      first_seen_at: "2026-08-05T11:00:00Z",
      last_seen_at: "2026-08-18T10:05:00Z",
    },
    {
      id: "3",
      pms_type: "scidoo",
      title: "Rimborso su prenotazione annullata",
      occurrences: 12,
      risk: "alto",
      status: "osservata",
      autonomy_threshold: 5,
      steps_summary: [{ campo: "importo", value_kind: "denaro" }],
      first_seen_at: "2026-07-20T08:00:00Z",
      last_seen_at: "2026-08-20T09:40:00Z",
    },
    {
      id: "4",
      pms_type: "scidoo",
      title: "Sconto fuori listino",
      occurrences: 9,
      risk: "medio",
      status: "bloccata",
      autonomy_threshold: 5,
      steps_summary: [{ campo: "sconto", value_kind: "percentuale" }],
      first_seen_at: "2026-07-11T08:00:00Z",
      last_seen_at: "2026-08-12T16:00:00Z",
    },
  ],
}

export default function ProvaVisiva() {
  const [pronto, setPronto] = useState(false)

  useEffect(() => {
    const originale = window.fetch
    window.fetch = (async (input: RequestInfo | URL) => {
      const url = String(typeof input === "string" ? input : (input as Request).url ?? input)
      if (url.includes("pms-shadow")) {
        return new Response(JSON.stringify(FINTE), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }
      return originale(input as RequestInfo)
    }) as typeof window.fetch
    setPronto(true)
    return () => {
      window.fetch = originale
    }
  }, [])

  if (!pronto) return <div className="p-8">Preparazione…</div>

  return (
    <div className="min-h-screen bg-background p-6">
      <ProcedureImparate />
    </div>
  )
}
