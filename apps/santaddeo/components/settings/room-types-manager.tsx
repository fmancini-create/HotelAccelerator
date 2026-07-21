"use client"

import React from "react"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Download, RefreshCw, Users, Home, Maximize, Save, GripVertical, Info, AlertTriangle, Plus, Import } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface RoomType {
  id: string
  scidoo_room_type_id: string
  brig_room_code: string | null
  brig_reservation_room_code: string | null
  name: string
  capacity: number
  min_occupancy: number
  max_occupancy: number
  total_rooms: number
  size_sqm: number | null
  additional_beds: number
  is_active: boolean
  deactivated_at: string | null
  display_order: number | null
  created_at: string
  updated_at: string
}

interface RoomTypesManagerProps {
  hotelId: string
  initialRoomTypes?: RoomType[]
  integrationMode?: string
  isSuperAdmin?: boolean
  pmsName?: string | null
}

export function RoomTypesManager({ hotelId, initialRoomTypes = [], integrationMode = "api", isSuperAdmin = false, pmsName = null }: RoomTypesManagerProps) {
  const isBrig = pmsName === "brig"
  const isGSheetsMode = integrationMode === "gsheets"
  const [roomTypes, setRoomTypes] = useState<RoomType[]>(() => sortByDisplayOrder(initialRoomTypes))
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [editedRoomTypes, setEditedRoomTypes] = useState<Set<string>>(new Set())
  const [orderChanged, setOrderChanged] = useState(false)
  const [lastSyncDate, setLastSyncDate] = useState<string | null>(null)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [newRoomType, setNewRoomType] = useState({ name: "", total_rooms: 1, capacity: 2, min_occupancy: 1, max_occupancy: 2 })
  const [isImporting, setIsImporting] = useState(false)

  function sortByDisplayOrder(items: RoomType[]): RoomType[] {
    return [...items].sort((a, b) => {
      const aOrder = a.display_order ?? 999
      const bOrder = b.display_order ?? 999
      if (aOrder !== bOrder) return aOrder - bOrder
      return a.name.localeCompare(b.name)
    })
  }

  useEffect(() => {
    if (roomTypes.length > 0) {
      const mostRecent = roomTypes.reduce((latest: Date, rt: RoomType) => {
        const rtDate = new Date(rt.updated_at || rt.created_at)
        return rtDate > latest ? rtDate : latest
      }, new Date(0))
      setLastSyncDate(
        mostRecent.toLocaleString("it-IT", {
          day: "2-digit", month: "2-digit", year: "numeric",
          hour: "2-digit", minute: "2-digit",
        }),
      )
    }
  }, [roomTypes])

  // --- Drag and Drop handlers ---
  const handleDragStart = useCallback((index: number) => {
    setDraggedIndex(index)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOverIndex(index)
  }, [])

  const handleDragEnd = useCallback(() => {
    if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
      setRoomTypes((prev) => {
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

  const moveItem = useCallback((fromIndex: number, direction: "up" | "down") => {
    const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1
    setRoomTypes((prev) => {
      if (toIndex < 0 || toIndex >= prev.length) return prev
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })
    setOrderChanged(true)
  }, [])

  // --- Sync ---
  const handleSync = async () => {
    setIsLoading(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch("/api/pms/room-types/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to sync room types")

      setRoomTypes(sortByDisplayOrder(data.roomTypes))
      setEditedRoomTypes(new Set())
      setOrderChanged(false)
      setSuccess(`Sincronizzate ${data.count} tipologie di camere dal PMS`)
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Errore durante la sincronizzazione"
      // Riconosci la quota giornaliera BRiG (sandbox=100/giorno) e
      // mostra un messaggio chiaro invece del 429 grezzo.
      // Vedi memoria 25/05/2026 "Brig sandbox 100 req/giorno".
      const isBrigQuota =
        /maximum\s+number\s+of\s+requests/i.test(raw) ||
        (/429/.test(raw) && /brig|nol/i.test(raw))
      if (isBrigQuota) {
        setError(
          "Quota giornaliera BRiG esaurita (sandbox: 100 richieste/giorno). " +
            "Il reset avviene a mezzanotte. Riprova domani o contatta BRiG per un piano superiore.",
        )
      } else {
        setError(raw)
      }
    } finally {
      setIsLoading(false)
    }
  }

  // --- Field changes ---
  const handleRoomCountChange = (roomTypeId: string, value: string) => {
    const numValue = Number.parseInt(value) || 0
    setRoomTypes((prev) => prev.map((rt) => (rt.id === roomTypeId ? { ...rt, total_rooms: numValue } : rt)))
    setEditedRoomTypes((prev) => new Set(prev).add(roomTypeId))
  }

  const handleActiveChange = (roomTypeId: string, checked: boolean) => {
    setRoomTypes((prev) => prev.map((rt) => {
      if (rt.id !== roomTypeId) return rt
      // Riattivando, azzeriamo subito la data anche lato UI (il trigger DB fa
      // lo stesso). Disattivando, se non c'e' gia' una data la pre-compiliamo
      // con oggi cosi' l'utente vede/puo' correggere il cutoff prima di salvare.
      const today = new Date().toISOString().slice(0, 10)
      const deactivated_at = checked ? null : (rt.deactivated_at ?? today)
      return { ...rt, is_active: checked, deactivated_at }
    }))
    setEditedRoomTypes((prev) => new Set(prev).add(roomTypeId))
  }

  // Imposta/corregge manualmente la data di disattivazione (formato 'YYYY-MM-DD',
  // o stringa vuota = nessun cutoff). Vale solo per le tipologie disattivate.
  const handleDeactivatedAtChange = (roomTypeId: string, value: string) => {
    setRoomTypes((prev) => prev.map((rt) => (rt.id === roomTypeId ? { ...rt, deactivated_at: value || null } : rt)))
    setEditedRoomTypes((prev) => new Set(prev).add(roomTypeId))
  }

  const handleMinOccupancyChange = (roomTypeId: string, value: string) => {
    const numValue = Math.max(1, Number.parseInt(value) || 1)
    setRoomTypes((prev) => prev.map((rt) => {
      if (rt.id !== roomTypeId) return rt
      const maxOcc = Math.max(numValue, rt.max_occupancy)
      return { ...rt, min_occupancy: numValue, max_occupancy: maxOcc }
    }))
    setEditedRoomTypes((prev) => new Set(prev).add(roomTypeId))
  }

  const handleMaxOccupancyChange = (roomTypeId: string, value: string) => {
    const numValue = Math.max(1, Number.parseInt(value) || 1)
    setRoomTypes((prev) => prev.map((rt) => {
      if (rt.id !== roomTypeId) return rt
      const minOcc = Math.min(numValue, rt.min_occupancy)
      return { ...rt, max_occupancy: numValue, min_occupancy: minOcc }
    }))
    setEditedRoomTypes((prev) => new Set(prev).add(roomTypeId))
  }

  // Solo super admin: rinomina l'etichetta della camera. La modifica e'
  // persistita tramite il batch save standard (handleSaveChanges) e
  // l'API /api/scidoo/room-types/update verifica il ruolo lato server.
  const handleNameChange = (roomTypeId: string, value: string) => {
    if (!isSuperAdmin) return
    setRoomTypes((prev) => prev.map((rt) => (rt.id === roomTypeId ? { ...rt, name: value } : rt)))
    setEditedRoomTypes((prev) => new Set(prev).add(roomTypeId))
  }

  // Solo super admin: imposta il `brig_reservation_room_code`, ovvero il
  // codice descrittivo (es. "MATRIMONIALE", "DOPPIA") che BRiG espone in
  // `getReservations().roomCode`. Senza di esso il mapper ETL non riesce
  // a collegare booking->room_type per gli hotel BRiG, quindi la
  // dashboard rimane vuota anche se i raw bookings sono presenti.
  // Vedi memoria 21/05/2026 "BRiG room_types: due namespace separati".
  const handleBrigReservationCodeChange = (roomTypeId: string, value: string) => {
    if (!isSuperAdmin) return
    setRoomTypes((prev) => prev.map((rt) => (rt.id === roomTypeId ? { ...rt, brig_reservation_room_code: value } : rt)))
    setEditedRoomTypes((prev) => new Set(prev).add(roomTypeId))
  }

  // Solo super admin: imposta il `brig_room_code`, ovvero il codice usato
  // da BRiG per il PUT /rateplans/updateRates (push tariffe). Senza
  // questo, il push verso BRiG fallisce con "Room type X non ha
  // brig_room_code mappato". Normalmente popolato dal sync, ma se Brig
  // ritorna i room types con codici diversi dal nostro `code`
  // normalizzato, il match fallisce e la riga resta NULL: l'override
  // manuale via questo input e' la via di fuga.
  // Vedi memoria 21/05/2026 "BRiG room_types: due namespace separati".
  const handleBrigRoomCodeChange = (roomTypeId: string, value: string) => {
    if (!isSuperAdmin) return
    setRoomTypes((prev) => prev.map((rt) => (rt.id === roomTypeId ? { ...rt, brig_room_code: value } : rt)))
    setEditedRoomTypes((prev) => new Set(prev).add(roomTypeId))
  }

  // --- Save all (field changes + order) ---
  const handleSaveChanges = async () => {
    setIsSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const promises: Promise<Response>[] = []

      // 1) Save individual field changes
      if (editedRoomTypes.size > 0) {
        for (const roomTypeId of editedRoomTypes) {
          const roomType = roomTypes.find((rt) => rt.id === roomTypeId)
          if (!roomType) continue
          promises.push(
            fetch("/api/scidoo/room-types/update", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                roomTypeId,
                total_rooms: roomType.total_rooms,
                is_active: roomType.is_active,
                min_occupancy: roomType.min_occupancy,
                max_occupancy: roomType.max_occupancy,
                // Data di disattivazione: inviata come 'YYYY-MM-DD' (o null).
                // Se attiva forziamo null (nessun cutoff), coerente col trigger DB.
                deactivated_at: roomType.is_active
                  ? null
                  : (roomType.deactivated_at ? String(roomType.deactivated_at).slice(0, 10) : null),
                // name solo se super admin: l'API valida il ruolo, ma evitiamo
                // di mandare il campo dai tenant per non generare 403 spuri.
                ...(isSuperAdmin ? { name: roomType.name } : {}),
                // brig_reservation_room_code: solo super admin, e solo se
                // pms = brig. L'API valida ruolo e payload lato server.
                    ...(isSuperAdmin && isBrig
                      ? {
                          brig_reservation_room_code: roomType.brig_reservation_room_code ?? null,
                          brig_room_code: roomType.brig_room_code ?? null,
                        }
                      : {}),
              }),
            }),
          )
        }
      }

      // 2) Save display_order for ALL items (always, to keep order consistent)
      const orderItems = roomTypes.map((rt, index) => ({
        id: rt.id,
        display_order: index + 1,
      }))
      promises.push(
        fetch("/api/settings/reorder", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ table: "room_types", items: orderItems }),
        }),
      )

      const results = await Promise.all(promises)
      const failed = results.filter((r) => !r.ok)

      if (failed.length > 0) {
        throw new Error(`Errore nel salvare ${failed.length} elementi`)
      }

      // Update local state with saved display_order
      setRoomTypes((prev) =>
        prev.map((rt, index) => ({ ...rt, display_order: index + 1 })),
      )
      setEditedRoomTypes(new Set())
      setOrderChanged(false)
      const changeCount = editedRoomTypes.size
      setSuccess(
        orderChanged && changeCount > 0
          ? `Ordine e ${changeCount} modifiche salvate con successo`
          : orderChanged
            ? "Ordine di visualizzazione salvato"
            : `${changeCount} modifiche salvate con successo`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante il salvataggio")
    } finally {
      setIsSaving(false)
    }
  }

  const hasPendingChanges = editedRoomTypes.size > 0 || orderChanged

  // --- Add new room type manually (GSheets mode) ---
  const handleAddRoomType = async () => {
    if (!newRoomType.name.trim()) {
      setError("Inserisci un nome per la tipologia")
      return
    }
    
    setIsSaving(true)
    setError(null)
    
    try {
      const response = await fetch("/api/settings/room-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelId,
          name: newRoomType.name.trim(),
          total_rooms: newRoomType.total_rooms,
          capacity: newRoomType.max_occupancy,
          min_occupancy: newRoomType.min_occupancy,
          max_occupancy: newRoomType.max_occupancy,
        }),
      })
      
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Errore nella creazione")
      
      setRoomTypes((prev) => sortByDisplayOrder([...prev, data.roomType]))
      setNewRoomType({ name: "", total_rooms: 1, capacity: 2, min_occupancy: 1, max_occupancy: 2 })
      setShowAddDialog(false)
      setSuccess("Tipologia di camera creata con successo")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nella creazione")
    } finally {
      setIsSaving(false)
    }
  }

  // --- Import room types from availability data (GSheets mode) ---
  const handleImportFromAvailability = async () => {
    setIsImporting(true)
    setError(null)
    setSuccess(null)
    
    try {
      const response = await fetch("/api/settings/room-types/import-from-availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId }),
      })
      
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Errore nell'importazione")
      
      if (data.imported === 0) {
        setSuccess("Nessuna nuova tipologia trovata da importare")
      } else {
        setRoomTypes(sortByDisplayOrder(data.roomTypes))
        setSuccess(`Importate ${data.imported} tipologie di camere dai dati di disponibilita'`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nell'importazione")
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Tipologie di Camere</CardTitle>
            <CardDescription>
              Scarica e configura le tipologie di camere dal PMS
              {lastSyncDate && (
                <span className="block mt-1 text-xs">Ultimo aggiornamento: {lastSyncDate}</span>
              )}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {hasPendingChanges && (
              <Button onClick={handleSaveChanges} disabled={isSaving} variant="default">
                {isSaving ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
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
              <Button onClick={handleSync} disabled={isLoading} variant="outline">
                {isLoading ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
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
            {isGSheetsMode && (
              <>
                <Button onClick={handleImportFromAvailability} disabled={isImporting} variant="outline">
                  {isImporting ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Importazione...
                    </>
                  ) : (
                    <>
                      <Import className="mr-2 h-4 w-4" />
                      Importa da Dati
                    </>
                  )}
                </Button>
                <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <Plus className="mr-2 h-4 w-4" />
                      Aggiungi
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Aggiungi Tipologia Camera</DialogTitle>
                      <DialogDescription>
                        Crea manualmente una nuova tipologia di camera per questo hotel.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="name" className="text-right">Nome</Label>
                        <Input
                          id="name"
                          value={newRoomType.name}
                          onChange={(e) => setNewRoomType(prev => ({ ...prev, name: e.target.value }))}
                          className="col-span-3"
                          placeholder="es. Camera Doppia"
                        />
                      </div>
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="total_rooms" className="text-right">N. Camere</Label>
                        <Input
                          id="total_rooms"
                          type="number"
                          min="1"
                          value={newRoomType.total_rooms}
                          onChange={(e) => setNewRoomType(prev => ({ ...prev, total_rooms: parseInt(e.target.value) || 1 }))}
                          className="col-span-3"
                        />
                      </div>
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="min_occ" className="text-right">Occ. Min</Label>
                        <Input
                          id="min_occ"
                          type="number"
                          min="1"
                          max={newRoomType.max_occupancy}
                          value={newRoomType.min_occupancy}
                          onChange={(e) => {
                            const v = parseInt(e.target.value) || 1
                            setNewRoomType(prev => ({ ...prev, min_occupancy: v, max_occupancy: Math.max(v, prev.max_occupancy) }))
                          }}
                          className="col-span-3"
                        />
                      </div>
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="max_occ" className="text-right">Occ. Max</Label>
                        <Input
                          id="max_occ"
                          type="number"
                          min={newRoomType.min_occupancy}
                          value={newRoomType.max_occupancy}
                          onChange={(e) => {
                            const v = parseInt(e.target.value) || 1
                            setNewRoomType(prev => ({ ...prev, max_occupancy: v, min_occupancy: Math.min(v, prev.min_occupancy) }))
                          }}
                          className="col-span-3"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowAddDialog(false)}>Annulla</Button>
                      <Button onClick={handleAddRoomType} disabled={isSaving}>
                        {isSaving ? "Creazione..." : "Crea"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </>
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
              Il <strong>matching dei codici PMS</strong> con SANTADDEO viene gestito dal super admin
              in <em>Connectors Mapping</em> (mapping anagrafico globale). Qui invece configuri cose
              che dipendono dalla <strong>singola struttura</strong>: ordine di visualizzazione,
              attivo/non attivo, occupanza, numero camere. L{"'"}ordine impatta direttamente
              l{"'"}algoritmo di pricing (vedi avviso sotto).
            </p>
          </div>
        </div>

        {/* Algorithm order warning */}
        <div className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/40">
          <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
          <div className="text-sm text-red-800 dark:text-red-300">
            <p className="font-medium">Ordine e algoritmo prezzi</p>
            <p className="mt-0.5 text-red-700 dark:text-red-400">
              L{"'"}ordine di visualizzazione influenza direttamente l{"'"}algoritmo di calcolo dei prezzi (Accelerator).
              Si raccomanda di ordinare le tipologie di camere <strong>in ordine di importanza e prezzo</strong>,
              dalla meno importante / prezzo piu{"'"} basso (in alto) alla piu{"'"} importante / prezzo piu{"'"} alto (in basso).
            </p>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {success && (
          <Alert>
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        {roomTypes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Home className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nessuna tipologia di camera</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Clicca su "Scarica" per importare le tipologie di camere dal tuo PMS
            </p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead className="w-12">Attiva</TableHead>
                  <TableHead className="text-center w-[150px]" title="Da questa data la tipologia non viene piu' conteggiata nei report (occupazione, camere vendute). I periodi precedenti restano invariati.">
                    Disattivata dal
                  </TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead className="text-center">
                    <Users className="h-4 w-4 inline mr-1" />
                    Occupazione (Min - Max)
                  </TableHead>
                  <TableHead className="text-center">
                    <Home className="h-4 w-4 inline mr-1" />
                    N. Camere
                  </TableHead>
                  <TableHead className="text-center">
                    <Maximize className="h-4 w-4 inline mr-1" />
                    Dimensione
                  </TableHead>
                  {isBrig ? (
                    <>
                      <TableHead className="text-center" title="Codice numerico BRiG da getRoomTypes() - usato per push tariffe">
                        Codice BRiG (Tariffe)
                      </TableHead>
                      <TableHead className="text-center" title="Codice descrittivo BRiG da getReservations().roomCode - usato per linkare booking a tipologia">
                        Codice BRiG (Prenotazioni)
                      </TableHead>
                    </>
                  ) : (
                    <TableHead className="text-center">ID PMS</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {roomTypes.map((roomType, index) => (
                  <TableRow
                    key={roomType.id}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`
                      ${!roomType.is_active ? "opacity-40 bg-muted/30" : ""}
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
                    <TableCell>
                      <Checkbox
                        checked={roomType.is_active}
                        onCheckedChange={(checked) => handleActiveChange(roomType.id, checked as boolean)}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      {roomType.is_active ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <Input
                          type="date"
                          value={roomType.deactivated_at ? String(roomType.deactivated_at).slice(0, 10) : ""}
                          onChange={(e) => handleDeactivatedAtChange(roomType.id, e.target.value)}
                          className="h-8 text-xs w-[140px] mx-auto"
                          title="Data da cui la tipologia smette di essere conteggiata nei report. Lasciare vuoto per nessun taglio temporale."
                        />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {isSuperAdmin ? (
                        <Input
                          value={roomType.name}
                          onChange={(e) => handleNameChange(roomType.id, e.target.value)}
                          className="h-8 text-sm font-medium min-w-[160px]"
                          placeholder="Etichetta camera"
                          title="Etichetta visualizzata dal tenant (solo super admin)"
                        />
                      ) : (
                        <>
                          {roomType.name}
                          {!roomType.is_active && (
                            <span className="ml-2 text-xs text-destructive font-normal">(disattivata)</span>
                          )}
                        </>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <Input
                          type="number"
                          min="1"
                          max={roomType.max_occupancy || 10}
                          value={roomType.min_occupancy ?? 1}
                          onChange={(e) => handleMinOccupancyChange(roomType.id, e.target.value)}
                          className="w-14 text-center h-8 text-sm"
                          title="Occupazione minima"
                        />
                        <span className="text-muted-foreground text-xs">-</span>
                        <Input
                          type="number"
                          min={roomType.min_occupancy || 1}
                          value={roomType.max_occupancy ?? roomType.capacity}
                          onChange={(e) => handleMaxOccupancyChange(roomType.id, e.target.value)}
                          className="w-14 text-center h-8 text-sm"
                          title="Occupazione massima"
                        />
                        {roomType.additional_beds > 0 && (
                          <Badge variant="outline" className="text-[10px] ml-1">+{roomType.additional_beds}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Input
                        type="number"
                        min="0"
                        value={roomType.total_rooms}
                        onChange={(e) => handleRoomCountChange(roomType.id, e.target.value)}
                        className="w-20 text-center"
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      {roomType.size_sqm ? `${roomType.size_sqm} m2` : "-"}
                    </TableCell>
                    {isBrig ? (
                      <>
                        <TableCell className="text-center">
                          {isSuperAdmin ? (
                            <Input
                              value={roomType.brig_room_code ?? ""}
                              onChange={(e) => handleBrigRoomCodeChange(roomType.id, e.target.value)}
                              className="h-8 text-xs font-mono w-[140px] mx-auto"
                              placeholder="es. DBL"
                              title="Codice numerico/stringa BRiG da getRoomTypes() — usato per push tariffe (PUT /rateplans/updateRates)"
                            />
                          ) : (
                            <code className="text-xs bg-muted px-2 py-1 rounded">
                              {roomType.brig_room_code || (
                                <span className="text-amber-600">non mappato</span>
                              )}
                            </code>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {isSuperAdmin ? (
                            <Input
                              value={roomType.brig_reservation_room_code ?? ""}
                              onChange={(e) => handleBrigReservationCodeChange(roomType.id, e.target.value)}
                              className="h-8 text-xs font-mono w-[160px] mx-auto uppercase"
                              placeholder="es. MATRIMONIALE"
                              title="Codice descrittivo da BRiG getReservations().roomCode"
                            />
                          ) : (
                            <code className="text-xs bg-muted px-2 py-1 rounded">
                              {roomType.brig_reservation_room_code || (
                                <span className="text-amber-600">non mappato</span>
                              )}
                            </code>
                          )}
                        </TableCell>
                      </>
                    ) : (
                      <TableCell className="text-center">
                        <code className="text-xs bg-muted px-2 py-1 rounded">
                          {roomType.scidoo_room_type_id}
                        </code>
                      </TableCell>
                    )}
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
