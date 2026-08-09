"use client"

// PAGINA TEMPORANEA DI VERIFICA - da eliminare dopo la misura.
// Monta il componente REALE e forza /api/kpi/email a rispondere 500,
// contando le chiamate per misurare la spaziatura del freno.

import { useEffect, useState } from "react"
import { EmailKpiBar } from "@/components/admin/email-kpi-bar"

export default function FrenoTestPage() {
  const [pronto, setPronto] = useState(false)

  useEffect(() => {
    const w = window as any
    if (w.__frenoInstallato) {
      setPronto(true)
      return
    }
    w.__chiamate = []
    const originale = window.fetch
    w.__frenoInstallato = true
    window.fetch = async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input?.url || ""
      if (url.includes("/api/kpi/email")) {
        w.__chiamate.push(Date.now())
        return new Response(JSON.stringify({ error: "guasto simulato" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      }
      return originale(input, init)
    }
    setPronto(true)
  }, [])

  if (!pronto) return <p className="p-4">Preparazione…</p>

  return (
    <main className="p-4">
      <h1 className="mb-4 text-lg font-semibold">Verifica freno KPI (temporanea)</h1>
      <EmailKpiBar />
    </main>
  )
}
