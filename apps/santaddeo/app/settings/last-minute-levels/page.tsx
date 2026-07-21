"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Plus, Trash2, Save, Loader2, AlertCircle,
  CheckCircle2, Lock, Zap, Info,
} from "lucide-react"
import Link from "next/link"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  LastMinuteConfirmDialog,
  LastMinuteExplanationDialog,
  type LastMinuteLevelLite,
} from "@/components/settings/last-minute-explanation-dialog"
import { ReviewsWidgetDialog } from "@/components/reviews/reviews-widget-dialog"
import { useHotel } from "@/lib/contexts/hotel-context"

// ---- Types ----

interface LastMinuteLevel {
  id?: string
  name: string
  sort_order: number
  color: string
}

interface SharedBand {
  id?: string
  min_rooms: number
  max_rooms: number
  label?: string
  sort_order: number
}

// discountsMap[levelIndex][bandIndex] = { discount_pct, discount_eur, discount_mode }
type DiscountEntry = {
  discount_pct: number
  discount_eur?: number | null
  discount_mode: string
}
type DiscountsMap = Record<number, Record<number, DiscountEntry>>

const LEVEL_COLORS = [
  { value: "#ef4444", label: "Rosso" },
  { value: "#f97316", label: "Arancione" },
  { value: "#eab308", label: "Giallo" },
  { value: "#22c55e", label: "Verde" },
  { value: "#3b82f6", label: "Blu" },
  { value: "#8b5cf6", label: "Viola" },
]

const DEFAULT_LEVEL_PRESETS = [
  { name: "Leggero", color: "#22c55e" },
  { name: "Medio", color: "#eab308" },
  { name: "Forte", color: "#f97316" },
  { name: "Aggressivo", color: "#ef4444" },
]

// Default discount matrix: rows=levels, columns=bands
// As occupancy decreases (more rooms available), discounts increase
const DEFAULT_DISCOUNT_MATRIX = [
  [5, 8, 10, 12, 15, 18, 20, 25],   // Leggero
  [10, 15, 20, 25, 30, 35, 40, 45], // Medio
  [15, 20, 30, 35, 40, 45, 50, 55], // Forte
  [20, 30, 40, 50, 60, 65, 70, 75], // Aggressivo
]

function createDefaultBands(totalRooms: number): SharedBand[] {
  // Create 8 bands of equal width
  const numBands = 8
  const step = Math.max(1, Math.ceil(totalRooms / numBands))
  const bands: SharedBand[] = []
  
  for (let i = 0; i < numBands; i++) {
    const minNum = i * step
    const maxNum = Math.min((i + 1) * step - 1, totalRooms)
    if (minNum > totalRooms) break
    bands.push({
      min_rooms: minNum,
      max_rooms: maxNum,
      label: `${minNum}-${maxNum}`,
      sort_order: i,
    })
  }
  
  return bands
}

function createDefaultDiscountsMap(numLevels: number, numBands: number): DiscountsMap {
  const map: DiscountsMap = {}
  for (let l = 0; l < numLevels; l++) {
    map[l] = {}
    for (let b = 0; b < numBands; b++) {
      map[l][b] = {
        discount_pct: DEFAULT_DISCOUNT_MATRIX[l]?.[b] ?? 10,
        discount_eur: null,
        discount_mode: "pct",
      }
    }
  }
  return map
}

// ---- Page ----

