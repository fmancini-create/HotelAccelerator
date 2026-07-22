"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import {
  Save,
  RotateCcw,
  Info,
  Target,
  Lock,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react"
import Link from "next/link"

interface KpiThreshold {
  id?: string
  hotel_id: string | null
  metric_key: string
  green_min: number
  green_max: number | null
  orange_min: number
  red_min: number
  is_inverted: boolean
  display_name: string
  description: string
  unit: string
}

// All available KPI metric definitions with their defaults
const KPI_DEFINITIONS: {
  metric_key: string
  display_name: string
  description: string
  unit: string
  is_inverted: boolean
  default_green_min: number
  default_green_max: number | null
  default_orange_min: number
  default_red_min: number
  category: string
}[] = [
  {
    metric_key: "occupancy",
    display_name: "Tasso di Occupazione",
    description: "Percentuale di camere occupate. Valori alti indicano una buona domanda.",
    unit: "%",
    is_inverted: false,
    default_green_min: 75,
    default_green_max: null,
    default_orange_min: 50,
    default_red_min: 0,
    category: "Performance",
  },
  {
    metric_key: "revpar",
    display_name: "RevPAR",
    description: "Revenue Per Available Room. Misura l'efficienza complessiva combinando occupazione e tariffa media.",
    unit: "\u20ac",
    is_inverted: false,
    default_green_min: 80,
    default_green_max: null,
    default_orange_min: 50,
    default_red_min: 0,
    category: "Performance",
  },
  {
    metric_key: "revpor",
    display_name: "RevPOR",
    description: "Revenue Per Occupied Room. Revenue medio per camera occupata.",
    unit: "\u20ac",
    is_inverted: false,
    default_green_min: 100,
    default_green_max: null,
    default_orange_min: 70,
    default_red_min: 0,
    category: "Performance",
  },
  {
    metric_key: "cancellation_rate",
    display_name: "Tasso Cancellazione",
    description: "Percentuale di cancellazioni. Valori bassi sono migliori.",
    unit: "%",
    is_inverted: true,
    default_green_min: 15,
    default_green_max: null,
    default_orange_min: 30,
    default_red_min: 50,
    category: "Rischio",
  },
  {
    metric_key: "intermediated_revenue_pct",
    display_name: "% Revenue Intermediato",
    description: "Percentuale di revenue da OTA (Booking, Expedia, etc). Valori bassi indicano migliore disintermediazione.",
    unit: "%",
    is_inverted: true,
    default_green_min: 40,
    default_green_max: null,
    default_orange_min: 60,
    default_red_min: 80,
    category: "Distribuzione",
  },
  {
    metric_key: "pickup_booking_days",
    display_name: "Pick Up Prenotazioni",
    description: "Giorni medi di anticipo delle prenotazioni rispetto al check-in.",
    unit: "gg",
    is_inverted: false,
    default_green_min: 30,
    default_green_max: null,
    default_orange_min: 14,
    default_red_min: 0,
    category: "Trend",
  },
  {
    metric_key: "pickup_cancellation_days",
    display_name: "Pick Up Cancellazioni",
    description: "Giorni medi di anticipo delle cancellazioni rispetto al check-in. Valori alti sono migliori (cancellazioni lontane).",
    unit: "gg",
    is_inverted: false,
    default_green_min: 14,
    default_green_max: null,
    default_orange_min: 7,
    default_red_min: 0,
    category: "Trend",
  },
  {
    metric_key: "inactivity_days_close",
    display_name: "Data Ferma (< 2 settimane)",
    description: "Soglia in giorni senza prenotazioni per date entro 14 giorni. Default: 1 giorno senza attivita = allarme.",
    unit: "gg",
    is_inverted: true,
    default_green_min: 0,
    default_green_max: null,
    default_orange_min: 1,
    default_red_min: 2,
    category: "Calendario",
  },
  {
    metric_key: "inactivity_days_mid",
    display_name: "Data Ferma (2-12 settimane)",
    description: "Soglia in giorni senza prenotazioni per date tra 2 e 12 settimane. Default: 4-7 giorni senza attivita = allarme.",
    unit: "gg",
    is_inverted: true,
    default_green_min: 0,
    default_green_max: null,
    default_orange_min: 4,
    default_red_min: 7,
    category: "Calendario",
  },
  {
    metric_key: "inactivity_days_far",
    display_name: "Data Ferma (> 3 mesi)",
    description: "Soglia in giorni senza prenotazioni per date oltre 3 mesi. Default: 14-30 giorni senza attivita = allarme.",
    unit: "gg",
    is_inverted: true,
    default_green_min: 0,
    default_green_max: null,
    default_orange_min: 14,
    default_red_min: 30,
    category: "Calendario",
  },
]

