"use client"

import { useState } from "react"
import useSWR from "swr"
import { Coins, CreditCard, Loader2, ShieldCheck } from "lucide-react"
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

function euro(cents: number | null) {
  if (cents === null) return "da definire"
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(cents / 100)
}

const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: "no-store" })
  if (!response.ok) throw new Error("Saldo Scout non disponibile")
  return response.json()
}

export function ScoutBillingCard({ billing }: { billing: ScoutBillingCardState }) {
  const { data } = useSWR<{ billing: ScoutBillingCardState }>(
    billing.active ? "/api/admin/crm/scout/billing" : null,
    fetcher,
    { fallbackData: { billing }, refreshInterval: 3000, revalidateOnFocus: true },
  )
  const current = data?.billing ?? billing
  const [quantity, setQuantity] = useState(Math.max(1, billing.minimumPurchaseCredits))
  const [loading, setLoading] = useState(false)

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

  if (!current.active) {
    return (
      <Card className="border-ha-brand/30 bg-ha-brand/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-ha-brand" aria-hidden />
            Attiva HotelAccelerator Scout
          </CardTitle>
          <CardDescription>
            Scout è un add-on a pagamento. L'attivazione è una tantum; successivamente acquisti solo i crediti che utilizzi.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <p className="text-2xl font-semibold">{euro(current.activationFeeCents)}</p>
            <p className="text-sm text-muted-foreground">
              {current.activationIncludedCredits > 0
                ? `${current.activationIncludedCredits.toLocaleString("it-IT")} crediti Scout inclusi nell'attivazione`
                : "Crediti acquistabili dopo l'attivazione"}
            </p>
          </div>
          <Button
            onClick={() => void checkout("activation")}
            disabled={loading || current.activationFeeCents === null || current.activationFeeCents <= 0}
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <CreditCard className="mr-2 h-4 w-4" aria-hidden />}
            Attiva Scout
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-ha-brand" aria-hidden />
              Crediti Scout
            </CardTitle>
            <CardDescription>Il saldo è condiviso da tutti gli utenti autorizzati di questo tenant.</CardDescription>
          </div>
          <Badge variant={current.availableCredits > 0 ? "secondary" : "destructive"} className="text-sm">
            {current.availableCredits.toLocaleString("it-IT")} disponibili
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Saldo totale</p>
            <p className="text-xl font-semibold">{current.balance.toLocaleString("it-IT")}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Temporaneamente riservati</p>
            <p className="text-xl font-semibold">{current.reservedCredits.toLocaleString("it-IT")}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Prezzo per credito</p>
            <p className="text-xl font-semibold">{current.pricingConfigured ? euro(current.creditPriceCents) : "da definire"}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="scout-credit-quantity">Crediti da acquistare</Label>
            <Input
              id="scout-credit-quantity"
              className="w-36"
              inputMode="numeric"
              type="number"
              min={current.minimumPurchaseCredits}
              value={quantity}
              onChange={(event) => setQuantity(Math.max(1, Number.parseInt(event.target.value || "0", 10) || 1))}
            />
            <p className="text-xs text-muted-foreground">Minimo {current.minimumPurchaseCredits}</p>
          </div>
          <Button
            onClick={() => void checkout("credits")}
            disabled={loading || !current.pricingConfigured || quantity < current.minimumPurchaseCredits}
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <CreditCard className="mr-2 h-4 w-4" aria-hidden />}
            Acquista crediti
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
