"use client"

/**
 * Banner di allerta integrita' pricing per la dashboard superadmin.
 *
 * Legge gli alert APERTI da /api/superadmin/pricing-integrity (popolati dal
 * cron pricing-integrity) e li mostra in cima alla dashboard. Ogni alert ha
 * un pulsante "Segna risolto". Auto-refresh ogni 60s. Se non ci sono alert,
 * il componente non renderizza nulla.
 */

import useSWR from "swr"
import { useState } from "react"
import { AlertTriangle, X, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"

interface IntegrityAlert {
  id: string
  kind: "mass_delete" | "horizon_gap"
  hotel_id: string | null
  hotel_name: string | null
  severity: string
  detail: Record<string, any>
  detected_at: string
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function describe(a: IntegrityAlert): string {
  const hotel = a.hotel_name || "Hotel sconosciuto"
  if (a.kind === "mass_delete") {
    const d = a.detail || {}
    const range =
      d.dateRange && d.dateRange.min && d.dateRange.max
        ? ` nel periodo ${d.dateRange.min} → ${d.dateRange.max}`
        : ""
    return `${hotel}: cancellati ${d.deletedRows ?? "?"} parametri (${d.distinctKeys ?? "?"} tipi)${range}. Dati ancora mancanti dopo il ripristino automatico.`
  }
  const d = a.detail || {}
  const ranges = Array.isArray(d.missingRanges)
    ? d.missingRanges
        .map((r: { from: string; to: string }) => (r.from === r.to ? r.from : `${r.from}→${r.to}`))
        .join(", ")
    : ""
  const rangeSuffix = ranges ? ` (${ranges})` : ""
  return `${hotel}: tariffa di partenza con ${d.missingDays ?? "?"} giorni mancanti nell'orizzonte${rangeSuffix}.`
}

export function PricingIntegrityBanner() {
  const { data, mutate } = useSWR<{ alerts: IntegrityAlert[] }>(
    "/api/superadmin/pricing-integrity",
    fetcher,
    { refreshInterval: 60_000 },
  )
  const [resolving, setResolving] = useState<string | null>(null)

  const alerts = data?.alerts || []
  if (alerts.length === 0) return null

  async function resolve(id: string) {
    setResolving(id)
    try {
      await fetch("/api/superadmin/pricing-integrity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      await mutate()
    } finally {
      setResolving(null)
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-destructive">
              {alerts.length === 1
                ? "1 anomalia critica sui prezzi"
                : `${alerts.length} anomalie critiche sui prezzi`}
            </h2>
            <a
              href="/superadmin/pricing-params-audit"
              className="inline-flex items-center gap-1 text-xs font-medium text-destructive hover:underline"
            >
              Audit parametri
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </div>
          <ul className="mt-2 flex flex-col gap-2">
            {alerts.map((a) => (
              <li
                key={a.id}
                className="flex items-start justify-between gap-3 rounded-md bg-background/60 px-3 py-2"
              >
                <p className="text-sm leading-relaxed text-foreground text-pretty">
                  {describe(a)}
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 shrink-0 gap-1 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => resolve(a.id)}
                  disabled={resolving === a.id}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                  {resolving === a.id ? "..." : "Risolvi"}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
