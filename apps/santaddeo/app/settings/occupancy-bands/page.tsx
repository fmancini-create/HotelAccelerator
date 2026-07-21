"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Plus, Trash2, Save, Loader2, ArrowUp, ArrowDown, AlertCircle,
  CheckCircle2, Lock, Zap, Pencil, Copy, FolderPlus,
} from "lucide-react"
import Link from "next/link"

// ---- Types ----

interface OccupancyBand {
  id?: string
  band_index: number
  min_pct: number
  max_pct: number
  min_num: number
  max_num: number
  label: string
  increment_pct: number
  increment_eur: number
  occupancy_mode: "pct" | "num"
  increment_mode: "pct" | "eur"
}

interface BandGroup {
  id?: string
  name: string
  sort_order: number
  color: string
  bands: OccupancyBand[]
}

const GROUP_COLORS = [
  { value: "#ef4444", label: "Rosso" },
  { value: "#f97316", label: "Arancione" },
  { value: "#eab308", label: "Giallo" },
  { value: "#22c55e", label: "Verde" },
  { value: "#06b6d4", label: "Ciano" },
  { value: "#3b82f6", label: "Blu" },
  { value: "#8b5cf6", label: "Viola" },
  { value: "#ec4899", label: "Rosa" },
  { value: "#6b7280", label: "Grigio" },
  { value: "#78716c", label: "Marrone" },
]

// ---- Page ----

