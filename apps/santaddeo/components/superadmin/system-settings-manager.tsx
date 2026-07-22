"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Save, Building2, RotateCcw, Check, Mail } from "lucide-react"
import { Badge } from "@/components/ui/badge"

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

interface Hotel {
  id: string
  name: string
}

export function SystemSettingsManager() {
  const [settings, setSettings] = useState({
    // Hotel Accelerator Settings
    fixed_fee_per_room: 5,
    commission_rate_year_1_2: 15,
    commission_rate_after_year_2: 10,

    // System Features
    enable_email_notifications: true,
    enable_auto_pilot: true,
    enable_partner_program: true,

    // Partner Program
    partner_registration_commission: 80,
    partner_service_commission: 20,
  })

  const [kpiThresholds, setKpiThresholds] = useState<Record<string, KpiThreshold>>({})
  const [hotels, setHotels] = useState<Hotel[]>([])
  const [selectedHotelId, setSelectedHotelId] = useState<string | null>(null)
  const [hotelThresholds, setHotelThresholds] = useState<Record<string, KpiThreshold>>({})
  const [saving, setSaving] = useState(false)
  const [savingKpi, setSavingKpi] = useState(false)
  const [testingEmail, setTestingEmail] = useState(false)
  const [emailTestResult, setEmailTestResult] = useState<string | null>(null)

  // Fetch hotels list
  useEffect(() => {
    async function fetchHotels() {
      try {
        const res = await fetch("/api/superadmin/hotels", {
          credentials: "include"
        })
        const data = await res.json()
        if (data.hotels) {
          setHotels(data.hotels)
        }
      } catch (error) {
        console.error("Error fetching hotels:", error)
      }
    }
    fetchHotels()
  }, [])

  // Fetch global KPI thresholds
  useEffect(() => {
    async function fetchGlobalThresholds() {
      try {
        const res = await fetch("/api/kpi-thresholds")
        const data = await res.json()
        if (data.thresholds) {
          setKpiThresholds(data.thresholds)
        }
      } catch (error) {
        console.error("Error fetching KPI thresholds:", error)
      }
    }
    fetchGlobalThresholds()
  }, [])

  // Fetch hotel-specific thresholds when hotel is selected
  const fetchHotelThresholds = useCallback(async (hotelId: string) => {
    try {
      const res = await fetch(`/api/kpi-thresholds?hotel_id=${hotelId}`)
      const data = await res.json()
      if (data.thresholds) {
        setHotelThresholds(data.thresholds)
      }
    } catch (error) {
      console.error("Error fetching hotel thresholds:", error)
    }
  }, [])

  useEffect(() => {
    if (selectedHotelId) {
      fetchHotelThresholds(selectedHotelId)
    } else {
      setHotelThresholds({})
    }
  }, [selectedHotelId, fetchHotelThresholds])

  const handleTestEmail = async () => {
    setTestingEmail(true)
    setEmailTestResult(null)
    try {
      const res = await fetch("/api/test-email", { 
        method: "POST",
        credentials: "include"
      })
      const data = await res.json()
      if (data.success) {
        setEmailTestResult(`Inviata con successo a ${data.message?.replace("Email di test inviata a ", "") || "la tua email"}`)
      } else {
        const errorMsg = data.error || ""
        if (errorMsg.includes("anteprima v0") || errorMsg.includes("not implemented") || errorMsg.includes("dns.lookup")) {
          setEmailTestResult("L'invio email SMTP non e disponibile nell'anteprima. Pubblica il progetto su Vercel per testare l'invio email.")
        } else if (errorMsg.includes("Invalid login") || errorMsg.includes("BadCredentials")) {
          setEmailTestResult("Credenziali SMTP non valide. Verifica che SMTP_PASSWORD contenga la App Password di Google (16 caratteri, non la password dell'account).")
        } else {
          setEmailTestResult(`Errore: ${errorMsg}`)
        }
      }
    } catch (error) {
      setEmailTestResult("Errore di connessione")
    } finally {
      setTestingEmail(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const response = await fetch("/api/superadmin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      })

      if (response.ok) {
        alert("Impostazioni salvate con successo")
      }
    } catch (error) {
      console.error("[v0] Error saving settings:", error)
      alert("Errore nel salvataggio delle impostazioni")
    } finally {
      setSaving(false)
    }
  }

  const handleSaveKpiThreshold = async (metricKey: string, isHotelSpecific: boolean) => {
    setSavingKpi(true)
    try {
      const threshold = isHotelSpecific ? hotelThresholds[metricKey] : kpiThresholds[metricKey]
      if (!threshold) return

      const response = await fetch("/api/kpi-thresholds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotel_id: isHotelSpecific ? selectedHotelId : null,
          metric_key: metricKey,
          green_min: threshold.green_min,
          green_max: threshold.green_max,
          orange_min: threshold.orange_min,
          red_min: threshold.red_min,
          is_inverted: threshold.is_inverted,
        }),
      })

      if (response.ok) {
        // Refresh thresholds
        if (isHotelSpecific && selectedHotelId) {
          fetchHotelThresholds(selectedHotelId)
        } else {
          const res = await fetch("/api/kpi-thresholds")
          const data = await res.json()
          if (data.thresholds) {
            setKpiThresholds(data.thresholds)
          }
        }
      }
    } catch (error) {
      console.error("Error saving KPI threshold:", error)
    } finally {
      setSavingKpi(false)
    }
  }

  const handleResetToGlobal = async (metricKey: string) => {
    if (!selectedHotelId) return
    
    try {
      await fetch(`/api/kpi-thresholds?hotel_id=${selectedHotelId}&metric_key=${metricKey}`, {
        method: "DELETE",
      })
      fetchHotelThresholds(selectedHotelId)
    } catch (error) {
      console.error("Error resetting threshold:", error)
    }
  }

  const updateThreshold = (metricKey: string, field: string, value: number, isHotelSpecific: boolean) => {
    if (isHotelSpecific) {
      setHotelThresholds(prev => ({
        ...prev,
        [metricKey]: { ...prev[metricKey], [field]: value }
      }))
    } else {
      setKpiThresholds(prev => ({
        ...prev,
        [metricKey]: { ...prev[metricKey], [field]: value }
      }))
    }
  }

  const renderKpiRow = (threshold: KpiThreshold, isHotelSpecific: boolean, isCustomized: boolean) => {
    const metricKey = threshold.metric_key
    const currentThreshold = isHotelSpecific ? hotelThresholds[metricKey] : kpiThresholds[metricKey]
    if (!currentThreshold) return null

    const hasRange = currentThreshold.green_max !== null && currentThreshold.green_max > 0

    return (
      <div key={metricKey} className="grid grid-cols-12 gap-2 items-center py-3 border-b last:border-b-0">
        <div className="col-span-3">
          <div className="font-medium text-sm">{currentThreshold.display_name}</div>
          <div className="text-xs text-muted-foreground">{currentThreshold.description}</div>
          {hasRange && <Badge variant="outline" className="mt-1 text-xs">Range</Badge>}
          {isHotelSpecific && isCustomized && (
            <Badge variant="secondary" className="mt-1 ml-1 text-xs">Personalizzato</Badge>
          )}
        </div>
        {hasRange ? (
          <>
            <div className="col-span-2">
              <Label className="text-xs text-green-600">Verde Min</Label>
              <Input
                type="number"
                className="h-8 text-sm"
                value={currentThreshold.green_min}
                onChange={(e) => updateThreshold(metricKey, 'green_min', Number(e.target.value), isHotelSpecific)}
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-green-600">Verde Max</Label>
              <Input
                type="number"
                className="h-8 text-sm"
                value={currentThreshold.green_max || 0}
                onChange={(e) => updateThreshold(metricKey, 'green_max', Number(e.target.value), isHotelSpecific)}
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-orange-600">Arancione fuori range</Label>
              <Input
                type="number"
                className="h-8 text-sm"
                value={currentThreshold.orange_min}
                onChange={(e) => updateThreshold(metricKey, 'orange_min', Number(e.target.value), isHotelSpecific)}
              />
            </div>
          </>
        ) : (
          <>
            <div className="col-span-2">
              <Label className="text-xs text-green-600">Verde {currentThreshold.is_inverted ? '≤' : '≥'}</Label>
              <Input
                type="number"
                className="h-8 text-sm"
                value={currentThreshold.green_min}
                onChange={(e) => updateThreshold(metricKey, 'green_min', Number(e.target.value), isHotelSpecific)}
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-orange-600">Arancione {currentThreshold.is_inverted ? '≤' : '≥'}</Label>
              <Input
                type="number"
                className="h-8 text-sm"
                value={currentThreshold.orange_min}
                onChange={(e) => updateThreshold(metricKey, 'orange_min', Number(e.target.value), isHotelSpecific)}
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-red-600">Rosso {currentThreshold.is_inverted ? '>' : '<'}</Label>
              <Input
                type="number"
                className="h-8 text-sm"
                value={currentThreshold.red_min || 0}
                onChange={(e) => updateThreshold(metricKey, 'red_min', Number(e.target.value), isHotelSpecific)}
              />
            </div>
          </>
        )}
        <div className="col-span-1 text-center text-xs text-muted-foreground">
          {currentThreshold.unit}
        </div>
        <div className="col-span-2 flex gap-1">
          <Button
            size="sm"
            variant="default"
            className="h-8 px-3"
            onClick={() => handleSaveKpiThreshold(metricKey, isHotelSpecific)}
            disabled={savingKpi}
          >
            <Save className="h-3 w-3 mr-1" />
            Salva
          </Button>
          {isHotelSpecific && isCustomized && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2"
              onClick={() => handleResetToGlobal(metricKey)}
              title="Ripristina default globali"
            >
              <RotateCcw className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    )
  }

  // Check if hotel has customized threshold
  const isCustomized = (metricKey: string): boolean => {
    if (!selectedHotelId) return false
    const hotelThreshold = hotelThresholds[metricKey]
    const globalThreshold = kpiThresholds[metricKey]
    if (!hotelThreshold || !globalThreshold) return false
    return hotelThreshold.hotel_id !== null
  }

  return (
    <div className="space-y-6">
      {/* KPI Thresholds Global */}
      <Card>
        <CardHeader>
          <CardTitle>Range KPI di Default (Globali)</CardTitle>
          <CardDescription>Soglie applicate di default a tutte le strutture. Ogni struttura può avere valori personalizzati.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {Object.values(kpiThresholds).map((threshold) => 
              renderKpiRow(threshold, false, false)
            )}
          </div>
        </CardContent>
      </Card>

      {/* KPI Thresholds per Hotel */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Range KPI per Struttura
              </CardTitle>
              <CardDescription>Personalizza le soglie KPI per una struttura specifica</CardDescription>
            </div>
            <Select value={selectedHotelId || ""} onValueChange={(v) => setSelectedHotelId(v || null)}>
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Seleziona struttura..." />
              </SelectTrigger>
              <SelectContent>
                {hotels.map((hotel) => (
                  <SelectItem key={hotel.id} value={hotel.id}>
                    {hotel.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {selectedHotelId ? (
            <div className="space-y-1">
              {Object.values(hotelThresholds).map((threshold) => 
                renderKpiRow(threshold, true, isCustomized(threshold.metric_key))
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Seleziona una struttura per personalizzare i suoi KPI
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hotel Accelerator - Pricing</CardTitle>
          <CardDescription>Configurazione prezzi e commissioni</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Fee Fissa per Camera (€/mese)</Label>
              <Input
                type="number"
                value={settings.fixed_fee_per_room}
                onChange={(e) => setSettings({ ...settings, fixed_fee_per_room: Number.parseFloat(e.target.value) })}
              />
            </div>

            <div className="space-y-2">
              <Label>Commissione Anni 1-2 (%)</Label>
              <Input
                type="number"
                value={settings.commission_rate_year_1_2}
                onChange={(e) =>
                  setSettings({ ...settings, commission_rate_year_1_2: Number.parseFloat(e.target.value) })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Commissione dopo Anno 2 (%)</Label>
              <Input
                type="number"
                value={settings.commission_rate_after_year_2}
                onChange={(e) =>
                  setSettings({ ...settings, commission_rate_after_year_2: Number.parseFloat(e.target.value) })
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Programma Partner B2B</CardTitle>
          <CardDescription>Configurazione commissioni per consulenti e partner</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Commissione su Registrazioni (%)</Label>
              <Input
                type="number"
                value={settings.partner_registration_commission}
                onChange={(e) =>
                  setSettings({ ...settings, partner_registration_commission: Number.parseFloat(e.target.value) })
                }
              />
              <p className="text-xs text-muted-foreground">Percentuale che va al partner per ogni registrazione</p>
            </div>

            <div className="space-y-2">
              <Label>Commissione su Upgrade Servizi (%)</Label>
              <Input
                type="number"
                value={settings.partner_service_commission}
                onChange={(e) =>
                  setSettings({ ...settings, partner_service_commission: Number.parseFloat(e.target.value) })
                }
              />
              <p className="text-xs text-muted-foreground">Percentuale che va al partner per upgrade servizi</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Funzionalità Sistema</CardTitle>
          <CardDescription>Abilita o disabilita funzionalità globali</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <div className="font-medium">Notifiche Email</div>
              <div className="text-sm text-muted-foreground">Invia email per alert e notifiche importanti</div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                variant="outline"
                className="bg-transparent"
                onClick={handleTestEmail}
                disabled={testingEmail}
              >
                <Mail className="h-3 w-3 mr-1" />
                {testingEmail ? "Invio..." : "Testa Email"}
              </Button>
              <Switch
                checked={settings.enable_email_notifications}
                onCheckedChange={(checked) => setSettings({ ...settings, enable_email_notifications: checked })}
              />
            </div>
          </div>
          {emailTestResult && (
            <div className={`p-3 rounded-lg text-sm ${
              emailTestResult.startsWith("Inviata") 
                ? "bg-green-50 text-green-700 border border-green-200" 
                : emailTestResult.includes("anteprima") || emailTestResult.includes("Pubblica")
                  ? "bg-amber-50 text-amber-700 border border-amber-200"
                  : "bg-red-50 text-red-700 border border-red-200"
            }`}>
              {emailTestResult}
            </div>
          )}

          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <div className="font-medium">Modalità Auto-Pilot</div>
              <div className="text-sm text-muted-foreground">Permetti aggiornamento automatico prezzi al PMS</div>
            </div>
            <Switch
              checked={settings.enable_auto_pilot}
              onCheckedChange={(checked) => setSettings({ ...settings, enable_auto_pilot: checked })}
            />
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <div className="font-medium">Programma Partner</div>
              <div className="text-sm text-muted-foreground">Abilita il programma di affiliazione B2B</div>
            </div>
            <Switch
              checked={settings.enable_partner_program}
              onCheckedChange={(checked) => setSettings({ ...settings, enable_partner_program: checked })}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button size="lg" onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Salvataggio..." : "Salva Impostazioni"}
        </Button>
      </div>
    </div>
  )
}
