"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { Coins, CreditCard, Loader2, Search, ShieldCheck, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"

export type ScoutBillingCardState = {
  active: boolean
  balance: number
  reservedCredits: number
  availableCredits: number
  activationFeeCents: number | null
  activationIncludedCredits: number
  minimumPurchaseCredits: number
  creditPriceCents: number | null
  pricingConfigured: boolean
}

type AutoRechargeState = {
  enabled: boolean
  status: "disabled" | "ready" | "action_required" | "error"
  thresholdCents: number | null
  rechargeCredits: number | null
  card: { brand: string | null; last4: string; expMonth: number | null; expYear: number | null } | null
  consentedAt: string | null
  lastSuccessAt: string | null
  lastErrorCode: string | null
  lastErrorAt: string | null
}

function euro(cents: number | null | undefined) {
  if (cents == null) return "da definire"
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(cents / 100)
}

const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: "no-store" })
  if (!response.ok) throw new Error("Dati Scout non disponibili")
  return response.json()
}

export function ScoutBillingCard({ billing }: { billing: ScoutBillingCardState }) {
  const { data, mutate } = useSWR<{ billing: ScoutBillingCardState }>(
    billing.active ? "/api/admin/crm/scout/billing" : null,
    fetcher,
    { fallbackData: { billing }, refreshInterval: 3000, revalidateOnFocus: true },
  )
  const { data: autoData, mutate: mutateAuto } = useSWR<{ autoRecharge: AutoRechargeState; creditPriceCents: number | null }>(
    billing.active ? "/api/admin/crm/scout/auto-recharge" : null,
    fetcher,
    { revalidateOnFocus: true },
  )

  const current = data?.billing ?? billing
  const auto = autoData?.autoRecharge
  const [quantity, setQuantity] = useState(Math.max(1, billing.minimumPurchaseCredits))
  const [loading, setLoading] = useState(false)
  const [autoSaving, setAutoSaving] = useState(false)
  const [thresholdEuro, setThresholdEuro] = useState("10")
  const [autoCredits, setAutoCredits] = useState(String(Math.max(100, billing.minimumPurchaseCredits)))

  useEffect(() => {
    if (!auto) return
    if (auto.thresholdCents != null) setThresholdEuro((auto.thresholdCents / 100).toFixed(2))
    if (auto.rechargeCredits != null) setAutoCredits(String(auto.rechargeCredits))
  }, [auto])

  useEffect(() => {
    if (!billing.active) return
    const params = new URLSearchParams(window.location.search)
    const sessionId = params.get("session_id")
    if (params.get("autoricarica") !== "carta-salvata" || !sessionId) return

    void (async () => {
      try {
        const response = await fetch("/api/admin/crm/scout/auto-recharge/finalize", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId }),
        })
        const payload = await response.json().catch(() => null)
        if (!response.ok) throw new Error(payload?.error || "Carta non salvata")
        toast.success("Carta salvata. Ora puoi attivare la ricarica automatica.")
        await mutateAuto()
        const url = new URL(window.location.href)
        url.searchParams.delete("autoricarica")
        url.searchParams.delete("session_id")
        window.history.replaceState({}, "", url.toString())
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Carta non salvata")
      }
    })()
  }, [billing.active, mutateAuto])

  async function checkout(kind: "activation" | "credits") {
    setLoading(true)
    try {
      const response = await fetch("/api/admin/crm/scout/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(kind === "activation" ? { kind } : { kind, quantity }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || "Pagamento Scout non avviato")
      if (!payload?.url) throw new Error("Pagamento Scout non disponibile")
      window.location.href = payload.url
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Pagamento Scout non avviato")
      setLoading(false)
    }
  }

  async function setupCard() {
    setAutoSaving(true)
    try {
      const response = await fetch("/api/admin/crm/scout/auto-recharge/setup", { method: "POST" })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || "Configurazione carta non avviata")
      if (!payload?.url) throw new Error("Configurazione carta non disponibile")
      window.location.href = payload.url
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Configurazione carta non avviata")
      setAutoSaving(false)
    }
  }

  async function saveAutoRecharge(enabled: boolean) {
    const threshold = Number(thresholdEuro.replace(",", "."))
    const credits = Number.parseInt(autoCredits, 10)
    if (!Number.isFinite(threshold) || threshold < 0.5 || !Number.isInteger(credits) || credits < current.minimumPurchaseCredits) {
      toast.error(`Imposta una soglia valida e almeno ${current.minimumPurchaseCredits} crediti per ricarica.`)
      return
    }

    setAutoSaving(true)
    try {
      const response = await fetch("/api/admin/crm/scout/auto-recharge", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled, thresholdCents: Math.round(threshold * 100), rechargeCredits: credits }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || "Impostazioni non salvate")
      toast.success(enabled ? "Ricarica automatica attivata" : "Ricarica automatica disattivata")
      await Promise.all([mutateAuto(), mutate()])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impostazioni non salvate")
    } finally {
      setAutoSaving(false)
    }
  }

  const autoRechargeValue = useMemo(() => {
    const credits = Number.parseInt(autoCredits, 10)
    if (!current.creditPriceCents || !Number.isFinite(credits) || credits <= 0) return null
    return credits * current.creditPriceCents
  }, [autoCredits, current.creditPriceCents])

  if (!current.active) {
    return (
      <Card className="overflow-hidden border-ha-brand/30 bg-gradient-to-br from-ha-brand/10 via-background to-background">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 text-ha-brand">
            <Sparkles className="h-5 w-5" aria-hidden />
            <span className="text-sm font-semibold uppercase tracking-wide">HotelAccelerator Scout</span>
          </div>
          <CardTitle className="mt-2 text-2xl sm:text-3xl">
            Vuoi trovare aziende, referenti, email e contatti utili senza passare ore a cercarli?
          </CardTitle>
          <CardDescription className="max-w-3xl text-base">
            Indica chi vuoi raggiungere: Scout cerca i prospect più interessanti, ti aiuta a individuare i decision maker e ti permette di verificare i riferimenti prima di portarli nel CRM.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-[1fr_auto] md:items-end">
          <div className="space-y-3">
            <div className="grid gap-2 text-sm sm:grid-cols-3">
              <div className="flex items-center gap-2"><Search className="h-4 w-4 text-ha-brand" aria-hidden /> Trova prospect mirati</div>
              <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-ha-brand" aria-hidden /> Verifica i riferimenti</div>
              <div className="flex items-center gap-2"><Coins className="h-4 w-4 text-ha-brand" aria-hidden /> Paga solo i crediti che usi</div>
            </div>
            <div>
              <span className="text-2xl font-semibold">{euro(current.activationFeeCents)}</span>
              <span className="ml-2 text-sm text-muted-foreground">una tantum</span>
              <p className="mt-1 text-sm text-muted-foreground">
                {current.activationIncludedCredits > 0
                  ? `${current.activationIncludedCredits.toLocaleString("it-IT")} crediti Scout inclusi per iniziare`
                  : "Dopo l'attivazione acquisti i crediti quando ti servono"}
              </p>
            </div>
          </div>
          <Button size="lg" onClick={() => void checkout("activation")} disabled={loading || !current.activationFeeCents}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="mr-2 h-4 w-4" aria-hidden />}
            Attiva Scout
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2"><Coins className="h-5 w-5 text-ha-brand" aria-hidden /> Crediti Scout</CardTitle>
              <CardDescription>Il saldo è condiviso da tutti gli utenti autorizzati di questo tenant.</CardDescription>
            </div>
            <Badge variant={current.availableCredits > 0 ? "secondary" : "destructive"} className="text-sm">{current.availableCredits.toLocaleString("it-IT")} disponibili</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <div className="grid gap-3 sm:grid-cols-3">
            <div><p className="text-xs text-muted-foreground">Saldo totale</p><p className="text-xl font-semibold">{current.balance.toLocaleString("it-IT")}</p></div>
            <div><p className="text-xs text-muted-foreground">Temporaneamente riservati</p><p className="text-xl font-semibold">{current.reservedCredits.toLocaleString("it-IT")}</p></div>
            <div><p className="text-xs text-muted-foreground">Prezzo per credito</p><p className="text-xl font-semibold">{current.pricingConfigured ? euro(current.creditPriceCents) : "da definire"}</p></div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="scout-credit-quantity">Crediti da acquistare</Label>
              <Input id="scout-credit-quantity" className="w-36" inputMode="numeric" type="number" min={current.minimumPurchaseCredits} value={quantity} onChange={(event) => setQuantity(Math.max(1, Number.parseInt(event.target.value || "0", 10) || 1))} />
              <p className="text-xs text-muted-foreground">Minimo {current.minimumPurchaseCredits}</p>
            </div>
            <Button onClick={() => void checkout("credits")} disabled={loading || !current.pricingConfigured || quantity < current.minimumPurchaseCredits}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <CreditCard className="mr-2 h-4 w-4" aria-hidden />}
              Acquista crediti
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Ricarica automatica</CardTitle>
              <CardDescription>Evita di fermare Scout quando il credito residuo diventa basso. È facoltativa e puoi disattivarla quando vuoi.</CardDescription>
            </div>
            <Badge variant={auto?.enabled ? "secondary" : "outline"}>{auto?.enabled ? "Attiva" : "Disattivata"}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {auto?.status === "action_required" && <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">La banca ha richiesto un nuovo intervento sulla carta. L'autoricarica è stata fermata per sicurezza.</p>}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
            <div className="space-y-1">
              <Label htmlFor="scout-auto-threshold">Ricarica quando il valore residuo scende sotto</Label>
              <div className="relative"><span className="absolute left-3 top-2.5 text-sm text-muted-foreground">€</span><Input id="scout-auto-threshold" className="pl-7" inputMode="decimal" value={thresholdEuro} onChange={(e) => setThresholdEuro(e.target.value)} /></div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="scout-auto-credits">Crediti per ogni ricarica</Label>
              <Input id="scout-auto-credits" type="number" min={current.minimumPurchaseCredits} value={autoCredits} onChange={(e) => setAutoCredits(e.target.value)} />
              <p className="text-xs text-muted-foreground">{autoRechargeValue == null ? "Importo calcolato al prezzo corrente" : `Addebito attuale: ${euro(autoRechargeValue)}`}</p>
            </div>
            <div className="space-y-1">
              <Label>Metodo di pagamento</Label>
              <p className="min-h-10 rounded-md border px-3 py-2 text-sm">{auto?.card ? `${auto.card.brand?.toUpperCase() || "Carta"} •••• ${auto.card.last4}` : "Nessuna carta salvata"}</p>
            </div>
            <Button variant="outline" onClick={() => void setupCard()} disabled={autoSaving}><CreditCard className="mr-2 h-4 w-4" aria-hidden />{auto?.card ? "Cambia carta" : "Salva carta"}</Button>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {auto?.enabled && <Button variant="outline" onClick={() => void saveAutoRecharge(false)} disabled={autoSaving}>Disattiva autoricarica</Button>}
            <Button onClick={() => void saveAutoRecharge(true)} disabled={autoSaving || !auto?.card}>
              {autoSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              {auto?.enabled ? "Aggiorna autoricarica" : "Attiva autoricarica"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Attivando la ricarica automatica autorizzi HotelAccelerator ad addebitare la carta salvata quando il valore dei crediti disponibili scende sotto la soglia impostata. Se il pagamento richiede autenticazione o viene rifiutato, l'autoricarica viene sospesa.</p>
        </CardContent>
      </Card>
    </div>
  )
}
