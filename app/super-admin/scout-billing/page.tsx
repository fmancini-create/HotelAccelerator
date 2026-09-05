"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Coins, Gauge, Loader2, Save, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"

type Settings = {
  activationFeeCents: number | null
  activationIncludedCredits: number
  markupMultiplier: number
  minimumPurchaseCredits: number
}

type CostRow = {
  id: string
  provider: string
  operation: string
  cost_micro_eur: number
  effective_from: string
  created_by: string | null
  created_at: string
}

type AccountRow = {
  property_id: string
  balance: number
  reserved_credits: number
  purchased_credits: number
  granted_credits: number
  consumed_credits: number
  provider_cost_micro_eur: number
  usage_retail_value_cents: number
  updated_at: string
  properties?: { name?: string; slug?: string } | Array<{ name?: string; slug?: string }> | null
}

type ProviderCredit = {
  limit: number
  consumed: number
  leftOver: number
}

type ProviderUsage = {
  available: boolean
  stats: {
    creditTypes: Record<string, ProviderCredit>
    cycleStart: string | null
    cycleEnd: string | null
  } | null
  error: string | null
}

type Payload = {
  settings: Settings
  currentCost: { costMicroEur: number; effectiveFrom: string } | null
  creditPriceCents: number | null
  unitMarginMicroEur: number | null
  history: CostRow[]
  accounts: AccountRow[]
  totals: {
    balance: number
    reserved: number
    purchased: number
    granted: number
    consumed: number
    providerCostMicroEur: number
    usageRetailValueCents: number
  }
  providerUsage: ProviderUsage
}

function euroFromCents(cents: number | null | undefined) {
  if (cents == null) return "da definire"
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(cents / 100)
}

function euroFromMicro(micro: number | null | undefined, digits = 4) {
  if (micro == null) return "da definire"
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  }).format(micro / 1_000_000)
}

function propertyName(row: AccountRow) {
  const value = Array.isArray(row.properties) ? row.properties[0] : row.properties
  return value?.name || value?.slug || row.property_id
}

const providerCreditLabels: Record<string, string> = {
  lead_credit: "Lead / enrichment",
  direct_dial_credit: "Direct dial",
  export_credit: "Export",
  conversation_credit: "Conversation",
  ai_credit: "AI",
  power_up_credit: "Power-up",
  inbound_website_visitor_credit: "Website visitor inbound",
  contact_website_visitor_credit: "Website visitor contact",
  dialer: "Dialer",
  web_search_record_credit: "Web search",
  broadcast_credit: "Broadcast",
}

