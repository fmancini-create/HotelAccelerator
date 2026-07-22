"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Layers, Info, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface RoomType {
  id: string
  name: string
  capacity: number | null
  max_occupancy: number | null
}
interface ObservedRoom {
  name: string
  numGuests: number | null
  lastPrice: number | null
}
interface ObservedComp {
  competitorId: string
  name: string
  rooms: ObservedRoom[]
  // "ok" = ha tipologie selezionabili
  // "no_prices" = Google non espone prezzi (refresh inutile)
  // "no_rooms"  = ha prezzi aggregati ma Google non espone il dettaglio camere (refresh inutile)
  // "pending"   = mai aggiornato (refresh utile)
  status?: "ok" | "no_prices" | "no_rooms" | "pending"
}

const NONE = "__none__"

export function RoomTypeMatcher({
  hotelId,
  onChanged,
}: {
  hotelId: string
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const [max, setMax] = useState(3)
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([])
  const [monitored, setMonitored] = useState<string[]>([])

  const [observed, setObserved] = useState<ObservedComp[]>([])
  // mapping key `${roomTypeId}|${competitorId}` -> competitorRoomName
  const [mapping, setMapping] = useState<Map<string, string>>(new Map())

  const load = useCallback(async () => {
    if (!hotelId) return
    setLoading(true)
    try {
      const [mrRes, rmRes] = await Promise.all([
        fetch(`/api/accelerator/rate-shopper/monitored-rooms?hotelId=${hotelId}`, { cache: "no-store" }),
        fetch(`/api/accelerator/rate-shopper/room-map?hotelId=${hotelId}`, { cache: "no-store" }),
      ])
      const mr = await mrRes.json()
      const rm = await rmRes.json()
      if (mrRes.ok) {
        setMax(mr.max ?? 3)
        setRoomTypes(mr.roomTypes ?? [])
        setMonitored(mr.monitored ?? [])
      }
      if (rmRes.ok) {
        setObserved(rm.observed ?? [])
        const m = new Map<string, string>()
        for (const x of rm.mappings ?? []) m.set(`${x.roomTypeId}|${x.competitorId}`, x.competitorRoomName)
        setMapping(m)
      }
    } catch {
      toast.error("Errore nel caricamento configurazione")
    } finally {
      setLoading(false)
    }
  }, [hotelId])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  // Aggiorna i prezzi (e quindi i nomi camera rilevati) di tutti i competitor,
  // poi ricarica le opzioni: utile dopo aver aggiunto un nuovo competitor.
  async function refreshPrices() {
    setRefreshing(true)
    try {
      const res = await fetch("/api/accelerator/rate-shopper/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId, days: 60, occupancy: 2 }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Errore aggiornamento prezzi")
      toast.success(
        body.pulled > 0 ? `Prezzi aggiornati: ${body.withPrice ?? body.pulled} rilevazioni` : body.note || "Nessun prezzo aggiornato",
      )
      await load()
      onChanged()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setRefreshing(false)
    }
  }

  function toggleRoomType(id: string, checked: boolean) {
    setMonitored((prev) => {
      if (checked) {
        if (prev.includes(id)) return prev
        if (prev.length >= max) {
          toast.info(`Puoi monitorare al massimo ${max} tipologie`)
          return prev
        }
        return [...prev, id]
      }
      return prev.filter((x) => x !== id)
    })
  }

  function setMap(roomTypeId: string, competitorId: string, roomName: string) {
    setMapping((prev) => {
      const next = new Map(prev)
      const key = `${roomTypeId}|${competitorId}`
      if (!roomName || roomName === NONE) next.delete(key)
      else next.set(key, roomName)
      return next
    })
  }

  async function save() {
    setSaving(true)
    try {
      // 1) tipologie monitorate
      const r1 = await fetch("/api/accelerator/rate-shopper/monitored-rooms", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId, roomTypeIds: monitored }),
      })
      if (!r1.ok) throw new Error((await r1.json()).error || "Errore salvataggio tipologie")

      // 2) mapping (solo per le tipologie monitorate)
      const mappings = Array.from(mapping.entries())
        .map(([key, competitorRoomName]) => {
          const [roomTypeId, competitorId] = key.split("|")
          return { roomTypeId, competitorId, competitorRoomName }
        })
        .filter((m) => monitored.includes(m.roomTypeId))
      const r2 = await fetch("/api/accelerator/rate-shopper/room-map", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId, mappings }),
      })
      if (!r2.ok) throw new Error((await r2.json()).error || "Errore salvataggio associazioni")

      toast.success("Associazioni salvate")
      setOpen(false)
      onChanged()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const eur = (n: number | null) =>
    n == null ? "" : ` · da ${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 }).format(n)} €`

  // Solo i competitor con tipologie rilevate sono selezionabili/associabili.
  const selectableComps = observed.filter((c) => c.rooms.length > 0)
  // Competitor senza tipologie, divisi per causa:
  //  - "pending"      -> mai aggiornato: un refresh può importarne le tipologie
  //  - "unavailable"  -> Google non espone prezzi o dettaglio camere: refresh inutile
  const pendingComps = observed.filter((c) => c.rooms.length === 0 && c.status === "pending")
  const unavailableComps = observed.filter(
    (c) => c.rooms.length === 0 && (c.status === "no_prices" || c.status === "no_rooms"),
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Layers className="mr-2 h-4 w-4" aria-hidden="true" />
          Associa tipologie
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Associa tipologie di camera</DialogTitle>
          <DialogDescription>
            Scegli fino a {max} tue tipologie da monitorare e, per ciascun competitor, indica la camera equivalente
            tra quelle rilevate su Google.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex min-h-[30vh] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* 1) Selezione tipologie */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Le tue tipologie da monitorare</h3>
                <span className="text-xs text-muted-foreground">
                  {monitored.length}/{max}
                </span>
              </div>
              {roomTypes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nessuna tipologia disponibile per questa struttura.</p>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {roomTypes.map((rt) => {
                    const checked = monitored.includes(rt.id)
                    const disabled = !checked && monitored.length >= max
                    return (
                      <label
                        key={rt.id}
                        className={`flex items-center gap-2 rounded-md border p-2 text-sm ${
                          disabled ? "opacity-50" : "cursor-pointer"
                        }`}
                      >
                        <Checkbox
                          checked={checked}
                          disabled={disabled}
                          onCheckedChange={(v) => toggleRoomType(rt.id, Boolean(v))}
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{rt.name}</span>
                          {rt.max_occupancy || rt.capacity ? (
                            <span className="block text-xs text-muted-foreground">
                              fino a {rt.max_occupancy ?? rt.capacity} ospiti
                            </span>
                          ) : null}
                        </span>
                      </label>
                    )
                  })}
                </div>
              )}
            </section>

            {/* 2) Mapping per tipologia monitorata: solo competitor con tipologie rilevate */}
            {monitored.length > 0 && selectableComps.length > 0 && (
              <section className="space-y-4">
                <h3 className="text-sm font-medium">Camera equivalente per competitor</h3>
                {monitored.map((rtId) => {
                  const rt = roomTypes.find((x) => x.id === rtId)
                  return (
                    <div key={rtId} className="rounded-md border p-3">
                      <p className="mb-2 text-sm font-medium">{rt?.name ?? "Tipologia"}</p>
                      <div className="flex flex-col gap-2">
                        {selectableComps.map((c) => {
                          const key = `${rtId}|${c.competitorId}`
                          const current = mapping.get(key) ?? NONE
                          return (
                            <div key={c.competitorId} className="grid grid-cols-1 items-center gap-1 sm:grid-cols-3">
                              <Label className="truncate text-xs text-muted-foreground sm:col-span-1">{c.name}</Label>
                              <div className="sm:col-span-2">
                                <Select value={current} onValueChange={(v) => setMap(rtId, c.competitorId, v)}>
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="Nessuna associazione" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value={NONE}>Nessuna associazione</SelectItem>
                                    {c.rooms.map((r) => (
                                      <SelectItem key={r.name} value={r.name}>
                                        {r.name}
                                        {r.numGuests ? ` (${r.numGuests}p)` : ""}
                                        {eur(r.lastPrice)}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </section>
            )}

            {pendingComps.length > 0 && (
              <div className="flex flex-col gap-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-2">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <p>
                    {pendingComps.map((c) => c.name).join(", ")}{" "}
                    {pendingComps.length === 1 ? "non ha" : "non hanno"} ancora tariffe rilevate (es. competitor appena
                    aggiunti) e non {pendingComps.length === 1 ? "è" : "sono"} selezionabili. Aggiorna i prezzi per
                    importarne le tipologie.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={refreshPrices}
                  disabled={refreshing}
                  className="shrink-0"
                >
                  {refreshing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Aggiorna prezzi
                </Button>
              </div>
            )}

            {unavailableComps.length > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" aria-hidden="true" />
                <p className="text-pretty">
                  {unavailableComps.map((c) => c.name).join(", ")}: Google Hotels non espone il dettaglio per tipologia
                  di camera, quindi non {unavailableComps.length === 1 ? "è associabile" : "sono associabili"} e non{" "}
                  {unavailableComps.length === 1 ? "compare" : "compaiono"} qui sopra. Aggiornare i prezzi non risolve:
                  valuta di sostituire {unavailableComps.length === 1 ? "questa struttura" : "queste strutture"} se ti
                  serve il dettaglio per tipologia.
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button onClick={save} disabled={saving || loading}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Salva associazioni
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
