"use client"

import useSWR from "swr"
import { TrendingUp } from "lucide-react"

interface RevenueSummaryResponse {
  status: "ready" | "not_configured" | "not_linked" | "not_applicable" | "unauthorized" | "error"
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

function Kpi({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="min-w-0" title={title}>
      <p className="truncate text-lg font-semibold tabular-nums text-foreground">{value}</p>
      <p className="truncate text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

/**
 * Card Revenue read-only (modulo Santaddeo RMS) per la dashboard admin.
 * Deve comportarsi come le altre card del cruscotto: stessa altezza, stessa
 * densita' visiva e una gerarchia immediata (produzione come KPI principale).
 * Regola dati certi: KPI mancanti = "n/d", mai numeri inventati.
 */
export default function RevenueSummaryCard() {
  const { data, error, isLoading } = useSWR<RevenueSummaryResponse>("/api/admin/revenue/summary", fetcher, {
    revalidateOnFocus: false,
  })

  // Tenant non alberghiero (azienda/agenzia): i KPI Revenue non sono pertinenti.
  if (data?.status === "not_applicable") return null

  let notice: string | null = null
  if (isLoading) notice = "Caricamento dati Revenue…"
  else if (error || !data || data.status === "error") notice = "Dati Revenue non disponibili al momento."
  else if (data.status === "not_configured")
    notice = "Collegamento a Santaddeo non attivo su questa installazione: lo imposta chi amministra la piattaforma."
  else if (data.status === "not_linked")
    notice = "Questa struttura non è ancora abbinata a un hotel su Santaddeo: l'abbinamento lo esegue chi amministra la piattaforma."
  else if (data.status === "unauthorized") notice = "Accesso non autorizzato."

  if (notice) {
    return (
      <section
        aria-label="Revenue"
        className="flex h-full flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:border-ha-brand/40"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-foreground">Revenue</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Mese corrente</p>
          </div>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
            <TrendingUp className="h-4 w-4" aria-hidden="true" />
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-sm leading-relaxed text-muted-foreground">{notice}</p>
        </div>
      </section>
    )
  }

  // KPI VALIDATI 23/07/2026: la pipeline replica le formule della dashboard
  // Santaddeo V1. KPI non calcolabili = "n/d", mai 0 finto.
  const kpi = data?.kpi
  const updatedAt = fmtDate(data?.lastDataDate)

  return (
    <section
      aria-label="Revenue"
      className="flex h-full flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:border-ha-brand/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-foreground">Revenue</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Mese corrente</p>
        </div>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ha-brand-soft text-ha-brand">
          <TrendingUp className="h-4 w-4" aria-hidden="true" />
        </div>
      </div>

      <div className="mt-4">
        <p className="text-3xl font-semibold tracking-tight tabular-nums text-ha-brand">
          {fmtEur(kpi?.revenueMonth)}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">Produzione del mese</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 border-t border-border pt-4">
        <Kpi label="Occupazione" value={fmtPct(kpi?.occupancyAvg)} title="Occupazione media del mese" />
        <Kpi label="Prezzo medio (ADR)" value={fmtEur(kpi?.adr)} title="Tariffa media giornaliera" />
        <Kpi label="RevPAR" value={fmtEur(kpi?.revpar)} title="Ricavo per camera disponibile" />
        <Kpi label="Camere vendute" value={fmtInt(kpi?.roomsSold)} />
      </div>

      <p className="mt-auto pt-4 text-xs text-muted-foreground">
        Dati Santaddeo{updatedAt ? ` · aggiornati al ${updatedAt}` : ""}
      </p>
    </section>
  )
}
