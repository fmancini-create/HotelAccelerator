"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Save, Upload, ChevronDown, ChevronUp, AlertCircle, CheckCircle2, Loader2 } from "lucide-react"

interface Band {
  id: string
  group_id: string
  band_index: number
  min_pct: number
  max_pct: number
  increment_pct: string
  label: string
}

interface BandGroup {
  id: string
  name: string
  sort_order: number
  bands: Band[]
}

interface LmLevel {
  id: string
  name: string
  sort_order: number
  color: string
  discount_pct: string
  min_occupancy_pct: string
  max_occupancy_pct: string
}

interface Hotel {
  id: string
  name: string
  total_rooms: number
}

export function PricingDefaultsManager() {
  const [bandGroups, setBandGroups] = useState<BandGroup[]>([])
  const [lmLevels, setLmLevels] = useState<LmLevel[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const [hotels, setHotels] = useState<Hotel[]>([])
  const [selectedHotelId, setSelectedHotelId] = useState("")
  const [dirty, setDirty] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [defRes, hotelsRes] = await Promise.all([
        fetch("/api/superadmin/pricing-defaults"),
        fetch("/api/superadmin/hotels-list"),
      ])
      if (defRes.ok) {
        const data = await defRes.json()
        setBandGroups(data.bandGroups || [])
        setLmLevels(data.lmLevels || [])
      }
      if (hotelsRes.ok) {
        const hData = await hotelsRes.json()
        setHotels(hData.hotels || [])
      }
    } catch (err) {
      console.error("Error loading defaults:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Save a single band increment
  async function saveBandIncrement(band: Band, newVal: string) {
    const num = parseFloat(newVal)
    if (isNaN(num)) return
    setSaving(true)
    try {
      await fetch("/api/superadmin/pricing-defaults", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table: "default_band_templates",
          id: band.id,
          data: { increment_pct: num },
        }),
      })
    } finally {
      setSaving(false)
      setDirty(false)
    }
  }

  // Save LM level field
  async function saveLmField(level: LmLevel, field: string, value: string) {
    const num = parseFloat(value)
    if (isNaN(num)) return
    setSaving(true)
    try {
      await fetch("/api/superadmin/pricing-defaults", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table: "default_lm_level_templates",
          id: level.id,
          data: { [field]: num },
        }),
      })
    } finally {
      setSaving(false)
    }
  }

  // Apply defaults to a hotel
  async function applyToHotel() {
    if (!selectedHotelId) return
    const hotel = hotels.find((h) => h.id === selectedHotelId)
    if (!confirm(`Applicare i template di default a "${hotel?.name}"? Questo creera fasce di occupazione e livelli last-minute.`)) return

    setApplying(true)
    setApplyResult(null)
    try {
      const res = await fetch("/api/superadmin/pricing-defaults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId: selectedHotelId }),
      })
      const data = await res.json()
      if (res.ok) {
        setApplyResult({ ok: true, msg: `Applicati ${data.groupsCreated} gruppi e ${data.bandsCreated} fasce con successo.` })
      } else {
        setApplyResult({ ok: false, msg: data.error || "Errore sconosciuto" })
      }
    } catch (err) {
      setApplyResult({ ok: false, msg: err instanceof Error ? err.message : "Errore" })
    } finally {
      setApplying(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Caricamento template...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Apply to hotel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Applica Default a Struttura</CardTitle>
          <CardDescription>
            Seleziona una struttura per applicare automaticamente le fasce di occupazione e i livelli last-minute di default.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs">Struttura</Label>
              <Select value={selectedHotelId} onValueChange={setSelectedHotelId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona struttura..." />
                </SelectTrigger>
                <SelectContent>
                  {hotels.map((h) => (
                    <SelectItem key={h.id} value={h.id}>
                      {h.name} ({h.total_rooms} camere)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={applyToHotel}
              disabled={!selectedHotelId || applying}
              className="gap-2"
            >
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Applica Default
            </Button>
          </div>
          {applyResult && (
            <div className={`mt-3 flex items-center gap-2 text-sm p-2 rounded ${applyResult.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              {applyResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              {applyResult.msg}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Band Groups */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fasce di Occupazione Default</CardTitle>
          <CardDescription>
            Template con 8 livelli di domanda e 5 fasce di occupazione ciascuno. Tutti gli incrementi sono in percentuale.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {bandGroups.map((group) => {
            const isExpanded = expandedGroup === group.id
            return (
              <div key={group.id} className="border rounded-lg overflow-hidden">
                <button
                  className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors text-left"
                  onClick={() => setExpandedGroup(isExpanded ? null : group.id)}
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-[10px] font-mono w-6 justify-center">
                      {group.sort_order}
                    </Badge>
                    <span className="font-medium text-sm">{group.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {group.bands.length} fasce
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1.5">
                      {group.bands.map((b) => {
                        const val = Number(b.increment_pct)
                        const color = val < 0 ? "text-red-600" : val > 0 ? "text-green-600" : "text-muted-foreground"
                        return (
                          <span key={b.id} className={`text-[10px] font-mono ${color}`}>
                            {val > 0 ? "+" : ""}{val}%
                          </span>
                        )
                      })}
                    </div>
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </button>
                {isExpanded && (
                  <div className="border-t bg-muted/20 p-3">
                    <div className="grid grid-cols-5 gap-3">
                      {group.bands.map((band) => (
                        <div key={band.id} className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">
                            {band.min_pct}-{band.max_pct}%
                          </Label>
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              step="0.5"
                              className="h-8 text-xs text-center"
                              defaultValue={band.increment_pct}
                              onChange={() => setDirty(true)}
                              onBlur={(e) => {
                                if (dirty) {
                                  saveBandIncrement(band, e.target.value)
                                  // Update local state
                                  setBandGroups((prev) =>
                                    prev.map((g) =>
                                      g.id === group.id
                                        ? { ...g, bands: g.bands.map((b) => (b.id === band.id ? { ...b, increment_pct: e.target.value } : b)) }
                                        : g
                                    )
                                  )
                                }
                              }}
                            />
                            <span className="text-[10px] text-muted-foreground">%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    {saving && (
                      <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Salvando...
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* LM Levels */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Livelli Last Minute Default</CardTitle>
          <CardDescription>
            Template con 6 livelli di sconto last-minute. Le soglie sono in percentuale di occupazione.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="p-2 text-left">Livello</th>
                  <th className="p-2 text-center">Colore</th>
                  <th className="p-2 text-center">Sconto %</th>
                  <th className="p-2 text-center">Occ. Min %</th>
                  <th className="p-2 text-center">Occ. Max %</th>
                </tr>
              </thead>
              <tbody>
                {lmLevels.map((level) => (
                  <tr key={level.id} className="border-b hover:bg-muted/30">
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: level.color }} />
                        <span className="font-medium">{level.name}</span>
                      </div>
                    </td>
                    <td className="p-2 text-center">
                      <Input
                        type="color"
                        className="h-7 w-12 mx-auto cursor-pointer p-0.5"
                        defaultValue={level.color}
                        onBlur={(e) => {
                          if (e.target.value !== level.color) {
                            fetch("/api/superadmin/pricing-defaults", {
                              method: "PUT",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                table: "default_lm_level_templates",
                                id: level.id,
                                data: { color: e.target.value },
                              }),
                            })
                            setLmLevels((prev) => prev.map((l) => (l.id === level.id ? { ...l, color: e.target.value } : l)))
                          }
                        }}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        step="1"
                        className="h-7 w-16 mx-auto text-xs text-center"
                        defaultValue={level.discount_pct}
                        onBlur={(e) => {
                          saveLmField(level, "discount_pct", e.target.value)
                          setLmLevels((prev) => prev.map((l) => (l.id === level.id ? { ...l, discount_pct: e.target.value } : l)))
                        }}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        step="1"
                        className="h-7 w-16 mx-auto text-xs text-center"
                        defaultValue={level.min_occupancy_pct}
                        onBlur={(e) => {
                          saveLmField(level, "min_occupancy_pct", e.target.value)
                          setLmLevels((prev) => prev.map((l) => (l.id === level.id ? { ...l, min_occupancy_pct: e.target.value } : l)))
                        }}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        step="1"
                        className="h-7 w-16 mx-auto text-xs text-center"
                        defaultValue={level.max_occupancy_pct}
                        onBlur={(e) => {
                          saveLmField(level, "max_occupancy_pct", e.target.value)
                          setLmLevels((prev) => prev.map((l) => (l.id === level.id ? { ...l, max_occupancy_pct: e.target.value } : l)))
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
