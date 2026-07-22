"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { format } from "date-fns"
import { it } from "date-fns/locale"
import { Loader2, Search, CalendarClock } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

type Prospect = { id: string; name: string; city?: string | null }

const fetcher = (url: string) => fetch(url).then((r) => r.json())

/**
 * Dialog per richiedere una demo sul calendario condiviso clienti@4bid.it.
 * Il venditore propone giorno/ora; la richiesta resta "in attesa" finche' il
 * super admin non la accetta (allora viene creato l'evento Google).
 */
export function RequestDemoDialog({
  open,
  date,
  presetStart,
  presetEnd,
  onClose,
  onCreated,
}: {
  open: boolean
  date: Date
  /** Orario di inizio preimpostato "HH:mm" (es. da uno slot libero cliccato). */
  presetStart?: string
  /** Orario di fine preimpostato "HH:mm". */
  presetEnd?: string
  onClose: () => void
  onCreated: () => void
}) {
  const [day, setDay] = useState("")
  const [start, setStart] = useState("10:00")
  const [end, setEnd] = useState("10:30")
  const [title, setTitle] = useState("")
  const [notes, setNotes] = useState("")
  const [search, setSearch] = useState("")
  const [prospect, setProspect] = useState<Prospect | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setDay(format(date, "yyyy-MM-dd"))
    setStart(presetStart || "10:00")
    setEnd(presetEnd || "10:30")
    setTitle("")
    setNotes("")
    setSearch("")
    setProspect(null)
    setError(null)
  }, [open, date, presetStart, presetEnd])

  const apiUrl = useMemo(() => {
    const q = search.trim()
    return `/api/sales/prospects?page_size=15${q ? `&search=${encodeURIComponent(q)}` : ""}`
  }, [search])
  const { data, isLoading } = useSWR<{ prospects: Prospect[] }>(open ? apiUrl : null, fetcher)

  async function submit() {
    setError(null)
    if (!day) {
      setError("Seleziona una data")
      return
    }
    const startDt = new Date(`${day}T${start}:00`)
    const endDt = new Date(`${day}T${end}:00`)
    if (isNaN(startDt.getTime()) || isNaN(endDt.getTime()) || endDt <= startDt) {
      setError("Orario non valido: la fine deve essere dopo l'inizio")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch("/api/sales/demo-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prospect_id: prospect?.id || null,
          title: title.trim() || null,
          notes: notes.trim() || null,
          requested_start: startDt.toISOString(),
          requested_end: endDt.toISOString(),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        // Il backend ritorna un messaggio leggibile per i casi gestiti
        // (slot occupato, controllo disponibilita' fallito): preferiscilo
        // al codice errore grezzo.
        throw new Error(body.message || body.error || `HTTP ${res.status}`)
      }
      onCreated()
    } catch (e: any) {
      setError(e.message || "Errore nella richiesta")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-emerald-600" />
            Richiedi una demo
          </DialogTitle>
          <DialogDescription>
            Proponi data e ora. La richiesta resta in attesa di conferma; una volta accettata verra&apos;
            aggiunta al calendario clienti@4bid.it.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="demo-day">Giorno</Label>
              <Input id="demo-day" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="demo-start">Inizio</Label>
              <Input id="demo-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="demo-end">Fine</Label>
              <Input id="demo-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Struttura (opzionale)</Label>
            {prospect ? (
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-border bg-muted/30">
                <div className="min-w-0">
                  <div className="font-medium truncate">{prospect.name}</div>
                  {prospect.city && <div className="text-xs text-muted-foreground truncate">{prospect.city}</div>}
                </div>
                <Button variant="ghost" size="sm" type="button" onClick={() => setProspect(null)}>
                  Cambia
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cerca nei tuoi prospect..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="border border-border rounded-md max-h-40 overflow-auto divide-y divide-border">
                  {isLoading && (
                    <div className="p-3 text-sm text-muted-foreground flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Caricamento...
                    </div>
                  )}
                  {!isLoading && (data?.prospects?.length ?? 0) === 0 && (
                    <div className="p-3 text-sm text-muted-foreground">
                      {search.trim() ? "Nessun prospect trovato" : "Inizia a digitare per cercare"}
                    </div>
                  )}
                  {(data?.prospects ?? []).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setProspect(p)}
                      className={cn("w-full text-left px-3 py-2 text-sm hover:bg-muted")}
                    >
                      <div className="font-medium truncate">{p.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{p.city || "—"}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="demo-title">Titolo (opzionale)</Label>
            <Input
              id="demo-title"
              placeholder='es. "Demo Santaddeo - Hotel Riviera"'
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="demo-notes">Note per chi conferma (opzionale)</Label>
            <Textarea
              id="demo-notes"
              placeholder="Contesto, link, riferimenti..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={500}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Annulla
          </Button>
          <Button onClick={submit} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700">
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Invio...
              </>
            ) : (
              "Invia richiesta"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
