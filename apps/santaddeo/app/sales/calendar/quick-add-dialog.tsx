"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR, { mutate as globalMutate } from "swr"
import { format } from "date-fns"
import { it } from "date-fns/locale"
import { Loader2, Search } from "lucide-react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

type Prospect = {
  id: string
  name: string
  city?: string | null
  status?: string | null
  category?: string | null
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function QuickAddDialog({
  open,
  date,
  onClose,
  onCreated,
}: {
  open: boolean
  date: Date
  onClose: () => void
  onCreated: () => void
}) {
  // Defaults: pianifica un task tipo "call" alle 9:00 del giorno selezionato
  const [type, setType] = useState<"call" | "email" | "visit" | "meeting" | "note">("call")
  const [time, setTime] = useState("09:00")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [search, setSearch] = useState("")
  const [prospect, setProspect] = useState<Prospect | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset all'apertura
  useEffect(() => {
    if (!open) return
    setType("call")
    setTime("09:00")
    setTitle("")
    setDescription("")
    setSearch("")
    setProspect(null)
    setError(null)
  }, [open])

  const apiUrl = useMemo(() => {
    const q = search.trim()
    return `/api/sales/prospects?page_size=15${q ? `&search=${encodeURIComponent(q)}` : ""}`
  }, [search])
  const { data, isLoading } = useSWR<{ prospects: Prospect[] }>(open ? apiUrl : null, fetcher)

  async function submit() {
    if (!prospect) {
      setError("Seleziona una struttura")
      return
    }
    setSubmitting(true)
    setError(null)

    // Componi due_at = giorno + ora
    const [hh, mm] = time.split(":").map((s) => Number.parseInt(s, 10))
    const due = new Date(date)
    due.setHours(hh || 9, mm || 0, 0, 0)

    try {
      const res = await fetch(`/api/sales/prospects/${prospect.id}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          title: title.trim() || null,
          description: description.trim() || null,
          due_at: due.toISOString(),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      // invalida task widget e nav badge
      globalMutate((key) => typeof key === "string" && key.startsWith("/api/sales/tasks"))
      onCreated()
    } catch (e: any) {
      setError(e.message || "Errore creazione task")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Pianifica task</DialogTitle>
          <DialogDescription>
            <span className="capitalize">
              {format(date, "EEEE d MMMM yyyy", { locale: it })}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="type">Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as any)}>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="call">Chiamata</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="visit">Visita</SelectItem>
                  <SelectItem value="meeting">Riunione</SelectItem>
                  <SelectItem value="note">Promemoria</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="time">Ora</Label>
              <Input
                id="time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Struttura</Label>
            {prospect ? (
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-border bg-muted/30">
                <div className="min-w-0">
                  <div className="font-medium truncate">{prospect.name}</div>
                  {prospect.city && (
                    <div className="text-xs text-muted-foreground truncate">
                      {prospect.city}
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() => setProspect(null)}
                >
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
                <div className="border border-border rounded-md max-h-48 overflow-auto divide-y divide-border">
                  {isLoading && (
                    <div className="p-3 text-sm text-muted-foreground flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Caricamento...
                    </div>
                  )}
                  {!isLoading && (data?.prospects?.length ?? 0) === 0 && (
                    <div className="p-3 text-sm text-muted-foreground">
                      {search.trim()
                        ? "Nessun prospect trovato"
                        : "Inizia a digitare per cercare"}
                    </div>
                  )}
                  {(data?.prospects ?? []).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setProspect(p)}
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm hover:bg-muted",
                      )}
                    >
                      <div className="font-medium truncate">{p.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {p.city || "—"}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="title">Oggetto (opzionale)</Label>
            <Input
              id="title"
              placeholder='es. "Richiamare per offerta"'
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="description">Note (opzionale)</Label>
            <Textarea
              id="description"
              placeholder="Dettagli, riferimenti, link..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={5000}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Annulla
          </Button>
          <Button
            onClick={submit}
            disabled={submitting || !prospect}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvataggio...
              </>
            ) : (
              "Pianifica"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
