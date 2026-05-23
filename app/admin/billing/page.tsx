"use client"

import { useState, useEffect } from "react"
import useSWR from "swr"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { Check, CreditCard, FileText, Building2, Loader2 } from "lucide-react"
import { AdminHeader } from "@/components/admin/admin-header"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface Plan {
  id: string
  name: string
  type: string
  description: string
  basePriceInCents: number
  commissionPercent?: number
  perRoomPriceInCents?: number
  setupFeeInCents?: number
  features: string[]
  isActive: boolean
}

interface Subscription {
  id: string
  plan_id: string
  plan_type: string
  status: string
  room_count: number
  current_period_start: string | null
  current_period_end: string | null
}

interface Invoice {
  id: string
  fic_invoice_number: string | null
  amount_cents: number
  status: string
  issue_date: string | null
  pdf_url: string | null
}

interface BillingInfo {
  billing_company_name: string | null
  billing_vat: string | null
  billing_tax_code: string | null
  billing_address: string | null
  billing_city: string | null
  billing_postal_code: string | null
  billing_province: string | null
  billing_pec: string | null
  billing_sdi: string | null
  billing_email: string | null
}

export default function BillingPage() {
  const { data, error, mutate } = useSWR<{
    plans: Plan[]
    subscriptions: Subscription[]
    invoices: Invoice[]
    billingInfo: BillingInfo
    propertyId: string
  }>("/api/admin/billing", fetcher)

  const [billingForm, setBillingForm] = useState<BillingInfo | null>(null)
  const [savingBilling, setSavingBilling] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)

  useEffect(() => {
    if (data?.billingInfo && !billingForm) {
      setBillingForm(data.billingInfo)
    }
  }, [data, billingForm])

  const handleCheckout = async (planId: string) => {
    setCheckoutLoading(planId)
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      })
      const result = await res.json()
      if (result.url) {
        window.location.href = result.url
      } else {
        toast.error(result.error || "Errore durante il checkout")
      }
    } catch {
      toast.error("Errore di rete")
    } finally {
      setCheckoutLoading(null)
    }
  }

  const handleSaveBilling = async () => {
    if (!billingForm) return
    setSavingBilling(true)
    try {
      const res = await fetch("/api/admin/billing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(billingForm),
      })
      if (res.ok) {
        toast.success("Dati di fatturazione salvati")
        mutate()
      } else {
        toast.error("Errore nel salvataggio")
      }
    } catch {
      toast.error("Errore di rete")
    } finally {
      setSavingBilling(false)
    }
  }

  const formatPrice = (cents: number) =>
    new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(cents / 100)

  const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("it-IT") : "-"

  if (error) {
    return (
      <div className="p-8">
        <AdminHeader title="Fatturazione" subtitle="Gestisci abbonamenti e dati di fatturazione" />
        <Card className="mt-6">
          <CardContent className="py-12 text-center text-muted-foreground">
            Errore nel caricamento dei dati di fatturazione.
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="p-8">
        <AdminHeader title="Fatturazione" subtitle="Gestisci abbonamenti e dati di fatturazione" />
        <div className="mt-6 flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  const activeSub = data.subscriptions.find((s) => s.status === "active")

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <AdminHeader title="Fatturazione" subtitle="Gestisci abbonamenti, piani e dati di fatturazione" />

      <Tabs defaultValue="plans" className="mt-6">
        <TabsList>
          <TabsTrigger value="plans">Piani</TabsTrigger>
          <TabsTrigger value="billing">Dati Fatturazione</TabsTrigger>
          <TabsTrigger value="invoices">Fatture</TabsTrigger>
        </TabsList>

        <TabsContent value="plans" className="mt-6">
          {activeSub && (
            <Card className="mb-6 border-green-200 bg-green-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-800">
                  <Check className="h-5 w-5" />
                  Abbonamento Attivo
                </CardTitle>
              </CardHeader>
              <CardContent className="text-green-700">
                <p>
                  Piano: <strong>{data.plans.find((p) => p.id === activeSub.plan_id)?.name || activeSub.plan_id}</strong>
                </p>
                <p>Camere: {activeSub.room_count}</p>
                <p>
                  Periodo: {formatDate(activeSub.current_period_start)} - {formatDate(activeSub.current_period_end)}
                </p>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {data.plans
              .filter((p) => p.isActive && (p.type === "commission" || p.type === "fixed_fee"))
              .map((plan) => {
                const isActive = activeSub?.plan_id === plan.id
                return (
                  <Card key={plan.id} className={isActive ? "border-primary" : ""}>
                    <CardHeader>
                      <CardTitle>{plan.name}</CardTitle>
                      <CardDescription>{plan.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="mb-4">
                        {plan.type === "commission" ? (
                          <>
                            <span className="text-3xl font-bold">{formatPrice(plan.basePriceInCents)}</span>
                            <span className="text-muted-foreground">/mese + {plan.commissionPercent}%</span>
                          </>
                        ) : (
                          <>
                            <span className="text-3xl font-bold">{formatPrice(plan.perRoomPriceInCents || 0)}</span>
                            <span className="text-muted-foreground">/camera/mese</span>
                          </>
                        )}
                      </div>
                      <ul className="space-y-2">
                        {plan.features.map((f, i) => (
                          <li key={i} className="flex items-center gap-2 text-sm">
                            <Check className="h-4 w-4 text-green-600" />
                            {f}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                    <CardFooter>
                      {isActive ? (
                        <Badge variant="secondary" className="w-full justify-center py-2">
                          Piano Attivo
                        </Badge>
                      ) : (
                        <Button
                          className="w-full"
                          onClick={() => handleCheckout(plan.id)}
                          disabled={checkoutLoading === plan.id}
                        >
                          {checkoutLoading === plan.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <CreditCard className="mr-2 h-4 w-4" />
                              Sottoscrivi
                            </>
                          )}
                        </Button>
                      )}
                    </CardFooter>
                  </Card>
                )
              })}
          </div>

          <Separator className="my-8" />

          <h3 className="text-lg font-semibold mb-4">Add-on</h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data.plans
              .filter((p) => p.isActive && p.type === "addon")
              .map((plan) => (
                <Card key={plan.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{plan.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-2">{plan.description}</p>
                    <p className="font-semibold">{formatPrice(plan.basePriceInCents)}/mese</p>
                  </CardContent>
                  <CardFooter>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => handleCheckout(plan.id)}
                      disabled={checkoutLoading === plan.id}
                    >
                      {checkoutLoading === plan.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aggiungi"}
                    </Button>
                  </CardFooter>
                </Card>
              ))}
          </div>
        </TabsContent>

        <TabsContent value="billing" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Dati di Fatturazione
              </CardTitle>
              <CardDescription>
                Questi dati verranno utilizzati per la fatturazione elettronica.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {billingForm && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="billing_company_name">Ragione Sociale</Label>
                    <Input
                      id="billing_company_name"
                      value={billingForm.billing_company_name || ""}
                      onChange={(e) => setBillingForm({ ...billingForm, billing_company_name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="billing_vat">Partita IVA</Label>
                    <Input
                      id="billing_vat"
                      value={billingForm.billing_vat || ""}
                      onChange={(e) => setBillingForm({ ...billingForm, billing_vat: e.target.value })}
                      placeholder="IT12345678901"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="billing_tax_code">Codice Fiscale</Label>
                    <Input
                      id="billing_tax_code"
                      value={billingForm.billing_tax_code || ""}
                      onChange={(e) => setBillingForm({ ...billingForm, billing_tax_code: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="billing_email">Email Fatturazione</Label>
                    <Input
                      id="billing_email"
                      type="email"
                      value={billingForm.billing_email || ""}
                      onChange={(e) => setBillingForm({ ...billingForm, billing_email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="billing_address">Indirizzo</Label>
                    <Input
                      id="billing_address"
                      value={billingForm.billing_address || ""}
                      onChange={(e) => setBillingForm({ ...billingForm, billing_address: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="billing_city">Città</Label>
                    <Input
                      id="billing_city"
                      value={billingForm.billing_city || ""}
                      onChange={(e) => setBillingForm({ ...billingForm, billing_city: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="billing_postal_code">CAP</Label>
                    <Input
                      id="billing_postal_code"
                      value={billingForm.billing_postal_code || ""}
                      onChange={(e) => setBillingForm({ ...billingForm, billing_postal_code: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="billing_province">Provincia</Label>
                    <Input
                      id="billing_province"
                      value={billingForm.billing_province || ""}
                      onChange={(e) => setBillingForm({ ...billingForm, billing_province: e.target.value })}
                      placeholder="FI"
                      maxLength={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="billing_pec">PEC</Label>
                    <Input
                      id="billing_pec"
                      type="email"
                      value={billingForm.billing_pec || ""}
                      onChange={(e) => setBillingForm({ ...billingForm, billing_pec: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="billing_sdi">Codice SDI</Label>
                    <Input
                      id="billing_sdi"
                      value={billingForm.billing_sdi || ""}
                      onChange={(e) => setBillingForm({ ...billingForm, billing_sdi: e.target.value })}
                      placeholder="0000000"
                      maxLength={7}
                    />
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button onClick={handleSaveBilling} disabled={savingBilling}>
                {savingBilling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Salva Dati Fatturazione
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="invoices" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Storico Fatture
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.invoices.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">Nessuna fattura disponibile.</p>
              ) : (
                <div className="space-y-4">
                  {data.invoices.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between border-b pb-4">
                      <div>
                        <p className="font-medium">{inv.fic_invoice_number || `#${inv.id.slice(0, 8)}`}</p>
                        <p className="text-sm text-muted-foreground">{formatDate(inv.issue_date)}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge variant={inv.status === "paid" ? "default" : "secondary"}>
                          {inv.status === "paid" ? "Pagata" : inv.status}
                        </Badge>
                        <span className="font-semibold">{formatPrice(inv.amount_cents)}</span>
                        {inv.pdf_url && (
                          <Button variant="outline" size="sm" asChild>
                            <a href={inv.pdf_url} target="_blank" rel="noopener noreferrer">
                              PDF
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
