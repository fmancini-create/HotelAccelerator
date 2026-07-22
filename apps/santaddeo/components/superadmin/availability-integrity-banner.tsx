"use client"

/**
 * Banner di allerta integrità DISPONIBILITÀ per la dashboard superadmin.
 *
 * Legge gli alert APERTI da /api/superadmin/availability-integrity (popolati
 * dal cron availability-integrity) e li mostra in cima alla dashboard. Ogni
 * alert ha un pulsante "Risolvi". Auto-refresh ogni 60s. Se non ci sono alert,
 * il componente non renderizza nulla. Speculare a PricingIntegrityBanner.
 */

import useSWR from "swr"
import { useState } from "react"
import { AlertTriangle, X, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"

interface AvailabilityAlert {
  id: string
  kind: "scidoo_stale_near_term" | "derived_missing_near_term" | "scidoo_fetch_stale"
  hotel_id: string | null
  hotel_name: string | null
  severity: string
  detail: Record<string, any>
  detected_at: string
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function describe(a: AvailabilityAlert): string {
  const hotel = a.hotel_name || "Hotel sconosciuto"
  const d = a.detail || {}
  if (a.kind === "scidoo_stale_near_term") {
    return `${hotel}: disponibilità non aggiornata — ${d.unprocessedNearTerm ?? "?"} righe grezze del PMS non ancora processate da oggi in avanti. La dashboard potrebbe mostrare camere libere in realtà vendute.`
  }
  if (a.kind === "scidoo_fetch_stale") {
    const age = d.ageHours != null ? `${d.ageHours}h fa` : "molto tempo fa"
    return `${hotel}: il PMS Scidoo non fornisce disponibilità fresca da ${age} (ultimo fetch riuscito: ${d.lastSyncedAt ?? "n/d"}). Probabile rate-limit 429 sul sync: la disponibilità è FERMA. Verificare il connettore.`
  }
  const missing = Array.isArray(d.missingRoomTypeIds) ? d.missingRoomTypeIds.length : "?"
  return `${hotel}: ${missing} tipologia/e venduta/e oggi senza dato di disponibilità (${d.date ?? "oggi"}). Dashboard cieca su quelle camere.`
}

export function AvailabilityIntegrityBanner() {
  const { data, mutate } = useSWR<{ alerts: AvailabilityAlert[] }>(
    "/api/superadmin/availability-integrity",
    fetcher,
    { refreshInterval: 60_000 },
  )
  const [resolving, setResolving] = useState<string | null>(null)

  const alerts = data?.alerts || []
  if (alerts.length === 0) return null

  async function resolve(id: string) {
    setResolving(id)
    try {
      await fetch("/api/superadmin/availability-integrity", {
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
                ? "1 anomalia critica sulla disponibilità"
                : `${alerts.length} anomalie critiche sulla disponibilità`}
            </h2>
            <a
              href="/superadmin/connectors-health"
              className="inline-flex items-center gap-1 text-xs font-medium text-destructive hover:underline"
            >
              Connectors Health
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </div>
          <ul className="mt-2 flex flex-col gap-2">
            {alerts.map((a) => (
              <li
                key={a.id}
                className="flex items-start justify-between gap-3 rounded-md bg-background/60 px-3 py-2"
              >
                <p className="text-sm leading-relaxed text-foreground text-pretty">{describe(a)}</p>
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
