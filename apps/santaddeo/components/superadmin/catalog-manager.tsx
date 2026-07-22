"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Loader2, RefreshCw, Package, CreditCard, CheckCircle2, AlertCircle, Settings2 } from "lucide-react"
import { toast } from "sonner"

interface ModuleRow {
  key: string
  name: string
  description: string
  category: string
  price_cents: number
  price_monthly_cents: number | null
  annual_discount_pct: number | string | null
  currency: string
  trial_days_monthly: number
  trial_days_annual: number
  allow_monthly: boolean
  allow_annual: boolean
  features: string[]
  is_published: boolean
  is_purchasable: boolean
  stripe_product_id: string | null
  stripe_price_monthly_id: string | null
  stripe_price_annual_id: string | null
  sort_order: number
}

interface RmsDefaults {
  default_fixed_fee_cents: number
  default_commission_pct: number
  default_trial_days: number
}

interface EditState {
  name: string
  description: string
  monthlyEur: string
  annualDiscountPct: string
  trialDaysMonthly: string
  trialDaysAnnual: string
  allow_monthly: boolean
  allow_annual: boolean
  features: string
  is_published: boolean
  is_purchasable: boolean
}

/** Prezzo annuale (cents) calcolato da mensile + sconto%. */
function computeAnnual(monthlyCents: number, discountPct: number): number {
  return Math.round(monthlyCents * 12 * (1 - discountPct / 100))
}

function fmtEur(cents: number): string {
  return (cents / 100).toLocaleString("it-IT")
}

