"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { AlertTriangle, ArrowRight, Calculator, Coins, Loader2, RefreshCw, Save, TrendingUp } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

type CreditBucket = { limit: number; consumed: number; leftOver: number }
type Warning = { code: string; message: string; severity: "info" | "warning" | "critical" }
type ScoutCostData = {
  settings: {
    currency: string
    commercialCurrency: string
    providerPlanLabel: string | null
    providerCycleCostCents: number | null
    leadCreditUnitCostMicrosOverride: number | null
    markupMultiplier: number
    lowBalanceThresholdPct: number
    pricingSource: string
    priceVerifiedAt: string | null
    fxSource: string
    fxRateOverride: number | null
  }
  fx: {
    available: boolean
    source: string | null
    fromCurrency: string
    toCurrency: string
    rate: number | null
    referenceDate: string | null
    fetchedAt: string | null
  }
  live: {
    available: boolean
    fetchedAt: string | null
    cycle: { start: string | null; end: string | null }
    lead: { limit: number; consumed: number; remaining: number }
    directDial: { limit: number; consumed: number; remaining: number }
    creditBuckets: Record<string, CreditBucket>
  }
  economics: {
    unitCostMicros: number | null
    customerUnitPriceMicros: number | null
    providerCostMicros: number | null
    providerCostCustomerMicros: number | null
    customerValueMicros: number | null
    marginMicros: number | null
    remainingProviderValueMicros: number | null
    remainingProviderValueCustomerMicros: number | null
    trackedProviderCostMicros: number
    trackedProviderCostCustomerMicros: number
    trackedCustomerValueMicros: number
    trackedMarginMicros: number
  }
  reconciliation: {
    providerConsumedCredits: number
    trackedCredits: number
    unattributedCredits: number
    attributionPct: number
  }
  tenants: Array<{
    propertyId: string
    propertyName: string
    credits: number
    providerCostMicros: number
    providerCostCustomerMicros: number
    customerValueMicros: number
    marginMicros: number
  }>
  warnings: Warning[]
  fxSnapshots: Array<{
    source: string
    from_currency: string
    to_currency: string
    rate: number
    reference_date: string
    fetched_at: string
  }>
}

type Draft = {
  providerPlanLabel: string
  providerCycleCost: string
  leadCreditUnitCostOverride: string
  commercialCurrency: string
  fxRateOverride: string
  markupMultiplier: string
  lowBalanceThresholdPct: string
}

async function fetcher(url: string): Promise<ScoutCostData> {
  const response = await fetch(url, { cache: "no-store" })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.error || `Lettura costi Scout non riuscita (HTTP ${response.status})`)
  return payload
}

function money(value: number | null | undefined, currency = "EUR") {
  if (value === null || value === undefined || !Number.isFinite(value)) return "da definire"
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: Math.abs(value) < 1 ? 4 : 2,
    maximumFractionDigits: Math.abs(value) < 1 ? 6 : 2,
  }).format(value)
}

function microsToMoney(value: number | null | undefined) {
  return value === null || value === undefined ? null : value / 1_000_000
}

function decimals(value: number) {
  return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 4 }).format(value)
}

function inputMoney(value: number | null | undefined, divisor: number) {
  if (value === null || value === undefined) return ""
  return (value / divisor).toFixed(divisor === 100 ? 2 : 6).replace(".", ",")
}

function parseMoney(value: string, multiplier: number): number | null | "invalid" {
  const clean = value.trim().replace(",", ".")
  if (!clean) return null
  const parsed = Number(clean)
  if (!Number.isFinite(parsed) || parsed < 0) return "invalid"
  return Math.round(parsed * multiplier)
}

function parseOptionalPositive(value: string): number | null | "invalid" {
  const clean = value.trim().replace(",", ".")
  if (!clean) return null
  const parsed = Number(clean)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : "invalid"
}

function formatDate(value: string | null) {
  if (!value) return "n/d"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "n/d" : date.toLocaleString("it-IT")
}