export default function ScoutBillingAdminPage() {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feeEuro, setFeeEuro] = useState("")
  const [includedCredits, setIncludedCredits] = useState("0")
  const [multiplier, setMultiplier] = useState("3")
  const [minimumPurchase, setMinimumPurchase] = useState("10")
  const [providerCostEuro, setProviderCostEuro] = useState("")

  async function load() {
    setLoading(true)
    try {
      const response = await fetch("/api/super-admin/scout-billing", { cache: "no-store" })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error || "Impossibile leggere i costi Scout")
      setData(payload)
      setFeeEuro(payload.settings.activationFeeCents == null ? "" : (payload.settings.activationFeeCents / 100).toFixed(2))
      setIncludedCredits(String(payload.settings.activationIncludedCredits))
      setMultiplier(String(payload.settings.markupMultiplier))
      setMinimumPurchase(String(payload.settings.minimumPurchaseCredits))
      setProviderCostEuro(payload.currentCost ? (payload.currentCost.costMicroEur / 1_000_000).toFixed(6) : "")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Errore caricamento Scout")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const projectedUnit = useMemo(() => {
    const cost = Number(providerCostEuro.replace(",", "."))
    const mult = Number(multiplier.replace(",", "."))
    if (!Number.isFinite(cost) || cost < 0 || !Number.isFinite(mult) || mult < 1) return null
    return Math.ceil(cost * mult * 100) / 100
  }, [providerCostEuro, multiplier])

  async function saveSettings() {
    const fee = feeEuro.trim() === "" ? null : Number(feeEuro.replace(",", "."))
    const credits = Number.parseInt(includedCredits, 10)
    const mult = Number(multiplier.replace(",", "."))
    const minimum = Number.parseInt(minimumPurchase, 10)
    if ((fee !== null && (!Number.isFinite(fee) || fee < 0.5)) || !Number.isInteger(credits) || credits < 0 || !Number.isFinite(mult) || mult < 1 || !Number.isInteger(minimum) || minimum < 1) {
      toast.error("Controlla il listino Scout. La fee deve essere vuota oppure almeno € 0,50.")
      return
    }
    setSaving(true)
    try {
      const response = await fetch("/api/super-admin/scout-billing", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          activationFeeCents: fee === null ? null : Math.round(fee * 100),
          activationIncludedCredits: credits,
          markupMultiplier: mult,
          minimumPurchaseCredits: minimum,
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || "Salvataggio non riuscito")
      toast.success("Listino Scout aggiornato")
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Salvataggio non riuscito")
    } finally {
      setSaving(false)
    }
  }

  async function addProviderCost() {
    const cost = Number(providerCostEuro.replace(",", "."))
    if (!Number.isFinite(cost) || cost < 0) {
      toast.error("Inserisci un costo provider valido in euro.")
      return
    }
    setSaving(true)
    try {
      const response = await fetch("/api/super-admin/scout-billing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation: "email_enrichment", costMicroEur: Math.round(cost * 1_000_000) }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || "Costo provider non salvato")
      toast.success("Nuovo costo provider registrato nello storico")
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Costo provider non salvato")
    } finally {
      setSaving(false)
    }
  }

  const providerCredits = data?.providerUsage.stats?.creditTypes ?? {}
  const leadCredits = providerCredits.lead_credit

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-3">
            <Link href="/super-admin/module-costs"><ArrowLeft className="mr-2 h-4 w-4" /> Costi piattaforma</Link>
          </Button>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold">Economics HotelAccelerator Scout</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Costi provider, ricarico commerciale, crediti venduti e margine. Questi dati non sono visibili ai tenant.
              </p>
            </div>
            <Badge variant="outline">Add-on a consumo</Badge>
          </div>
        </div>

        {loading || !data ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Caricamento...</div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <Card><CardHeader className="pb-2"><CardDescription>Crediti residui tenant</CardDescription><CardTitle>{data.totals.balance.toLocaleString("it-IT")}</CardTitle></CardHeader></Card>
              <Card><CardHeader className="pb-2"><CardDescription>Crediti consumati</CardDescription><CardTitle>{data.totals.consumed.toLocaleString("it-IT")}</CardTitle></CardHeader></Card>
              <Card><CardHeader className="pb-2"><CardDescription>Costo provider stimato</CardDescription><CardTitle>{euroFromMicro(data.totals.providerCostMicroEur, 2)}</CardTitle></CardHeader></Card>
              <Card><CardHeader className="pb-2"><CardDescription>Valore vendita utilizzi</CardDescription><CardTitle>{euroFromCents(data.totals.usageRetailValueCents)}</CardTitle></CardHeader></Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Gauge className="h-5 w-5" /> Crediti provider in tempo reale</CardTitle>
                <CardDescription>
                  Monitoraggio del piano sottostante. Serve a intercettare variazioni di consumo o disponibilità; non viene mai mostrato ai tenant.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!data.providerUsage.available || !data.providerUsage.stats ? (
                  <p className="text-sm text-amber-700">{data.providerUsage.error || "Monitoraggio provider non disponibile."}</p>
                ) : (
                  <>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div><p className="text-xs text-muted-foreground">Lead credit disponibili</p><p className="text-2xl font-semibold">{leadCredits ? leadCredits.leftOver.toLocaleString("it-IT") : "—"}</p></div>
                      <div><p className="text-xs text-muted-foreground">Lead credit consumati</p><p className="text-2xl font-semibold">{leadCredits ? leadCredits.consumed.toLocaleString("it-IT") : "—"}</p></div>
                      <div><p className="text-xs text-muted-foreground">Ciclo provider</p><p className="text-sm font-medium">{data.providerUsage.stats.cycleStart && data.providerUsage.stats.cycleEnd ? `${new Date(data.providerUsage.stats.cycleStart).toLocaleDateString("it-IT")} → ${new Date(data.providerUsage.stats.cycleEnd).toLocaleDateString("it-IT")}` : "—"}</p></div>
                    </div>
                    <div className="overflow-x-auto rounded-md border">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-left"><tr><th className="p-3">Tipo credito</th><th className="p-3 text-right">Limite</th><th className="p-3 text-right">Consumati</th><th className="p-3 text-right">Residui</th></tr></thead>
                        <tbody>
                          {Object.entries(providerCredits).filter(([, row]) => row.limit > 0 || row.consumed > 0).map(([key, row]) => (
                            <tr key={key} className="border-t">
                              <td className="p-3 font-medium">{providerCreditLabels[key] || key}</td>
                              <td className="p-3 text-right">{row.limit.toLocaleString("it-IT")}</td>
                              <td className="p-3 text-right">{row.consumed.toLocaleString("it-IT")}</td>
                              <td className={`p-3 text-right ${row.leftOver === 0 ? "font-semibold text-red-600" : ""}`}>{row.leftOver.toLocaleString("it-IT")}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Coins className="h-5 w-5" /> Listino Scout</CardTitle>
                <CardDescription>Il tenant vede solo fee, prezzo dei crediti e saldo. Il costo provider resta interno.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-4">
                <div className="space-y-1"><Label htmlFor="fee">Attivazione una tantum (€)</Label><Input id="fee" inputMode="decimal" placeholder="da definire" value={feeEuro} onChange={(e) => setFeeEuro(e.target.value)} /><p className="text-xs text-muted-foreground">Vuota = non acquistabile; minimo € 0,50.</p></div>
                <div className="space-y-1"><Label htmlFor="included">Crediti inclusi</Label><Input id="included" type="number" min={0} value={includedCredits} onChange={(e) => setIncludedCredits(e.target.value)} /></div>
                <div className="space-y-1"><Label htmlFor="multiplier">Moltiplicatore</Label><Input id="multiplier" inputMode="decimal" min={1} value={multiplier} onChange={(e) => setMultiplier(e.target.value)} /></div>
                <div className="space-y-1"><Label htmlFor="minimum">Acquisto minimo crediti</Label><Input id="minimum" type="number" min={1} value={minimumPurchase} onChange={(e) => setMinimumPurchase(e.target.value)} /></div>
                <div className="md:col-span-4 flex justify-end"><Button onClick={() => void saveSettings()} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Salva listino</Button></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" /> Costo provider</CardTitle>
                <CardDescription>Ogni variazione crea una nuova riga con decorrenza. Il costo è la nostra stima economica per operazione e resta distinto dai contatori tecnici del piano.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-4 md:items-end">
                  <div className="space-y-1"><Label htmlFor="provider-cost">Costo stimato per enrichment (€)</Label><Input id="provider-cost" inputMode="decimal" value={providerCostEuro} onChange={(e) => setProviderCostEuro(e.target.value)} placeholder="0,000000" /></div>
                  <div><p className="text-xs text-muted-foreground">Prezzo/credito attuale</p><p className="text-lg font-semibold">{data.creditPriceCents == null ? "da definire" : euroFromCents(data.creditPriceCents)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Margine unitario stimato</p><p className="text-lg font-semibold">{euroFromMicro(data.unitMarginMicroEur)}</p></div>
                  <Button onClick={() => void addProviderCost()} disabled={saving}>Registra nuovo costo</Button>
                </div>
                {projectedUnit !== null && <p className="text-xs text-muted-foreground">Con i valori in modifica, il prezzo arrotondato al centesimo sarebbe circa {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(projectedUnit)} per credito.</p>}
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left"><tr><th className="p-3">Decorrenza</th><th className="p-3">Costo</th><th className="p-3">Inserito da</th></tr></thead>
                    <tbody>{data.history.map((row) => <tr key={row.id} className="border-t"><td className="p-3">{new Date(row.effective_from).toLocaleString("it-IT")}</td><td className="p-3">{euroFromMicro(Number(row.cost_micro_eur))}</td><td className="p-3 text-muted-foreground">{row.created_by || "—"}</td></tr>)}</tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Saldo crediti per tenant</CardTitle><CardDescription>Controllo operativo dei crediti acquistati, concessi e consumati.</CardDescription></CardHeader>
              <CardContent>
                {data.accounts.length === 0 ? <p className="text-sm text-muted-foreground">Nessun account crediti Scout ancora creato.</p> : (
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm"><thead className="bg-muted/50 text-left"><tr><th className="p-3">Tenant</th><th className="p-3 text-right">Saldo</th><th className="p-3 text-right">Riservati</th><th className="p-3 text-right">Acquistati</th><th className="p-3 text-right">Inclusi/omaggi</th><th className="p-3 text-right">Consumati</th></tr></thead><tbody>
                      {data.accounts.map((row) => <tr key={row.property_id} className="border-t"><td className="p-3 font-medium">{propertyName(row)}</td><td className="p-3 text-right">{Number(row.balance).toLocaleString("it-IT")}</td><td className="p-3 text-right">{Number(row.reserved_credits).toLocaleString("it-IT")}</td><td className="p-3 text-right">{Number(row.purchased_credits).toLocaleString("it-IT")}</td><td className="p-3 text-right">{Number(row.granted_credits).toLocaleString("it-IT")}</td><td className="p-3 text-right">{Number(row.consumed_credits).toLocaleString("it-IT")}</td></tr>)}
                    </tbody></table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
