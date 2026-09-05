"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { AlertTriangle, Calculator, Coins, Loader2, RefreshCw, Save, TrendingUp } from "lucide-react"
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
    providerPlanLabel: string | null
    providerCycleCostCents: number | null
    leadCreditUnitCostMicrosOverride: number | null
    markupMultiplier: number
    lowBalanceThresholdPct: number
    pricingSource: string
    priceVerifiedAt: string | null
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
    customerValueMicros: number | null
    marginMicros: number | null
    remainingProviderValueMicros: number | null
    trackedProviderCostMicros: number
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
    customerValueMicros: number
    marginMicros: number
  }>
  warnings: Warning[]
  snapshots: Array<{
    cycle_start: string | null
    cycle_end: string | null
    lead_credit_limit: number
    lead_credit_consumed: number
    lead_credit_remaining: number
    fetched_at: string
    source: string
  }>
}

type Draft = {
  providerPlanLabel: string
  providerCycleCost: string
  leadCreditUnitCostOverride: string
  markupMultiplier: string
  lowBalanceThresholdPct: string
}

async function fetcher(url: string): Promise<ScoutCostData> {
  const response = await fetch(url, { cache: "no-store" })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.error || `Lettura costi Scout non riuscita (HTTP ${response.status})`)
  return payload
}

