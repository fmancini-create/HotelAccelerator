"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Textarea } from "@/components/ui/textarea"
import {
  CheckCircle2,
  Circle,
  AlertTriangle,
  MinusCircle,
  Search,
  MoreHorizontal,
  StickyNote,
  Loader2,
} from "lucide-react"

type StepStatus = "done" | "todo" | "blocked" | "skipped"

interface GoLiveStep {
  key: string
  label: string
  description: string
  status: StepStatus
  autoStatus: StepStatus
  overridden: boolean
  overrideNote?: string | null
  detail: string
}

interface HotelGoLive {
  hotelId: string
  hotelName: string
  organizationId: string | null
  createdAt: string
  ownerEmail: string | null
  ownerName: string | null
  steps: GoLiveStep[]
  completed: number
  total: number
  progress: number
  isOnline: boolean
  notesCount: number
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function StatusIcon({ status }: { status: StepStatus }) {
  if (status === "done") return <CheckCircle2 className="h-5 w-5 text-emerald-500" aria-label="Completato" />
  if (status === "blocked") return <AlertTriangle className="h-5 w-5 text-red-500" aria-label="Bloccato" />
  if (status === "skipped") return <MinusCircle className="h-5 w-5 text-muted-foreground" aria-label="Saltato" />
  return <Circle className="h-5 w-5 text-muted-foreground/40" aria-label="Da fare" />
}

export function OnboardingTracker() {
  const { data, isLoading, mutate } = useSWR<{ hotels: HotelGoLive[] }>(
    "/api/superadmin/onboarding",
    fetcher,
    { refreshInterval: 60_000 },
  )
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<"all" | "in_progress" | "online">("all")
  const [notesHotel, setNotesHotel] = useState<HotelGoLive | null>(null)

  const hotels = data?.hotels ?? []

  const filtered = useMemo(() => {
    let list = hotels
    if (filter === "online") list = list.filter((h) => h.isOnline)
    if (filter === "in_progress") list = list.filter((h) => !h.isOnline)
    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (h) =>
          h.hotelName.toLowerCase().includes(q) ||
          (h.ownerEmail ?? "").toLowerCase().includes(q) ||
          (h.ownerName ?? "").toLowerCase().includes(q),
      )
    }
    return list
  }, [hotels, query, filter])

  const stats = useMemo(() => {
    const total = hotels.length
    const online = hotels.filter((h) => h.isOnline).length
    return { total, online, inProgress: total - online }
  }, [hotels])

  async function setOverride(hotelId: string, stepKey: string, status: StepStatus | "auto") {
    if (status === "auto") {
      await fetch("/api/superadmin/onboarding/override", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId, stepKey }),
      })
    } else {
      await fetch("/api/superadmin/onboarding/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId, stepKey, status }),
      })
    }
    mutate()
  }

  return (
    <div className="space-y-6">
      {/* Riepilogo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Hotel registrati</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">In configurazione</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-amber-600">{stats.inProgress}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Online</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-emerald-600">{stats.online}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtri */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca hotel o referente..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          {([
            { id: "all", label: "Tutti" },
            { id: "in_progress", label: "In configurazione" },
            { id: "online", label: "Online" },
          ] as const).map((f) => (
            <Button
              key={f.id}
              size="sm"
              variant={filter === f.id ? "default" : "outline"}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Caricamento stato onboarding...
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <p className="text-center text-muted-foreground py-16">Nessun hotel corrisponde ai filtri.</p>
      )}

      {/* Lista hotel */}
      <div className="space-y-4">
        {filtered.map((h) => (
          <Card key={h.hotelId}>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg">{h.hotelName}</CardTitle>
                    {h.isOnline ? (
                      <Badge className="bg-emerald-500 hover:bg-emerald-500">Online</Badge>
                    ) : (
                      <Badge variant="outline" className="text-amber-600 border-amber-300">
                        In configurazione
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {h.ownerName || h.ownerEmail || "Referente n/d"}
                    {h.ownerName && h.ownerEmail ? ` · ${h.ownerEmail}` : ""}
                    {" · registrato il "}
                    {new Date(h.createdAt).toLocaleDateString("it-IT")}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm font-medium">
                      {h.completed}/{h.total} step
                    </p>
                    <Progress value={h.progress} className="w-32 h-2 mt-1" />
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setNotesHotel(h)}>
                    <StickyNote className="h-4 w-4 mr-1.5" />
                    Note{h.notesCount > 0 ? ` (${h.notesCount})` : ""}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2">
                {h.steps.map((s) => (
                  <li key={s.key} className="flex items-start gap-3 py-1.5 border-b last:border-0 border-border/50">
                    <StatusIcon status={s.status} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{s.label}</span>
                        {s.overridden && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            manuale
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{s.detail}</p>
                      {s.overridden && s.overrideNote && (
                        <p className="text-xs text-muted-foreground italic mt-0.5">Nota: {s.overrideNote}</p>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Azioni step</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setOverride(h.hotelId, s.key, "done")}>
                          Segna completato
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setOverride(h.hotelId, s.key, "blocked")}>
                          Segna bloccato
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setOverride(h.hotelId, s.key, "skipped")}>
                          Segna non applicabile
                        </DropdownMenuItem>
                        {s.overridden && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setOverride(h.hotelId, s.key, "auto")}>
                              Ripristina automatico
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        ))}
      </div>

      {notesHotel && (
        <NotesDialog
          hotel={notesHotel}
          onClose={() => {
            setNotesHotel(null)
            mutate()
          }}
        />
      )}
    </div>
  )
}

function NotesDialog({ hotel, onClose }: { hotel: HotelGoLive; onClose: () => void }) {
  const { data, mutate } = useSWR<{ notes: { id: string; note: string; created_at: string }[] }>(
    `/api/superadmin/onboarding/notes?hotelId=${hotel.hotelId}`,
    fetcher,
  )
  const [text, setText] = useState("")
  const [saving, setSaving] = useState(false)

  async function addNote() {
    if (!text.trim()) return
    setSaving(true)
    await fetch("/api/superadmin/onboarding/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hotelId: hotel.hotelId, note: text.trim() }),
    })
    setText("")
    setSaving(false)
    mutate()
  }

  const notes = data?.notes ?? []

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Note onboarding — {hotel.hotelName}</DialogTitle>
          <DialogDescription>
            Annotazioni manuali sul percorso go-live (es. listino inviato, attesa credenziali PMS).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Textarea
              placeholder="Aggiungi una nota..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
            />
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={addNote} disabled={saving || !text.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Aggiungi nota
            </Button>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-2 pt-2 border-t">
            {notes.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Nessuna nota.</p>}
            {notes.map((n) => (
              <div key={n.id} className="text-sm border rounded-md p-2">
                <p className="whitespace-pre-wrap">{n.note}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(n.created_at).toLocaleString("it-IT")}
                </p>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
