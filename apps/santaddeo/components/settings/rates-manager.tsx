"use client"

import React from "react"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Download, Save, Loader2, GripVertical, Info } from "lucide-react"

interface Rate {
  id: string
  scidoo_rate_id: string
  code: string
  name: string
  room_type_ids: string[]
  arrangements: Array<{ code: string; description: string }>
  is_active: boolean
  display_order: number | null
  updated_at?: string
  created_at?: string
}

interface RatesManagerProps {
  hotelId: string
  integrationMode?: string
}

function normalizeArrangements(arrangements: any): Array<{ code: string; description: string }> {
  if (Array.isArray(arrangements)) return arrangements
  if (typeof arrangements === "string") {
    try {
      const parsed = JSON.parse(arrangements)
      if (Array.isArray(parsed)) return parsed
    } catch {}
  }
  if (arrangements && typeof arrangements === "object") {
    const keys = Object.keys(arrangements)
    if (keys.every((k) => !Number.isNaN(Number(k)))) return Object.values(arrangements)
  }
  return []
}

function normalizeRoomTypeIds(roomTypeIds: any): string[] {
  if (Array.isArray(roomTypeIds)) return roomTypeIds
  if (typeof roomTypeIds === "string") {
    try {
      const parsed = JSON.parse(roomTypeIds)
      if (Array.isArray(parsed)) return parsed
    } catch {}
  }
  if (roomTypeIds && typeof roomTypeIds === "object") {
    const keys = Object.keys(roomTypeIds)
    if (keys.every((k) => !Number.isNaN(Number(k)))) return Object.values(roomTypeIds)
  }
  return []
}

function sortByDisplayOrder(items: Rate[]): Rate[] {
  return [...items].sort((a, b) => {
    const aOrder = a.display_order ?? 999
    const bOrder = b.display_order ?? 999
    if (aOrder !== bOrder) return aOrder - bOrder
    const aCode = a.code || a.id
    const bCode = b.code || b.id
    return aCode.localeCompare(bCode)
  })
}