export default function OccupancyBandsSettingsPage() {
  const [groups, setGroups] = useState<BandGroup[]>([])
  const groupsRef = useRef<BandGroup[]>([])
  // Keep ref in sync with state so handleSave always reads latest
  useEffect(() => { groupsRef.current = groups }, [groups])
  const [activeGroupIndex, setActiveGroupIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isAccelerator, setIsAccelerator] = useState(false)
  const [totalRooms, setTotalRooms] = useState(0)
  const [editingGroupName, setEditingGroupName] = useState<number | null>(null)
  const [tempGroupName, setTempGroupName] = useState("")

  // Global mode selections (applied to all bands across all groups)
  const [occupancyMode, setOccupancyMode] = useState<"pct" | "num">("pct")
  const [incrementMode, setIncrementMode] = useState<"pct" | "eur">("pct")

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/settings/occupancy-bands")
      if (!res.ok) throw new Error(`Errore ${res.status}`)
      const data = await res.json()
      setIsAccelerator(data.isAccelerator ?? false)
      setTotalRooms(data.totalRooms ?? 0)

      if (data.groups && data.groups.length > 0) {
        setGroups(data.groups.map((g: any, i: number) => ({
          id: g.id,
          name: g.name || `Gruppo ${i + 1}`,
          sort_order: g.sort_order ?? i,
          color: g.color || GROUP_COLORS[i % GROUP_COLORS.length].value,
          bands: (g.bands || []).map((b: any) => ({
            ...b,
            increment_pct: parseFloat(b.increment_pct) || 0,
            increment_eur: parseFloat(b.increment_eur) || 0,
          })),
        })))
        // Detect modes from first band of first group
        const firstBand = data.groups[0]?.bands?.[0]
        if (firstBand) {
          setOccupancyMode(firstBand.occupancy_mode || "pct")
          setIncrementMode(firstBand.increment_mode || "pct")
        }
      } else if (data.bands && data.bands.length > 0) {
        // Legacy: no groups, flat bands -> wrap in default group
        setGroups([{
          name: "Default",
          sort_order: 0,
          color: GROUP_COLORS[0].value,
          bands: data.bands.map((b: any) => ({
            ...b,
            increment_pct: parseFloat(b.increment_pct) || 0,
            increment_eur: parseFloat(b.increment_eur) || 0,
          })),
        }])
        if (data.bands[0]) {
          setOccupancyMode(data.bands[0].occupancy_mode || "pct")
          setIncrementMode(data.bands[0].increment_mode || "pct")
        }
      } else {
        setGroups([])
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // ---- Group operations ----

  function addGroup() {
    if (!isAccelerator) return
    const newGroup: BandGroup = {
      name: `Gruppo ${groups.length + 1}`,
      sort_order: groups.length,
      color: GROUP_COLORS[groups.length % GROUP_COLORS.length].value,
      bands: [],
    }
    setGroups((prev) => [...prev, newGroup])
    setActiveGroupIndex(groups.length)
    setHasChanges(true)
    setSaveSuccess(false)
  }

  function duplicateGroup(gi: number) {
    if (!isAccelerator) return
    const src = groups[gi]
    const clone: BandGroup = {
      name: `${src.name} (copia)`,
      sort_order: groups.length,
      color: src.color,
      bands: src.bands.map((b) => ({ ...b, id: undefined })),
    }
    setGroups((prev) => [...prev, clone])
    setActiveGroupIndex(groups.length)
    setHasChanges(true)
    setSaveSuccess(false)
  }

  function removeGroup(gi: number) {
    if (!isAccelerator || groups.length <= 1) return
    setGroups((prev) => prev.filter((_, i) => i !== gi))
    setActiveGroupIndex((prev) => Math.min(prev, groups.length - 2))
    setHasChanges(true)
    setSaveSuccess(false)
  }

  function startRenameGroup(gi: number) {
    setEditingGroupName(gi)
    setTempGroupName(groups[gi].name)
  }

  function confirmRenameGroup() {
    if (editingGroupName === null) return
    setGroups((prev) =>
      prev.map((g, i) => (i === editingGroupName ? { ...g, name: tempGroupName.trim() || g.name } : g))
    )
    setEditingGroupName(null)
    setHasChanges(true)
    setSaveSuccess(false)
  }

  function changeGroupColor(gi: number, color: string) {
    if (!isAccelerator) return
    setGroups((prev) =>
      prev.map((g, i) => (i === gi ? { ...g, color } : g))
    )
    setHasChanges(true)
    setSaveSuccess(false)
  }

  // ---- Band operations (scoped to active group) ----

  const activeGroup = groups[activeGroupIndex]
  const activeBands = activeGroup?.bands || []

  function updateGroupBands(gi: number, updater: (bands: OccupancyBand[]) => OccupancyBand[]) {
    setGroups((prev) =>
      prev.map((g, i) => (i === gi ? { ...g, bands: updater(g.bands) } : g))
    )
    setHasChanges(true)
    setSaveSuccess(false)
  }

  function addBand() {
    if (!isAccelerator) return
    const lastBand = activeBands[activeBands.length - 1]
    const newMinPct = lastBand ? lastBand.max_pct + 1 : 0
    const newMinNum = lastBand ? lastBand.max_num + 1 : 0
    updateGroupBands(activeGroupIndex, (prev) => [
      ...prev,
      {
        band_index: prev.length,
        min_pct: Math.min(newMinPct, 100),
        max_pct: Math.min(newMinPct + 20, 100),
        min_num: newMinNum,
        max_num: totalRooms > 0 ? Math.min(newMinNum + 5, totalRooms) : newMinNum + 5,
        label: `Fascia ${prev.length + 1}`,
        increment_pct: 0,
        increment_eur: 0,
        occupancy_mode: occupancyMode,
        increment_mode: incrementMode,
      },
    ])
  }

  function removeBand(index: number) {
    if (!isAccelerator) return
    updateGroupBands(activeGroupIndex, (prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((b, i) => ({ ...b, band_index: i }))
    )
  }

  function updateBand(index: number, field: keyof OccupancyBand, value: string | number) {
    if (!isAccelerator) return
    // Clamp num fields to totalRooms
    if (totalRooms > 0 && typeof value === "number" && (field === "min_num" || field === "max_num")) {
      value = Math.max(0, Math.min(value, totalRooms))
    }
    updateGroupBands(activeGroupIndex, (prev) =>
      prev.map((b, i) => (i === index ? { ...b, [field]: value } : b))
    )
  }

  function moveBand(index: number, direction: "up" | "down") {
    if (!isAccelerator) return
    updateGroupBands(activeGroupIndex, (prev) => {
      const newBands = [...prev]
      const targetIndex = direction === "up" ? index - 1 : index + 1
      if (targetIndex < 0 || targetIndex >= newBands.length) return prev
      ;[newBands[index], newBands[targetIndex]] = [newBands[targetIndex], newBands[index]]
      return newBands.map((b, i) => ({ ...b, band_index: i }))
    })
  }

  function handleOccupancyModeChange(mode: "pct" | "num") {
    if (!isAccelerator) return
    setOccupancyMode(mode)
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        bands: g.bands.map((b) => ({ ...b, occupancy_mode: mode })),
      }))
    )
    setHasChanges(true)
    setSaveSuccess(false)
  }

  function handleIncrementModeChange(mode: "pct" | "eur") {
    if (!isAccelerator) return
    setIncrementMode(mode)
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        bands: g.bands.map((b) => ({ ...b, increment_mode: mode })),
      }))
    )
    setHasChanges(true)
    setSaveSuccess(false)
  }

  // ---- Save ----

  async function handleSave() {
    if (!isAccelerator) return
    const latestGroups = groupsRef.current
    setSaving(true)
    setError(null)
    setSaveSuccess(false)
    try {
      const res = await fetch("/api/settings/occupancy-bands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groups: latestGroups }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || `Errore salvataggio: ${res.status}`)
      }
      setHasChanges(false)
      setSaveSuccess(true)
      await loadData()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // ---- Validation (per active group) ----

  const hasOverlap = activeBands.some((b, i) =>
    activeBands.some((other, j) => {
      if (i === j) return false
      if (occupancyMode === "pct") {
        return b.min_pct <= other.max_pct && b.max_pct >= other.min_pct
      }
      return b.min_num <= other.max_num && b.max_num >= other.min_num
    })
  )
  const hasInvalidRange = activeBands.some((b) =>
    occupancyMode === "pct" ? b.min_pct > b.max_pct : b.min_num > b.max_num
  )

  // Coverage visualization for active group
  const coveredRanges = useMemo(
    () =>
      activeBands.map((b) =>
        occupancyMode === "pct"
          ? { start: Math.max(0, Math.min(100, b.min_pct)), end: Math.max(0, Math.min(100, b.max_pct)) }
          : totalRooms > 0
            ? { start: (b.min_num / totalRooms) * 100, end: (b.max_num / totalRooms) * 100 }
            : { start: 0, end: 0 }
      ),
    [activeBands, occupancyMode, totalRooms]
  )

  // ---- Render ----

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle>Fasce di Occupazione</CardTitle>
            <CardDescription className="mt-1">
              Configura gruppi di fasce (stagionalita) utilizzati dall{"'"}Algoritmo Base per il calcolo dinamico dei prezzi.
            </CardDescription>
          </div>
          {isAccelerator && hasChanges && (
            <Button onClick={handleSave} disabled={saving || hasOverlap || hasInvalidRange} className="gap-2 flex-shrink-0">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Salvataggio..." : "Salva tutto"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Read-only banner if not accelerator */}
        {!loading && !isAccelerator && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200">
            <Lock className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800">Modalita sola lettura</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Attiva Accelerator per modificare le fasce di occupazione e abilitare il pricing dinamico.
              </p>
            </div>
            <Link href="/accelerator/activate">
              <Button variant="outline" size="sm" className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-100">
                <Zap className="h-3.5 w-3.5" />
                Attiva Accelerator
              </Button>
            </Link>
          </div>
        )}

        {/* Status messages */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}
        {saveSuccess && !hasChanges && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 text-emerald-700 text-sm">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            Fasce salvate correttamente.
          </div>
        )}

        {/* Validation warnings */}
        {hasOverlap && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 text-amber-700 text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            Alcune fasce del gruppo attivo si sovrappongono. Correggi i range prima di salvare.
          </div>
        )}
        {hasInvalidRange && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            Il valore minimo non puo essere superiore al massimo.
          </div>
        )}

        {/* Mode selectors */}
        <div className="flex flex-wrap items-center gap-6 p-4 rounded-lg border border-border bg-muted/30">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Definisci occupazione in</Label>
            <Select
              value={occupancyMode}
              onValueChange={(v) => handleOccupancyModeChange(v as "pct" | "num")}
              disabled={!isAccelerator}
            >
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pct">Percentuale (%)</SelectItem>
                <SelectItem value="num">Numero camere</SelectItem>
              </SelectContent>
            </Select>
            {occupancyMode === "num" && (
              <p className="text-[10px] text-muted-foreground">
                {totalRooms > 0 ? `Totale camere struttura: ${totalRooms} (max impostabile)` : "Nessuna camera trovata -- configura le tipologie di camera."}
              </p>
            )}
          </div>

          {occupancyMode === "num" && totalRooms > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-blue-50 border border-blue-200">
              <Badge variant="outline" className="text-xs border-blue-300 text-blue-700 font-semibold">
                Max: {totalRooms} camere
              </Badge>
              <span className="text-[11px] text-blue-600">I valori sono limitati al totale camere della struttura</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Definisci incremento prezzo in</Label>
            <Select
              value={incrementMode}
              onValueChange={(v) => handleIncrementModeChange(v as "pct" | "eur")}
              disabled={!isAccelerator}
            >
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pct">Percentuale (%)</SelectItem>
                <SelectItem value="eur">Importo fisso (EUR)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Loading state */}
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Caricamento fasce...
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center py-10 space-y-3">
            <p className="text-muted-foreground text-sm">
              {isAccelerator
                ? "Nessun gruppo di fasce configurato. Crea il primo gruppo per iniziare."
                : "Nessuna fascia configurata. Attiva Accelerator per creare le fasce di occupazione."}
            </p>
            {isAccelerator && (
              <Button onClick={addGroup} variant="outline" className="gap-2">
                <FolderPlus className="h-4 w-4" />
                Crea primo gruppo
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Groups tabs */}
            <Tabs
              value={String(activeGroupIndex)}
              onValueChange={(v) => setActiveGroupIndex(Number(v))}
            >
              <div className="flex items-center gap-2">
                <div className="flex-1 overflow-x-auto">
                  <TabsList className="w-max">
                    {groups.map((g, gi) => (
                      <TabsTrigger key={gi} value={String(gi)} className="gap-1.5 min-h-[40px]">
                        <span
                          className="inline-block w-3 h-3 rounded-full shrink-0 border border-black/10"
                          style={{ backgroundColor: g.color }}
                        />
                        {editingGroupName === gi ? (
                          <Input
                            autoFocus
                            value={tempGroupName}
                            onChange={(e) => setTempGroupName(e.target.value)}
                            onBlur={confirmRenameGroup}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") confirmRenameGroup()
                              if (e.key === "Escape") setEditingGroupName(null)
                            }}
                            className="h-6 w-32 text-xs"
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <>
                            <span className="truncate max-w-28">{g.name}</span>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-0.5">
                              {g.bands.length}
                            </Badge>
                          </>
                        )}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>
                {isAccelerator && (
                  <Button onClick={addGroup} variant="outline" size="sm" className="gap-1.5 flex-shrink-0 h-9">
                    <FolderPlus className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Nuovo gruppo</span>
                  </Button>
                )}
              </div>

              {groups.map((group, gi) => (
                <TabsContent key={gi} value={String(gi)} className="space-y-4 mt-4">
                  {/* Group header with actions */}
                  {isAccelerator && (
                    <div className="flex items-center gap-2 pb-2 border-b border-border">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-muted-foreground h-8"
                        onClick={() => startRenameGroup(gi)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Rinomina
                      </Button>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 text-muted-foreground h-8"
                          >
                            <span
                              className="inline-block w-3.5 h-3.5 rounded-full border border-black/15"
                              style={{ backgroundColor: group.color }}
                            />
                            Colore
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-3" align="start">
                          <div className="grid grid-cols-5 gap-2">
                            {GROUP_COLORS.map((c) => (
                              <button
                                key={c.value}
                                title={c.label}
                                className={`w-7 h-7 rounded-full border-2 transition-all hover:scale-110 ${group.color === c.value ? "border-foreground ring-2 ring-offset-2 ring-primary" : "border-transparent"}`}
                                style={{ backgroundColor: c.value }}
                                onClick={() => changeGroupColor(gi, c.value)}
                              />
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-muted-foreground h-8"
                        onClick={() => duplicateGroup(gi)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Duplica
                      </Button>
                      {groups.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 text-destructive hover:text-destructive h-8 ml-auto"
                          onClick={() => removeGroup(gi)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Elimina gruppo
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Coverage bar */}
                  {gi === activeGroupIndex && activeBands.length > 0 && (
                    <div>
                      <Label className="text-xs text-muted-foreground mb-2 block">
                        Copertura {occupancyMode === "pct" ? "0% - 100%" : `0 - ${totalRooms} camere`}
                      </Label>
                      <div className="relative h-8 bg-muted rounded-md overflow-hidden border border-border">
                        {coveredRanges.map((r, i) => (
                          <div
                            key={i}
                            className="absolute top-0 bottom-0 bg-primary/20 border-l border-r border-primary/30"
                            style={{
                              left: `${r.start}%`,
                              width: `${Math.max(r.end - r.start, 1)}%`,
                            }}
                          >
                            <span className="absolute inset-0 flex items-center justify-center text-[9px] font-medium text-primary truncate px-0.5">
                              {activeBands[i]?.label || `F${i + 1}`}
                            </span>
                          </div>
                        ))}
                        {[0, 25, 50, 75, 100].map((tick) => (
                          <div key={tick} className="absolute top-0 bottom-0 border-l border-dashed border-muted-foreground/20" style={{ left: `${tick}%` }}>
                            <span className="absolute -bottom-4 text-[8px] text-muted-foreground -translate-x-1/2">
                              {occupancyMode === "pct" ? `${tick}%` : Math.round((tick / 100) * totalRooms)}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="h-4" />
                    </div>
                  )}

                  {/* Bands list */}
                  <div className="space-y-3">
                    {group.bands.map((band, index) => (
                      <div
                        key={index}
                        className={`border border-border rounded-lg p-4 transition-colors ${
                          isAccelerator ? "bg-card hover:bg-muted/20" : "bg-muted/10 opacity-80"
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          {/* Move controls */}
                          {isAccelerator && (
                            <div className="flex flex-col items-center gap-0.5 pt-1">
                              <Button variant="ghost" size="sm" disabled={index === 0} onClick={() => moveBand(index, "up")} className="h-6 w-6 p-0">
                                <ArrowUp className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" disabled={index === group.bands.length - 1} onClick={() => moveBand(index, "down")} className="h-6 w-6 p-0">
                                <ArrowDown className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}

                          {/* Band config */}
                          <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4">
                            {/* Label */}
                            <div className="space-y-1.5">
                              <Label className="text-xs text-muted-foreground">Nome fascia</Label>
                              <Input
                                value={band.label}
                                onChange={(e) => updateBand(index, "label", e.target.value)}
                                placeholder={`Fascia ${index + 1}`}
                                className="h-9"
                                disabled={!isAccelerator}
                              />
                            </div>

                            {/* Min */}
                            <div className="space-y-1.5">
                              <Label className="text-xs text-muted-foreground">
                                {occupancyMode === "pct" ? "Occupazione min %" : "Camere min"}
                              </Label>
                              <div className="flex items-center gap-1">
                                <Input
                                  type="number"
                                  min={0}
                                  max={occupancyMode === "pct" ? 100 : totalRooms || 999}
                                  value={occupancyMode === "pct" ? band.min_pct : band.min_num}
                                  onChange={(e) =>
                                    updateBand(
                                      index,
                                      occupancyMode === "pct" ? "min_pct" : "min_num",
                                      parseInt(e.target.value) || 0
                                    )
                                  }
                                  className="h-9"
                                  disabled={!isAccelerator}
                                />
                                <span className="text-sm text-muted-foreground">
                                  {occupancyMode === "pct" ? "%" : "cam"}
                                </span>
                              </div>
                            </div>

                            {/* Max */}
                            <div className="space-y-1.5">
                              <Label className="text-xs text-muted-foreground">
                                {occupancyMode === "pct" ? "Occupazione max %" : "Camere max"}
                              </Label>
                              <div className="flex items-center gap-1">
                                <Input
                                  type="number"
                                  min={0}
                                  max={occupancyMode === "pct" ? 100 : totalRooms || 999}
                                  value={occupancyMode === "pct" ? band.max_pct : band.max_num}
                                  onChange={(e) =>
                                    updateBand(
                                      index,
                                      occupancyMode === "pct" ? "max_pct" : "max_num",
                                      parseInt(e.target.value) || 0
                                    )
                                  }
                                  className="h-9"
                                  disabled={!isAccelerator}
                                />
                                <span className="text-sm text-muted-foreground">
                                  {occupancyMode === "pct" ? "%" : "cam"}
                                </span>
                              </div>
                            </div>

                            {/* Increment */}
                            <div className="space-y-1.5">
                              <Label className="text-xs text-muted-foreground">
                                {incrementMode === "pct" ? "Incremento prezzo %" : "Incremento prezzo EUR"}
                              </Label>
                              <div className="flex items-center gap-1">
                                <Input
                                  type="number"
                                  step={incrementMode === "pct" ? "0.1" : "0.01"}
                                  value={incrementMode === "pct" ? band.increment_pct : band.increment_eur}
                                  onChange={(e) =>
                                    updateBand(
                                      index,
                                      incrementMode === "pct" ? "increment_pct" : "increment_eur",
                                      parseFloat(e.target.value) || 0
                                    )
                                  }
                                  className="h-9"
                                  disabled={!isAccelerator}
                                />
                                <span className="text-sm text-muted-foreground">
                                  {incrementMode === "pct" ? "%" : "EUR"}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Delete */}
                          {isAccelerator && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeBand(index)}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10 h-9 w-9 p-0 mt-5"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>

                        {/* Visual indicator */}
                        <div className="mt-3 flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {occupancyMode === "pct"
                              ? `${band.min_pct}% - ${band.max_pct}%`
                              : `${band.min_num} - ${band.max_num} camere`}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {incrementMode === "pct"
                              ? band.increment_pct > 0
                                ? `+${band.increment_pct}% sul prezzo`
                                : band.increment_pct < 0
                                  ? `${band.increment_pct}% sul prezzo`
                                  : "Nessun aggiustamento"
                              : band.increment_eur > 0
                                ? `+${Number(band.increment_eur).toFixed(2)} EUR`
                                : band.increment_eur < 0
                                  ? `${Number(band.increment_eur).toFixed(2)} EUR`
                                  : "Nessun aggiustamento"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Add band button */}
                  {isAccelerator ? (
                    <Button variant="outline" onClick={addBand} className="w-full gap-2 border-dashed">
                      <Plus className="h-4 w-4" />
                      Aggiungi fascia a &quot;{group.name}&quot;
                    </Button>
                  ) : group.bands.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground text-sm">
                      Nessuna fascia in questo gruppo.
                    </div>
                  ) : null}
                </TabsContent>
              ))}
            </Tabs>

            {/* Help text */}
            <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-4 space-y-1.5">
              <p className="font-medium">Come funzionano i gruppi di fasce?</p>
              <p>
                Ogni gruppo rappresenta una <strong>stagionalita</strong> (es. Bassa Stagione, Alta Stagione, Eventi).
                Nella tabella prezzi dell{"'"}Accelerator potrai assegnare un gruppo di fasce diverso per ciascun giorno
                o periodo, in modo che l{"'"}algoritmo applichi gli incrementi corretti in base alla stagionalita.
              </p>
              <p>
                All{"'"}interno di ogni gruppo, le fasce definiscono come il prezzo varia in base al tasso di occupazione
                giornaliero. Puoi definirle in <strong>percentuale</strong> (es. 0-30%) o in <strong>numero di camere vendute</strong>.
              </p>
            </div>
          </>
        )}

        {/* Bottom save */}
        {isAccelerator && hasChanges && (
          <div className="flex justify-end pt-4 border-t border-border">
            <Button onClick={handleSave} disabled={saving || hasOverlap || hasInvalidRange} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Salvataggio..." : "Salva tutto"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
