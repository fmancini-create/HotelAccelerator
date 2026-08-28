"use client"

import { useEffect, useState } from "react"
import { Progress } from "@/components/ui/progress"

type Quote = {
  pagine: { uso: number; limite: number }
  foto: { uso: number; limite: number }
  conversazioni: { uso: number; limite: number }
}

export function ResourceUsagePanel() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [quote, setQuote] = useState<Quote | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const dashboard = await fetch("/api/platform/dashboard")
        if (!dashboard.ok) return
        const identity = await dashboard.json()
        if (!identity?.isAdmin || !alive) return
        setIsAdmin(true)

        const response = await fetch("/api/admin/quotas")
        if (!response.ok) return
        const data = await response.json()
        if (!data?.usage || !data?.quotas || !alive) return
        setQuote({
          pagine: { uso: data.usage.pagesCount ?? 0, limite: data.quotas.maxPagesCount ?? 0 },
          foto: { uso: data.usage.photosCount ?? 0, limite: data.quotas.maxPhotosCount ?? 0 },
          conversazioni: {
            uso: data.usage.conversationsThisMonth ?? 0,
            limite: data.quotas.maxConversationsPerMonth ?? 0,
          },
        })
      } catch {
        // Secondary panel: a quota failure must not make the operative dashboard fail.
      }
    })()
    return () => { alive = false }
  }, [])

  if (!isAdmin || !quote) return null

  return (
    <section className="mx-auto mb-8 w-full max-w-7xl px-4 md:px-6">
      <h2 className="mb-3 text-sm font-semibold text-foreground">Utilizzo risorse</h2>
      <div className="grid gap-3 rounded-xl border border-border bg-card p-5 sm:grid-cols-3">
        {[
          { nome: "Pagine", value: quote.pagine },
          { nome: "Foto", value: quote.foto },
          { nome: "Conversazioni del mese", value: quote.conversazioni },
        ].map(({ nome, value }) => {
          const percentage = value.limite > 0 ? Math.min(100, Math.round((value.uso / value.limite) * 100)) : null
          return (
            <div key={nome}>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <span className="text-xs text-muted-foreground">{nome}</span>
                <span className="text-sm font-semibold tabular-nums">
                  {value.uso.toLocaleString("it-IT")}{value.limite > 0 ? ` / ${value.limite.toLocaleString("it-IT")}` : ""}
                </span>
              </div>
              {percentage !== null && <Progress value={percentage} className="h-1.5" />}
            </div>
          )
        })}
      </div>
    </section>
  )
}