export default function LastMinuteLevelsPage() {
  const [levels, setLevels] = useState<LastMinuteLevel[]>([])
  const [sharedBands, setSharedBands] = useState<SharedBand[]>([])
  const [discountsMap, setDiscountsMap] = useState<DiscountsMap>({})
  
  const dataRef = useRef({ levels, sharedBands, discountsMap })
  useEffect(() => { 
    dataRef.current = { levels, sharedBands, discountsMap } 
  }, [levels, sharedBands, discountsMap])
  
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isAccelerator, setIsAccelerator] = useState(false)
  const [totalRooms, setTotalRooms] = useState(0)
  
  // Dialog state for post-save explanation
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [showExplanationDialog, setShowExplanationDialog] = useState(false)

  // Hotel attivo (per il widget Last Minute incorporato in questa pagina)
  const { selectedHotel } = useHotel()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/settings/last-minute-levels")
      if (!res.ok) throw new Error(`Errore ${res.status}`)
      const data = await res.json()
      setIsAccelerator(data.isAccelerator ?? false)
      setTotalRooms(data.totalRooms ?? 0)

      // Map levels
      const mappedLevels: LastMinuteLevel[] = (data.levels || []).map((l: any, i: number) => ({
        id: l.id,
        name: l.name || `Livello ${i + 1}`,
        sort_order: l.sort_order ?? i,
        color: l.color || LEVEL_COLORS[i % LEVEL_COLORS.length].value,
      }))
      setLevels(mappedLevels)

      // Map shared bands
      const mappedBands: SharedBand[] = (data.sharedBands || []).map((b: any, i: number) => ({
        id: b.id,
        min_rooms: b.min_rooms ?? 0,
        max_rooms: b.max_rooms ?? 0,
        label: b.label || `${b.min_rooms}-${b.max_rooms}`,
        sort_order: b.sort_order ?? i,
      }))
      setSharedBands(mappedBands)

      // Map discounts: convert from {levelId: {bandId: discount}} to {levelIndex: {bandIndex: discount}}
      const newDiscountsMap: DiscountsMap = {}
      const serverDiscountsMap = data.discountsMap || {}
      
      mappedLevels.forEach((level, levelIndex) => {
        newDiscountsMap[levelIndex] = {}
        const levelDiscounts = serverDiscountsMap[level.id!] || {}
        
        mappedBands.forEach((band, bandIndex) => {
          const discount = levelDiscounts[band.id!]
          newDiscountsMap[levelIndex][bandIndex] = discount || {
            discount_pct: 0,
            discount_eur: null,
            discount_mode: "pct",
          }
        })
      })
      setDiscountsMap(newDiscountsMap)

    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // ---- Actions ----

  function initializeWithDefaults() {
    if (!isAccelerator || !totalRooms) return
    
    // Create 4 default levels
    const newLevels = DEFAULT_LEVEL_PRESETS.map((preset, i) => ({
      name: preset.name,
      sort_order: i,
      color: preset.color,
    }))
    
    // Create default bands based on total rooms
    const newBands = createDefaultBands(totalRooms)
    
    // Create default discounts matrix
    const newDiscounts = createDefaultDiscountsMap(newLevels.length, newBands.length)
    
    setLevels(newLevels)
    setSharedBands(newBands)
    setDiscountsMap(newDiscounts)
    setHasChanges(true)
    setSaveSuccess(false)
  }

  function addLevel() {
    if (!isAccelerator) return
    const preset = DEFAULT_LEVEL_PRESETS[levels.length % DEFAULT_LEVEL_PRESETS.length]
    const newLevel: LastMinuteLevel = {
      name: `${preset.name} ${levels.length + 1}`,
      sort_order: levels.length,
      color: preset.color,
    }
    
    // Add discount entries for all existing bands
    const newLevelIndex = levels.length
    const newDiscounts = { ...discountsMap }
    newDiscounts[newLevelIndex] = {}
    sharedBands.forEach((_, bandIndex) => {
      newDiscounts[newLevelIndex][bandIndex] = {
        discount_pct: DEFAULT_DISCOUNT_MATRIX[newLevelIndex % 4]?.[bandIndex] ?? 10,
        discount_eur: null,
        discount_mode: "pct",
      }
    })
    
    setLevels((prev) => [...prev, newLevel])
    setDiscountsMap(newDiscounts)
    setHasChanges(true)
    setSaveSuccess(false)
  }

  function removeLevel(index: number) {
    if (!isAccelerator) return
    
    // Remove level and reindex discounts
    const newDiscounts: DiscountsMap = {}
    Object.keys(discountsMap).forEach((key) => {
      const oldIndex = parseInt(key)
      if (oldIndex < index) {
        newDiscounts[oldIndex] = discountsMap[oldIndex]
      } else if (oldIndex > index) {
        newDiscounts[oldIndex - 1] = discountsMap[oldIndex]
      }
      // Skip the removed index
    })
    
    setLevels((prev) => prev.filter((_, i) => i !== index).map((l, i) => ({ ...l, sort_order: i })))
    setDiscountsMap(newDiscounts)
    setHasChanges(true)
    setSaveSuccess(false)
  }

  function updateLevelName(index: number, name: string) {
    if (!isAccelerator) return
    setLevels((prev) => prev.map((l, i) => (i === index ? { ...l, name } : l)))
    setHasChanges(true)
    setSaveSuccess(false)
  }

  function updateLevelColor(index: number, color: string) {
    if (!isAccelerator) return
    setLevels((prev) => prev.map((l, i) => (i === index ? { ...l, color } : l)))
    setHasChanges(true)
    setSaveSuccess(false)
  }

  function addBand() {
    if (!isAccelerator) return
    const lastBand = sharedBands[sharedBands.length - 1]
    const newMinRooms = lastBand ? lastBand.max_rooms + 1 : 0
    const newMaxRooms = Math.min(newMinRooms + 3, totalRooms)
    
    const newBand: SharedBand = {
      min_rooms: newMinRooms,
      max_rooms: newMaxRooms,
      label: `${newMinRooms}-${newMaxRooms}`,
      sort_order: sharedBands.length,
    }
    
    // Add discount entries for all levels for this new band
    const newBandIndex = sharedBands.length
    const newDiscounts = { ...discountsMap }
    levels.forEach((_, levelIndex) => {
      if (!newDiscounts[levelIndex]) newDiscounts[levelIndex] = {}
      newDiscounts[levelIndex][newBandIndex] = {
        discount_pct: 10,
        discount_eur: null,
        discount_mode: "pct",
      }
    })
    
    setSharedBands((prev) => [...prev, newBand])
    setDiscountsMap(newDiscounts)
    setHasChanges(true)
    setSaveSuccess(false)
  }

  function removeBand(index: number) {
    if (!isAccelerator) return
    
    // Remove band and reindex discounts
    const newDiscounts: DiscountsMap = {}
    Object.keys(discountsMap).forEach((levelKey) => {
      const levelIndex = parseInt(levelKey)
      newDiscounts[levelIndex] = {}
      Object.keys(discountsMap[levelIndex]).forEach((bandKey) => {
        const oldBandIndex = parseInt(bandKey)
        if (oldBandIndex < index) {
          newDiscounts[levelIndex][oldBandIndex] = discountsMap[levelIndex][oldBandIndex]
        } else if (oldBandIndex > index) {
          newDiscounts[levelIndex][oldBandIndex - 1] = discountsMap[levelIndex][oldBandIndex]
        }
      })
    })
    
    setSharedBands((prev) => prev.filter((_, i) => i !== index).map((b, i) => ({ ...b, sort_order: i })))
    setDiscountsMap(newDiscounts)
    setHasChanges(true)
    setSaveSuccess(false)
  }

  function updateBand(index: number, field: "min_rooms" | "max_rooms", value: number) {
    if (!isAccelerator) return
    value = Math.max(0, Math.min(value, totalRooms))
    setSharedBands((prev) => prev.map((b, i) => {
      if (i !== index) return b
      const updated = { ...b, [field]: value }
      updated.label = `${updated.min_rooms}-${updated.max_rooms}`
      return updated
    }))
    setHasChanges(true)
    setSaveSuccess(false)
  }

  function updateDiscount(levelIndex: number, bandIndex: number, value: number) {
    if (!isAccelerator) return
    value = Math.max(0, Math.min(value, 100))
    setDiscountsMap((prev) => ({
      ...prev,
      [levelIndex]: {
        ...prev[levelIndex],
        [bandIndex]: {
          ...prev[levelIndex]?.[bandIndex],
          discount_pct: value,
        },
      },
    }))
    setHasChanges(true)
    setSaveSuccess(false)
  }

  async function handleSave() {
    if (!isAccelerator) return
    const latest = dataRef.current
    setSaving(true)
    setError(null)
    setSaveSuccess(false)
    try {
      const res = await fetch("/api/settings/last-minute-levels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          levels: latest.levels,
          sharedBands: latest.sharedBands,
          discountsMap: latest.discountsMap,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || `Errore salvataggio: ${res.status}`)
      }
      setHasChanges(false)
      setSaveSuccess(true)
      setShowConfirmDialog(true) // Show explanation prompt after save
      await loadData()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // ---- Coverage analysis ----
  // Le fasce coprono un intervallo di camere libere [min_rooms, max_rooms].
  // Un "buco" e' un numero di camere (da 1 a totalRooms) che nessuna fascia
  // copre: in quel caso il last-minute NON applica sconto (ne nel widget ne
  // nel motore di pricing). Segnaliamo buchi e sovrapposizioni al revenue manager.
  const coverage = useMemo(() => {
    // Analizziamo da 1 a totalRooms (0 camere libere = sold out, niente offerta).
    const max = totalRooms > 0 ? totalRooms : 0
    if (max === 0 || sharedBands.length === 0) {
      return { gaps: [] as Array<[number, number]> }
    }
    const covered: boolean[] = new Array(max + 1).fill(false)
    for (const b of sharedBands) {
      const lo = Math.max(0, Math.min(b.min_rooms, b.max_rooms))
      const hi = Math.min(max, Math.max(b.min_rooms, b.max_rooms))
      for (let r = lo; r <= hi; r++) covered[r] = true
    }
    // Buchi: 1..max non coperti, compressi in intervalli consecutivi.
    // NB: i confini condivisi tra fasce contigue (es. 2-5 e 5-7) sono una
    // convenzione voluta, non un errore: per questo NON segnaliamo le
    // sovrapposizioni, solo i buchi che azzerano lo sconto last-minute.
    const gaps: Array<[number, number]> = []
    let start: number | null = null
    for (let r = 1; r <= max; r++) {
      if (!covered[r]) {
        if (start === null) start = r
      } else if (start !== null) {
        gaps.push([start, r - 1])
        start = null
      }
    }
    if (start !== null) gaps.push([start, max])
    return { gaps }
  }, [sharedBands, totalRooms])

  const fmtRange = ([a, b]: [number, number]) => (a === b ? `${a}` : `${a}-${b}`)
  const hasGaps = coverage.gaps.length > 0

  // ---- Render ----

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* How it works explanation */}
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Info className="h-5 w-5 text-blue-600" />
              Come funziona il Last Minute
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-white rounded-lg p-4 border">
                <div className="font-semibold text-foreground mb-2">1. Definisci le fasce</div>
                <p>Le fasce di camere libere sono <strong>condivise</strong> tra tutti i livelli. Es: 0-3, 4-6, 7-9 camere.</p>
              </div>
              <div className="bg-white rounded-lg p-4 border">
                <div className="font-semibold text-foreground mb-2">2. Configura gli sconti</div>
                <p>Per ogni livello (Leggero, Forte, ecc.) imposta lo sconto % per ciascuna fascia nella matrice.</p>
              </div>
              <div className="bg-white rounded-lg p-4 border">
                <div className="font-semibold text-foreground mb-2">3. Attiva nella griglia</div>
                <p>Nella pagina Pricing, seleziona il livello per le date. Lo sconto si applica in base all&apos;occupazione.</p>
              </div>
            </div>
            
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="font-semibold text-amber-800 mb-1">Esempio</div>
              <p className="text-amber-700">
                Hai 20 camere e 3 camere libere. Attivi il livello <strong>&quot;Forte&quot;</strong> per domani.
                Il sistema cerca la fascia &quot;0-5 camere&quot; e applica lo sconto configurato (es. -15%).
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Main settings card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle>Configurazione Last Minute</CardTitle>
                <CardDescription>
                  {totalRooms > 0 
                    ? `Il tuo hotel ha ${totalRooms} camere totali. Configura le fasce e gli sconti per livello.`
                    : "Configura le tipologie di camera per vedere il totale camere."
                  }
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {isAccelerator && selectedHotel?.id && (
                  <ReviewsWidgetDialog
                    hotelId={selectedHotel.id}
                    stats={null}
                    defaultTab="lastminute"
                    triggerLabel="Widget Last Minute per il sito"
                  />
                )}
                {isAccelerator && hasChanges && (
                  <Button onClick={handleSave} disabled={saving} className="gap-2">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {saving ? "Salvataggio..." : "Salva modifiche"}
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Alerts */}
            {!isAccelerator && (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200">
                <Lock className="h-5 w-5 text-amber-600 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-800">Modalita sola lettura</p>
                  <p className="text-xs text-amber-700 mt-0.5">Attiva Accelerator per configurare i livelli last-minute.</p>
                </div>
                <Link href="/accelerator/activate">
                  <Button variant="outline" size="sm" className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-100">
                    <Zap className="h-3.5 w-3.5" />Attiva
                  </Button>
                </Link>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />{error}
              </div>
            )}
            
            {saveSuccess && !hasChanges && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 text-emerald-700 text-sm">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0" />Configurazione salvata correttamente.
              </div>
            )}

            {/* Empty state */}
            {levels.length === 0 || sharedBands.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p className="mb-4">Nessuna configurazione last minute.</p>
                {isAccelerator && totalRooms > 0 && (
                  <Button onClick={initializeWithDefaults} variant="outline" className="gap-2">
                    <Plus className="h-4 w-4" />
                    Crea configurazione di default
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                {/* Levels management */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-sm font-semibold">Livelli</Label>
                    {isAccelerator && (
                      <Button onClick={addLevel} variant="outline" size="sm" className="gap-1.5">
                        <Plus className="h-3.5 w-3.5" />Aggiungi livello
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {levels.map((level, levelIndex) => (
                      <div key={level.id || levelIndex} className="flex items-center gap-2 p-2 border rounded-lg bg-muted/30">
                        <div 
                          className="w-4 h-4 rounded-full flex-shrink-0 border border-black/10" 
                          style={{ backgroundColor: level.color }}
                        />
                        <Input
                          value={level.name}
                          onChange={(e) => updateLevelName(levelIndex, e.target.value)}
                          className="w-28 h-8"
                          disabled={!isAccelerator}
                        />
                        <Select
                          value={level.color}
                          onValueChange={(v) => updateLevelColor(levelIndex, v)}
                          disabled={!isAccelerator}
                        >
                          <SelectTrigger className="w-24 h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LEVEL_COLORS.map((c) => (
                              <SelectItem key={c.value} value={c.value}>
                                <div className="flex items-center gap-2">
                                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: c.value }} />
                                  {c.label}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {isAccelerator && levels.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeLevel(levelIndex)}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bands management */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-sm font-semibold">Fasce di camere libere</Label>
                    {isAccelerator && (
                      <Button onClick={addBand} variant="outline" size="sm" className="gap-1.5">
                        <Plus className="h-3.5 w-3.5" />Aggiungi fascia
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {/* Sort bands by min_rooms for display, keeping original index for updates */}
                    {sharedBands
                      .map((band, originalIndex) => ({ band, originalIndex }))
                      .sort((a, b) => a.band.min_rooms - b.band.min_rooms)
                      .map(({ band, originalIndex }) => (
                      <div key={band.id || originalIndex} className="flex items-center gap-1.5 p-2 border rounded-lg bg-muted/30">
                        <Input
                          type="number"
                          value={band.min_rooms}
                          onChange={(e) => updateBand(originalIndex, "min_rooms", parseInt(e.target.value) || 0)}
                          className="w-14 h-8 text-center"
                          disabled={!isAccelerator}
                        />
                        <span className="text-muted-foreground">-</span>
                        <Input
                          type="number"
                          value={band.max_rooms}
                          onChange={(e) => updateBand(originalIndex, "max_rooms", parseInt(e.target.value) || 0)}
                          className="w-14 h-8 text-center"
                          disabled={!isAccelerator}
                        />
                        <span className="text-xs text-muted-foreground">cam.</span>
                        {isAccelerator && sharedBands.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeBand(originalIndex)}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Coverage warning: buchi nelle fasce che azzerano lo sconto */}
                {hasGaps && (
                  <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200">
                    <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 text-sm">
                      <p className="font-medium text-amber-800">
                        Attenzione: alcune quantita di camere libere non sono coperte da nessuna fascia
                      </p>
                      <p className="text-amber-700 mt-1">
                        Camere scoperte:{" "}
                        <strong>{coverage.gaps.map(fmtRange).join(", ")}</strong>. Quando il numero di
                        camere libere cade in questi valori, il last-minute <strong>non applica alcuno
                        sconto</strong> &mdash; ne nel widget del sito ne nel motore di pricing. Estendi le
                        fasce per coprire l&apos;intero intervallo da 1 a {totalRooms} camere.
                      </p>
                    </div>
                  </div>
                )}

                {/* Discount Matrix */}
                <div>
                  <Label className="text-sm font-semibold mb-3 block">Matrice Sconti (%)</Label>
                  <div className="overflow-x-auto">
                    {/* Sort bands by min_rooms for display, keeping original index for discount mapping */}
                    {(() => {
                      const sortedBandsWithIndex = sharedBands
                        .map((band, originalIndex) => ({ band, originalIndex }))
                        .sort((a, b) => a.band.min_rooms - b.band.min_rooms)
                      
                      return (
                        <table className="w-full border-collapse">
                          <thead>
                            <tr>
                              <th className="text-left p-2 bg-muted/50 border text-sm font-medium min-w-[120px]">
                                Livello / Camere
                              </th>
                              {sortedBandsWithIndex.map(({ band }) => (
                                <th key={band.id || `${band.min_rooms}-${band.max_rooms}`} className="p-2 bg-muted/50 border text-center text-sm font-medium min-w-[80px]">
                                  {band.min_rooms}-{band.max_rooms}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {levels.map((level, levelIndex) => (
                              <tr key={level.id || levelIndex}>
                                <td className="p-2 border bg-muted/30">
                                  <div className="flex items-center gap-2">
                                    <div 
                                      className="w-3 h-3 rounded-full flex-shrink-0" 
                                      style={{ backgroundColor: level.color }}
                                    />
                                    <span className="text-sm font-medium">{level.name}</span>
                                  </div>
                                </td>
                                {sortedBandsWithIndex.map(({ band, originalIndex }) => {
                                  const discount = discountsMap[levelIndex]?.[originalIndex]?.discount_pct ?? 0
                                  return (
                                    <td key={band.id || `${band.min_rooms}-${band.max_rooms}`} className="p-1 border text-center">
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Input
                                            type="number"
                                            value={discount}
                                            onChange={(e) => updateDiscount(levelIndex, originalIndex, parseInt(e.target.value) || 0)}
                                            className="w-16 h-8 text-center mx-auto"
                                            disabled={!isAccelerator}
                                            min={0}
                                            max={100}
                                          />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>Sconto {discount}% per {level.name}</p>
                                          <p className="text-xs text-muted-foreground">
                                            quando {band.min_rooms}-{band.max_rooms} camere libere
                                          </p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </td>
                                  )
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )
                    })()}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Ogni cella indica lo sconto % applicato quando il livello e attivo e le camere libere rientrano nella fascia.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Post-save explanation dialogs */}
      <LastMinuteConfirmDialog
        open={showConfirmDialog}
        onCancel={() => setShowConfirmDialog(false)}
        onAccept={() => {
          setShowConfirmDialog(false)
          setShowExplanationDialog(true)
        }}
      />
      
      <LastMinuteExplanationDialog
        open={showExplanationDialog}
        onClose={() => setShowExplanationDialog(false)}
        levels={levels.map((level, levelIndex): LastMinuteLevelLite => {
          // Find the discount range for this level across all bands
          const levelDiscounts = Object.values(discountsMap[levelIndex] || {})
          const discountPcts = levelDiscounts.map(d => d.discount_pct)
          const minDiscount = Math.min(...discountPcts, 0)
          const maxDiscount = Math.max(...discountPcts, 0)
          
          // Get band ranges
          const minRooms = Math.min(...sharedBands.map(b => b.min_rooms), 0)
          const maxRooms = Math.max(...sharedBands.map(b => b.max_rooms), totalRooms)
          
          return {
            name: level.name,
            color: level.color,
            discount_pct: maxDiscount,
            discount_eur: 0,
            discount_mode: "pct",
            min_occupancy_pct: 0,
            max_occupancy_pct: 100,
            occupancy_mode: "num",
            min_occupancy_num: minRooms,
            max_occupancy_num: maxRooms,
            occupancy_bands: sharedBands
              .map((band, bandIndex) => ({
                min_occupancy_pct: 0,
                max_occupancy_pct: 100,
                min_occupancy_num: band.min_rooms,
                max_occupancy_num: band.max_rooms,
                occupancy_mode: "num" as const,
                discount_pct: discountsMap[levelIndex]?.[bandIndex]?.discount_pct ?? 0,
                discount_eur: 0,
                discount_mode: "pct" as const,
                rate_growth_pct: 0,
                rate_growth_speed: "medium",
                max_recovery_pct: 100,
              }))
              .sort((a, b) => a.min_occupancy_num - b.min_occupancy_num),
          }
        })}
        occupancyMode="num"
        discountMode="pct"
        totalRooms={totalRooms}
      />
    </TooltipProvider>
  )
}
