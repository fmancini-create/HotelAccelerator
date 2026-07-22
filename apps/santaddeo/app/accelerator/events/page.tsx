"use client"

import { useState, useEffect, useCallback } from "react"
import { format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth, isToday, addMonths, subMonths } from "date-fns"
import { it } from "date-fns/locale"
import { ChevronLeft, ChevronRight, Plus, Trash2, Globe, Sparkles, CalendarDays, AlertCircle, Info, Flag, X as XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface HotelEvent {
  id: string
  hotel_id: string
  date: string
  name: string
  type: "holiday" | "manual" | "fair" | "local" | "note"
  country_code?: string | null
  impact: "low" | "medium" | "high"
  color: string
  notes?: string | null
}

const IMPACT_LABELS: Record<string, string> = { low: "Basso", medium: "Medio", high: "Alto" }
const TYPE_LABELS: Record<string, string> = { holiday: "Festivita'", manual: "Manuale", fair: "Fiera", local: "Locale", note: "Nota" }
const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"]

// Mercati turistici piu' comuni (codici ISO supportati da date.nager.at) per
// costruirsi mercati potenziali importando le festivita' di nuove nazioni.
const COUNTRY_OPTIONS: { code: string; name: string }[] = [
  { code: "IT", name: "Italia" },
  { code: "DE", name: "Germania" },
  { code: "FR", name: "Francia" },
  { code: "GB", name: "Regno Unito" },
  { code: "US", name: "Stati Uniti" },
  { code: "AT", name: "Austria" },
  { code: "CH", name: "Svizzera" },
  { code: "NL", name: "Paesi Bassi" },
  { code: "ES", name: "Spagna" },
  { code: "BE", name: "Belgio" },
  { code: "PL", name: "Polonia" },
  { code: "PT", name: "Portogallo" },
  { code: "SE", name: "Svezia" },
  { code: "NO", name: "Norvegia" },
  { code: "DK", name: "Danimarca" },
  { code: "FI", name: "Finlandia" },
  { code: "IE", name: "Irlanda" },
  { code: "CZ", name: "Rep. Ceca" },
  { code: "HU", name: "Ungheria" },
  { code: "RO", name: "Romania" },
  { code: "GR", name: "Grecia" },
  { code: "HR", name: "Croazia" },
  { code: "SI", name: "Slovenia" },
  { code: "CA", name: "Canada" },
  { code: "BR", name: "Brasile" },
  { code: "AU", name: "Australia" },
  { code: "JP", name: "Giappone" },
]

export default function EventsCalendarPage() {
  const [hotelId, setHotelId] = useState<string | null>(null)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [events, setEvents] = useState<HotelEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)
  const [showAddDialog, setShowAddDialog] = useState(false)
  // Import per Nazione + range (mercati potenziali)
  const [showCountryDialog, setShowCountryDialog] = useState(false)
  const [countryImportLoading, setCountryImportLoading] = useState(false)
  const [selectedCountries, setSelectedCountries] = useState<string[]>([])
  const [rangeFrom, setRangeFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"))
  const [rangeTo, setRangeTo] = useState(format(endOfMonth(addMonths(new Date(), 11)), "yyyy-MM-dd"))
  const [form, setForm] = useState({
    name: "",
    type: "manual",
    impact: "medium",
    color: "#f59e0b",
    notes: "",
    date: "",
  })

  // Load hotelId from session using the same pattern as other accelerator pages
  useEffect(() => {
    fetch("/api/ui/selected-hotel")
      .then(r => r.json())
      .then(d => { if (d.hotel?.id) setHotelId(d.hotel.id) })
      .catch(() => {})
  }, [])

  const fetchEvents = useCallback(async () => {
    if (!hotelId) return
    setLoading(true)
    const from = format(startOfMonth(currentMonth), "yyyy-MM-dd")
    const to = format(endOfMonth(currentMonth), "yyyy-MM-dd")
    try {
      const res = await fetch(`/api/accelerator/events?hotel_id=${hotelId}&from=${from}&to=${to}`)
      const data = await res.json()
      setEvents(data.events || [])
    } catch {
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [hotelId, currentMonth])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  const eventsByDate = events.reduce<Record<string, HotelEvent[]>>((acc, ev) => {
    if (!acc[ev.date]) acc[ev.date] = []
    acc[ev.date].push(ev)
    return acc
  }, {})

  const calStart = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 })
  const calEnd = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 })
  const calDays = eachDayOfInterval({ start: calStart, end: calEnd })

  async function handleImportHolidays() {
    if (!hotelId) return
    setImportLoading(true)
    setImportResult(null)
    try {
      const res = await fetch("/api/accelerator/events/import-holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotel_id: hotelId, year: currentMonth.getFullYear() }),
      })
      const data = await res.json()
      if (data.ok) {
        setImportResult(`Importate ${data.inserted} festivita' per ${data.countries?.join(", ")}`)
        fetchEvents()
      } else {
        setImportResult(`Errore: ${data.error}`)
      }
    } catch {
      setImportResult("Errore di rete")
    } finally {
      setImportLoading(false)
    }
  }

  function toggleCountry(code: string) {
    setSelectedCountries(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    )
  }

  async function handleImportByCountry() {
    if (!hotelId || selectedCountries.length === 0 || !rangeFrom || !rangeTo) return
    if (rangeTo < rangeFrom) {
      setImportResult("Errore: la data di fine deve essere successiva alla data di inizio")
      return
    }
    setCountryImportLoading(true)
    setImportResult(null)
    try {
      const res = await fetch("/api/accelerator/events/import-holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotel_id: hotelId,
          country_codes: selectedCountries,
          from: rangeFrom,
          to: rangeTo,
        }),
      })
      const data = await res.json()
      if (data.ok) {
        setImportResult(`Importate ${data.inserted} festivita' (mercati potenziali) per ${data.countries?.join(", ")}`)
        setShowCountryDialog(false)
        fetchEvents()
      } else {
        setImportResult(`Errore: ${data.error}`)
      }
    } catch {
      setImportResult("Errore di rete")
    } finally {
      setCountryImportLoading(false)
    }
  }

  async function handleAddEvent() {
    if (!hotelId || !form.name || !form.date) return
    const res = await fetch("/api/accelerator/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hotel_id: hotelId, events: [{ ...form }] }),
    })
    if (res.ok) {
      setShowAddDialog(false)
      setForm({ name: "", type: "manual", impact: "medium", color: "#f59e0b", notes: "", date: "" })
      fetchEvents()
    }
  }

  async function handleDelete(id: string) {
    if (!hotelId) return
    await fetch(`/api/accelerator/events?hotel_id=${hotelId}&id=${id}`, { method: "DELETE" })
    fetchEvents()
  }

  const sortedEvents = [...events].sort((a, b) => a.date.localeCompare(b.date))

  return (
    <div className="flex h-full min-h-screen bg-background">
      {/* Main Calendar */}
      <div className="flex-1 flex flex-col p-6 overflow-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <CalendarDays className="h-6 w-6 text-primary" />
              Calendario Eventi
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Gestisci festivita' nazionali ed eventi personalizzati
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleImportHolidays} disabled={importLoading || !hotelId} className="gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              {importLoading ? "Importando..." : "Importa Festivita'"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowCountryDialog(true)} disabled={!hotelId} className="gap-2">
              <Flag className="h-4 w-4 text-primary" />
              Importa per Nazione
            </Button>
            <Button size="sm" onClick={() => { setForm(f => ({ ...f, date: format(new Date(), "yyyy-MM-dd") })); setShowAddDialog(true) }} className="gap-2" disabled={!hotelId}>
              <Plus className="h-4 w-4" />
              Nuovo Evento
            </Button>
          </div>
        </div>

        {/* Spiegazione su come funziona l'import festivita' */}
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-4 py-3">
          <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div className="text-xs text-muted-foreground leading-relaxed space-y-1.5">
            <p>
              <strong className="text-foreground">Importa Festivita&apos;</strong> si basa sui tuoi{" "}
              <strong className="text-foreground">mercati storici</strong>: rileva le principali nazionalita&apos;
              dalle prenotazioni della struttura e importa le festivita&apos; nazionali di quei Paesi per l&apos;anno
              visualizzato. Cosi&apos; vedi a colpo d&apos;occhio quando i tuoi mercati di provenienza sono in vacanza.
            </p>
            <p>
              <strong className="text-foreground">Importa per Nazione</strong> ti permette invece di scegliere uno o piu&apos;
              Paesi e un intervallo di date, per costruirti anche i{" "}
              <strong className="text-foreground">mercati potenziali</strong> su cui vuoi puntare.
            </p>
          </div>
        </div>

        {importResult && (
          <div className={cn(
            "mb-4 px-4 py-2.5 rounded-lg text-sm flex items-center gap-2 border",
            importResult.startsWith("Errore") ? "bg-red-50 text-red-700 border-red-200" : "bg-green-50 text-green-700 border-green-200"
          )}>
            {importResult.startsWith("Errore") ? <AlertCircle className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            {importResult}
          </div>
        )}

        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(m => subMonths(m, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold text-foreground capitalize">
            {format(currentMonth, "MMMM yyyy", { locale: it })}
          </h2>
          <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(m => addMonths(m, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 border border-border rounded-xl overflow-hidden bg-card shadow-sm">
          <div className="grid grid-cols-7 border-b border-border bg-muted/40">
            {WEEKDAYS.map(d => (
              <div key={d} className="py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 divide-x divide-y divide-border">
            {calDays.map(day => {
              const dateStr = format(day, "yyyy-MM-dd")
              const dayEvents = eventsByDate[dateStr] || []
              const inMonth = isSameMonth(day, currentMonth)
              const today = isToday(day)
              const isWeekend = day.getDay() === 0 || day.getDay() === 6
              return (
                <div
                  key={dateStr}
                  className={cn(
                    "min-h-[100px] p-2 cursor-pointer transition-colors group relative",
                    !inMonth && "bg-muted/20 opacity-50",
                    inMonth && isWeekend && "bg-slate-50/50",
                    inMonth && !isWeekend && "bg-background",
                    today && "ring-2 ring-primary ring-inset",
                  )}
                  onClick={() => inMonth && hotelId && (() => { setForm(f => ({ ...f, date: dateStr })); setShowAddDialog(true) })()}
                >
                  <div className={cn(
                    "text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full mb-1",
                    today ? "bg-primary text-primary-foreground" : "text-foreground",
                    !inMonth && "text-muted-foreground"
                  )}>
                    {format(day, "d")}
                  </div>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 3).map(ev => (
                      <TooltipProvider key={ev.id} delayDuration={0}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className="flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium text-white truncate"
                              style={{ backgroundColor: ev.color }}
                              onClick={e => e.stopPropagation()}
                            >
                              {ev.country_code && <span className="shrink-0 text-[9px] opacity-80">{ev.country_code}</span>}
                              <span className="truncate">{ev.name}</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-[200px]">
                            <div className="space-y-1">
                              <div className="font-semibold text-xs">{ev.name}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {TYPE_LABELS[ev.type]} · Impatto {IMPACT_LABELS[ev.impact]}
                              </div>
                              {ev.country_code && <div className="text-[10px]">Paese: {ev.country_code}</div>}
                              {ev.notes && <div className="text-[10px] text-muted-foreground">{ev.notes}</div>}
                              <button
                                className="text-[10px] text-red-500 hover:text-red-700 underline mt-1 block"
                                onClick={e => { e.stopPropagation(); handleDelete(ev.id) }}
                              >
                                Elimina evento
                              </button>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ))}
                    {dayEvents.length > 3 && (
                      <div className="text-[9px] text-muted-foreground pl-1">+{dayEvents.length - 3} altri</div>
                    )}
                  </div>
                  {inMonth && dayEvents.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      <Plus className="h-4 w-4 text-muted-foreground/40" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <div className="w-72 border-l border-border bg-muted/20 flex flex-col p-4 overflow-hidden">
        <h3 className="font-semibold text-sm text-foreground mb-3 flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          Eventi del mese
          {loading && <span className="text-xs text-muted-foreground animate-pulse ml-auto">Caricamento...</span>}
          {!loading && <Badge variant="secondary" className="ml-auto text-xs">{events.length}</Badge>}
        </h3>

        {sortedEvents.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 py-8">
            <CalendarDays className="h-10 w-10 text-muted-foreground/30" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Nessun evento</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Importa le festivita' o aggiungi un evento manuale</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleImportHolidays} disabled={importLoading || !hotelId} className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              Importa Festivita'
            </Button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
            {sortedEvents.map(ev => (
              <div key={ev.id} className="flex items-start gap-2 p-2.5 rounded-lg bg-background border border-border hover:border-primary/30 transition-colors group">
                <div className="w-2.5 h-2.5 rounded-full mt-0.5 shrink-0" style={{ backgroundColor: ev.color }} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-foreground truncate">{ev.name}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                    <span>{format(new Date(ev.date + "T00:00:00"), "d MMM", { locale: it })}</span>
                    {ev.country_code && <span className="text-[9px] bg-muted px-1 rounded">{ev.country_code}</span>}
                    <span className={cn(
                      "text-[9px] px-1 rounded",
                      ev.impact === "high" ? "bg-red-100 text-red-700" :
                      ev.impact === "medium" ? "bg-amber-100 text-amber-700" :
                      "bg-sky-100 text-sky-700"
                    )}>
                      {IMPACT_LABELS[ev.impact]}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(ev.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-500 p-0.5 rounded"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Import by country dialog (mercati potenziali) */}
      <Dialog open={showCountryDialog} onOpenChange={setShowCountryDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flag className="h-5 w-5 text-primary" />
              Importa festivita&apos; per Nazione
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Scegli i Paesi e l&apos;intervallo di date: importeremo le festivita&apos; nazionali di quei mercati
              nel periodo selezionato, cosi&apos; da costruirti anche i mercati potenziali. L&apos;intervallo puo&apos;
              coprire piu&apos; anni (max 5).
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Dal</Label>
                <Input type="date" value={rangeFrom} onChange={e => setRangeFrom(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Al</Label>
                <Input type="date" value={rangeTo} onChange={e => setRangeTo(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Nazioni</Label>
                <span className="text-[11px] text-muted-foreground">
                  {selectedCountries.length} selezionate
                </span>
              </div>
              {selectedCountries.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pb-1">
                  {selectedCountries.map(code => {
                    const c = COUNTRY_OPTIONS.find(o => o.code === code)
                    return (
                      <Badge key={code} variant="secondary" className="gap-1 pr-1">
                        {c?.name || code}
                        <button onClick={() => toggleCountry(code)} className="hover:text-red-500">
                          <XIcon className="h-3 w-3" />
                        </button>
                      </Badge>
                    )
                  })}
                </div>
              )}
              <div className="max-h-52 overflow-y-auto rounded-lg border border-border p-2 grid grid-cols-2 gap-1">
                {COUNTRY_OPTIONS.map(c => {
                  const active = selectedCountries.includes(c.code)
                  return (
                    <button
                      key={c.code}
                      onClick={() => toggleCountry(c.code)}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left transition-colors",
                        active ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                      )}
                    >
                      <span className={cn("text-[10px] font-mono px-1 rounded", active ? "bg-primary-foreground/20" : "bg-muted")}>
                        {c.code}
                      </span>
                      <span className="truncate">{c.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCountryDialog(false)}>Annulla</Button>
            <Button
              onClick={handleImportByCountry}
              disabled={countryImportLoading || selectedCountries.length === 0 || !rangeFrom || !rangeTo}
              className="gap-2"
            >
              <Sparkles className="h-4 w-4" />
              {countryImportLoading ? "Importando..." : "Importa festivita'"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add event dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Aggiungi Evento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Nome evento</Label>
              <Input placeholder="es. Fiera del Turismo, Evento locale..." value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manuale</SelectItem>
                    <SelectItem value="fair">Fiera</SelectItem>
                    <SelectItem value="local">Evento Locale</SelectItem>
                    <SelectItem value="holiday">Festivita'</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Impatto</Label>
                <Select value={form.impact} onValueChange={v => setForm(f => ({ ...f, impact: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Basso</SelectItem>
                    <SelectItem value="medium">Medio</SelectItem>
                    <SelectItem value="high">Alto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Colore</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.color}
                  onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                  className="w-10 h-9 rounded border border-input cursor-pointer p-1"
                />
                <div className="flex gap-1.5">
                  {["#ef4444","#f59e0b","#10b981","#3b82f6","#8b5cf6","#ec4899","#64748b"].map(c => (
                    <button
                      key={c}
                      className={cn("w-6 h-6 rounded-full border-2 transition-all", form.color === c ? "border-foreground scale-110" : "border-transparent")}
                      style={{ backgroundColor: c }}
                      onClick={() => setForm(f => ({ ...f, color: c }))}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Note (opzionale)</Label>
              <Textarea placeholder="Descrizione aggiuntiva..." rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Annulla</Button>
            <Button onClick={handleAddEvent} disabled={!form.name || !form.date}>Salva evento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