export function CatalogManager() {
  const [modules, setModules] = useState<ModuleRow[]>([])
  const [rmsDefaults, setRmsDefaults] = useState<RmsDefaults | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [savingRms, setSavingRms] = useState(false)

  const [editKey, setEditKey] = useState<string | null>(null)
  const [edit, setEdit] = useState<EditState | null>(null)
  const [saving, setSaving] = useState(false)

  const fetchCatalog = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/superadmin/catalog")
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Errore")
      setModules(data.modules || [])
      if (data.rmsDefaults) {
        setRmsDefaults({
          default_fixed_fee_cents: data.rmsDefaults.default_fixed_fee_cents ?? 0,
          default_commission_pct: Number(data.rmsDefaults.default_commission_pct ?? 0),
          default_trial_days: data.rmsDefaults.default_trial_days ?? 0,
        })
      }
    } catch (error) {
      console.error("[v0] fetchCatalog error:", error)
      toast.error("Errore nel caricamento del catalogo")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCatalog()
  }, [])

  const openEdit = (m: ModuleRow) => {
    setEditKey(m.key)
    setEdit({
      name: m.name,
      description: m.description,
      monthlyEur: ((m.price_monthly_cents ?? 0) / 100).toString(),
      annualDiscountPct: (m.annual_discount_pct != null ? Number(m.annual_discount_pct) : 0).toString(),
      trialDaysMonthly: (m.trial_days_monthly ?? 0).toString(),
      trialDaysAnnual: (m.trial_days_annual ?? 0).toString(),
      allow_monthly: m.allow_monthly,
      allow_annual: m.allow_annual,
      features: m.features.join("\n"),
      is_published: m.is_published,
      is_purchasable: m.is_purchasable,
    })
  }

  const saveEdit = async () => {
    if (!editKey || !edit) return
    const monthlyCents = Math.round(Number.parseFloat(edit.monthlyEur.replace(",", ".")) * 100)
    const discountPct = Number.parseFloat(edit.annualDiscountPct.replace(",", "."))
    const trialM = Number.parseInt(edit.trialDaysMonthly, 10)
    const trialA = Number.parseInt(edit.trialDaysAnnual, 10)
    if (Number.isNaN(monthlyCents) || monthlyCents < 0) {
      toast.error("Prezzo mensile non valido")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/superadmin/catalog", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: editKey,
          name: edit.name,
          description: edit.description,
          price_monthly_cents: monthlyCents,
          annual_discount_pct: Number.isNaN(discountPct) ? 0 : discountPct,
          trial_days_monthly: Number.isNaN(trialM) ? 0 : trialM,
          trial_days_annual: Number.isNaN(trialA) ? 0 : trialA,
          allow_monthly: edit.allow_monthly,
          allow_annual: edit.allow_annual,
          features: edit.features.split("\n").map((f) => f.trim()).filter(Boolean),
          is_published: edit.is_published,
          is_purchasable: edit.is_purchasable,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Errore")
      toast.success("Modulo aggiornato")
      setEditKey(null)
      setEdit(null)
      fetchCatalog()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Errore nel salvataggio")
    } finally {
      setSaving(false)
    }
  }

  const syncStripe = async (key: string) => {
    setSyncing(key)
    try {
      const res = await fetch(`/api/superadmin/catalog/${key}/sync-stripe`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Errore Stripe")
      toast.success(data.createdNewPrice ? "Sincronizzato: nuovo prezzo creato su Stripe" : "Sincronizzato con Stripe")
      fetchCatalog()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Errore Stripe")
    } finally {
      setSyncing(null)
    }
  }

  const saveRms = async () => {
    if (!rmsDefaults) return
    setSavingRms(true)
    try {
      const res = await fetch("/api/superadmin/catalog?target=rms", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          default_fixed_fee_cents: rmsDefaults.default_fixed_fee_cents,
          default_commission_pct: rmsDefaults.default_commission_pct,
          default_trial_days: rmsDefaults.default_trial_days,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Errore")
      toast.success("Default piani base salvati")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Errore nel salvataggio")
    } finally {
      setSavingRms(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Catalogo moduli */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-emerald-600" />
                Catalogo Moduli e Addon
              </CardTitle>
              <CardDescription>
                Prezzo, prova gratuita, feature incluse e visibilità. Le modifiche sono subito visibili sulle pagine pubbliche.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchCatalog} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Aggiorna
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {modules.map((m) => (
                <Card key={m.key} className="border">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base">{m.name}</CardTitle>
                      <Badge variant="outline" className="capitalize">
                        {m.category === "module" ? "Modulo" : "Addon"}
                      </Badge>
                    </div>
                    <CardDescription className="line-clamp-2">{m.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-0.5">
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold">{fmtEur(m.price_monthly_cents ?? 0)} EUR</span>
                        <span className="text-sm text-muted-foreground">/mese</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        oppure {fmtEur(computeAnnual(m.price_monthly_cents ?? 0, Number(m.annual_discount_pct ?? 0)))} EUR/anno
                        {Number(m.annual_discount_pct ?? 0) > 0 ? ` (-${Number(m.annual_discount_pct)}%)` : ""}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs">
                      {(m.trial_days_monthly ?? 0) > 0 && (
                        <Badge variant="secondary">{m.trial_days_monthly} gg prova (mensile)</Badge>
                      )}
                      {(m.trial_days_annual ?? 0) > 0 && (
                        <Badge variant="secondary">{m.trial_days_annual} gg prova (annuale)</Badge>
                      )}
                      <Badge variant={m.is_published ? "secondary" : "outline"}>
                        {m.is_published ? "Pubblicato" : "Nascosto"}
                      </Badge>
                      <Badge variant={m.is_purchasable ? "secondary" : "outline"}>
                        {m.is_purchasable ? "Acquistabile" : "Non acquistabile"}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {m.stripe_product_id && (m.stripe_price_monthly_id || m.stripe_price_annual_id) ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                          <span className="truncate">
                            Sincronizzato con Stripe
                            {m.stripe_price_monthly_id && m.stripe_price_annual_id
                              ? " (mensile + annuale)"
                              : m.stripe_price_annual_id
                                ? " (annuale)"
                                : " (mensile)"}
                          </span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                          <span>Non sincronizzato (prezzo inline)</span>
                        </>
                      )}
                    </div>

                    <div className="flex gap-2 pt-1">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(m)}>
                        <Settings2 className="h-4 w-4 mr-1.5" />
                        Modifica
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => syncStripe(m.key)}
                        disabled={syncing === m.key}
                      >
                        {syncing === m.key ? (
                          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                        ) : (
                          <CreditCard className="h-4 w-4 mr-1.5" />
                        )}
                        Sincronizza Stripe
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Default piani base RMS */}
      {rmsDefaults && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-emerald-600" />
              Default Piani Base RMS
            </CardTitle>
            <CardDescription>
              Valori predefiniti usati alla creazione di un nuovo abbonamento per-hotel.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Fee fissa default (EUR)</Label>
                <Input
                  type="number"
                  min={0}
                  value={rmsDefaults.default_fixed_fee_cents / 100}
                  onChange={(e) =>
                    setRmsDefaults({
                      ...rmsDefaults,
                      default_fixed_fee_cents: Math.round(Number.parseFloat(e.target.value || "0") * 100),
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Commissione default (%)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.1"
                  value={rmsDefaults.default_commission_pct}
                  onChange={(e) =>
                    setRmsDefaults({
                      ...rmsDefaults,
                      default_commission_pct: Number.parseFloat(e.target.value || "0"),
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Giorni di prova default</Label>
                <Input
                  type="number"
                  min={0}
                  value={rmsDefaults.default_trial_days}
                  onChange={(e) =>
                    setRmsDefaults({
                      ...rmsDefaults,
                      default_trial_days: Number.parseInt(e.target.value || "0", 10),
                    })
                  }
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button onClick={saveRms} disabled={savingRms}>
                {savingRms ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Salva default
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog modifica modulo */}
      <Dialog open={editKey !== null} onOpenChange={(open) => !open && setEditKey(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifica modulo</DialogTitle>
            <DialogDescription>
              Aggiorna prezzo, prova gratuita, feature e visibilità. Dopo aver cambiato il prezzo, ricordati di sincronizzare con Stripe.
            </DialogDescription>
          </DialogHeader>
          {edit && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Descrizione</Label>
                <Textarea
                  rows={2}
                  value={edit.description}
                  onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Prezzo mensile (EUR)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={edit.monthlyEur}
                    onChange={(e) => setEdit({ ...edit, monthlyEur: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Sconto annuale (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={edit.annualDiscountPct}
                    onChange={(e) => setEdit({ ...edit, annualDiscountPct: e.target.value })}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground -mt-2">
                Prezzo annuale calcolato:{" "}
                <span className="font-medium text-foreground">
                  {fmtEur(
                    computeAnnual(
                      Math.round(Number.parseFloat(edit.monthlyEur.replace(",", ".") || "0") * 100),
                      Number.parseFloat(edit.annualDiscountPct.replace(",", ".") || "0"),
                    ),
                  )}{" "}
                  EUR/anno
                </span>
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Giorni prova (mensile)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={edit.trialDaysMonthly}
                    onChange={(e) => setEdit({ ...edit, trialDaysMonthly: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Giorni prova (annuale)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={edit.trialDaysAnnual}
                    onChange={(e) => setEdit({ ...edit, trialDaysAnnual: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <p className="text-sm font-medium">Abilita mensile</p>
                  <Switch
                    checked={edit.allow_monthly}
                    onCheckedChange={(v) => setEdit({ ...edit, allow_monthly: v })}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <p className="text-sm font-medium">Abilita annuale</p>
                  <Switch
                    checked={edit.allow_annual}
                    onCheckedChange={(v) => setEdit({ ...edit, allow_annual: v })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Feature incluse (una per riga)</Label>
                <Textarea
                  rows={5}
                  value={edit.features}
                  onChange={(e) => setEdit({ ...edit, features: e.target.value })}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Pubblicato</p>
                  <p className="text-xs text-muted-foreground">Visibile sulle pagine pubbliche di upgrade</p>
                </div>
                <Switch
                  checked={edit.is_published}
                  onCheckedChange={(v) => setEdit({ ...edit, is_published: v })}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Acquistabile</p>
                  <p className="text-xs text-muted-foreground">Abilita il pulsante di checkout</p>
                </div>
                <Switch
                  checked={edit.is_purchasable}
                  onCheckedChange={(v) => setEdit({ ...edit, is_purchasable: v })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditKey(null)}>
              Annulla
            </Button>
            <Button onClick={saveEdit} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
