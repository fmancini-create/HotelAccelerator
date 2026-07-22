"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Check, MessageSquare, Clock, TrendingUp, Shield, Sparkles, ArrowRight, Loader2, AlertCircle } from "lucide-react"
import { useHotel } from "@/lib/contexts/hotel-context"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface PublicModule {
  key: string
  name: string
  description: string
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

export default function PremiumExpertUpgradePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { selectedHotel } = useHotel()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [alreadyActive, setAlreadyActive] = useState(false)
  const [product, setProduct] = useState<PublicModule | null>(null)
  const [productLoading, setProductLoading] = useState(true)
  // Intervallo selezionato: annuale preselezionato.
  const [interval, setIntervalState] = useState<"month" | "year">("year")

  const canceled = searchParams.get("canceled") === "true"

  // Carica i dati del modulo dal catalogo DB (gestito dal superadmin).
  useEffect(() => {
    let cancelled = false
    async function loadProduct() {
      setProductLoading(true)
      try {
        const res = await fetch("/api/catalog/premium_expert")
        if (res.ok) {
          const data = await res.json()
          if (!cancelled) {
            const mod = data.module as PublicModule
            setProduct(mod)
            if (!mod.allowAnnual && mod.allowMonthly) setIntervalState("month")
          }
        }
      } catch (err) {
        console.error("[v0] Error loading premium_expert:", err)
      } finally {
        if (!cancelled) setProductLoading(false)
      }
    }
    loadProduct()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    // Check if addon is already active
    async function checkStatus() {
      if (!selectedHotel?.id) return
      
      try {
        const res = await fetch(`/api/addon/status?hotelId=${selectedHotel.id}&addonType=premium_expert`)
        const data = await res.json()
        if (data.hasPremiumExpert) {
          setAlreadyActive(true)
        }
      } catch (err) {
        console.error("Error checking status:", err)
      }
    }
    checkStatus()
  }, [selectedHotel?.id])

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
        body: JSON.stringify({
          addonType: "premium_expert",
          hotelId: selectedHotel.id,
          interval,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Errore durante il checkout")
      }

      // Redirect to Stripe checkout
      if (data.url) {
        window.location.href = data.url
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore sconosciuto")
    } finally {
      setLoading(false)
    }
  }

  if (alreadyActive) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex items-center justify-center p-6">
        <Card className="max-w-lg w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
              <Check className="h-8 w-8 text-emerald-600" />
            </div>
            <CardTitle className="text-2xl text-emerald-700">Premium Expert Attivo</CardTitle>
            <CardDescription>
              Il tuo abbonamento Premium Expert e' gia' attivo per {selectedHotel?.name || "questo hotel"}.
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button onClick={() => router.push("/dashboard")} variant="outline">
              Torna alla Dashboard
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  if (productLoading || !product) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex items-center justify-center p-6">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    )
  }

  // Valori derivati per l'intervallo selezionato.
  const fmt = (cents: number) => (cents / 100).toLocaleString("it-IT")
  const showToggle = product.allowMonthly && product.allowAnnual
  const activeCents = interval === "year" ? product.annualPriceCents : product.monthlyPriceCents
  const activeTrial = interval === "year" ? product.trialDaysAnnual : product.trialDaysMonthly
  const annualSavingCents = product.annualFullPriceCents - product.annualPriceCents

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      <div className="container mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <Badge className="mb-4 bg-emerald-600">Addon Premium</Badge>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Premium Expert
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Porta le tue strategie di revenue management al livello successivo con il supporto di un esperto dedicato
          </p>
        </div>

        {canceled && (
          <Alert className="max-w-2xl mx-auto mb-8 border-amber-200 bg-amber-50">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              Il pagamento e' stato annullato. Puoi riprovare quando vuoi.
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert className="max-w-2xl mx-auto mb-8 border-red-200 bg-red-50">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {/* Features */}
          <div className="space-y-6">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-emerald-600" />
                  Come Funziona
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-semibold">1</div>
                  <div>
                    <p className="font-medium">Parla con Taddeo AI</p>
                    <p className="text-sm text-muted-foreground">Fai le tue domande all'assistente AI come sempre</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-semibold">2</div>
                  <div>
                    <p className="font-medium">Inoltra all'Esperto</p>
                    <p className="text-sm text-muted-foreground">Con un click, invia la conversazione al tuo consulente RM</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-semibold">3</div>
                  <div>
                    <p className="font-medium">Ricevi Consigli Strategici</p>
                    <p className="text-sm text-muted-foreground">L'esperto risponde entro 24-48 ore lavorative</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-emerald-600" />
                  Cosa Include
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {product.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <Check className="h-5 w-5 text-emerald-600 mt-0.5 flex-shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Pricing Card */}
          <div>
            <Card className="border-2 border-emerald-200 shadow-xl sticky top-8">
              <CardHeader className="text-center pb-2">
                {showToggle && (
                  <div className="mx-auto mb-4 inline-flex rounded-lg bg-emerald-50 p-1">
                    <button
                      type="button"
                      onClick={() => setIntervalState("month")}
                      className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                        interval === "month" ? "bg-white text-emerald-700 shadow-sm" : "text-emerald-600/70"
                      }`}
                    >
                      Mensile
                    </button>
                    <button
                      type="button"
                      onClick={() => setIntervalState("year")}
                      className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                        interval === "year" ? "bg-white text-emerald-700 shadow-sm" : "text-emerald-600/70"
                      }`}
                    >
                      Annuale
                      {product.annualDiscountPct > 0 && (
                        <span className="rounded-full bg-emerald-600/15 px-1.5 py-0.5 text-xs font-semibold text-emerald-700">
                          -{product.annualDiscountPct}%
                        </span>
                      )}
                    </button>
                  </div>
                )}
                <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-sm font-medium mx-auto mb-4">
                  <Shield className="h-4 w-4" />
                  {interval === "year" ? "Abbonamento Annuale" : "Abbonamento Mensile"}
                </div>
                <CardTitle className="text-4xl font-bold">
                  {fmt(activeCents)} EUR
                  <span className="text-lg font-normal text-muted-foreground">
                    /{interval === "year" ? "anno" : "mese"}
                  </span>
                </CardTitle>
                {interval === "year" ? (
                  <CardDescription className="text-base">
                    Equivale a soli {fmt(Math.round(product.annualPriceCents / 12))} EUR/mese
                    {annualSavingCents > 0 && (
                      <span className="ml-1 font-medium text-emerald-700">
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
                  <CardDescription className="text-base font-medium text-emerald-700">
                    {activeTrial} giorni di prova gratuita
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>Risposta garantita entro 24-48h</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    <span>Report mensile incluso</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <span>Cancella in qualsiasi momento</span>
                  </div>
                </div>

                {selectedHotel ? (
                  <p className="text-sm text-center text-muted-foreground">
                    Per: <span className="font-medium text-foreground">{selectedHotel.name}</span>
                  </p>
                ) : (
                  <p className="text-sm text-center text-amber-600">
                    Seleziona un hotel dalla dashboard per continuare
                  </p>
                )}
              </CardContent>
              <CardFooter>
                <Button 
                  onClick={handleCheckout} 
                  disabled={loading || !selectedHotel}
                  className="w-full h-14 text-lg bg-emerald-600 hover:bg-emerald-700"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Elaborazione...
                    </>
                  ) : (
                    <>
                      Attiva Premium Expert
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