function euro(value: number | null | undefined, currency = "EUR") {
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
    const multiplier = Number(draft.markupMultiplier.replace(",", "."))
    const threshold = Number(draft.lowBalanceThresholdPct.replace(",", "."))
    if (providerCycleCostCents === "invalid" || leadCreditUnitCostMicrosOverride === "invalid") {
      toast.error("Controlla gli importi: devono essere numeri non negativi.")
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
          markupMultiplier: multiplier,
          lowBalanceThresholdPct: threshold,
          pricingSource: leadCreditUnitCostMicrosOverride !== null ? "manual_override" : "manual_invoice",
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error || "Salvataggio non riuscito")
      toast.success("Costo Apollo e regole Scout aggiornati")
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
            HotelAccelerator Scout · costi provider
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-neutral-600">
            I crediti e il ciclo vengono letti live da Apollo. Il costo monetario del piano viene invece verificato da fattura/contratto,
            perché Apollo non lo restituisce nell&apos;API dei consumi. Il prezzo Scout viene calcolato automaticamente dal costo reale e dal moltiplicatore.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => mutate()} disabled={isLoading || isValidating}>
          {isValidating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Aggiorna Apollo
        </Button>
      </div>

      {isLoading && (
        <Card><CardContent className="flex items-center gap-2 p-5 text-sm text-neutral-600"><Loader2 className="h-4 w-4 animate-spin" />Leggo crediti e costi Scout...</CardContent></Card>
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
            <span>Ultima lettura {formatDate(data.live.fetchedAt)}</span>
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

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card><CardHeader className="pb-2"><CardDescription>Lead credits Apollo</CardDescription><CardTitle className="text-2xl">{decimals(data.live.lead.remaining)} / {decimals(data.live.lead.limit)}</CardTitle></CardHeader><CardContent><p className="text-xs text-neutral-500">Usati {decimals(data.live.lead.consumed)} · residuo {remainingPct.toFixed(1)}%</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardDescription>Costo reale / credito</CardDescription><CardTitle className="text-2xl">{euro(microsToMoney(data.economics.unitCostMicros), data.settings.currency)}</CardTitle></CardHeader><CardContent><p className="text-xs text-neutral-500">Da costo ciclo ÷ plafond, salvo override</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardDescription>Prezzo Scout / credito</CardDescription><CardTitle className="text-2xl">{euro(microsToMoney(data.economics.customerUnitPriceMicros), data.settings.currency)}</CardTitle></CardHeader><CardContent><p className="text-xs text-neutral-500">Moltiplicatore ×{data.settings.markupMultiplier}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardDescription>Uso attribuito ad HotelAccelerator</CardDescription><CardTitle className="text-2xl">{data.reconciliation.attributionPct.toFixed(1)}%</CardTitle></CardHeader><CardContent><p className="text-xs text-neutral-500">{decimals(data.reconciliation.trackedCredits)} su {decimals(data.reconciliation.providerConsumedCredits)} crediti provider</p></CardContent></Card>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card><CardHeader className="pb-2"><CardDescription>Costo provider stimato · ciclo</CardDescription><CardTitle className="flex items-center gap-2 text-xl"><Coins className="h-5 w-5 text-neutral-400" />{euro(microsToMoney(data.economics.providerCostMicros), data.settings.currency)}</CardTitle></CardHeader></Card>
            <Card><CardHeader className="pb-2"><CardDescription>Valore Scout · ciclo</CardDescription><CardTitle className="flex items-center gap-2 text-xl"><TrendingUp className="h-5 w-5 text-neutral-400" />{euro(microsToMoney(data.economics.customerValueMicros), data.settings.currency)}</CardTitle></CardHeader></Card>
            <Card><CardHeader className="pb-2"><CardDescription>Margine teorico · ciclo</CardDescription><CardTitle className="flex items-center gap-2 text-xl"><Calculator className="h-5 w-5 text-neutral-400" />{euro(microsToMoney(data.economics.marginMicros), data.settings.currency)}</CardTitle></CardHeader></Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Regole economiche Scout</CardTitle>
              <CardDescription>
                Inserisci il costo reale del ciclo Apollo. Se lasci vuoto l&apos;override per credito, HotelAccelerator divide automaticamente il costo per il plafond lead live. Ogni variazione viene storicizzata.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {draft && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <div className="space-y-1.5"><Label htmlFor="scout-plan">Piano / riferimento</Label><Input id="scout-plan" value={draft.providerPlanLabel} onChange={(e) => setDraft({ ...draft, providerPlanLabel: e.target.value })} placeholder="Es. Apollo annuale" /></div>
                <div className="space-y-1.5"><Label htmlFor="scout-cycle-cost">Costo ciclo Apollo</Label><div className="flex items-center gap-2"><Input id="scout-cycle-cost" inputMode="decimal" value={draft.providerCycleCost} onChange={(e) => setDraft({ ...draft, providerCycleCost: e.target.value })} placeholder="es. 99,00" /><span className="text-sm text-neutral-500">{data.settings.currency}</span></div></div>
                <div className="space-y-1.5"><Label htmlFor="scout-unit-override">Costo/credito override</Label><div className="flex items-center gap-2"><Input id="scout-unit-override" inputMode="decimal" value={draft.leadCreditUnitCostOverride} onChange={(e) => setDraft({ ...draft, leadCreditUnitCostOverride: e.target.value })} placeholder="vuoto = automatico" /><span className="text-sm text-neutral-500">{data.settings.currency}</span></div></div>
                <div className="space-y-1.5"><Label htmlFor="scout-markup">Moltiplicatore vendita</Label><Input id="scout-markup" inputMode="decimal" value={draft.markupMultiplier} onChange={(e) => setDraft({ ...draft, markupMultiplier: e.target.value })} /></div>
                <div className="space-y-1.5"><Label htmlFor="scout-threshold">Alert crediti residui %</Label><Input id="scout-threshold" inputMode="decimal" value={draft.lowBalanceThresholdPct} onChange={(e) => setDraft({ ...draft, lowBalanceThresholdPct: e.target.value })} /></div>
                <div className="md:col-span-2 xl:col-span-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                  <p className="text-xs text-neutral-500">Ultima verifica prezzo: {formatDate(data.settings.priceVerifiedAt)}</p>
                  <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Salva regole Scout</Button>
                </div>
              </div>}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Riconciliazione HotelAccelerator ↔ Apollo</CardTitle><CardDescription>Serve a intercettare consumo Apollo esterno a Scout, retry anomali o vecchi eventi non metered.</CardDescription></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between gap-4"><span className="text-neutral-600">Consumo Apollo nel ciclo</span><strong>{decimals(data.reconciliation.providerConsumedCredits)}</strong></div>
                <div className="flex justify-between gap-4"><span className="text-neutral-600">Attribuito a Scout</span><strong>{decimals(data.reconciliation.trackedCredits)}</strong></div>
                <div className="flex justify-between gap-4"><span className="text-neutral-600">Non attribuito</span><strong>{decimals(data.reconciliation.unattributedCredits)}</strong></div>
                <div className="flex justify-between gap-4"><span className="text-neutral-600">Valore crediti ancora disponibili</span><strong>{euro(microsToMoney(data.economics.remainingProviderValueMicros), data.settings.currency)}</strong></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Tutti i contatori Apollo</CardTitle><CardDescription>Monitoraggio del piano provider; Scout oggi usa il bucket lead/enrichment.</CardDescription></CardHeader>
              <CardContent>
                {buckets.length === 0 ? <p className="text-sm text-neutral-500">Nessun contatore disponibile.</p> : <div className="space-y-2 text-sm">
                  {buckets.map(([key, item]) => <div key={key} className="grid grid-cols-[1fr_auto_auto] gap-4 border-b py-2 last:border-0"><span className="text-neutral-600">{bucketLabels[key] || key}</span><span className="tabular-nums">{decimals(item.consumed)} usati</span><span className="min-w-20 text-right font-medium tabular-nums">{decimals(item.leftOver)} rimasti</span></div>)}
                </div>}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Costo e margine per tenant · ciclo Apollo</CardTitle><CardDescription>Attribuzione dai singoli eventi fatturabili Scout; gli importi storici restano congelati al prezzo valido nel momento dell&apos;uso.</CardDescription></CardHeader>
            <CardContent>
              {data.tenants.length === 0 ? <p className="text-sm text-neutral-500">Nessun consumo Scout attribuito nel ciclo corrente.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-neutral-500"><th className="py-2 pr-4 font-medium">Tenant</th><th className="py-2 px-3 text-right font-medium">Crediti</th><th className="py-2 px-3 text-right font-medium">Costo</th><th className="py-2 px-3 text-right font-medium">Valore</th><th className="py-2 pl-3 text-right font-medium">Margine</th></tr></thead><tbody>{data.tenants.map((tenant) => <tr key={tenant.propertyId} className="border-b last:border-0"><td className="py-2 pr-4 font-medium">{tenant.propertyName}</td><td className="py-2 px-3 text-right tabular-nums">{decimals(tenant.credits)}</td><td className="py-2 px-3 text-right tabular-nums">{euro(microsToMoney(tenant.providerCostMicros), data.settings.currency)}</td><td className="py-2 px-3 text-right tabular-nums">{euro(microsToMoney(tenant.customerValueMicros), data.settings.currency)}</td><td className="py-2 pl-3 text-right font-medium tabular-nums">{euro(microsToMoney(tenant.marginMicros), data.settings.currency)}</td></tr>)}</tbody></table></div>}
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  )
}
