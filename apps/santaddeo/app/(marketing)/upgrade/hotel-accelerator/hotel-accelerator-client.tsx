"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import Image from "next/image"
import { Footer } from "@/components/layout/footer"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  Check,
  Zap,
  TrendingUp,
  DollarSign,
  Clock,
  Settings,
  BarChart3,
  MessageSquare,
  Sparkles,
} from "lucide-react"

interface PricingConfig {
  id: string
  model_type: "fee" | "commission"
  name: string
  fee_base_value: string
  fee_coefficient_camere: string
  fee_coefficient_appartamenti: string
  fee_coefficient_piazzole: string
  commission_startup_years: number
  commission_yearly_rates: number[]
  commission_post_startup_rate: string
}

interface Props {
  isLoggedIn: boolean
  defaultFee: PricingConfig | null
  defaultCommission: PricingConfig | null
  // 13/05/2026: piani non-default ma attivi (varianti promo / stagionali
  // create da /superadmin/pricing). Vengono mostrati in una sezione
  // "Offerte speciali" sotto i piani principali, ognuna con badge promo.
  promoFeePlans?: PricingConfig[]
  promoCommissionPlans?: PricingConfig[]
}

export function HotelAcceleratorClient({
  isLoggedIn,
  defaultFee,
  defaultCommission,
  promoFeePlans = [],
  promoCommissionPlans = [],
}: Props) {
  const [stars, setStars] = useState("3")
  const [accommodationType, setAccommodationType] = useState("camere")
  const [numUnits, setNumUnits] = useState("20")

  // true when user selects "oltre 300"
  const isContactRequired = numUnits === "oltre300"

  // Compute fee from DB config
  const monthlyFee = useMemo(() => {
    if (!defaultFee || isContactRequired) return 0
    const base = Number(defaultFee.fee_base_value)
    let coefficient = Number(defaultFee.fee_coefficient_camere)
    if (accommodationType === "appartamenti") {
      coefficient = Number(defaultFee.fee_coefficient_appartamenti)
    } else if (accommodationType === "piazzole") {
      coefficient = Number(defaultFee.fee_coefficient_piazzole)
    }
    const starsMultiplier = Number(stars)
    const units = Number(numUnits) || 0
    return base * coefficient * starsMultiplier * units
  }, [defaultFee, stars, accommodationType, numUnits, isContactRequired])

  const yearlyFee = monthlyFee * 12

  // Generate options 1..300
  const unitOptions = Array.from({ length: 300 }, (_, i) => i + 1)

  // Commission data from DB
  const commYears = defaultCommission?.commission_startup_years || 3
  const commRates = defaultCommission?.commission_yearly_rates || [8, 10, 12]
  const commPostRate = defaultCommission
    ? Number(defaultCommission.commission_post_startup_rate)
    : 1

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-background">
        <div className="container mx-auto flex h-16 items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <img
              src="/logo-santaddeo.png"
              alt="SANTADDEO"
              width={140}
              height={32}
            />
          </Link>
          <div className="flex items-center gap-3">
            {isLoggedIn ? (
              <Button asChild>
                <Link href="/dashboard">Dashboard</Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" asChild>
                  <Link href="/auth/login">Accedi</Link>
                </Button>
                <Button asChild>
                  <Link href="/auth/sign-up">Inizia Gratis</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="py-16 bg-gradient-to-b from-muted/40 to-background">
          <div className="container mx-auto px-6 text-center">
            <Badge className="mb-4 bg-primary/10 text-primary border-primary/20 hover:bg-primary/10">
              Hotel Accelerator
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-5xl mb-4 text-balance">
              Massimizza il Revenue della tua Struttura
            </h1>
            <p className="mx-auto max-w-3xl text-lg text-muted-foreground leading-relaxed text-pretty">
              Il nostro team di Revenue Manager esperti, supportato da algoritmi AI avanzati, ottimizza
              le tue tariffe per massimizzare occupazione e fatturato. Scegli il modello di pricing
              piu adatto alla tua struttura.
            </p>
          </div>
        </section>

        {/* Pricing Plans */}
        <section className="py-12">
          <div className="container mx-auto px-6">
            <div className="grid gap-8 lg:grid-cols-2 max-w-5xl mx-auto">
              {/* Fee Plan */}
              <Card className="border-2 border-primary/20">
                <CardHeader>
                  <div className="flex items-center justify-between mb-2">
                    <CardTitle className="text-xl">Piano Fee Mensile</CardTitle>
                    <Badge variant="secondary">Trasparente</Badge>
                  </div>
                  <CardDescription className="leading-relaxed">
                    Costo fisso mensile calcolato in base alla categoria, al tipo e al numero
                    di sistemazioni della tua struttura.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <ul className="space-y-3">
                    <li className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                      <span className="text-sm">Algoritmo di pricing dinamico AI</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                      <span className="text-sm">Aggiornamento automatico delle tariffe</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                      <span className="text-sm">Dashboard analytics avanzata</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                      <span className="text-sm">Configurazione e training iniziale inclusi</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                      <span className="text-sm">Costo prevedibile e trasparente</span>
                    </li>
                  </ul>

                  <Separator />

                  {/* Fee Simulator */}
                  <div className="space-y-4">
                    <h3 className="font-semibold text-sm text-foreground">Simulatore Fee Mensile</h3>

                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Categoria (Stelle)</Label>
                        <Select value={stars} onValueChange={setStars}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1 Stella</SelectItem>
                            <SelectItem value="2">2 Stelle</SelectItem>
                            <SelectItem value="3">3 Stelle</SelectItem>
                            <SelectItem value="4">4 Stelle</SelectItem>
                            <SelectItem value="5">5 Stelle</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Tipo Sistemazione</Label>
                        <Select value={accommodationType} onValueChange={setAccommodationType}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="camere">Camere</SelectItem>
                            <SelectItem value="appartamenti">Appartamenti</SelectItem>
                            <SelectItem value="piazzole">Piazzole</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">N. Sistemazioni</Label>
                        <Select value={numUnits} onValueChange={setNumUnits}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="max-h-60">
                            {unitOptions.map((n) => (
                              <SelectItem key={n} value={String(n)}>
                                {n}
                              </SelectItem>
                            ))}
                            <SelectItem value="oltre300">Oltre 300 &rarr; Prezzo su richiesta</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {isContactRequired ? (
                      <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 text-center space-y-2">
                        <div className="text-xl font-bold text-blue-800">
                          Prezzo su richiesta
                        </div>
                        <div className="text-sm text-blue-600">
                          Per strutture con oltre 300 sistemazioni, contattaci per un preventivo personalizzato.
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg bg-muted/50 p-4 text-center space-y-1">
                        <div className="text-3xl font-bold text-foreground">
                          {monthlyFee.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {"€/mese"}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {yearlyFee.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {"€/anno"}
                        </div>
                      </div>
                    )}
                  </div>

                  {isContactRequired ? (
                    <Button className="w-full" size="lg" variant="outline" asChild>
                      <Link href="/request-info">
                        Contattaci per un Preventivo
                      </Link>
                    </Button>
                  ) : (
                  <Button className="w-full" size="lg" asChild>
                    <Link
                      href={
                        isLoggedIn
                          ? `/accelerator/activate?plan=fee&config_id=${defaultFee?.id || ""}`
                          : "/auth/sign-up"
                      }
                    >
                      Attiva Piano Fee Mensile
                    </Link>
                  </Button>
                  )}
                </CardContent>
              </Card>

              {/* Commission Plan */}
              <Card className="border-2 border-chart-4/30 bg-gradient-to-br from-chart-4/5 to-background">
                <CardHeader>
                  <div className="flex items-center justify-between mb-2">
                    <CardTitle className="text-xl">Piano a Commissione</CardTitle>
                    <Badge className="bg-chart-4 text-white hover:bg-chart-4/90">Performance</Badge>
                  </div>
                  <CardDescription className="leading-relaxed">
                    Commissione sull'incremento di fatturato durante il periodo di start-up,
                    poi una piccola percentuale sul fatturato totale. Paghi solo se cresci.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* How it works */}
                  <div className="space-y-3">
                    <h3 className="font-semibold text-sm text-foreground">Come funziona</h3>

                    <div className="space-y-3 text-sm">
                      <div className="rounded-lg border bg-background p-3">
                        <p className="leading-relaxed">
                          <span className="font-semibold">{"Fase 1 - Start-Up:"}</span>
                          {"Il periodo di start-up corrisponde all'inizio dell'utilizzo del nostro RMS (Revenue Management System). Durante questa fase, applichiamo una commissione calcolata esclusivamente sull'incremento di fatturato rispetto all'anno precedente."}
                        </p>
                      </div>

                      <div className="rounded-lg border bg-background p-3">
                        <p className="leading-relaxed">
                          <span className="font-semibold">{"Fase 2:"}</span>
                          {"Terminato il periodo di start-up, si passa a una percentuale ridotta sul fatturato totale."}
                        </p>
                      </div>

                      <div className="rounded-lg border bg-muted/30 p-3">
                        <p className="leading-relaxed text-muted-foreground">
                          <span className="font-semibold text-foreground">{"Per esempio:"}</span>
                          {" Se il nostro team di esperti valuta che per portare a regime la tua struttura occorrono "}
                          <span className="font-semibold text-foreground">{commYears}</span>
                          {" anni, la commissione verra cosi calcolata: durante i primi "}
                          <span className="font-semibold text-foreground">{commYears}</span>
                          {" anni pagherai una percentuale solo sull'incremento di fatturato generato rispetto all'anno precedente. Dal "}
                          <span className="font-semibold text-foreground">{commYears + 1}{"° anno"}</span>
                          {" in poi, la commissione diventa una piccola percentuale fissa sul fatturato totale."}
                        </p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Commissione personalizzata */}
                  <div className="rounded-lg border-2 border-dashed border-chart-4/30 bg-chart-4/5 p-4 space-y-2">
                    <h4 className="font-semibold text-sm">Commissione personalizzata</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {"La commissione viene calcolata dai nostri esperti Revenue Manager dopo aver terminato la prima configurazione della tua struttura. Le percentuali sono definite su misura in base alle caratteristiche, al mercato di riferimento e al potenziale di crescita della tua struttura."}
                    </p>
                  </div>

                  <ul className="space-y-3">
                    <li className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-chart-4 mt-0.5 shrink-0" />
                      <span className="text-sm">Revenue Manager dedicato alla tua struttura</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-chart-4 mt-0.5 shrink-0" />
                      <span className="text-sm">Algoritmo AI avanzato con ottimizzazione continua</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-chart-4 mt-0.5 shrink-0" />
                      <span className="text-sm">Consulenza strategica e analisi di mercato</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-chart-4 mt-0.5 shrink-0" />
                      <span className="text-sm">{"Modalita Auto-Pilot disponibile"}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-chart-4 mt-0.5 shrink-0" />
                      <span className="text-sm">{"Nessun costo fisso: paghi solo sui risultati"}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-chart-4 mt-0.5 shrink-0" />
                      <span className="text-sm">Report mensili dettagliati sulle performance</span>
                    </li>
                  </ul>

                  <Button className="w-full bg-chart-4 text-white hover:bg-chart-4/90" size="lg" asChild>
                    <Link href={isLoggedIn ? "/upgrade/consultation" : "/request-info"}>
                      Richiedi Consulenza Gratuita
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Offerte speciali - 13/05/2026
            Visibile SOLO se esistono piani attivi non-default in DB. Le card
            mostrano lo sconto rispetto al piano default dello stesso tipo. */}
        {(promoFeePlans.length > 0 || promoCommissionPlans.length > 0) && (
          <section className="py-12 bg-gradient-to-b from-amber-50/40 to-background">
            <div className="container mx-auto px-6">
              <div className="text-center mb-10">
                <Badge className="mb-3 bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100">
                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                  Offerte in corso
                </Badge>
                <h2 className="text-3xl font-bold text-foreground mb-2 text-balance">
                  Piani con condizioni speciali
                </h2>
                <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed text-pretty">
                  Varianti promozionali dei nostri piani standard, attivabili
                  per un periodo limitato. Le condizioni sono garantite per
                  tutta la durata del contratto sottoscritto.
                </p>
              </div>

              <div className="grid gap-6 lg:grid-cols-2 max-w-5xl mx-auto">
                {promoFeePlans.map((plan) => (
                  <PromoFeePlanCard
                    key={plan.id}
                    plan={plan}
                    referenceFee={defaultFee}
                    isLoggedIn={isLoggedIn}
                  />
                ))}
                {promoCommissionPlans.map((plan) => (
                  <PromoCommissionPlanCard
                    key={plan.id}
                    plan={plan}
                    referenceCommission={defaultCommission}
                    isLoggedIn={isLoggedIn}
                  />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Stats */}
        <section className="py-12">
          <div className="container mx-auto px-6">
            <div className="grid gap-6 md:grid-cols-4 max-w-4xl mx-auto">
              <Card>
                <CardContent className="pt-6 text-center">
                  <TrendingUp className="mx-auto h-10 w-10 text-primary mb-3" />
                  <div className="text-2xl font-bold mb-1">+75%</div>
                  <div className="text-sm text-muted-foreground">Revenue medio</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <DollarSign className="mx-auto h-10 w-10 text-chart-2 mb-3" />
                  <div className="text-2xl font-bold mb-1">+18%</div>
                  <div className="text-sm text-muted-foreground">RevPAR medio</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <Zap className="mx-auto h-10 w-10 text-chart-3 mb-3" />
                  <div className="text-2xl font-bold mb-1">-60%</div>
                  <div className="text-sm text-muted-foreground">Tempo gestione tariffe</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <Clock className="mx-auto h-10 w-10 text-chart-4 mb-3" />
                  <div className="text-2xl font-bold mb-1">24/7</div>
                  <div className="text-sm text-muted-foreground">Ottimizzazione automatica</div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Included in both plans */}
        <section className="py-12 bg-muted/30">
          <div className="container mx-auto px-6">
            <h2 className="text-2xl font-bold text-center mb-8 text-foreground">
              Inclusi in entrambi i piani
            </h2>
            <div className="grid gap-6 md:grid-cols-3 max-w-4xl mx-auto">
              <Card>
                <CardContent className="pt-6">
                  <Settings className="h-10 w-10 text-primary mb-4" />
                  <h3 className="font-semibold mb-2">Configurazione Iniziale</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Setup completo della piattaforma con analisi delle tariffe attuali e del mercato di riferimento.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <BarChart3 className="h-10 w-10 text-primary mb-4" />
                  <h3 className="font-semibold mb-2">Dashboard Avanzata</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Monitora occupazione, revenue, ADR, RevPAR e tutte le metriche chiave in tempo reale.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <MessageSquare className="h-10 w-10 text-primary mb-4" />
                  <h3 className="font-semibold mb-2">Assistente AI</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Chat AI integrata per analizzare i dati della tua struttura e ricevere suggerimenti personalizzati.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16">
          <div className="container mx-auto px-6">
            <Card className="bg-foreground text-background max-w-4xl mx-auto">
              <CardContent className="py-12 text-center">
                <h2 className="text-3xl font-bold mb-4 text-balance">
                  Pronto a far crescere il tuo fatturato?
                </h2>
                <p className="text-background/70 mb-8 max-w-2xl mx-auto leading-relaxed">
                  {"Contattaci per una consulenza gratuita. I nostri esperti analizzeranno la tua struttura e ti consiglieranno il piano migliore per le tue esigenze."}
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button size="lg" variant="secondary" asChild>
                    <Link href={isLoggedIn ? "/upgrade/consultation" : "/request-info"}>
                      Prenota Consulenza Gratuita
                    </Link>
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="text-background border-background/30 hover:bg-background/10 bg-transparent"
                    asChild
                  >
                    <Link href={isLoggedIn ? "/dashboard" : "/auth/sign-up"}>
                      {isLoggedIn ? "Torna alla Dashboard" : "Registrati Gratis"}
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}

/* ============================================================================
   PromoFeePlanCard - card piano Fee variante promo (13/05/2026)
   Mostra il piano con simulatore proprio e badge sconto rispetto al default.
   Riusa la stessa formula del piano principale (base * coef * stelle * unita)
   per coerenza nel calcolo. Lo sconto e' calcolato come differenza % del
   fee_base_value della variante rispetto al default.
   ========================================================================== */
interface PromoFeeProps {
  plan: PricingConfig
  referenceFee: PricingConfig | null
  isLoggedIn: boolean
}

function PromoFeePlanCard({ plan, referenceFee, isLoggedIn }: PromoFeeProps) {
  const [stars, setStars] = useState("3")
  const [accommodationType, setAccommodationType] = useState("camere")
  const [numUnits, setNumUnits] = useState("20")
  const isContactRequired = numUnits === "oltre300"

  const monthlyFee = useMemo(() => {
    if (isContactRequired) return 0
    const base = Number(plan.fee_base_value)
    let coefficient = Number(plan.fee_coefficient_camere)
    if (accommodationType === "appartamenti") coefficient = Number(plan.fee_coefficient_appartamenti)
    else if (accommodationType === "piazzole") coefficient = Number(plan.fee_coefficient_piazzole)
    return base * coefficient * Number(stars) * (Number(numUnits) || 0)
  }, [plan, stars, accommodationType, numUnits, isContactRequired])

  const yearlyFee = monthlyFee * 12
  const unitOptions = Array.from({ length: 300 }, (_, i) => i + 1)

  // Sconto stimato (a parita' di parametri stelle+tipo+unita) rispetto al
  // piano default: rapporto fra base*coef della promo e del default.
  const discountLabel = useMemo(() => {
    if (!referenceFee) return null
    const promoBase = Number(plan.fee_base_value) * Number(plan.fee_coefficient_camere)
    const refBase =
      Number(referenceFee.fee_base_value) * Number(referenceFee.fee_coefficient_camere)
    if (refBase <= 0) return null
    const pct = Math.round((1 - promoBase / refBase) * 100)
    if (pct <= 0) return null
    return `-${pct}% sul Fee Mensile`
  }, [plan, referenceFee])

  return (
    <Card className="border-2 border-amber-300/60 bg-gradient-to-br from-amber-50/50 to-background relative overflow-hidden">
      <div className="absolute top-0 right-0">
        <div className="bg-amber-500 text-white text-xs font-bold px-4 py-1 transform rotate-12 translate-x-4 translate-y-3 shadow-md">
          PROMO
        </div>
      </div>
      <CardHeader>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100">
            <Sparkles className="h-3 w-3 mr-1" />
            Offerta speciale
          </Badge>
          {discountLabel && (
            <Badge variant="outline" className="border-amber-400 text-amber-700">
              {discountLabel}
            </Badge>
          )}
        </div>
        <CardTitle className="text-xl">{plan.name}</CardTitle>
        <CardDescription className="leading-relaxed">
          Variante promozionale del piano Fee Mensile. Stesso servizio, prezzo
          ridotto per l&apos;intera durata del contratto.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <h3 className="font-semibold text-sm text-foreground">Simulatore</h3>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Categoria (Stelle)</Label>
              <Select value={stars} onValueChange={setStars}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 Stella</SelectItem>
                  <SelectItem value="2">2 Stelle</SelectItem>
                  <SelectItem value="3">3 Stelle</SelectItem>
                  <SelectItem value="4">4 Stelle</SelectItem>
                  <SelectItem value="5">5 Stelle</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Tipo Sistemazione</Label>
              <Select value={accommodationType} onValueChange={setAccommodationType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="camere">Camere</SelectItem>
                  <SelectItem value="appartamenti">Appartamenti</SelectItem>
                  <SelectItem value="piazzole">Piazzole</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">N. Sistemazioni</Label>
              <Select value={numUnits} onValueChange={setNumUnits}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {unitOptions.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                  <SelectItem value="oltre300">Oltre 300 &rarr; Prezzo su richiesta</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {isContactRequired ? (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-center space-y-1">
              <div className="text-lg font-bold text-amber-800">Prezzo su richiesta</div>
              <div className="text-xs text-amber-700">
                Per strutture con oltre 300 sistemazioni, contattaci per un preventivo.
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-amber-50/70 border border-amber-200 p-4 text-center space-y-1">
              <div className="text-3xl font-bold text-foreground">
                {monthlyFee.toLocaleString("it-IT", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                €/mese
              </div>
              <div className="text-sm text-muted-foreground">
                {yearlyFee.toLocaleString("it-IT", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                €/anno
              </div>
            </div>
          )}
        </div>

        {isContactRequired ? (
          <Button className="w-full" size="lg" variant="outline" asChild>
            <Link href="/request-info">Contattaci per un Preventivo</Link>
          </Button>
        ) : (
          <Button className="w-full bg-amber-600 text-white hover:bg-amber-600/90" size="lg" asChild>
            <Link
              href={
                isLoggedIn
                  ? `/accelerator/activate?plan=fee&config_id=${plan.id}`
                  : "/auth/sign-up"
              }
            >
              Attiva Offerta
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

/* ============================================================================
   PromoCommissionPlanCard - card piano Commissione variante promo (13/05/2026)
   Mostra le aliquote start-up + post-startup del piano e differenze rispetto
   al default. Niente simulatore: la commissione e' negoziata case-by-case.
   ========================================================================== */
interface PromoCommissionProps {
  plan: PricingConfig
  referenceCommission: PricingConfig | null
  isLoggedIn: boolean
}

function PromoCommissionPlanCard({
  plan,
  referenceCommission,
  isLoggedIn,
}: PromoCommissionProps) {
  const commRates = plan.commission_yearly_rates || []
  const commYears = plan.commission_startup_years || commRates.length || 3
  const postRate = Number(plan.commission_post_startup_rate)

  // Etichetta differenza vs default: confrontiamo la media degli yearly_rates
  const diffLabel = useMemo(() => {
    if (!referenceCommission?.commission_yearly_rates?.length) return null
    const avgPromo = commRates.reduce((a, b) => a + b, 0) / Math.max(commRates.length, 1)
    const refRates = referenceCommission.commission_yearly_rates
    const avgRef = refRates.reduce((a, b) => a + b, 0) / Math.max(refRates.length, 1)
    if (avgPromo === avgRef) return null
    const delta = (avgPromo - avgRef).toFixed(1)
    const sign = avgPromo > avgRef ? "+" : ""
    return `${sign}${delta}pt vs standard`
  }, [commRates, referenceCommission])

  return (
    <Card className="border-2 border-amber-300/60 bg-gradient-to-br from-amber-50/50 to-background relative overflow-hidden">
      <div className="absolute top-0 right-0">
        <div className="bg-amber-500 text-white text-xs font-bold px-4 py-1 transform rotate-12 translate-x-4 translate-y-3 shadow-md">
          PROMO
        </div>
      </div>
      <CardHeader>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100">
            <Sparkles className="h-3 w-3 mr-1" />
            Offerta speciale
          </Badge>
          {diffLabel && (
            <Badge variant="outline" className="border-amber-400 text-amber-700">
              {diffLabel}
            </Badge>
          )}
        </div>
        <CardTitle className="text-xl">{plan.name}</CardTitle>
        <CardDescription className="leading-relaxed">
          Variante del piano a commissione con aliquote dedicate per la fase
          di start-up e post-startup.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <h3 className="font-semibold text-sm text-foreground">Aliquote</h3>
          <div className="rounded-lg border bg-background p-3 space-y-2">
            <div className="text-sm font-medium text-foreground">
              Start-up ({commYears} anni) sul solo incremento
            </div>
            <div className="flex flex-wrap gap-2">
              {commRates.map((rate, idx) => (
                <Badge key={idx} variant="secondary" className="bg-amber-100 text-amber-800">
                  Anno {idx + 1}: {rate}%
                </Badge>
              ))}
            </div>
          </div>
          <div className="rounded-lg border bg-background p-3 flex items-center justify-between">
            <div className="text-sm font-medium text-foreground">
              Dal {commYears + 1}° anno sul fatturato totale
            </div>
            <div className="text-lg font-bold text-amber-700">
              {postRate}%
            </div>
          </div>
        </div>

        <Button className="w-full bg-amber-600 text-white hover:bg-amber-600/90" size="lg" asChild>
          <Link href={isLoggedIn ? "/upgrade/consultation" : "/request-info"}>
            Richiedi Consulenza Gratuita
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