interface FormValues {
  [metricKey: string]: {
    green_min: number
    green_max: number | null
    orange_min: number
    red_min: number
    is_inverted: boolean
    enabled: boolean
  }
}

export default function KpiSettingsPage() {
  const router = useRouter()
  const [hotelId, setHotelId] = useState<string | null>(null)
  const [hotelName, setHotelName] = useState("")
  const [isAccelerator, setIsAccelerator] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [globalThresholds, setGlobalThresholds] = useState<Record<string, KpiThreshold>>({})
  const [customThresholds, setCustomThresholds] = useState<Record<string, KpiThreshold>>({})
  const [formValues, setFormValues] = useState<FormValues>({})

  // Load data
  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      // Get selected hotel
      const hotelRes = await fetch("/api/ui/selected-hotel")
      if (!hotelRes.ok) {
        if (hotelRes.status === 401) {
          router.push("/auth/login")
          return
        }
        setIsLoading(false)
        return
      }
      const hotelData = await hotelRes.json()
      const hId = hotelData.hotel?.id
      if (!hId) {
        // Hotel not selected yet - stay on page with empty state
        setIsLoading(false)
        return
      }
      setHotelId(hId)
      setHotelName(hotelData.hotel?.name || "")

      // Check subscription - SuperAdmin always has access
      const meRes = await fetch("/api/ui/me")
      if (meRes.ok) {
        const meData = await meRes.json()
        if (meData.isSuperAdmin) {
          setIsAccelerator(true)
        } else {
          const subRes = await fetch(`/api/ui/accelerator/subscription?hotelId=${hId}`)
          if (subRes.ok) {
            const subData = await subRes.json()
            const hasActiveSubscription = subData.subscriptions?.some((s: any) => s.is_active === true) ?? false
            setIsAccelerator(hasActiveSubscription)
          }
        }
      }

      // Get global (system) thresholds
      const globalRes = await fetch(`/api/kpi-thresholds?hotel_id=${hId}&mode=system`)
      if (globalRes.ok) {
        const globalData = await globalRes.json()
        setGlobalThresholds(globalData.thresholds || {})
      }

      // Get custom thresholds
      const customRes = await fetch(`/api/kpi-thresholds?hotel_id=${hId}&mode=custom`)
      if (customRes.ok) {
        const customData = await customRes.json()
        // Extract only hotel-specific ones
        const customOnly: Record<string, KpiThreshold> = {}
        for (const [key, val] of Object.entries(customData.thresholds || {})) {
          const t = val as KpiThreshold
          if (t.hotel_id === hId) {
            customOnly[key] = t
          }
        }
        setCustomThresholds(customOnly)
      }
    } catch {
      // fallback
    }
    setIsLoading(false)
  }, [router])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Initialize form values when data loads
  useEffect(() => {
    const values: FormValues = {}
    for (const def of KPI_DEFINITIONS) {
      const custom = customThresholds[def.metric_key]
      const global = globalThresholds[def.metric_key] as KpiThreshold | undefined
      if (custom) {
        values[def.metric_key] = {
          green_min: custom.green_min,
          green_max: custom.green_max,
          orange_min: custom.orange_min,
          red_min: custom.red_min,
          is_inverted: custom.is_inverted,
          enabled: true,
        }
      } else {
        values[def.metric_key] = {
          green_min: global?.green_min ?? def.default_green_min,
          green_max: global?.green_max ?? def.default_green_max,
          orange_min: global?.orange_min ?? def.default_orange_min,
          red_min: global?.red_min ?? def.default_red_min,
          is_inverted: global?.is_inverted ?? def.is_inverted,
          enabled: false,
        }
      }
    }
    setFormValues(values)
  }, [globalThresholds, customThresholds])

  const updateField = (metricKey: string, field: string, value: number | boolean | null) => {
    setFormValues((prev) => ({
      ...prev,
      [metricKey]: {
        ...prev[metricKey],
        [field]: value,
      },
    }))
    setSaveSuccess(false)
  }

  const toggleEnabled = (metricKey: string) => {
    setFormValues((prev) => ({
      ...prev,
      [metricKey]: {
        ...prev[metricKey],
        enabled: !prev[metricKey]?.enabled,
      },
    }))
    setSaveSuccess(false)
  }

  const resetToDefaults = (metricKey: string) => {
    const def = KPI_DEFINITIONS.find((d) => d.metric_key === metricKey)
    const global = globalThresholds[metricKey] as KpiThreshold | undefined
    if (def) {
      setFormValues((prev) => ({
        ...prev,
        [metricKey]: {
          green_min: global?.green_min ?? def.default_green_min,
          green_max: global?.green_max ?? def.default_green_max,
          orange_min: global?.orange_min ?? def.default_orange_min,
          red_min: global?.red_min ?? def.default_red_min,
          is_inverted: global?.is_inverted ?? def.is_inverted,
          enabled: false,
        },
      }))
      setSaveSuccess(false)
    }
  }

  const handleSave = async () => {
    if (!hotelId) return
    setIsSaving(true)
    setSaveSuccess(false)

    try {
      for (const def of KPI_DEFINITIONS) {
        const values = formValues[def.metric_key]
        if (!values) continue

        if (values.enabled) {
          // Save custom threshold
          await fetch("/api/kpi-thresholds", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              hotel_id: hotelId,
              metric_key: def.metric_key,
              green_min: values.green_min,
              // FIX 06/05/2026: green_max e' nullable (modalita' "soglia
              // singola"). Quando l'utente attiva il toggle "intervallo"
              // diventa il limite superiore del range "ottimale".
              green_max: values.green_max,
              orange_min: values.orange_min,
              red_min: values.red_min,
              // FIX: in modalita' range NON ha senso parlare di
              // "is_inverted" (il range e' definito esplicitamente).
              // Forziamo a false per evitare confusioni nel calcolo.
              is_inverted: values.green_max && values.green_max > 0 ? false : values.is_inverted,
            }),
          })
        } else {
          // Delete custom threshold (revert to system)
          await fetch(`/api/kpi-thresholds?hotel_id=${hotelId}&metric_key=${def.metric_key}`, {
            method: "DELETE",
          })
        }
      }
      setSaveSuccess(true)
      // Reload to refresh custom thresholds state
      await loadData()
    } catch {
      // handle error
    }
    setIsSaving(false)
  }

  // Group KPIs by category
  const categories = [...new Set(KPI_DEFINITIONS.map((d) => d.category))]

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-4xl p-6">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-4 w-72 mb-6" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!isAccelerator) {
    return (
      <div className="container mx-auto max-w-4xl p-6">
        <Card>
          <CardContent className="py-16 text-center">
            <Lock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">KPI Personalizzati non disponibili</h2>
            <p className="text-muted-foreground max-w-md mx-auto mb-6">
              La personalizzazione dei KPI e delle soglie di avviso e' disponibile esclusivamente per gli utenti
              con piano <strong>Accelerator</strong> attivo. Attiva Accelerator per definire obiettivi e metriche su misura per la tua struttura.
            </p>
            <Button asChild>
              <Link href="/accelerator">Scopri Accelerator</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-4xl p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <Target className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Imposta i tuoi KPI</h1>
            <p className="text-muted-foreground">
              Personalizza le soglie per{" "}
              <strong>{hotelName}</strong>. Attiva i KPI che vuoi personalizzare e imposta i valori target.
            </p>
          </div>
        </div>
      </div>

          {/* Info banner */}
          <Card className="mb-6 border-blue-200 bg-blue-50">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">Come funzionano i KPI personalizzati</p>
                  <p>
                    I KPI che non personalizzi useranno i{" "}
                    <strong>valori di sistema</strong> (benchmark di strutture simili).
                    Attiva lo switch accanto a ogni KPI per impostare soglie specifiche per la tua struttura.
                    Le soglie determinano il colore del semaforo nella dashboard: verde (target raggiunto), arancione (attenzione), rosso (critico).
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* KPI Cards by Category */}
          {categories.map((category) => (
            <div key={category} className="mb-8">
              <h2 className="text-lg font-semibold mb-4 text-muted-foreground uppercase tracking-wide text-sm">
                {category}
              </h2>
              <div className="space-y-4">
                {KPI_DEFINITIONS.filter((d) => d.category === category).map((def) => {
                  const values = formValues[def.metric_key]
                  if (!values) return null
                  const isCustomized = values.enabled

                  return (
                    <Card
                      key={def.metric_key}
                      className={`transition-all ${isCustomized ? "border-primary/50 shadow-sm" : "border-border"}`}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Switch
                              checked={isCustomized}
                              onCheckedChange={() => toggleEnabled(def.metric_key)}
                            />
                            <div>
                              <CardTitle className="text-base flex items-center gap-2">
                                {def.display_name}
                                <HoverCard>
                                  <HoverCardTrigger>
                                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                                  </HoverCardTrigger>
                                  <HoverCardContent className="w-72">
                                    <p className="text-sm">{def.description}</p>
                                  </HoverCardContent>
                                </HoverCard>
                              </CardTitle>
                              <CardDescription>
                                {isCustomized ? "Soglie personalizzate attive" : "Usa soglie di sistema (benchmark)"}
                              </CardDescription>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {isCustomized && (
                              <Badge variant="outline" className="text-primary border-primary/30">
                                Personalizzato
                              </Badge>
                            )}
                            {isCustomized && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => resetToDefaults(def.metric_key)}
                                title="Ripristina valori di sistema"
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      {isCustomized && (
                        <CardContent className="pt-0">
                          {/* Toggle: modalita' "soglia singola" vs "intervallo (range)".
                              Es. revenue intermediato deve stare TRA il 45% e il 60% (range);
                              occupazione deve essere SOPRA il 75% (soglia singola). */}
                          <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2 mb-4">
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={values.green_max !== null && values.green_max > 0}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    // Attivo intervallo: green_max default a green_min + 15
                                    updateField(
                                      def.metric_key,
                                      "green_max",
                                      Math.max(values.green_min + 15, 50),
                                    )
                                  } else {
                                    updateField(def.metric_key, "green_max", null)
                                  }
                                }}
                              />
                              <Label className="text-sm font-medium cursor-pointer">
                                Usa intervallo (range)
                              </Label>
                              <HoverCard>
                                <HoverCardTrigger>
                                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                                </HoverCardTrigger>
                                <HoverCardContent className="w-80">
                                  <p className="text-sm">
                                    <strong>Soglia singola</strong>: il KPI e&apos; verde sopra (o sotto, se invertito) un certo valore. Esempio: occupazione sopra il 75%.
                                  </p>
                                  <p className="text-sm mt-2">
                                    <strong>Intervallo</strong>: il KPI e&apos; verde solo se sta DENTRO un range. Esempio: revenue intermediato tra il 45% e il 60%, fuori e&apos; arancione/rosso.
                                  </p>
                                </HoverCardContent>
                              </HoverCard>
                            </div>
                          </div>

                          {values.green_max !== null && values.green_max > 0 ? (
                            // ==== MODALITA' RANGE ====
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                              {/* Verde da */}
                              <div className="space-y-2">
                                <Label className="flex items-center gap-2 text-sm">
                                  <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
                                  Verde da ({def.unit})
                                </Label>
                                <Input
                                  type="number"
                                  value={values.green_min}
                                  onChange={(e) =>
                                    updateField(def.metric_key, "green_min", parseFloat(e.target.value) || 0)
                                  }
                                  className="border-green-200 focus:border-green-400"
                                />
                                <p className="text-xs text-muted-foreground">
                                  Limite inferiore del range &quot;ottimale&quot;
                                </p>
                              </div>

                              {/* Verde a */}
                              <div className="space-y-2">
                                <Label className="flex items-center gap-2 text-sm">
                                  <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
                                  Verde a ({def.unit})
                                </Label>
                                <Input
                                  type="number"
                                  value={values.green_max ?? 0}
                                  onChange={(e) =>
                                    updateField(def.metric_key, "green_max", parseFloat(e.target.value) || 0)
                                  }
                                  className="border-green-200 focus:border-green-400"
                                />
                                <p className="text-xs text-muted-foreground">
                                  Limite superiore del range &quot;ottimale&quot;
                                </p>
                              </div>

                              {/* Tolleranza arancione */}
                              <div className="space-y-2">
                                <Label className="flex items-center gap-2 text-sm">
                                  <span className="w-3 h-3 rounded-full bg-orange-500 inline-block" />
                                  Tolleranza arancione ({def.unit})
                                </Label>
                                <Input
                                  type="number"
                                  value={values.orange_min}
                                  onChange={(e) =>
                                    updateField(def.metric_key, "orange_min", parseFloat(e.target.value) || 0)
                                  }
                                  className="border-orange-200 focus:border-orange-400"
                                />
                                <p className="text-xs text-muted-foreground">
                                  Sotto questo valore: rosso. Tra qui e &quot;Verde da&quot;: arancione.
                                </p>
                              </div>
                            </div>
                          ) : (
                            // ==== MODALITA' SOGLIA SINGOLA ====
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                              {/* Green threshold */}
                              <div className="space-y-2">
                                <Label className="flex items-center gap-2 text-sm">
                                  <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
                                  {def.is_inverted ? `Verde (${def.unit} max)` : `Verde (${def.unit} min)`}
                                </Label>
                                <Input
                                  type="number"
                                  value={values.green_min}
                                  onChange={(e) =>
                                    updateField(def.metric_key, "green_min", parseFloat(e.target.value) || 0)
                                  }
                                  className="border-green-200 focus:border-green-400"
                                />
                                <p className="text-xs text-muted-foreground">
                                  {def.is_inverted
                                    ? "Valore sotto il quale il KPI e' verde"
                                    : "Valore sopra il quale il KPI e' verde"}
                                </p>
                              </div>

                              {/* Orange threshold */}
                              <div className="space-y-2">
                                <Label className="flex items-center gap-2 text-sm">
                                  <span className="w-3 h-3 rounded-full bg-orange-500 inline-block" />
                                  {def.is_inverted ? `Arancione (${def.unit} max)` : `Arancione (${def.unit} min)`}
                                </Label>
                                <Input
                                  type="number"
                                  value={values.orange_min}
                                  onChange={(e) =>
                                    updateField(def.metric_key, "orange_min", parseFloat(e.target.value) || 0)
                                  }
                                  className="border-orange-200 focus:border-orange-400"
                                />
                                <p className="text-xs text-muted-foreground">
                                  {def.is_inverted
                                    ? "Valore sotto il quale il KPI e' arancione"
                                    : "Valore sopra il quale il KPI e' arancione"}
                                </p>
                              </div>

                              {/* Red info */}
                              <div className="space-y-2">
                                <Label className="flex items-center gap-2 text-sm">
                                  <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
                                  Rosso (automatico)
                                </Label>
                                <div className="h-9 flex items-center px-3 bg-muted rounded-md text-sm text-muted-foreground">
                                  {def.is_inverted
                                    ? `Sopra ${values.orange_min}${def.unit}`
                                    : `Sotto ${values.orange_min}${def.unit}`}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  Calcolato automaticamente in base alle soglie impostate
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Preview semaphore */}
                          <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                            <p className="text-xs font-medium text-muted-foreground mb-2">Anteprima soglie</p>
                            <div className="flex items-center gap-6 text-sm flex-wrap">
                              {values.green_max !== null && values.green_max > 0 ? (
                                // Range model preview
                                <>
                                  <span className="flex items-center gap-1.5">
                                    <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                                    {`tra ${values.green_min}${def.unit} e ${values.green_max}${def.unit}`}
                                  </span>
                                  <span className="flex items-center gap-1.5">
                                    <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                                    {`${values.orange_min}-${values.green_min}${def.unit} oppure ${values.green_max}-${values.green_max + 10}${def.unit}`}
                                  </span>
                                  <span className="flex items-center gap-1.5">
                                    <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                                    {`< ${values.orange_min}${def.unit} oppure > ${values.green_max + 10}${def.unit}`}
                                  </span>
                                </>
                              ) : (
                                // Single threshold preview
                                <>
                                  <span className="flex items-center gap-1.5">
                                    <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                                    {def.is_inverted
                                      ? `\u2264 ${values.green_min}${def.unit}`
                                      : `\u2265 ${values.green_min}${def.unit}`}
                                  </span>
                                  <span className="flex items-center gap-1.5">
                                    <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                                    {def.is_inverted
                                      ? `${values.green_min} - ${values.orange_min}${def.unit}`
                                      : `${values.orange_min} - ${values.green_min}${def.unit}`}
                                  </span>
                                  <span className="flex items-center gap-1.5">
                                    <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                                    {def.is_inverted
                                      ? `\u2265 ${values.orange_min}${def.unit}`
                                      : `\u2264 ${values.orange_min}${def.unit}`}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Save button - sticky bottom */}
          <div className="sticky bottom-0 py-4 bg-gray-50 border-t mt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {saveSuccess && (
                  <span className="flex items-center gap-1.5 text-sm text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    KPI personalizzati salvati
                  </span>
                )}
                {Object.values(formValues).some((v) => v.enabled) && !saveSuccess && (
                  <span className="flex items-center gap-1.5 text-sm text-amber-600">
                    <AlertTriangle className="h-4 w-4" />
                    Modifiche non salvate
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={() => router.back()}>
                  Annulla
                </Button>
                <Button onClick={handleSave} disabled={isSaving}>
                  <Save className="h-4 w-4 mr-2" />
                  {isSaving ? "Salvataggio..." : "Salva KPI Personalizzati"}
                </Button>
              </div>
            </div>
          </div>
      </div>
  )
}
