"use client"

/**
 * Pannello "Pubblica Tariffe" agnostico.
 *
 * AGNOSTICO: questo componente NON conosce Scidoo, BRiG, GSheets o altri
 * provider specifici. Si auto-attiva chiamando /api/pms/capabilities che
 * legge il registry centrale (lib/connectors/registry.ts) e ritorna se
 * il connector ha capability "push_rates". Se non la ha, il pannello
 * mostra un info banner e nasconde i pulsanti.
 *
 * Il push effettivo va al dispatcher esistente
 * POST /api/superadmin/push-prices-range, che a sua volta chiama
 * pushPricesToPMS -> registry -> connector.pushRates. Niente switch
 * sul pms_name in nessun punto del flusso (regola aurea del 20/05/2026).
 *
 * Aggiunto 20/05/2026 con il refactor agnostico + push BRiG.
 */

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Send, Loader2, Info, AlertCircle, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"

interface Capabilities {
  code: string | null
  displayName: string | null
  capabilities: string[]
  supportsPushRates: boolean
  reason?: string
}

interface PushOutcome {
  success: boolean
  method: string
  cellsOrRecords: number
  errors: string[]
  warnings?: string[]
}

interface PublishRatesPanelProps {
  hotelId: string
  pmsIntegrationId: string
}

export function PublishRatesPanel({ hotelId, pmsIntegrationId }: PublishRatesPanelProps) {
  const [caps, setCaps] = useState<Capabilities | null>(null)
  const [loadingCaps, setLoadingCaps] = useState(true)

  // Default range: oggi -> oggi+90 giorni (orizzonte tipico di pricing).
  const today = new Date().toISOString().split("T")[0]
  const ninetyDaysOut = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString().split("T")[0]
  const [dateFrom, setDateFrom] = useState(today)
  const [dateTo, setDateTo] = useState(ninetyDaysOut)

  const [pushing, setPushing] = useState(false)
  const [lastResult, setLastResult] = useState<PushOutcome | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoadingCaps(true)
      try {
        const res = await fetch(`/api/pms/capabilities?pmsIntegrationId=${pmsIntegrationId}`)
        const json = await res.json()
        if (!cancelled) setCaps(json)
      } catch (err) {
        console.error("[v0] [PublishRatesPanel] capabilities load failed:", err)
      } finally {
        if (!cancelled) setLoadingCaps(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [pmsIntegrationId])

  async function runPush() {
    if (!caps?.supportsPushRates) return
    if (!dateFrom || !dateTo) {
      toast.error("Seleziona un range di date valido")
      return
    }
    if (dateTo < dateFrom) {
      toast.error("La data di fine deve essere >= data di inizio")
      return
    }
    setPushing(true)
    setLastResult(null)
    try {
      const res = await fetch("/api/superadmin/push-prices-range", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId, dateFrom, dateTo }),
      })
      const json = await res.json()
      const outcome: PushOutcome = {
        success: !!json.success,
        method: json.method || "unknown",
        cellsOrRecords: json.cellsOrRecords ?? 0,
        errors: json.errors || (json.error ? [json.error] : []),
        warnings: json.warnings,
      }
      setLastResult(outcome)
      if (outcome.success) {
        toast.success(
          `Push completato: ${outcome.cellsOrRecords} prezzi inviati a ${caps.displayName}`,
        )
      } else {
        toast.error(`Push fallito: ${outcome.errors[0] || "errore sconosciuto"}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore di rete"
      toast.error(msg)
      setLastResult({ success: false, method: "unknown", cellsOrRecords: 0, errors: [msg] })
    } finally {
      setPushing(false)
    }
  }

  if (loadingCaps) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Verifico capability del PMS...
        </CardContent>
      </Card>
    )
  }

  if (!caps) return null

  // Capability not supported: mostriamo un info banner invece di nascondere
  // tutto, cosi' l'utente capisce che il push non e' bloccato per bug ma
  // perche' il PMS non lo espone come funzionalita'.
  if (!caps.supportsPushRates) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Pubblica Tariffe
          </CardTitle>
          <CardDescription>
            Invio dei prezzi calcolati dal motore RMS al PMS.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Push tariffe non disponibile</AlertTitle>
            <AlertDescription>
              Il PMS configurato {caps.displayName ? `(${caps.displayName})` : ""} non supporta il push tariffe via API.
              {caps.reason ? ` Dettaglio: ${caps.reason}` : ""}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Pubblica Tariffe
            </CardTitle>
            <CardDescription className="mt-1.5">
              Invia i prezzi calcolati al PMS {caps.displayName}. I prezzi vengono presi dalla{" "}
              <code className="text-xs">pricing_grid</code> per il range selezionato.
            </CardDescription>
          </div>
          <Button onClick={runPush} disabled={pushing} className="shrink-0">
            {pushing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Pubblicazione...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Pubblica
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="push-date-from">Da</Label>
            <Input
              id="push-date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              disabled={pushing}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="push-date-to">A</Label>
            <Input
              id="push-date-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              disabled={pushing}
            />
          </div>
        </div>

        {lastResult && (
          <Alert variant={lastResult.success ? "default" : "destructive"}>
            {lastResult.success ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            <AlertTitle>
              {lastResult.success
                ? `Pubblicazione completata (${lastResult.method})`
                : "Pubblicazione fallita"}
            </AlertTitle>
            <AlertDescription className="space-y-1">
              <div>
                {lastResult.cellsOrRecords > 0
                  ? `${lastResult.cellsOrRecords} prezzi inviati con successo.`
                  : "Nessun prezzo inviato."}
              </div>
              {lastResult.errors.length > 0 && (
                <ul className="text-xs list-disc pl-4">
                  {lastResult.errors.slice(0, 5).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                  {lastResult.errors.length > 5 && (
                    <li>+ altri {lastResult.errors.length - 5} errori</li>
                  )}
                </ul>
              )}
              {lastResult.warnings && lastResult.warnings.length > 0 && (
                <details className="text-xs mt-1">
                  <summary className="cursor-pointer">
                    {lastResult.warnings.length} warning (espandi)
                  </summary>
                  <ul className="list-disc pl-4 mt-1">
                    {lastResult.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </details>
              )}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
