"use client"

import { useState, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Zap,
  TrendingUp,
  AlertCircle,
  Check,
  Building2,
  CreditCard,
  Cpu,
  Settings,
  FileText,
  ExternalLink,
  CheckCircle2,
} from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"

interface Hotel {
  id: string
  name: string
  total_rooms: number
  star_rating?: number
}

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
  hotels: Hotel[]
  defaultFee?: PricingConfig | null
  defaultCommission?: PricingConfig | null
}

export function AcceleratorActivationForm({
  hotels,
  defaultFee,
  defaultCommission,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedPlan = searchParams?.get("plan") ?? null

  const [selectedHotel, setSelectedHotel] = useState<string>("")
  const [planType, setPlanType] = useState<"fixed_fee" | "commission">(
    preselectedPlan === "commission" ? "commission" : "fixed_fee"
  )
  const [algorithmType, setAlgorithmType] = useState<"basic" | "advanced">("basic")
  const [autoPilot, setAutoPilot] = useState(false)
  const [loading, setLoading] = useState(false)
  const [contractAccepted, setContractAccepted] = useState(false)
  const [showContractDialog, setShowContractDialog] = useState(false)
  const [requestSuccess, setRequestSuccess] = useState(false)
  const [successMessage, setSuccessMessage] = useState("")

  const selectedHotelData = hotels.find((h) => h.id === selectedHotel)

  // Fee calculation from DB config
  const monthlyFee = useMemo(() => {
    if (!defaultFee || !selectedHotelData) return 0
    const base = Number(defaultFee.fee_base_value)
    const coefficient = Number(defaultFee.fee_coefficient_camere)
    const rooms = selectedHotelData.total_rooms || 0
    const stars = selectedHotelData.star_rating || 3
    return base * coefficient * stars * rooms
  }, [defaultFee, selectedHotelData])

  // Commission data from DB
  const commYears = defaultCommission?.commission_startup_years || 3
  const commRates = defaultCommission?.commission_yearly_rates || [8, 10, 12]
  const commPostRate = defaultCommission
    ? Number(defaultCommission.commission_post_startup_rate)
    : 1
  const commRatesDisplay =
    commRates.length > 1
      ? `${commRates[0]}-${commRates[commRates.length - 1]}%`
      : `${commRates[0]}%`

  const handleActivate = async () => {
    if (!selectedHotel) return

    setLoading(true)

    try {
      const feePerRoom = defaultFee
        ? Number(defaultFee.fee_base_value) *
          Number(defaultFee.fee_coefficient_camere) *
          (selectedHotelData?.star_rating || 3)
        : 0

      const response = await fetch("/api/accelerator/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotel_id: selectedHotel,
          plan_type: planType,
          algorithm_type: algorithmType,
          auto_pilot: autoPilot,
          pricing_config_id:
            planType === "fixed_fee" ? defaultFee?.id : defaultCommission?.id,
          fixed_fee_per_room: planType === "fixed_fee" ? feePerRoom : null,
          commission_rates: planType === "commission" ? commRates : null,
          commission_startup_years: planType === "commission" ? commYears : null,
          commission_post_startup_rate:
            planType === "commission" ? commPostRate : null,
          contract_accepted: contractAccepted,
          contract_version: "1.0",
        }),
      })

      const data = await response.json()
      
      if (response.ok) {
        // For fee plan, redirect to Stripe checkout
        if (planType === "fixed_fee" && data.checkoutUrl) {
          window.location.href = data.checkoutUrl
        } else if (planType === "commission") {
          // For commission plan, show success message
          setRequestSuccess(true)
          setSuccessMessage(data.message || "Richiesta inviata con successo!")
        } else {
          router.push("/accelerator/dashboard")
        }
      } else {
        alert(`Errore durante l'attivazione: ${data.error || "Errore sconosciuto"}`)
      }
    } catch {
      alert("Errore durante l'attivazione. Riprova.")
    } finally {
      setLoading(false)
    }
  }

  // Show success screen for commission requests
  if (requestSuccess) {
    return (
      <Card className="border-2 border-green-500/20 bg-gradient-to-br from-green-50 to-background dark:from-green-950/20">
        <CardContent className="pt-8 pb-8 text-center space-y-6">
          <div className="flex justify-center">
            <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-4">
              <CheckCircle2 className="h-12 w-12 text-green-600" />
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">Richiesta Inviata!</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              {successMessage}
            </p>
          </div>
          <div className="bg-muted/50 rounded-lg p-4 max-w-md mx-auto text-left space-y-3">
            <h3 className="font-semibold">Prossimi passi:</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                <span>Riceverai una email di conferma</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                <span>Un nostro Revenue Manager ti contattera entro 24-48 ore</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                <span>Definiremo insieme le percentuali personalizzate</span>
              </li>
            </ul>
          </div>
          <Button onClick={() => router.push("/dashboard")} className="mt-4">
            Torna alla Dashboard
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Step 1: Seleziona Struttura */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
              1
            </div>
            <div>
              <CardTitle className="text-lg">Seleziona Struttura</CardTitle>
              <CardDescription>
                Scegli la struttura per cui attivare Hotel Accelerator
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Label className="text-sm text-muted-foreground">Struttura</Label>
            <Select value={selectedHotel} onValueChange={setSelectedHotel}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Seleziona una struttura" />
              </SelectTrigger>
              <SelectContent>
                {hotels.map((hotel) => (
                  <SelectItem key={hotel.id} value={hotel.id}>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {hotel.name} ({hotel.total_rooms} camere)
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedHotelData && (
              <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {selectedHotelData.name}
                </span>{" "}
                - {selectedHotelData.total_rooms} camere
                {selectedHotelData.star_rating &&
                  ` - ${selectedHotelData.star_rating} stelle`}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Piano di Pagamento */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
              2
            </div>
            <div>
              <CardTitle className="text-lg">Piano di Pagamento</CardTitle>
              <CardDescription>
                Scegli la modalita di pagamento piu adatta alle tue esigenze
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={planType}
            onValueChange={(v) =>
              setPlanType(v as "fixed_fee" | "commission")
            }
            className="space-y-4"
          >
            {/* Fee Plan */}
            <div
              className={`rounded-lg border-2 p-4 transition-colors ${
                planType === "fixed_fee"
                  ? "border-primary bg-primary/5"
                  : "border-border"
              }`}
            >
              <div className="flex items-start gap-3">
                <RadioGroupItem value="fixed_fee" id="fixed_fee" className="mt-1" />
                <div className="flex-1 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="fixed_fee"
                      className="font-semibold cursor-pointer text-base"
                    >
                      <CreditCard className="inline h-4 w-4 mr-2" />
                      {defaultFee?.name || "Fee Mensile"}
                    </Label>
                    <Badge variant="secondary">Trasparente</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Costo fisso mensile calcolato in base alla categoria, al tipo e al
                    numero di sistemazioni della tua struttura.
                  </p>
                  <ul className="space-y-1.5 text-sm">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-primary shrink-0" />
                      <span>Algoritmo di pricing dinamico AI</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-primary shrink-0" />
                      <span>Aggiornamento automatico delle tariffe</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-primary shrink-0" />
                      <span>Dashboard analytics avanzata</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-primary shrink-0" />
                      <span>Costo prevedibile e trasparente</span>
                    </li>
                  </ul>

                  {planType === "fixed_fee" && selectedHotelData && (
                    <div className="rounded-lg bg-muted/50 p-4 text-center space-y-1">
                      <div className="text-2xl font-bold text-foreground">
                        {monthlyFee.toLocaleString("it-IT", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{" "}
                        {"€/mese"}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {(monthlyFee * 12).toLocaleString("it-IT", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{" "}
                        {"€/anno"}
                      </div>
                    </div>
                  )}

                  {planType === "fixed_fee" && !selectedHotelData && (
                    <div className="rounded-lg bg-muted/50 p-3 text-center text-sm text-muted-foreground">
                      Seleziona una struttura per vedere il prezzo
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Commission Plan */}
            <div
              className={`rounded-lg border-2 p-4 transition-colors ${
                planType === "commission"
                  ? "border-chart-4 bg-chart-4/5"
                  : "border-border"
              }`}
            >
              <div className="flex items-start gap-3">
                <RadioGroupItem
                  value="commission"
                  id="commission"
                  className="mt-1"
                />
                <div className="flex-1 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="commission"
                      className="font-semibold cursor-pointer text-base"
                    >
                      <TrendingUp className="inline h-4 w-4 mr-2" />
                      {defaultCommission?.name || "Commissione su Incremento"}
                    </Label>
                    <Badge className="bg-chart-4 text-white hover:bg-chart-4/90">
                      Performance
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Commissione sull'incremento di fatturato durante il periodo di
                    start-up, poi una piccola percentuale sul fatturato totale.
                  </p>

                  {planType === "commission" && (
                    <>
                      <div className="space-y-2 text-sm">
                        <div className="rounded-lg border bg-background p-3">
                          <p className="leading-relaxed">
                            <span className="font-semibold">
                              {"Fase 1 - Start-Up (" + commYears + " anni):"}
                            </span>{" "}
                            {
                              "Commissione calcolata esclusivamente sull'incremento di fatturato rispetto all'anno precedente."
                            }
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {commRates.map((rate, i) => (
                              <Badge key={i} variant="outline">
                                {"Anno " + (i + 1) + ": " + rate + "%"}
                              </Badge>
                            ))}
                          </div>
                        </div>

                        <div className="rounded-lg border bg-background p-3">
                          <p className="leading-relaxed">
                            <span className="font-semibold">
                              {"Fase 2 (dal " + (commYears + 1) + "° anno):"}
                            </span>{" "}
                            {"Percentuale ridotta del "}
                            <span className="font-semibold">
                              {commPostRate + "%"}
                            </span>
                            {" sul fatturato totale."}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-lg border-2 border-dashed border-chart-4/30 bg-chart-4/5 p-3 space-y-1">
                        <h4 className="font-semibold text-sm">
                          Commissione personalizzata
                        </h4>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {
                            "Le percentuali definitive vengono calcolate dai nostri esperti Revenue Manager dopo la configurazione iniziale della tua struttura, su misura in base alle caratteristiche e al potenziale di crescita."
                          }
                        </p>
                      </div>
                    </>
                  )}

                  <ul className="space-y-1.5 text-sm">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-chart-4 shrink-0" />
                      <span>Revenue Manager dedicato</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-chart-4 shrink-0" />
                      <span>Consulenza strategica e analisi di mercato</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-chart-4 shrink-0" />
                      <span>Nessun costo fisso: paghi solo sui risultati</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-chart-4 shrink-0" />
                      <span>Report mensili dettagliati</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Step 3: Algoritmo */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
              3
            </div>
            <div>
              <CardTitle className="text-lg">Algoritmo di Pricing</CardTitle>
              <CardDescription>
                Scegli il livello di sofisticazione dell'algoritmo
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={algorithmType}
            onValueChange={(v) => setAlgorithmType(v as "basic" | "advanced")}
            className="space-y-3"
          >
            <div
              className={`rounded-lg border-2 p-4 transition-colors ${
                algorithmType === "basic"
                  ? "border-primary bg-primary/5"
                  : "border-border"
              }`}
            >
              <div className="flex items-start gap-3">
                <RadioGroupItem value="basic" id="basic" className="mt-1" />
                <div className="flex-1">
                  <Label
                    htmlFor="basic"
                    className="font-semibold cursor-pointer flex items-center gap-2 text-base"
                  >
                    <Zap className="h-4 w-4 text-primary" />
                    Algoritmo Base
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    Basato sull'occupazione e sulla domanda. Consigliato per
                    strutture fino a 30 camere.
                  </p>
                </div>
              </div>
            </div>

            <div
              className={`rounded-lg border-2 p-4 transition-colors ${
                algorithmType === "advanced"
                  ? "border-primary bg-primary/5"
                  : "border-border"
              }`}
            >
              <div className="flex items-start gap-3">
                <RadioGroupItem value="advanced" id="advanced" className="mt-1" />
                <div className="flex-1">
                  <Label
                    htmlFor="advanced"
                    className="font-semibold cursor-pointer flex items-center gap-2 text-base"
                  >
                    <Cpu className="h-4 w-4 text-primary" />
                    Algoritmo Avanzato
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    Modello matematico complesso con AI, analisi predittiva e
                    fattori multipli. Ideale per grandi strutture.
                  </p>
                  {algorithmType === "advanced" && planType === "fixed_fee" && (
                    <Alert className="mt-3">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        {"L'algoritmo avanzato e consigliato con il piano a commissione per massimizzare i risultati."}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </div>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Step 4: Auto-Pilot */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
              4
            </div>
            <div>
              <CardTitle className="text-lg">Modalita Auto-Pilot</CardTitle>
              <CardDescription>
                Applica automaticamente le raccomandazioni di prezzo al tuo PMS
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-1">
              <Label htmlFor="auto-pilot" className="font-semibold flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Attiva Auto-Pilot
              </Label>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Le tariffe verranno aggiornate automaticamente ogni giorno nel tuo PMS.
              </p>
            </div>
            <Switch
              id="auto-pilot"
              checked={autoPilot}
              onCheckedChange={setAutoPilot}
            />
          </div>

          {autoPilot && (
            <Alert className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-sm leading-relaxed">
                {planType === "commission"
                  ? "Con il piano a commissione, l'Auto-Pilot richiede l'accettazione delle condizioni operative proposte dal Revenue Manager."
                  : "Con l'Auto-Pilot attivo, le tariffe calcolate dall'algoritmo verranno inviate automaticamente al tuo PMS. Potrai sempre disattivarlo dalla dashboard."}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Summary & Activate */}
      <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-background">
        <CardHeader>
          <CardTitle className="text-lg">Riepilogo Attivazione</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Struttura</span>
              <span className="font-medium">
                {selectedHotelData ? selectedHotelData.name : "Non selezionata"}
              </span>
            </div>
            <Separator />
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Piano</span>
              <Badge
                className={
                  planType === "fixed_fee"
                    ? "bg-primary text-primary-foreground"
                    : "bg-chart-4 text-white"
                }
              >
                {planType === "fixed_fee" ? "Fee Mensile" : "Commissione"}
              </Badge>
            </div>
            <Separator />
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Algoritmo</span>
              <Badge variant="outline">
                {algorithmType === "basic" ? "Base" : "Avanzato"}
              </Badge>
            </div>
            <Separator />
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Auto-Pilot</span>
              <Badge variant={autoPilot ? "default" : "outline"}>
                {autoPilot ? "Attivo" : "Disattivo"}
              </Badge>
            </div>

            {planType === "fixed_fee" && selectedHotelData && (
              <>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    Costo mensile
                  </span>
                  <span className="text-2xl font-bold text-primary">
                    {monthlyFee.toLocaleString("it-IT", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    {"€"}
                  </span>
                </div>
              </>
            )}
            {planType === "commission" && (
              <>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    Commissione start-up
                  </span>
                  <span className="text-2xl font-bold text-chart-4">
                    {commRatesDisplay}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Contract Acceptance */}
          <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
            <div className="flex items-start gap-3">
              <Checkbox
                id="contract-accept"
                checked={contractAccepted}
                onCheckedChange={(checked) => setContractAccepted(checked === true)}
                className="mt-0.5"
              />
              <div className="space-y-1">
                <Label htmlFor="contract-accept" className="text-sm cursor-pointer leading-relaxed">
                  Ho letto e accetto il{" "}
                  <Dialog open={showContractDialog} onOpenChange={setShowContractDialog}>
                    <DialogTrigger asChild>
                      <button type="button" className="text-primary underline hover:no-underline inline-flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        Contratto di Abbonamento
                      </button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[80vh]">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                          <FileText className="h-5 w-5" />
                          Contratto Piano Abbonamento Mensile
                        </DialogTitle>
                        <DialogDescription>
                          Termini e Condizioni di Utilizzo della Piattaforma Santaddeo
                        </DialogDescription>
                      </DialogHeader>
                      <ScrollArea className="h-[60vh] pr-4">
                        <div className="space-y-4 text-sm">
                          <section>
                            <h3 className="font-semibold text-base mb-2">1. Oggetto del servizio</h3>
                            <p className="text-muted-foreground leading-relaxed">
                              Santaddeo e una piattaforma software progettata per supportare le strutture ricettive nelle attivita di: analisi dei dati di prenotazione, revenue management, monitoraggio performance, analisi dei prezzi e dei canali di vendita, suggerimenti di pricing e strategie commerciali.
                            </p>
                          </section>
                          <section>
                            <h3 className="font-semibold text-base mb-2">2. Modalita di attivazione</h3>
                            <p className="text-muted-foreground leading-relaxed">
                              Il servizio viene attivato al momento della registrazione dell'Hotel sulla piattaforma Santaddeo e dell'accettazione dei presenti termini. L'Hotel si impegna a fornire dati corretti e aggiornati per consentire il corretto funzionamento della piattaforma.
                            </p>
                          </section>
                          <section>
                            <h3 className="font-semibold text-base mb-2">3. Corrispettivo</h3>
                            <p className="text-muted-foreground leading-relaxed">
                              L'utilizzo della piattaforma Santaddeo prevede un canone mensile secondo il piano selezionato. Il pagamento avviene mensilmente tramite il sistema di pagamento integrato nella piattaforma, con rinnovo automatico salvo disdetta. Il mancato pagamento comporta la sospensione del servizio.
                            </p>
                          </section>
                          <section>
                            <h3 className="font-semibold text-base mb-2">4. Integrazione con PMS e sistemi terzi</h3>
                            <p className="text-muted-foreground leading-relaxed">
                              Per il corretto funzionamento della piattaforma puo essere necessario collegare Santaddeo ai sistemi gestionali della struttura. Qualora il PMS o altri software terzi richiedano costi di integrazione, attivazione o utilizzo delle API, tali costi sono interamente a carico dell'Hotel.
                            </p>
                          </section>
                          <section>
                            <h3 className="font-semibold text-base mb-2">5. Natura del servizio</h3>
                            <p className="text-muted-foreground leading-relaxed">
                              Santaddeo fornisce strumenti di analisi, suggerimenti e supporto decisionale. Le decisioni finali relative a prezzi, disponibilita, politiche commerciali e distribuzione sui canali rimangono esclusiva responsabilita dell'Hotel. Santaddeo non garantisce risultati economici specifici.
                            </p>
                          </section>
                          <section>
                            <h3 className="font-semibold text-base mb-2">6. Sicurezza dei dati</h3>
                            <p className="text-muted-foreground leading-relaxed">
                              Santaddeo adotta misure tecniche e organizzative adeguate per garantire sicurezza delle informazioni, protezione dei dati e integrita dei sistemi. Tuttavia nessun sistema informatico puo garantire sicurezza assoluta.
                            </p>
                          </section>
                          <section>
                            <h3 className="font-semibold text-base mb-2">7. Trattamento dei dati</h3>
                            <p className="text-muted-foreground leading-relaxed">
                              L'Hotel autorizza Santaddeo a trattare i dati necessari all'erogazione del servizio. Il trattamento avviene nel rispetto della normativa GDPR.
                            </p>
                          </section>
                          <section>
                            <h3 className="font-semibold text-base mb-2">8. Recesso</h3>
                            <p className="text-muted-foreground leading-relaxed">
                              L'Hotel puo disdire il servizio in qualsiasi momento. La disdetta ha effetto al termine del mese di abbonamento in corso.
                            </p>
                          </section>
                          <section>
                            <h3 className="font-semibold text-base mb-2">9. Legge applicabile</h3>
                            <p className="text-muted-foreground leading-relaxed">
                              Il presente contratto e regolato dalla legge italiana.
                            </p>
                          </section>
                        </div>
                      </ScrollArea>
                      <div className="flex justify-end gap-2 pt-4 border-t">
                        <Button variant="outline" onClick={() => setShowContractDialog(false)}>
                          Chiudi
                        </Button>
                        <Button onClick={() => {
                          setContractAccepted(true)
                          setShowContractDialog(false)
                        }}>
                          Accetta Contratto
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                  {" "}e i Termini e Condizioni del servizio Hotel Accelerator.
                </Label>
                <p className="text-xs text-muted-foreground">
                  Versione contratto: 1.0 - 4Bid S.r.l.
                </p>
              </div>
            </div>
          </div>

          <Button
            className="w-full mt-4"
            size="lg"
            onClick={handleActivate}
            disabled={!selectedHotel || loading || !contractAccepted}
          >
            {loading
              ? "Attivazione in corso..."
              : planType === "commission" 
                ? "Invia Richiesta"
                : "Attiva Hotel Accelerator"}
          </Button>

          {!contractAccepted && selectedHotel && (
            <p className="text-xs text-center text-amber-600 dark:text-amber-400">
              Devi accettare il contratto per procedere
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