export function RatesManager({ hotelId, integrationMode = "api" }: RatesManagerProps) {
  const isGSheetsMode = integrationMode === "gsheets"
  const [rates, setRates] = useState<Rate[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activeChanges, setActiveChanges] = useState<Map<string, boolean>>(new Map())
  const [orderChanged, setOrderChanged] = useState(false)
  const [lastSyncDate, setLastSyncDate] = useState<string | null>(null)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const loadRates = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/rates?hotel_id=${hotelId}`)
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to load rates")
      }
      const { rates: data } = await response.json()
      const normalizedData = (data || []).map((rate: any) => ({
        ...rate,
        room_type_ids: normalizeRoomTypeIds(rate.room_type_ids),
        arrangements: normalizeArrangements(rate.arrangements),
      }))
      setRates(sortByDisplayOrder(normalizedData))

      if (normalizedData.length > 0) {
        const mostRecent = normalizedData.reduce((latest: Date, rate: Rate) => {
          const rateDate = new Date(rate.updated_at || rate.created_at || 0)
          return rateDate > latest ? rateDate : latest
        }, new Date(0))
        setLastSyncDate(
          mostRecent.toLocaleString("it-IT", {
            day: "2-digit", month: "2-digit", year: "numeric",
            hour: "2-digit", minute: "2-digit",
          }),
        )
      } else {
        setLastSyncDate(null)
      }
    } catch (error) {
      console.error("Error loading rates:", error)
      setRates([])
      setLastSyncDate(null)
    } finally {
      setLoading(false)
    }
  }

  const handleSync = async () => {
    try {
      setSyncing(true)
      const response = await fetch("/api/pms/rates/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to sync rates")
      }
      await loadRates()
      setActiveChanges(new Map())
      setOrderChanged(false)
    } catch (error) {
      console.error("Error syncing rates:", error)
      alert(error instanceof Error ? error.message : "Failed to sync rates")
    } finally {
      setSyncing(false)
    }
  }

  // --- Drag and Drop ---
  const handleDragStart = useCallback((index: number) => {
    setDraggedIndex(index)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOverIndex(index)
  }, [])

  const handleDragEnd = useCallback(() => {
    if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
      setRates((prev) => {
        const next = [...prev]
        const [moved] = next.splice(draggedIndex, 1)
        next.splice(dragOverIndex, 0, moved)
        return next
      })
      setOrderChanged(true)
    }
    setDraggedIndex(null)
    setDragOverIndex(null)
  }, [draggedIndex, dragOverIndex])

  // --- Active toggle ---
  const handleActiveChange = (rateId: string, isActive: boolean) => {
    setActiveChanges((prev) => new Map(prev).set(rateId, isActive))
    setRates((prev) => prev.map((rate) => (rate.id === rateId ? { ...rate, is_active: isActive } : rate)))
  }

  // --- Save all ---
  const handleSave = async () => {
    try {
      setSaving(true)
      const promises: Promise<Response>[] = []

      // 1) Save active/inactive changes
      if (activeChanges.size > 0) {
        const updates = Array.from(activeChanges.entries()).map(([id, is_active]) => ({
          id,
          is_active,
        }))
        promises.push(
          fetch("/api/scidoo/rates/update", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ updates }),
          }),
        )
      }

      // 2) Save display_order for all items
      const orderItems = rates.map((r, index) => ({
        id: r.id,
        display_order: index + 1,
      }))
      promises.push(
        fetch("/api/settings/reorder", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ table: "rates", items: orderItems }),
        }),
      )

      const results = await Promise.all(promises)
      const failed = results.filter((r) => !r.ok)
      if (failed.length > 0) throw new Error("Failed to save some changes")

      setRates((prev) => prev.map((r, index) => ({ ...r, display_order: index + 1 })))
      setActiveChanges(new Map())
      setOrderChanged(false)
    } catch (error) {
      console.error("Error saving changes:", error)
      alert(error instanceof Error ? error.message : "Failed to save changes")
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    loadRates()
  }, [hotelId])

  const hasPendingChanges = activeChanges.size > 0 || orderChanged

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Tariffe</CardTitle>
            <CardDescription>
              Gestisci le tariffe sincronizzate dal PMS
              {lastSyncDate && (
                <span className="block mt-1 text-xs">Ultimo aggiornamento: {lastSyncDate}</span>
              )}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {hasPendingChanges && (
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvataggio...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Salva Modifiche
                  </>
                )}
              </Button>
            )}
            {!isGSheetsMode && (
              <Button onClick={handleSync} disabled={syncing} variant="outline">
                {syncing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sincronizzazione...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Scarica
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Info banner */}
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/40">
          <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
          <div className="text-sm text-blue-800 dark:text-blue-300">
            <p className="font-medium">Ordine, attivazione e algoritmo prezzi</p>
            <p className="mt-0.5 text-blue-700 dark:text-blue-400">
              Il <strong>matching dei codici tariffa PMS</strong> con SANTADDEO viene gestito dal super admin
              in <em>Connectors Mapping</em> (mapping anagrafico globale). Qui configuri solo le impostazioni
              per la singola struttura: ordine di visualizzazione, attivo/non attivo. L'ordine influisce
              direttamente sull'algoritmo di pricing (la tariffa piu' in basso e' considerata la piu' premium).
            </p>
          </div>
        </div>

        {rates.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Nessuna tariffa trovata. Clicca su "Scarica" per importare le tariffe.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10" />
                  <TableHead className="h-10 w-[60px]">Attiva</TableHead>
                  <TableHead className="h-10">Nome</TableHead>
                  <TableHead className="h-10 w-[100px]">Codice</TableHead>
                  <TableHead className="h-10">Tipologie Camere</TableHead>
                  <TableHead className="h-10">Trattamenti</TableHead>
                  <TableHead className="h-10 w-[120px]">ID PMS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rates.map((rate, index) => (
                  <TableRow
                    key={rate.id}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`
                      h-12
                      ${!rate.is_active ? "opacity-40 bg-muted/30" : ""}
                      ${draggedIndex === index ? "opacity-30" : ""}
                      ${dragOverIndex === index && draggedIndex !== index ? "border-t-2 border-t-primary" : ""}
                      cursor-grab active:cursor-grabbing transition-colors
                    `}
                  >
                    <TableCell className="px-2">
                      <div className="flex flex-col items-center gap-0.5">
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground font-mono">{index + 1}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      <Checkbox
                        checked={rate.is_active}
                        onCheckedChange={(checked) => handleActiveChange(rate.id, checked as boolean)}
                      />
                    </TableCell>
                    <TableCell className="py-2 font-medium">
                      {rate.name}
                      {!rate.is_active && (
                        <span className="ml-2 text-xs text-destructive font-normal">(disattivata)</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2">
                      <Badge variant="outline" className="text-xs">{rate.code}</Badge>
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="flex flex-wrap gap-1">
                        {(rate.room_type_ids?.length ?? 0) > 0 ? (
                          rate.room_type_ids.slice(0, 3).map((id) => (
                            <Badge key={id} variant="secondary" className="text-xs px-1.5 py-0">{id}</Badge>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground">Nessuna</span>
                        )}
                        {(rate.room_type_ids?.length ?? 0) > 3 && (
                          <Badge variant="secondary" className="text-xs px-1.5 py-0">
                            +{rate.room_type_ids.length - 3}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="flex flex-wrap gap-1">
                        {(rate.arrangements?.length ?? 0) > 0 ? (
                          rate.arrangements.slice(0, 3).map((arr, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs px-1.5 py-0">{arr.code}</Badge>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground">Nessuno</span>
                        )}
                        {(rate.arrangements?.length ?? 0) > 3 && (
                          <Badge variant="secondary" className="text-xs px-1.5 py-0">
                            +{rate.arrangements.length - 3}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-2 text-xs text-muted-foreground">{rate.scidoo_rate_id}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
