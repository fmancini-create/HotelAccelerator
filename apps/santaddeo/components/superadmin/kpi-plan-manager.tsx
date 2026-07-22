"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Save, RotateCcw, Building2, Gauge } from "lucide-react"
import { toast } from "sonner"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface KpiDefault {
  id: string
  plan_type: string
  kpi_key: string
  is_enabled: boolean
}

interface HotelOverride {
  hotel_id: string
  hotel_name: string
  plan_type: string
  kpi_key: string
  is_enabled: boolean
}

const PLAN_LABELS: Record<string, { label: string; color: string; description: string }> = {
  free: {
    label: "Free",
    color: "bg-zinc-100 text-zinc-700 border-zinc-200",
    description: "Piano base gratuito - KPI essenziali",
  },
  fixed_fee: {
    label: "Standard (Fee Fissa)",
    color: "bg-blue-50 text-blue-700 border-blue-200",
    description: "Piano a canone fisso - KPI avanzati",
  },
  commission: {
    label: "Advanced (Commissione)",
    color: "bg-amber-50 text-amber-700 border-amber-200",
    description: "Piano a commissione - Tutti i KPI",
  },
}

const KPI_CATEGORIES = {
  overview: {
    label: "Sezione Overview",
    keys: [
      { key: "overview_occupancy", label: "Occupancy" },
      { key: "overview_adr", label: "ADR" },
      { key: "overview_revpar", label: "RevPAR" },
      { key: "overview_revenue", label: "Revenue" },
      { key: "overview_arrivals", label: "Arrivi" },
      { key: "overview_departures", label: "Partenze" },
      { key: "overview_in_house", label: "In House" },
      { key: "overview_availability", label: "Disponibilita" },
      { key: "overview_production", label: "Produzione" },
    ],
  },
  rooms: {
    label: "Sezione Camere",
    keys: [
      { key: "rooms_available", label: "Camere Disponibili" },
      { key: "rooms_occupied", label: "Camere Occupate" },
      { key: "out_of_service", label: "Fuori Servizio" },
      { key: "arrivals_departures", label: "Arrivi / Partenze" },
      { key: "bookings_received", label: "Prenotazioni Ricevute" },
      { key: "cancellations_received", label: "Cancellazioni Ricevute" },
      { key: "fiscal_production_today", label: "Produzione Fiscale Oggi" },
      { key: "fiscal_production_month", label: "Produzione Fiscale Mese" },
      { key: "room_production_today", label: "Produzione Camere Oggi" },
    ],
  },
  metrics: {
    label: "Sezione Metriche",
    keys: [
      { key: "metrics_occupancy", label: "Occupancy" },
      { key: "metrics_adr", label: "ADR" },
      { key: "metrics_revpar", label: "RevPAR" },
      { key: "metrics_revpor", label: "RevPOR" },
      { key: "metrics_room_revenue", label: "Revenue Camere" },
      { key: "metrics_total_production", label: "Produzione Totale" },
      { key: "metrics_arrivals", label: "Arrivi" },
      { key: "metrics_departures", label: "Partenze" },
      { key: "metrics_in_house", label: "In House" },
      { key: "metrics_new_bookings", label: "Nuove Prenotazioni" },
      { key: "metrics_avg_stay", label: "Soggiorno Medio" },
      { key: "metrics_room_nights", label: "Room Nights" },
      { key: "metrics_total_revenue", label: "Revenue Totale" },
      { key: "metrics_direct_revenue", label: "Revenue Diretto" },
      { key: "metrics_intermediated_revenue", label: "Revenue Intermediato" },
      { key: "metrics_bookings", label: "Prenotazioni" },
      { key: "metrics_cancellations", label: "Cancellazioni" },
      { key: "metrics_cancellation_pct", label: "% Cancellazione" },
      { key: "metrics_pickup_bookings", label: "Pickup Prenotazioni" },
      { key: "metrics_pickup_cancellations", label: "Pickup Cancellazioni" },
    ],
  },
}