const bucketLabels: Record<string, string> = {
  lead_credit: "Lead / enrichment",
  direct_dial_credit: "Direct Dial",
  export_credit: "Export",
  conversation_credit: "Conversation",
  ai_credit: "AI",
  power_up_credit: "Power-up",
  inbound_website_visitor_credit: "Website visitor",
  dialer: "Dialer",
  web_search_record_credit: "Web search",
  contact_website_visitor_credit: "Contact visitor",
  broadcast_credit: "Broadcast",
}

export function ScoutCostsPanel() {
  const { data, error, isLoading, isValidating, mutate } = useSWR<ScoutCostData>(
    "/api/super-admin/scout-costs",
    fetcher,
    { revalidateOnFocus: false },
  )
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!data || draft) return
    setDraft({
      providerPlanLabel: data.settings.providerPlanLabel || "",
      providerCycleCost: inputMoney(data.settings.providerCycleCostCents, 100),
      leadCreditUnitCostOverride: inputMoney(data.settings.leadCreditUnitCostMicrosOverride, 1_000_000),
      commercialCurrency: data.settings.commercialCurrency || "EUR",
      fxRateOverride: data.settings.fxRateOverride ? String(data.settings.fxRateOverride).replace(".", ",") : "",
      markupMultiplier: String(data.settings.markupMultiplier).replace(".", ","),
      lowBalanceThresholdPct: String(data.settings.lowBalanceThresholdPct).replace(".", ","),
    })
  }, [data, draft])

  const remainingPct = data?.live.lead.limit
    ? (data.live.lead.remaining / data.live.lead.limit) * 100
    : 0

  const buckets = useMemo(() => {
    return Object.entries(data?.live.creditBuckets || {})
      .filter(([, item]) => Number(item?.limit || 0) > 0 || Number(item?.consumed || 0) > 0)
      .sort((a, b) => Number(b[1].consumed || 0) - Number(a[1].consumed || 0))
  }, [data])

  async function save() {
    if (!draft) return
    const providerCycleCostCents = parseMoney(draft.providerCycleCost, 100)
    const leadCreditUnitCostMicrosOverride = parseMoney(draft.leadCreditUnitCostOverride, 1_000_000)
    const fxRateOverride = parseOptionalPositive(draft.fxRateOverride)
    const multiplier = Number(draft.markupMultiplier.replace(",", "."))
    const threshold = Number(draft.lowBalanceThresholdPct.replace(",", "."))
    const commercialCurrency = draft.commercialCurrency.trim().toUpperCase()

    if (providerCycleCostCents === "invalid" || leadCreditUnitCostMicrosOverride === "invalid" || fxRateOverride === "invalid") {
      toast.error("Controlla costo e cambio: devono essere numeri positivi o campi vuoti.")
      return
    }
    if (!/^[A-Z]{3}$/.test(commercialCurrency)) {
      toast.error("La valuta commerciale deve essere un codice ISO di 3 lettere, per esempio EUR.")
      return
    }
    if (!Number.isFinite(multiplier) || multiplier < 1 || multiplier > 100) {
      toast.error("Il moltiplicatore deve essere compreso tra 1 e 100.")
      return
    }
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
      toast.error("La soglia crediti deve essere compresa tra 0 e 100%.")
      return
    }

    setSaving(true)
    try {
      const response = await fetch("/api/super-admin/scout-costs", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          providerPlanLabel: draft.providerPlanLabel.trim() || null,
          providerCycleCostCents,
          leadCreditUnitCostMicrosOverride,
          commercialCurrency,
          fxRateOverride,
          markupMultiplier: multiplier,
          lowBalanceThresholdPct: threshold,
          pricingSource: leadCreditUnitCostMicrosOverride !== null ? "manual_override" : "contract",
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error || "Salvataggio non riuscito")
      toast.success("Costo provider, cambio e prezzo Scout aggiornati")
      setDraft(null)
      await mutate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Salvataggio non riuscito")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-labelledby="scout-costs-title" className="mb-8">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="scout-costs-title" className="text-lg font-semibold text-neutral-900">
            HotelAccelerator Scout · costi provider e cambio
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-neutral-600">
            Il costo Apollo resta nella valuta del contratto. HotelAccelerator lo converte nella valuta commerciale con il cambio BCE
            e solo dopo applica il moltiplicatore Scout. In questo modo costo, prezzo e margine non confondono USD ed EUR.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => mutate()} disabled={isLoading || isValidating}>
          {isValidating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Aggiorna Apollo + cambio
        </Button>
      </div>

      {isLoading && (
        <Card><CardContent className="flex items-center gap-2 p-5 text-sm text-neutral-600"><Loader2 className="h-4 w-4 animate-spin" />Leggo crediti, costo e cambio...</CardContent></Card>
      )}

      {error && !data && (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardContent className="flex items-start gap-3 p-5">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <div><p className="font-medium text-amber-950">Controllo Scout non disponibile</p><p className="mt-1 text-sm text-amber-900">{error instanceof Error ? error.message : "Errore sconosciuto"}</p></div>
          </CardContent>
        </Card>
      )}

      {data && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
            <Badge variant={data.live.available ? "default" : "outline"}>{data.live.available ? "Apollo live" : "Ultimo snapshot"}</Badge>
            <Badge variant={data.fx.available ? "default" : "outline"}>{data.fx.available ? `FX ${data.fx.source === "manual_override" ? "manuale" : "BCE"}` : "FX non disponibile"}</Badge>
            <span>Apollo {formatDate(data.live.fetchedAt)}</span>
            <span>· cambio {data.fx.referenceDate || "n/d"}</span>
            <span>· ciclo {data.live.cycle.start ? new Date(data.live.cycle.start).toLocaleDateString("it-IT") : "n/d"} → {data.live.cycle.end ? new Date(data.live.cycle.end).toLocaleDateString("it-IT") : "n/d"}</span>
          </div>

          {data.warnings.length > 0 && (
            <div className="space-y-2">
              {data.warnings.map((item) => (
                <div key={item.code} className={`rounded-lg border px-4 py-3 text-sm ${item.severity === "critical" ? "border-red-200 bg-red-50 text-red-900" : item.severity === "warning" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-neutral-200 bg-white text-neutral-700"}`}>
                  {item.message}
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Card><CardHeader className="pb-2"><CardDescription>Lead credits Apollo</CardDescription><CardTitle className="text-2xl">{decimals(data.live.lead.remaining)} / {decimals(data.live.lead.limit)}</CardTitle></CardHeader><CardContent><p className="text-xs text-neutral-500">Usati {decimals(data.live.lead.consumed)} · residuo {remainingPct.toFixed(1)}%</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardDescription>Costo provider / credito</CardDescription><CardTitle className="text-2xl">{money(microsToMoney(data.economics.unitCostMicros), data.settings.currency)}</CardTitle></CardHeader><CardContent><p className="text-xs text-neutral-500">Costo ciclo ÷ plafond</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardDescription>Cambio {data.settings.currency} → {data.settings.commercialCurrency}</CardDescription><CardTitle className="text-2xl">{data.fx.rate ? data.fx.rate.toFixed(6) : "n/d"}</CardTitle></CardHeader><CardContent><p className="text-xs text-neutral-500">1 {data.settings.currency} = {data.fx.rate ? data.fx.rate.toFixed(6) : "—"} {data.settings.commercialCurrency}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardDescription>Prezzo Scout / credito</CardDescription><CardTitle className="text-2xl">{money(microsToMoney(data.economics.customerUnitPriceMicros), data.settings.commercialCurrency)}</CardTitle></CardHeader><CardContent><p className="text-xs text-neutral-500">Cambio applicato prima di ×{data.settings.markupMultiplier}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardDescription>Uso attribuito ad HA</CardDescription><CardTitle className="text-2xl">{data.reconciliation.attributionPct.toFixed(1)}%</CardTitle></CardHeader><CardContent><p className="text-xs text-neutral-500">{decimals(data.reconciliation.trackedCredits)} / {decimals(data.reconciliation.providerConsumedCredits)} crediti</p></CardContent></Card>
          </div>

          <Card className="border-neutral-200 bg-neutral-50/70">
            <CardContent className="flex flex-wrap items-center gap-2 p-4 text-sm text-neutral-700">
              <span className="font-medium">Formula:</span>
              <span>costo {data.settings.currency}</span><ArrowRight className="h-4 w-4" />
              <span>cambio {data.fx.rate ? data.fx.rate.toFixed(6) : "n/d"}</span><ArrowRight className="h-4 w-4" />
              <span>costo in {data.settings.commercialCurrency}</span><ArrowRight className="h-4 w-4" />
              <span>× {data.settings.markupMultiplier}</span><ArrowRight className="h-4 w-4" />
              <strong>prezzo Scout in {data.settings.commercialCurrency}</strong>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card><CardHeader className="pb-2"><CardDescription>Costo provider · ciclo</CardDescription><CardTitle className="flex items-center gap-2 text-xl"><Coins className="h-5 w-5 text-neutral-400" />{money(microsToMoney(data.economics.providerCostMicros), data.settings.currency)}</CardTitle></CardHeader><CardContent><p className="text-xs text-neutral-500">Valuta fattura Apollo</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardDescription>Costo convertito · ciclo</CardDescription><CardTitle className="text-xl">{money(microsToMoney(data.economics.providerCostCustomerMicros), data.settings.commercialCurrency)}</CardTitle></CardHeader><CardContent><p className="text-xs text-neutral-500">Costo confrontabile col prezzo cliente</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardDescription>Valore Scout · ciclo</CardDescription><CardTitle className="flex items-center gap-2 text-xl"><TrendingUp className="h-5 w-5 text-neutral-400" />{money(microsToMoney(data.economics.customerValueMicros), data.settings.commercialCurrency)}</CardTitle></CardHeader></Card>
            <Card><CardHeader className="pb-2"><CardDescription>Margine teorico · ciclo</CardDescription><CardTitle className="flex items-center gap-2 text-xl"><Calculator className="h-5 w-5 text-neutral-400" />{money(microsToMoney(data.economics.marginMicros), data.settings.commercialCurrency)}</CardTitle></CardHeader></Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Regole economiche Scout</CardTitle>
              <CardDescription>
                Il provider viene pagato in {data.settings.currency}; i tenant vengono valorizzati in {data.settings.commercialCurrency}. Lascia vuoto il cambio manuale per usare automaticamente il riferimento BCE.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {draft && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-1.5"><Label htmlFor="scout-plan">Piano / riferimento</Label><Input id="scout-plan" value={draft.providerPlanLabel} onChange={(e) => setDraft({ ...draft, providerPlanLabel: e.target.value })} placeholder="Piano mensile Apollo" /></div>
                <div className="space-y-1.5"><Label htmlFor="scout-cycle-cost">Costo ciclo provider</Label><div className="flex items-center gap-2"><Input id="scout-cycle-cost" inputMode="decimal" value={draft.providerCycleCost} onChange={(e) => setDraft({ ...draft, providerCycleCost: e.target.value })} /><span className="text-sm text-neutral-500">{data.settings.currency}</span></div></div>
                <div className="space-y-1.5"><Label htmlFor="scout-commercial-currency">Valuta commerciale</Label><Input id="scout-commercial-currency" maxLength={3} value={draft.commercialCurrency} onChange={(e) => setDraft({ ...draft, commercialCurrency: e.target.value.toUpperCase() })} /></div>
                <div className="space-y-1.5"><Label htmlFor="scout-fx-override">Cambio manuale opzionale</Label><Input id="scout-fx-override" inputMode="decimal" value={draft.fxRateOverride} onChange={(e) => setDraft({ ...draft, fxRateOverride: e.target.value })} placeholder="vuoto = BCE" /><p className="text-xs text-neutral-500">{data.settings.commercialCurrency} per 1 {data.settings.currency}</p></div>
                <div className="space-y-1.5"><Label htmlFor="scout-unit-cost">Costo/credito override</Label><Input id="scout-unit-cost" inputMode="decimal" value={draft.leadCreditUnitCostOverride} onChange={(e) => setDraft({ ...draft, leadCreditUnitCostOverride: e.target.value })} placeholder="vuoto = calcolo automatico" /></div>
                <div className="space-y-1.5"><Label htmlFor="scout-multiplier">Moltiplicatore prezzo</Label><Input id="scout-multiplier" inputMode="decimal" value={draft.markupMultiplier} onChange={(e) => setDraft({ ...draft, markupMultiplier: e.target.value })} /></div>
                <div className="space-y-1.5"><Label htmlFor="scout-threshold">Allarme credito residuo %</Label><Input id="scout-threshold" inputMode="decimal" value={draft.lowBalanceThresholdPct} onChange={(e) => setDraft({ ...draft, lowBalanceThresholdPct: e.target.value })} /></div>
                <div className="flex items-end"><Button onClick={save} disabled={saving} className="w-full">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}{saving ? "Salvataggio" : "Salva regole"}</Button></div>
              </div>}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Riconciliazione HotelAccelerator ↔ Apollo</CardTitle><CardDescription>Controlla che i crediti consumati dal provider siano attribuiti a eventi Scout.</CardDescription></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between gap-4"><span>Consumati provider</span><strong>{decimals(data.reconciliation.providerConsumedCredits)}</strong></div>
                <div className="flex justify-between gap-4"><span>Attribuiti a HotelAccelerator</span><strong>{decimals(data.reconciliation.trackedCredits)}</strong></div>
                <div className="flex justify-between gap-4"><span>Non attribuiti</span><strong>{decimals(data.reconciliation.unattributedCredits)}</strong></div>
                <div className="flex justify-between gap-4 border-t pt-2"><span>Copertura</span><strong>{data.reconciliation.attributionPct.toFixed(1)}%</strong></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Bucket provider</CardTitle><CardDescription>Plafond e consumo del piano collegato.</CardDescription></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {buckets.length === 0 && <p className="text-neutral-500">Nessun bucket disponibile.</p>}
                {buckets.slice(0, 8).map(([key, bucket]) => (
                  <div key={key} className="flex items-center justify-between gap-4">
                    <span>{bucketLabels[key] || key}</span>
                    <span className="text-neutral-600">{decimals(bucket.consumed)} / {decimals(bucket.limit)} · residui {decimals(bucket.leftOver)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Costo e margine per tenant</CardTitle><CardDescription>Il costo provider è mostrato sia nella valuta originale sia convertito; valore e margine sono sempre nella valuta commerciale.</CardDescription></CardHeader>
            <CardContent>
              {data.tenants.length === 0 ? <p className="text-sm text-neutral-500">Nessun consumo Scout attribuito nel ciclo corrente.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead><tr className="border-b text-left text-neutral-500"><th className="py-2 pr-3 font-medium">Tenant</th><th className="py-2 pr-3 font-medium">Crediti</th><th className="py-2 pr-3 font-medium">Costo provider</th><th className="py-2 pr-3 font-medium">Costo convertito</th><th className="py-2 pr-3 font-medium">Valore Scout</th><th className="py-2 font-medium">Margine</th></tr></thead>
                    <tbody>{data.tenants.map((tenant) => <tr key={tenant.propertyId} className="border-b last:border-0"><td className="py-2 pr-3 font-medium">{tenant.propertyName}</td><td className="py-2 pr-3">{decimals(tenant.credits)}</td><td className="py-2 pr-3">{money(microsToMoney(tenant.providerCostMicros), data.settings.currency)}</td><td className="py-2 pr-3">{money(microsToMoney(tenant.providerCostCustomerMicros), data.settings.commercialCurrency)}</td><td className="py-2 pr-3">{money(microsToMoney(tenant.customerValueMicros), data.settings.commercialCurrency)}</td><td className="py-2 font-medium">{money(microsToMoney(tenant.marginMicros), data.settings.commercialCurrency)}</td></tr>)}</tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Storico cambio Scout</CardTitle><CardDescription>Ultimi riferimenti usati per convertire {data.settings.currency} in {data.settings.commercialCurrency}.</CardDescription></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {data.fxSnapshots.length === 0 ? <p className="text-neutral-500">Il primo snapshot verrà creato al prossimo aggiornamento.</p> : data.fxSnapshots.slice(0, 8).map((snapshot, index) => (
                <div key={`${snapshot.source}-${snapshot.reference_date}-${index}`} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 last:border-0">
                  <span>{snapshot.reference_date} · {snapshot.source === "manual_override" ? "manuale" : "BCE"}</span>
                  <strong>1 {snapshot.from_currency} = {Number(snapshot.rate).toFixed(6)} {snapshot.to_currency}</strong>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  )
}
