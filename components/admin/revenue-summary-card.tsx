"use client"

import useSWR from "swr"
import { TrendingUp } from "lucide-react"

interface RevenueSummaryResponse {
  status: "ready" | "not_configured" | "not_linked" | "unauthorized" | "error"
  property?: { id: string; name: string }
  period?: { from: string; to: string }
  kpi?: {
    revenueMonth: number | null
    occupancyAvg: number | null
    adr: number | null
    revpar: number | null
    roomsSold: number | null
    roomsAvailable: number | null
  }
  lastDataDate?: string | null
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const eur = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
})

function fmtEur(v: number | null | undefined): string {
  return v === null || v === undefined ? "n/d" : eur.format(v)
}

function fmtPct(v: number | null | undefined): string {
  return v === null || v === undefined ? "n/d" : `${v.toFixed(1)}%`
}

function fmtInt(v: number | null | undefined): string {
  return v === null || v === undefined ? "n/d" : String(Math.round(v))
}

function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const [y, m, d] = iso.split("-")
  if (!y || !m || !d) return null
  return `${d}/${m}/${y}`
}

/**
 * Card Revenue read-only (modulo Santaddeo RMS) per la dashboard admin.
 * Grafica sui token Santaddeo (palette neutra, radius di tema).
 * Regola dati certi: KPI mancanti = "n/d", mai numeri inventati.
 */
export default function RevenueSummaryCard() {
  const { data, error, isLoading } = useSWR<RevenueSummaryResponse>("/api/admin/revenue/summary", fetcher, {
    revalidateOnFocus: false,
  })

  // Stati non-ready: card compatta informativa, mai errori bloccanti.
  let notice: string | null = null
  if (isLoading) notice = "Caricamento…"
  else if (error || !data || data.status === "error") notice = "Dati Revenue non disponibili al momento."
  else if (data.status === "not_configured") notice = "Revenue non configurato."
  else if (data.status === "not_linked") notice = "Revenue non collegato a questa struttura."
  else if (data.status === "unauthorized") notice = "Accesso non autorizzato."

  if (notice) {
    return (
      <section aria-label="Revenue" className="mb-8 rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
            <TrendingUp className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-base font-medium text-foreground">Revenue</h3>
            <p className="text-sm text-muted-foreground">{notice}</p>
          </div>
        </div>
      </section>
    )
  }

  // KPI VALIDATI 23/07/2026: la pipeline replica le formule della dashboard
  // Santaddeo V1 (metrics.service) e i valori sono stati confrontati 1:1 con
  // /api/dashboard/metrics di V1 sullo stesso range (revenue, room nights,
  // occupancy, ADR, RevPAR identici). KPI non calcolabili = "n/d", mai 0 finto.
  const kpi = data?.kpi
  const updatedAt = fmtDate(data?.lastDataDate)

  const items: { label: string; value: string }[] = [
    { label: "Produzione mese", value: fmtEur(kpi?.revenueMonth) },
    { label: "Occupazione media", value: fmtPct(kpi?.occupancyAvg) },
    { label: "ADR", value: fmtEur(kpi?.adr) },
    { label: "RevPAR", value: fmtEur(kpi?.revpar) },
    { label: "Camere vendute", value: fmtInt(kpi?.roomsSold) },
  ]

  return (
    <section aria-label="Revenue" className="mb-8 rounded-xl border border-border bg-card p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* Verde identitario Santaddeo (solo styling, dati invariati) */}
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ha-brand text-ha-brand-foreground">
            <TrendingUp className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-base font-medium text-foreground">Revenue</h3>
            <p className="text-sm text-muted-foreground">Mese corrente — dati Santaddeo (sola lettura)</p>
          </div>
        </div>
        {updatedAt && <span className="text-xs text-muted-foreground">Aggiornato al {updatedAt}</span>}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((item) => (
          <div key={item.label} className="rounded-lg border border-ha-brand/15 bg-ha-brand-soft p-3">
            <p className="text-lg font-semibold text-ha-brand-soft-foreground">{item.value}</p>
            <p className="text-xs text-muted-foreground">{item.label}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
