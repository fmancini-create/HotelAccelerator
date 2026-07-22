"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ChevronLeft, Loader2, AlertCircle, CheckCircle2 } from "lucide-react"

type StepResult =
  | { ok: true; durationMs: number; summary: string; sample?: unknown }
  | { ok: false; durationMs: number; error: string; httpStatus?: number; bodyPreview?: string }

interface DerivedFromReservations {
  roomCodes: string[]
  channelCodes: string[]
  marketCodes: string[]
  note: string
}

interface DiagnoseResponse {
  ok: boolean
  runAt?: string
  env?: { baseUrl?: string; structureIdMasked?: string; apiKeyMasked?: string }
  steps?: { label: string; result: StepResult }[]
  derivedFromReservations?: DerivedFromReservations | null
  error?: string
  hint?: string
}

export default function BrigSpikePage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<DiagnoseResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function runDiagnose() {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch("/api/admin/brig/diagnose", { cache: "no-store" })
      const json = (await res.json()) as DiagnoseResponse
      if (!res.ok && !json.steps) {
        setError(json.error || `HTTP ${res.status}`)
      }
      setResult(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/superadmin"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
          Torna alla Dashboard
        </Link>
      </div>

      <div>
        <h2 className="text-2xl font-semibold">BRiG Connector — Spike</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Test di connessione contro l&apos;ambiente BRiG di test. Verifica che le credenziali nelle env funzionino e
          che le API rispondano come da documentazione, prima di procedere con schema DB e sync.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Test connessione</CardTitle>
          <CardDescription>
            Esegue 3 chiamate parallele: <code className="text-xs">roomtypes/list</code>,{" "}
            <code className="text-xs">rateplans/list</code>,{" "}
            <code className="text-xs">reservations/daily-occupancy-filters</code> (page 1, 10 elementi).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={runDiagnose} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Esecuzione in corso…
              </>
            ) : (
              "Esegui test connessione"
            )}
          </Button>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {result?.env && (
            <div className="rounded-md border border-border bg-muted/30 p-3 text-xs font-mono space-y-1">
              <div>
                <span className="text-muted-foreground">baseUrl:</span> {result.env.baseUrl ?? "(missing)"}
              </div>
              <div>
                <span className="text-muted-foreground">structureId:</span> {result.env.structureIdMasked}
              </div>
              <div>
                <span className="text-muted-foreground">x-api-key:</span> {result.env.apiKeyMasked}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {result?.steps?.map((step) => (
        <StepCard key={step.label} label={step.label} result={step.result} />
      ))}

      {result?.derivedFromReservations && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Codici derivati dalle prenotazioni</CardTitle>
            <CardDescription>{result.derivedFromReservations.note}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <CodeList label="Room codes" items={result.derivedFromReservations.roomCodes} />
            <CodeList label="Channel codes" items={result.derivedFromReservations.channelCodes} />
            <CodeList label="Market codes" items={result.derivedFromReservations.marketCodes} />
          </CardContent>
        </Card>
      )}

      {result && !result.steps && result.hint && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{result.hint}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function CodeList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{label}</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">— nessuno —</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((c) => (
            <Badge key={c} variant="secondary" className="font-mono text-xs">
              {c}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

function StepCard({ label, result }: { label: string; result: StepResult }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base font-mono break-all">{label}</CardTitle>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={result.ok ? "default" : "destructive"} className="gap-1">
              {result.ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
              {result.ok ? "OK" : "ERROR"}
            </Badge>
            <span className="text-xs text-muted-foreground">{result.durationMs}ms</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {result.ok ? (
          <>
            <p className="text-sm mb-3">{result.summary}</p>
            {result.sample !== undefined && (
              <pre className="rounded-md bg-muted p-3 text-xs overflow-auto max-h-96 leading-relaxed">
                {JSON.stringify(result.sample, null, 2)}
              </pre>
            )}
          </>
        ) : (
          <div className="space-y-2 text-sm">
            <p className="font-medium text-destructive">{result.error}</p>
            {result.httpStatus !== undefined && (
              <p className="text-xs text-muted-foreground">HTTP {result.httpStatus}</p>
            )}
            {result.bodyPreview && (
              <pre className="rounded-md bg-muted p-3 text-xs overflow-auto max-h-64">{result.bodyPreview}</pre>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