export function KpiPlanManager() {
  const [defaults, setDefaults] = useState<KpiDefault[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [activePlanTab, setActivePlanTab] = useState("free")
  const [pendingChanges, setPendingChanges] = useState<Record<string, boolean>>({})
  const [hotels, setHotels] = useState<Array<{ id: string; name: string; plan_type: string }>>([])
  const [selectedHotel, setSelectedHotel] = useState<string>("_plans")

  // Fetch plan defaults
  const fetchDefaults = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch("/api/superadmin/kpi-plan-defaults")
      if (!res.ok) throw new Error()
      const data = await res.json()
      setDefaults(data.defaults || [])
    } catch {
      toast.error("Errore nel caricamento dei default KPI")
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Fetch hotels with their subscription plan types
  const fetchHotels = useCallback(async () => {
    try {
      const res = await fetch("/api/superadmin/data")
      if (!res.ok) throw new Error()
      const data = await res.json()

      // Map hotel_id -> plan_type from active subscriptions
      const planMap: Record<string, string> = {}
      for (const sub of data.activeSubscriptions || []) {
        if (sub.hotel_id) {
          planMap[sub.hotel_id] = sub.plan_type || "free"
        }
      }

      const enriched = (data.hotels || []).map((h: any) => ({
        id: h.id,
        name: h.name,
        plan_type: planMap[h.id] || "free",
      }))
      setHotels(enriched)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    fetchDefaults()
    fetchHotels()
  }, [fetchDefaults, fetchHotels])

  const getDefaultForPlan = (planType: string, kpiKey: string): boolean => {
    const changeKey = `${planType}:${kpiKey}`
    if (changeKey in pendingChanges) return pendingChanges[changeKey]
    const found = defaults.find((d) => d.plan_type === planType && d.kpi_key === kpiKey)
    return found?.is_enabled ?? false
  }

  const handleToggle = (planType: string, kpiKey: string, checked: boolean) => {
    const changeKey = `${planType}:${kpiKey}`
    setPendingChanges((prev) => ({ ...prev, [changeKey]: checked }))
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const updates = Object.entries(pendingChanges).map(([key, isEnabled]) => {
        const [planType, kpiKey] = key.split(":")
        return { plan_type: planType, kpi_key: kpiKey, is_enabled: isEnabled }
      })

      const res = await fetch("/api/superadmin/kpi-plan-defaults", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      })

      if (!res.ok) throw new Error()
      toast.success("Default KPI aggiornati con successo!")
      setPendingChanges({})
      fetchDefaults()
    } catch {
      toast.error("Errore nel salvataggio")
    } finally {
      setIsSaving(false)
    }
  }

  const handleApplyToHotel = async (hotelId: string) => {
    try {
      const res = await fetch(`/api/superadmin/kpi-plan-defaults?action=apply-to-hotel&hotelId=${hotelId}`, {
        method: "POST",
      })
      if (!res.ok) throw new Error()
      toast.success("Default applicati alla struttura!")
    } catch {
      toast.error("Errore nell'applicazione dei default")
    }
  }

  const hasPendingChanges = Object.keys(pendingChanges).length > 0

  const enabledCount = (planType: string) => {
    let count = 0
    Object.values(KPI_CATEGORIES).forEach((cat) => {
      cat.keys.forEach((kpi) => {
        if (getDefaultForPlan(planType, kpi.key)) count++
      })
    })
    return count
  }

  const totalKpis = Object.values(KPI_CATEGORIES).reduce((sum, cat) => sum + cat.keys.length, 0)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="h-5 w-5" />
              Gestione KPI per Piano
            </CardTitle>
            <CardDescription className="mt-1">
              Configura quali KPI sono visibili di default per ciascun piano di abbonamento, oppure personalizzali per struttura.
            </CardDescription>
          </div>
          {hasPendingChanges && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPendingChanges({})}
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Annulla
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-1" />
                )}
                Salva Modifiche
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* View mode selector: by plan or by hotel */}
        <div className="flex items-center gap-3">
          <Label className="text-sm font-medium">Visualizza per:</Label>
          <Select value={selectedHotel} onValueChange={setSelectedHotel}>
            <SelectTrigger className="w-[300px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_plans">
                <span className="flex items-center gap-2">
                  <Gauge className="h-4 w-4" />
                  Default per Piano
                </span>
              </SelectItem>
              {hotels.map((h) => (
                <SelectItem key={h.id} value={h.id}>
                  <span className="flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    {h.name}
                    <Badge variant="outline" className="text-[10px] ml-1">
                      {PLAN_LABELS[h.plan_type]?.label || h.plan_type}
                    </Badge>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedHotel !== "_plans" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleApplyToHotel(selectedHotel)}
            >
              Applica Default Piano
            </Button>
          )}
        </div>

        {/* Plan tabs (only visible when viewing by plan) */}
        {selectedHotel === "_plans" && (
          <Tabs value={activePlanTab} onValueChange={setActivePlanTab}>
            <TabsList className="grid grid-cols-3">
              {Object.entries(PLAN_LABELS).map(([key, config]) => (
                <TabsTrigger key={key} value={key} className="text-xs">
                  <span className="flex items-center gap-1.5">
                    {config.label}
                    <Badge variant="secondary" className="text-[10px] px-1.5">
                      {enabledCount(key)}/{totalKpis}
                    </Badge>
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>

            {Object.entries(PLAN_LABELS).map(([planKey, planConfig]) => (
              <TabsContent key={planKey} value={planKey} className="space-y-6 mt-4">
                <div className="flex items-center gap-3 pb-3 border-b">
                  <Badge className={planConfig.color}>{planConfig.label}</Badge>
                  <p className="text-sm text-muted-foreground">{planConfig.description}</p>
                </div>

                {Object.entries(KPI_CATEGORIES).map(([catKey, category]) => (
                  <div key={catKey}>
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                      {category.label}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {category.keys.map((kpi) => {
                        const isEnabled = getDefaultForPlan(planKey, kpi.key)
                        const changeKey = `${planKey}:${kpi.key}`
                        const hasChange = changeKey in pendingChanges

                        return (
                          <div
                            key={kpi.key}
                            className={`flex items-center justify-between py-2 px-3 rounded-lg border ${
                              hasChange ? "border-amber-300 bg-amber-50/50" : "border-transparent hover:bg-muted/50"
                            }`}
                          >
                            <Label
                              htmlFor={`${planKey}-${kpi.key}`}
                              className="text-sm cursor-pointer flex-1"
                            >
                              {kpi.label}
                              {hasChange && (
                                <span className="text-[10px] text-amber-600 ml-2">(modificato)</span>
                              )}
                            </Label>
                            <Switch
                              id={`${planKey}-${kpi.key}`}
                              checked={isEnabled}
                              onCheckedChange={(checked) => handleToggle(planKey, kpi.key, checked)}
                            />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </TabsContent>
            ))}
          </Tabs>
        )}

        {/* Per-hotel view (when a specific hotel is selected) */}
        {selectedHotel !== "_plans" && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
              Per personalizzare i KPI di una singola struttura, usa il pannello{" "}
              <strong>Hotel {">"} Configura KPI</strong> nel tab Hotel oppure clicca su{" "}
              <strong>Applica Default Piano</strong> per resettare ai default del piano attivo.
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
