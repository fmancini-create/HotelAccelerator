"use client"

import { useEffect, useState } from "react"
import useSWR from "swr"
import { Percent, Save, Loader2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import { jsonFetcher } from "@/lib/swr-fetcher"

type SettingsResponse = {
  canManage: boolean
  settings: {
    crossSellEnabled: boolean
    crossSellDiscountPercent: number
    allowPromotionStacking: boolean
  }
}

export function SuiteCommercialSettingsCard() {
  const { data, mutate } = useSWR<SettingsResponse>("/api/platform/commercial-settings", jsonFetcher)
  const [discount, setDiscount] = useState("10")
  const [enabled, setEnabled] = useState(true)
  const [stacking, setStacking] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!data?.settings) return
    setDiscount(String(data.settings.crossSellDiscountPercent))
    setEnabled(data.settings.crossSellEnabled)
    setStacking(data.settings.allowPromotionStacking)
  }, [data])

  if (!data?.canManage) return null

  async function save() {
    setSaving(true)
    try {
      const res = await fetch("/api/platform/commercial-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          crossSellEnabled: enabled,
          crossSellDiscountPercent: Number(discount),
          allowPromotionStacking: stacking,
        }),
      })
      const result = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(result.error || "Salvataggio non riuscito")
      toast.success("Regola globale Vantaggio cliente 4BID aggiornata")
      await mutate()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Salvataggio non riuscito")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="mt-6 border-2 border-emerald-200 bg-emerald-50/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Percent className="h-4 w-4" />
          Vantaggio cliente 4BID · regola globale
        </CardTitle>
        <CardDescription>
          Questa è l'unica sorgente della percentuale usata dall'intero ecosistema 4BID. Se un cliente possiede già almeno un prodotto 4BID, il vantaggio si applica all'acquisto di un prodotto diverso. Santaddeo, HotelProfitAI, ManuBot e il preventivatore 4BID devono leggere questo valore e non mantenerne copie autonome.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 md:grid-cols-3">
        <div className="flex items-center justify-between gap-3 rounded-md border bg-background p-3">
          <div>
            <Label htmlFor="cross-sell-enabled">Vantaggio cliente 4BID</Label>
            <p className="text-xs text-muted-foreground">Abilita o disabilita la regola in tutta la suite.</p>
          </div>
          <Switch id="cross-sell-enabled" checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="cross-sell-discount">Percentuale globale</Label>
          <div className="relative">
            <Input
              id="cross-sell-discount"
              type="number"
              min={0}
              max={100}
              step="0.5"
              value={discount}
              onChange={(event) => setDiscount(event.target.value)}
              className="pr-9"
            />
            <Percent className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-xs text-muted-foreground">Oggi il valore previsto è 10%. Modificalo qui una sola volta.</p>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-md border bg-background p-3">
          <div>
            <Label htmlFor="promotion-stacking">Cumula promozioni</Label>
            <p className="text-xs text-muted-foreground">Se disattivato, evita di sommare automaticamente altre promo allo sconto 4BID.</p>
          </div>
          <Switch id="promotion-stacking" checked={stacking} onCheckedChange={setStacking} />
        </div>

        <div className="md:col-span-3 flex flex-col gap-2 rounded-lg border border-emerald-200 bg-background p-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span><strong className="text-foreground">Gestione:</strong> Superadmin HotelAccelerator → Moduli → Vantaggio cliente 4BID.</span>
          <span>Gli altri repo espongono la regola, ma non la modificano.</span>
        </div>

        <div className="md:col-span-3 flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Salva regola globale
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
