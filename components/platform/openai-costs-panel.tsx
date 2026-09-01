"use client"

import useSWR from "swr"
import { AlertTriangle, DollarSign, Loader2, RefreshCw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface OpenAICostSummary {
  currency: string
  total: number
  today: number
  monthToDate: number
  last30Days: number
  periodDays: number
  fetchedAt: string
  scope: {
    kind: "organization" | "project" | "api_key"
    label: string
    isVoiceExact: boolean
  }
  daily: Array<{
    date: string
    startTime: number
    endTime: number
    amount: number
  }>
  lineItems: Array<{
    name: string
    amount: number
  }>
}

async function fetcher(url: string): Promise<OpenAICostSummary> {
  const response = await fetch(url, { cache: "no-store" })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.error || `Lettura costi OpenAI non riuscita (HTTP ${response.status})`)
  }
  return payload
}

function formatAmount(value: number, currency: string) {
  const normalizedCurrency = currency?.toUpperCase() || "USD"
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: normalizedCurrency,
    minimumFractionDigits: Math.abs(value) < 1 ? 4 : 2,
    maximumFractionDigits: Math.abs(value) < 1 ? 4 : 2,
  }).format(value)
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  })
}

export function OpenAICostsPanel() {
  const { data, error, isLoading, isValidating, mutate } = useSWR<OpenAICostSummary>(
    "/api/super-admin/ai-costs?days=90",
    fetcher,
    { revalidateOnFocus: false },
  )

  return (
    <section aria-labelledby="openai-costs-title" className="mb-8">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 id="openai-costs-title" className="text-lg font-semibold text-neutral-900">
            Costi variabili AI
          </h2>
          <p className="mt-1 text-sm text-neutral-600">
            Spesa reale letta direttamente dall&apos;API amministrativa del provider. Nessuna stima viene salvata come costo reale.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => mutate()} disabled={isLoading || isValidating}>
          {isValidating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Aggiorna
        </Button>
      </div>

      {isLoading && (
        <Card>
          <CardContent className="p-5 flex items-center gap-2 text-sm text-neutral-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            Leggo i costi OpenAI...
          </CardContent>
        </Card>
      )}

      {error && !data && (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardContent className="p-5 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-950">Costi OpenAI non disponibili</p>
              <p className="mt-1 text-sm text-amber-900">{error instanceof Error ? error.message : "Errore sconosciuto"}</p>
              <p className="mt-2 text-xs text-amber-800">
                Serve una chiave amministrativa OpenAI salvata lato server come OPENAI_ADMIN_KEY. Non usare qui la chiave Realtime del centralino.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Badge variant={data.scope.isVoiceExact ? "default" : "outline"}>{data.scope.label}</Badge>
            <span className="text-xs text-neutral-500">
              Ultima lettura {new Date(data.fetchedAt).toLocaleString("it-IT")}
            </span>
          </div>

          {!data.scope.isVoiceExact && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Il totale comprende tutta l&apos;organizzazione OpenAI. Per rendere il costo della telefonia esatto e separato dagli altri usi,
              configura un progetto o una API key dedicata al Voice Agent e il relativo ID server-side.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Oggi</CardDescription>
                <CardTitle className="text-2xl flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-neutral-400" aria-hidden />
                  {formatAmount(data.today, data.currency)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Mese corrente</CardDescription>
                <CardTitle className="text-2xl">{formatAmount(data.monthToDate, data.currency)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Ultimi 30 giorni</CardDescription>
                <CardTitle className="text-2xl">{formatAmount(data.last30Days, data.currency)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Periodo caricato ({data.periodDays} giorni)</CardDescription>
                <CardTitle className="text-2xl">{formatAmount(data.total, data.currency)}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ultimi giorni</CardTitle>
                <CardDescription>Costo giornaliero restituito da OpenAI.</CardDescription>
              </CardHeader>
              <CardContent>
                {data.daily.length === 0 ? (
                  <p className="text-sm text-neutral-500">Nessun costo nel periodo.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-neutral-500">
                          <th className="py-2 pr-4 font-medium">Giorno</th>
                          <th className="py-2 text-right font-medium">Costo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.daily.slice(-14).reverse().map((item) => (
                          <tr key={item.startTime} className="border-b last:border-0">
                            <td className="py-2 pr-4">{formatDate(item.date)}</td>
                            <td className="py-2 text-right tabular-nums">{formatAmount(item.amount, data.currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Voci di costo</CardTitle>
                <CardDescription>Ripartizione ufficiale restituita dal provider nel periodo caricato.</CardDescription>
              </CardHeader>
              <CardContent>
                {data.lineItems.length === 0 ? (
                  <p className="text-sm text-neutral-500">Nessuna voce di costo nel periodo.</p>
                ) : (
                  <div className="space-y-2">
                    {data.lineItems.slice(0, 12).map((item) => (
                      <div key={item.name} className="flex items-start justify-between gap-4 text-sm">
                        <span className="text-neutral-600 break-words">{item.name}</span>
                        <span className="font-medium tabular-nums shrink-0">{formatAmount(item.amount, data.currency)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </section>
  )
}
