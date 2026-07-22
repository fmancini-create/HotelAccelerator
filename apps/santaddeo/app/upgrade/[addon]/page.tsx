"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams, useParams, notFound } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Check, Shield, Sparkles, ArrowRight, Loader2, AlertCircle } from "lucide-react"
import { useHotel } from "@/lib/contexts/hotel-context"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface PublicModule {
  key: string
  name: string
  description: string
  category: string
  currency: string
  monthlyPriceCents: number
  annualPriceCents: number
  annualFullPriceCents: number
  annualDiscountPct: number
  allowMonthly: boolean
  allowAnnual: boolean
  trialDaysMonthly: number
  trialDaysAnnual: number
  features: string[]
  isPurchasable: boolean
}

// Generic addon upgrade page. Carica i dati del modulo dal catalogo DB
// (gestito dal superadmin) cosicché prezzo/trial/feature siano sempre aggiornati.
// Slug uses dashes (booking-pace) and maps to the addon id with underscores
// (booking_pace).
export default function AddonUpgradePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const params = useParams<{ addon: string }>()
  const { selectedHotel } = useHotel()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [alreadyActive, setAlreadyActive] = useState(false)
  const [product, setProduct] = useState<PublicModule | null>(null)
  const [productLoading, setProductLoading] = useState(true)
  // Intervallo selezionato: annuale preselezionato.
  const [interval, setIntervalState] = useState<"month" | "year">("year")

  const slug = String(params?.addon || "")
  const addonType = slug.replace(/-/g, "_")
  const canceled = searchParams.get("canceled") === "true"

  // premium_expert has its own dedicated page; this generic one should not
  // shadow it (Next.js static segment takes precedence, but guard anyway).
  if (addonType === "premium_expert") {
    notFound()
  }

  // Carica il modulo dal catalogo pubblico (riflette le modifiche superadmin).
  useEffect(() => {
    let cancelled = false
    async function loadProduct() {
      setProductLoading(true)
      try {
        const res = await fetch(`/api/catalog/${addonType}`)
        if (!res.ok) {
          if (!cancelled) setProduct(null)
          return
        }
        const data = await res.json()
        if (!cancelled) {
          const mod = data.module as PublicModule
          setProduct(mod)
          // Se l'annuale non è disponibile, ripiega sul mensile.
          if (!mod.allowAnnual && mod.allowMonthly) setIntervalState("month")
        }
      } catch (err) {
        console.error("[v0] Error loading module:", err)
        if (!cancelled) setProduct(null)
      } finally {
        if (!cancelled) setProductLoading(false)
      }
    }
    loadProduct()
    return () => {
      cancelled = true
    }
  }, [addonType])

  useEffect(() => {
    async function checkStatus() {
      if (!selectedHotel?.id) return
      try {
        const res = await fetch(`/api/addon/status?hotelId=${selectedHotel.id}&addonType=${addonType}`)
        const data = await res.json()
        const active = Array.isArray(data.addons)
          ? data.addons.some((a: { addon_type: string; status: string }) => a.addon_type === addonType && a.status === "active")
          : false
        if (active) setAlreadyActive(true)
      } catch (err) {
        console.error("[v0] Error checking addon status:", err)
      }
    }
    checkStatus()
  }, [selectedHotel?.id, addonType])

  const handleCheckout = async () => {
    if (!selectedHotel?.id) {
      setError("Seleziona prima un hotel")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/addon/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addonType, hotelId: selectedHotel.id, interval }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Errore durante il checkout")
      if (data.url) window.location.href = data.url
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore sconosciuto")
    } finally {
      setLoading(false)
    }
  }

  if (productLoading) {
    return (
      <div className="container mx-auto flex max-w-5xl items-center justify-center px-4 py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!product) {
    notFound()
  }

  // Valori derivati per l'intervallo selezionato.
  const fmt = (cents: number) => (cents / 100).toLocaleString("it-IT")
  const showToggle = product.allowMonthly && product.allowAnnual
  const activeCents = interval === "year" ? product.annualPriceCents : product.monthlyPriceCents
  const activeTrial = interval === "year" ? product.trialDaysAnnual : product.trialDaysMonthly
  const annualSavingCents = product.annualFullPriceCents - product.annualPriceCents

  if (alreadyActive) {
    return (
      <div className="container mx-auto max-w-lg px-4 py-16">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Check className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">{product.name} attivo</CardTitle>
            <CardDescription>
              Il modulo {product.name} è già attivo per {selectedHotel?.name || "questa struttura"}.
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button onClick={() => router.push(`/accelerator/${slug}`)} variant="outline">
              Vai al modulo
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-10 md:py-12">
      <div className="mb-10 text-center">
        <Badge className="mb-4">Modulo Accelerator</Badge>
        <h1 className="text-3xl md:text-4xl font-bold text-balance">{product.name}</h1>
        <p className="mx-auto mt-3 max-w-2xl text-lg text-muted-foreground text-pretty">{product.description}</p>
      </div>

      {canceled && (
        <Alert className="mx-auto mb-8 max-w-2xl border-amber-200 bg-amber-50">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            Il pagamento è stato annullato. Puoi riprovare quando vuoi.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert className="mx-auto mb-8 max-w-2xl border-destructive/30 bg-destructive/10">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <AlertDescription className="text-destructive">{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Cosa include
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {product.features.map((feature) => (
                <li key={feature} className="flex items-start gap-3">
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="border-2 border-primary/30 shadow-lg lg:sticky lg:top-8 self-start">
          <CardHeader className="pb-2 text-center">
            {showToggle && (
              <div className="mx-auto mb-4 inline-flex rounded-lg bg-muted p-1">
                <button
                  type="button"
                  onClick={() => setIntervalState("month")}
                  className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                    interval === "month" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                  }`}
                >
                  Mensile
                </button>
                <button
                  type="button"
                  onClick={() => setIntervalState("year")}
                  className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                    interval === "year" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                  }`}
                >
                  Annuale
                  {product.annualDiscountPct > 0 && (
                    <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-xs font-semibold text-primary">
                      -{product.annualDiscountPct}%
                    </span>
                  )}
                </button>
              </div>
            )}
            <div className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
              <Shield className="h-4 w-4" />
              {interval === "year" ? "Abbonamento annuale" : "Abbonamento mensile"}
            </div>
            <CardTitle className="text-4xl font-bold">
              {fmt(activeCents)} EUR
              <span className="text-lg font-normal text-muted-foreground">
                /{interval === "year" ? "anno" : "mese"}
              </span>
            </CardTitle>
            {interval === "year" ? (
              <CardDescription className="text-base">
                Equivale a circa {fmt(Math.round(product.annualPriceCents / 12))} EUR/mese
                {annualSavingCents > 0 && (
                  <span className="ml-1 font-medium text-primary">
                    · risparmi {fmt(annualSavingCents)} EUR/anno
                  </span>
                )}
              </CardDescription>
            ) : (
              product.allowAnnual &&
              product.annualDiscountPct > 0 && (
                <CardDescription className="text-base">
                  Passa all&apos;annuale e risparmia il {product.annualDiscountPct}%
                </CardDescription>
              )
            )}
            {activeTrial > 0 && (
              <CardDescription className="mt-1 text-base font-medium text-primary">
                {activeTrial} giorni di prova gratuita
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {selectedHotel ? (
              <p className="text-center text-sm text-muted-foreground">
                Per: <span className="font-medium text-foreground">{selectedHotel.name}</span>
              </p>
            ) : (
              <p className="text-center text-sm text-amber-600">
                Seleziona una struttura dalla dashboard per continuare
              </p>
            )}
          </CardContent>
          <CardFooter>
            <Button onClick={handleCheckout} disabled={loading || !selectedHotel} className="h-14 w-full text-lg">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Elaborazione...
                </>
              ) : (
                <>
                  Attiva {product.name}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
