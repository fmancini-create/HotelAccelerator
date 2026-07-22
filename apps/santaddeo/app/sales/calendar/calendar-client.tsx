"use client"

import { useMemo, useState, useCallback, useEffect, useRef } from "react"
import useSWR, { mutate as globalMutate } from "swr"
import {
  addDays,
  addMonths,
  addWeeks,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns"
import { it } from "date-fns/locale"
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import { Check, ChevronDown, ChevronLeft, ChevronRight, ListChecks, Loader2, Plus, Presentation, RefreshCw, Settings, Users, Video } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { QuickAddDialog } from "./quick-add-dialog"
import { DayDetailDialog } from "./day-detail-dialog"
import { RequestDemoDialog } from "./request-demo-dialog"

type GoogleEvent = {
  id: string
  title: string
  start: string | null
  end: string | null
  allDay: boolean
  meetLink?: string | null
  htmlLink?: string | null
  // Proprietario demo (esposto dal server quando visibile) + colore risolto
  // lato client per distinguere i venditori in overlay multi-calendario.
  ownerAgentId?: string | null
  ownerColor?: string
}

// Evento da un calendario personale del venditore (overlay ICS, sola lettura).
type MyEvent = {
  id: string
  title: string
  start: string | null
  end: string | null
  allDay: boolean
  color: string
  calendar_id: string
  agent_id?: string
}

type Prospect = { id: string; name: string; city?: string | null }

type CalendarItem = {
  id: string
  prospect_id: string
  agent_id: string | null
  type: "note" | "call" | "email" | "visit" | "meeting" | "system"
  title: string | null
  description: string | null
  outcome: "positive" | "neutral" | "negative" | null
  happened_at: string
  due_at: string | null
  task_status: "pending" | "done" | "cancelled" | null
  completed_at: string | null
  prospect: Prospect | null
}

type View = "month" | "week"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

// Palette per distinguere i venditori quando il capo area sovrappone piu'
// calendari (overlay). Colori distinti, evitando il viola riservato agli
// impegni personali ICS. Assegnati in modo stabile per posizione in elenco.
const AGENT_COLORS = ["#0ea5e9", "#f59e0b", "#10b981", "#ef4444", "#0891b2", "#d97706", "#65a30d", "#db2777"]

export function CalendarClient() {
  // Vista SETTIMANA come default: e' l'unica con la griglia oraria che mostra
  // gli "slot liberi" prenotabili (la vista Mese e' per-giorno e non puo'
  // mostrarli). Cosi' aprendo il calendario gli slot sono subito visibili.
  const [view, setView] = useState<View>("week")
  const [anchor, setAnchor] = useState<Date>(() => new Date())
  const [quickAddDate, setQuickAddDate] = useState<Date | null>(null)
  const [openDay, setOpenDay] = useState<Date | null>(null)
  const [demoDate, setDemoDate] = useState<Date | null>(null)
  // Orari precompilati quando si apre la richiesta demo da uno slot libero.
  const [demoPreset, setDemoPreset] = useState<{ start: string; end: string } | null>(null)
  // Selettore venditori (capo area / super admin): insieme ADDITIVO di venditori
  // del team da sovrapporre al proprio calendario (overlay multi, come il
  // calendario superadmin). Vuoto = solo il proprio.
  const [selectedAgentIds, setSelectedAgentIds] = useState<Set<string>>(() => new Set())
  const toggleAgent = useCallback((id: string) => {
    setSelectedAgentIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Apre la richiesta demo su uno slot libero cliccato nella vista Settimana.
  const pickSlot = useCallback((day: Date, startHHmm: string, endHHmm: string) => {
    setDemoPreset({ start: startHHmm, end: endHHmm })
    setDemoDate(day)
  }, [])

  // Calcola finestra basata su view
  const { rangeStart, rangeEnd, gridStart, gridEnd, days } = useMemo(() => {
    if (view === "month") {
      const monthStart = startOfMonth(anchor)
      const monthEnd = endOfMonth(anchor)
      const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
      const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
      const days: Date[] = []
      let d = gridStart
      while (d <= gridEnd) {
        days.push(d)
        d = addDays(d, 1)
      }
      return {
        rangeStart: monthStart,
        rangeEnd: monthEnd,
        gridStart,
        gridEnd,
        days,
      }
    } else {
      const wStart = startOfWeek(anchor, { weekStartsOn: 1 })
      const wEnd = endOfWeek(anchor, { weekStartsOn: 1 })
      const days: Date[] = []
      let d = wStart
      while (d <= wEnd) {
        days.push(d)
        d = addDays(d, 1)
      }
      return {
        rangeStart: wStart,
        rangeEnd: wEnd,
        gridStart: wStart,
        gridEnd: wEnd,
        days,
      }
    }
  }, [view, anchor])

  // Team ispezionabile (capo area -> suoi venditori; super admin -> tutti).
  // Per i venditori semplici torna { can_view_team: false }.
  const { data: teamData } = useSWR<{
    can_view_team: boolean
    self_agent_id: string | null
    team: Array<{ id: string; display_name: string | null; email: string | null }>
  }>("/api/sales/calendar/team", fetcher)
  const canViewTeam = (teamData?.can_view_team ?? false) && (teamData?.team?.length ?? 0) > 0
  const selfAgentId = teamData?.self_agent_id ?? null

  // Colore stabile per venditore (per posizione nell'elenco team). Il proprio
  // calendario resta in emerald per coerenza con il resto della UI.
  const colorForAgent = useCallback(
    (agentId: string | null | undefined): string => {
      if (!agentId) return "#0ea5e9"
      if (agentId === selfAgentId) return "#059669"
      const idx = (teamData?.team ?? []).findIndex((a) => a.id === agentId)
      return AGENT_COLORS[idx >= 0 ? idx % AGENT_COLORS.length : 0]
    },
    [teamData, selfAgentId],
  )

  // Venditori selezionati (oggetti) per banner/legenda.
  const selectedAgents = useMemo(
    () => (teamData?.team ?? []).filter((a) => selectedAgentIds.has(a.id)),
    [teamData, selectedAgentIds],
  )
  const isOverlay = selectedAgentIds.size > 0

  // Quando si sovrappongono venditori, includi anche il PROPRIO calendario
  // (overlay additivo). Parametro `agent_ids` (CSV) inviato solo in overlay.
  const agentParam = useMemo(() => {
    if (!isOverlay) return ""
    const ids = new Set<string>(selectedAgentIds)
    if (selfAgentId) ids.add(selfAgentId)
    return `&agent_ids=${encodeURIComponent(Array.from(ids).join(","))}`
  }, [isOverlay, selectedAgentIds, selfAgentId])

  const apiFrom = startOfDay(gridStart).toISOString()
  const apiTo = endOfDay(gridEnd).toISOString()
  const apiUrl = `/api/sales/calendar?from=${encodeURIComponent(apiFrom)}&to=${encodeURIComponent(apiTo)}${agentParam}`
  const { data, isLoading, mutate } = useSWR<{ items: CalendarItem[] }>(apiUrl, fetcher)

  // Overlay disponibilita' del calendario condiviso clienti@4bid.it (sola lettura)
  const googleUrl = `/api/sales/calendar/google-availability?from=${encodeURIComponent(apiFrom)}&to=${encodeURIComponent(apiTo)}${agentParam}`
  const { data: googleData, mutate: mutateGoogle } = useSWR<{ configured: boolean; events: GoogleEvent[] }>(googleUrl, fetcher)
  const googleConfigured = googleData?.configured ?? false

  // Overlay dei calendari personali del venditore (feed ICS, sola lettura)
  const myEventsUrl = `/api/sales/calendar/my-events?from=${encodeURIComponent(apiFrom)}&to=${encodeURIComponent(apiTo)}${agentParam}`
  const { data: myEventsData } = useSWR<{ events: MyEvent[] }>(myEventsUrl, fetcher)
  const hasMyCalendars = (myEventsData?.events?.length ?? 0) > 0

  // Indicizzazione per giorno (locale)
  const itemsByDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>()
    for (const it of data?.items ?? []) {
      const d = it.task_status ? it.due_at ?? it.happened_at : it.happened_at
      if (!d) continue
      const key = format(parseISO(d), "yyyy-MM-dd")
      const arr = map.get(key) ?? []
      arr.push(it)
      map.set(key, arr)
    }
    // ordino per data dentro ogni giorno
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const da = parseISO(a.task_status ? a.due_at ?? a.happened_at : a.happened_at).getTime()
        const db = parseISO(b.task_status ? b.due_at ?? b.happened_at : b.happened_at).getTime()
        return da - db
      })
    }
    return map
  }, [data])

  // Indicizzazione eventi Google per giorno (locale). In overlay, attacca il
  // colore del venditore proprietario (ownerColor) per distinguere le demo.
  const googleByDay = useMemo(() => {
    const map = new Map<string, GoogleEvent[]>()
    for (const raw of googleData?.events ?? []) {
      if (!raw.start) continue
      const ev: GoogleEvent = isOverlay
        ? { ...raw, ownerColor: colorForAgent(raw.ownerAgentId) }
        : raw
      const d = parseISO(ev.start as string)
      const key = format(d, "yyyy-MM-dd")
      const arr = map.get(key) ?? []
      arr.push(ev)
      map.set(key, arr)
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.start && b.start ? parseISO(a.start).getTime() - parseISO(b.start).getTime() : 0))
    }
    return map
  }, [googleData, isOverlay, colorForAgent])

  // Indicizzazione eventi personali (ICS) per giorno (locale). In overlay, ogni
  // venditore usa il proprio colore (sostituisce quello del feed ICS), cosi' i
  // calendari sovrapposti restano distinguibili.
  const myEventsByDay = useMemo(() => {
    const map = new Map<string, MyEvent[]>()
    for (const raw of myEventsData?.events ?? []) {
      if (!raw.start) continue
      const ev: MyEvent =
        isOverlay && raw.agent_id ? { ...raw, color: colorForAgent(raw.agent_id) } : raw
      const key = format(parseISO(ev.start as string), "yyyy-MM-dd")
      const arr = map.get(key) ?? []
      arr.push(ev)
      map.set(key, arr)
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.start && b.start ? parseISO(a.start).getTime() - parseISO(b.start).getTime() : 0))
    }
    return map
  }, [myEventsData, isOverlay, colorForAgent])

  const goPrev = () =>
    setAnchor((a) => (view === "month" ? addMonths(a, -1) : addWeeks(a, -1)))
  const goNext = () =>
    setAnchor((a) => (view === "month" ? addMonths(a, 1) : addWeeks(a, 1)))
  const goToday = () => setAnchor(new Date())

  // Drag & drop: riprogramma task pending al nuovo giorno mantenendo l'orario
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const handleDragEnd = useCallback(
    async (e: DragEndEvent) => {
      if (!e.over || !e.active) return
      const itemId = String(e.active.id)
      const targetDayKey = String(e.over.id)
      const item = (data?.items ?? []).find((x) => x.id === itemId)
      if (!item || item.task_status !== "pending" || !item.due_at) return
      const sourceKey = format(parseISO(item.due_at), "yyyy-MM-dd")
      if (sourceKey === targetDayKey) return
      const oldDate = parseISO(item.due_at)
      const [y, m, d] = targetDayKey.split("-").map((s) => Number.parseInt(s, 10))
      const newDate = new Date(oldDate)
      newDate.setFullYear(y, m - 1, d)
      const optimistic = {
        items: (data?.items ?? []).map((x) =>
          x.id === itemId ? { ...x, due_at: newDate.toISOString() } : x,
        ),
      }
      mutate(optimistic, { revalidate: false })
      try {
        const res = await fetch(
          `/api/sales/prospects/${item.prospect_id}/activities/${item.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ due_at: newDate.toISOString() }),
          },
        )
        if (!res.ok) throw new Error(await res.text())
      } catch (err) {
        console.error("[v0] drag reschedule failed:", err)
        mutate()
      }
      // Anche il widget dashboard / pagina task usa la stessa fonte
      globalMutate((key) => typeof key === "string" && key.startsWith("/api/sales/tasks"))
    },
    [data, mutate],
  )

  return (
    <div className="container mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calendario</h1>
          <p className="text-sm text-muted-foreground">
            Task pianificati e attivit&agrave; svolte. Trascina un task pending per
            riprogrammarlo.
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {canViewTeam && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="flex-1 sm:flex-none">
                  <Users className="h-4 w-4 mr-2" />
                  {isOverlay ? `${selectedAgentIds.size} venditori +1` : "Il mio calendario"}
                  <ChevronDown className="h-4 w-4 ml-2 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-80 w-64 overflow-y-auto">
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  Aggiungi i calendari dei tuoi venditori (sovrapposti al tuo).
                </div>
                <DropdownMenuItem
                  className="flex items-center gap-2"
                  onSelect={(e) => {
                    e.preventDefault()
                    setSelectedAgentIds(new Set())
                  }}
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: colorForAgent(selfAgentId) }}
                  />
                  <span className="flex-1">Solo il mio calendario</span>
                </DropdownMenuItem>
                {(teamData?.team ?? []).map((a) => {
                  const checked = selectedAgentIds.has(a.id)
                  return (
                    <DropdownMenuItem
                      key={a.id}
                      className="flex items-center gap-2"
                      onSelect={(e) => {
                        e.preventDefault()
                        toggleAgent(a.id)
                      }}
                    >
                      <span
                        className={cn(
                          "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border",
                          checked ? "text-white" : "border-muted-foreground/40",
                        )}
                        style={checked ? { backgroundColor: colorForAgent(a.id), borderColor: colorForAgent(a.id) } : undefined}
                      >
                        {checked && <Check className="h-3 w-3" />}
                      </span>
                      <span className="flex-1 truncate">{a.display_name ?? a.email ?? "(senza nome)"}</span>
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 flex-1 sm:flex-none"
            onClick={() => {
              setDemoPreset(null)
              setDemoDate(new Date())
            }}
          >
            <Presentation className="h-4 w-4 mr-2" />
            Richiedi demo
          </Button>
          {/* Switch Mese/Settimana: solo da sm in su (mobile usa l'agenda) */}
          <div className="hidden sm:flex items-center rounded-md border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setView("month")}
              className={cn(
                "px-3 py-1.5 text-sm",
                view === "month" ? "bg-emerald-600 text-white" : "hover:bg-muted",
              )}
            >
              Mese
            </button>
            <button
              type="button"
              onClick={() => setView("week")}
              className={cn(
                "px-3 py-1.5 text-sm",
                view === "week" ? "bg-emerald-600 text-white" : "hover:bg-muted",
              )}
            >
              Settimana
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={() => mutate()} title="Aggiorna">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isOverlay && (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
          <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="text-pretty">Stai sovrapponendo i calendari di (sola lettura):</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: colorForAgent(selfAgentId) }} />
            Il mio
          </span>
          {selectedAgents.map((a) => (
            <span key={a.id} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: colorForAgent(a.id) }} />
              {a.display_name ?? a.email}
            </span>
          ))}
          <button
            type="button"
            onClick={() => setSelectedAgentIds(new Set())}
            className="ml-auto shrink-0 font-medium underline hover:no-underline"
          >
            Solo il mio
          </button>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {view === "week" && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm border border-dashed border-emerald-400 bg-emerald-50" />
            Slot liberi (lun-ven 9-18): clicca per richiedere una demo
          </span>
        )}
        {(googleConfigured || hasMyCalendars) && (
          <>
          {googleConfigured && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-sky-500" />
              Demo gia&apos; pianificate su clienti@4bid.it
            </span>
          )}
          {hasMyCalendars && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-violet-500" />
              I miei impegni personali
            </span>
          )}
          <Link
            href="/sales/settings/calendar"
            className="inline-flex items-center gap-1 text-emerald-700 hover:underline"
          >
            <Settings className="h-3.5 w-3.5" />
            Collega il tuo calendario
          </Link>
          </>
        )}
      </div>

      <Card className="hidden md:block overflow-hidden">
        {/* Toolbar mese/settimana */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={goPrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={goToday}>
              Oggi
            </Button>
            <Button variant="outline" size="sm" onClick={goNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <h2 className="text-base font-semibold capitalize">
            {view === "month"
              ? format(rangeStart, "MMMM yyyy", { locale: it })
              : `${format(rangeStart, "d MMM", { locale: it })} - ${format(rangeEnd, "d MMM yyyy", { locale: it })}`}
          </h2>
          <div className="text-sm text-muted-foreground tabular-nums">
            {isLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Caricamento
              </span>
            ) : (
              <span>
                {(data?.items.length ?? 0) +
                  (googleData?.events?.length ?? 0) +
                  (myEventsData?.events?.length ?? 0)}{" "}
                elementi
              </span>
            )}
          </div>
        </div>

        {view === "month" ? (
          <>
            {/* Header giorni settimana */}
            <div className="grid grid-cols-7 border-b border-border bg-muted/40 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map((d) => (
                <div key={d} className="px-3 py-2 text-center">
                  {d}
                </div>
              ))}
            </div>

            {/* Griglia giorni (mese) */}
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              <div className="grid grid-cols-7 auto-rows-[minmax(7rem,1fr)]">
                {days.map((day) => {
                  const key = format(day, "yyyy-MM-dd")
                  const items = itemsByDay.get(key) ?? []
                  return (
                    <DayCell
                      key={key}
                      day={day}
                      items={items}
                      googleEvents={googleByDay.get(key) ?? []}
                      myEvents={myEventsByDay.get(key) ?? []}
                      inMonth={isSameMonth(day, anchor)}
                      onAdd={() => setQuickAddDate(day)}
                      onDemo={() => {
                        setDemoPreset(null)
                        setDemoDate(day)
                      }}
                      onOpen={() => setOpenDay(day)}
                    />
                  )
                })}
              </div>
            </DndContext>
          </>
        ) : (
          /* Vista Settimana: griglia oraria per leggere meglio gli slot liberi */
          <WeekHourGrid
            days={days}
            googleByDay={googleByDay}
            myEventsByDay={myEventsByDay}
            itemsByDay={itemsByDay}
            onOpenDay={(day) => setOpenDay(day)}
            onPickSlot={pickSlot}
          />
        )}
      </Card>

      {/* Vista Agenda (mobile) */}
      <div className="md:hidden">
        <div className="flex items-center justify-between mb-3">
          <Button variant="outline" size="sm" onClick={goPrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold capitalize">
              {format(rangeStart, "MMMM yyyy", { locale: it })}
            </h2>
            <Button variant="ghost" size="sm" onClick={goToday} className="h-7 px-2 text-xs">
              Oggi
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={goNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          (() => {
            const agendaDays = days.filter((day) => {
              if (view === "month" && !isSameMonth(day, anchor)) return false
              const key = format(day, "yyyy-MM-dd")
              return (
                (itemsByDay.get(key)?.length ?? 0) +
                  (googleByDay.get(key)?.length ?? 0) +
                  (myEventsByDay.get(key)?.length ?? 0) >
                0
              )
            })
            if (agendaDays.length === 0) {
              return (
                <Card className="p-8 text-center text-sm text-muted-foreground">
                  Nessun impegno in questo periodo.
                </Card>
              )
            }
            return (
              <div className="space-y-4">
                {agendaDays.map((day) => {
                  const key = format(day, "yyyy-MM-dd")
                  const items = itemsByDay.get(key) ?? []
                  const gEvents = googleByDay.get(key) ?? []
                  const mEvents = myEventsByDay.get(key) ?? []
                  return (
                    <div key={key}>
                      <button
                        type="button"
                        onClick={() => setOpenDay(day)}
                        className="flex items-center gap-2 mb-2 w-full text-left"
                      >
                        <span
                          className={cn(
                            "inline-flex items-center justify-center h-8 w-8 rounded-full text-sm font-semibold shrink-0",
                            isToday(day)
                              ? "bg-emerald-600 text-white"
                              : "bg-muted text-foreground",
                          )}
                        >
                          {format(day, "d")}
                        </span>
                        <span className="text-sm font-medium capitalize">
                          {format(day, "EEEE", { locale: it })}
                        </span>
                      </button>
                      <div className="space-y-1.5 pl-10">
                        {gEvents.map((ev) => (
                          <button
                            type="button"
                            key={ev.id}
                            onClick={() => setOpenDay(day)}
                            className="flex w-full items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-2.5 py-2 text-sm text-sky-800 text-left"
                            style={
                              ev.ownerColor
                                ? { borderColor: `${ev.ownerColor}55`, backgroundColor: `${ev.ownerColor}1a`, color: ev.ownerColor }
                                : undefined
                            }
                          >
                            <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-sky-500" style={ev.ownerColor ? { backgroundColor: ev.ownerColor } : undefined} />
                            {ev.start && !ev.allDay && (
                              <span className="shrink-0 font-semibold tabular-nums">{format(parseISO(ev.start), "HH:mm")}</span>
                            )}
                            <span className="truncate">{ev.title}</span>
                            {ev.meetLink && <Video className="h-3.5 w-3.5 shrink-0 text-sky-600" aria-label="Demo con Google Meet" />}
                          </button>
                        ))}
                        {mEvents.map((ev) => (
                          <button
                            type="button"
                            key={ev.id}
                            onClick={() => setOpenDay(day)}
                            className="flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-sm text-left"
                            style={{
                              borderColor: `${ev.color}55`,
                              backgroundColor: `${ev.color}1a`,
                              color: ev.color,
                            }}
                          >
                            <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: ev.color }} />
                            {ev.start && !ev.allDay && (
                              <span className="shrink-0 font-semibold tabular-nums">{format(parseISO(ev.start), "HH:mm")}</span>
                            )}
                            <span className="truncate">{ev.title}</span>
                          </button>
                        ))}
                        {items.map((it) => {
                          const when = it.task_status ? it.due_at ?? it.happened_at : it.happened_at
                          return (
                            <button
                              key={it.id}
                              type="button"
                              onClick={() => setOpenDay(day)}
                              className={cn(
                                "flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-sm text-left",
                                TYPE_COLORS[it.type] ?? "bg-slate-100 text-slate-700 border-slate-200",
                                it.task_status === "done" && "opacity-60 line-through",
                              )}
                            >
                              <span className="text-xs font-semibold shrink-0 tabular-nums">
                                {when ? format(parseISO(when), "HH:mm") : ""}
                              </span>
                              <span className="truncate">
                                {it.title || it.prospect?.name || TYPE_LABEL[it.type] || "Attività"}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()
        )}
      </div>

      {quickAddDate && (
        <QuickAddDialog
          open
          date={quickAddDate}
          onClose={() => setQuickAddDate(null)}
          onCreated={() => {
            setQuickAddDate(null)
            mutate()
          }}
        />
      )}

      {openDay && (
    <DayDetailDialog
  open
  day={openDay}
  items={itemsByDay.get(format(openDay, "yyyy-MM-dd")) ?? []}
  googleEvents={googleByDay.get(format(openDay, "yyyy-MM-dd")) ?? []}
  myEvents={myEventsByDay.get(format(openDay, "yyyy-MM-dd")) ?? []}
  assignableAgents={canViewTeam ? (teamData?.team ?? []) : []}
  onClose={() => setOpenDay(null)}
  onChange={() => mutate()}
  onAssigned={() => {
    // ricarica demo Google + items per riflettere la nuova attribuzione
    mutateGoogle()
    mutate()
  }}
  />
      )}

      {demoDate && (
        <RequestDemoDialog
          open
          date={demoDate}
          presetStart={demoPreset?.start}
          presetEnd={demoPreset?.end}
          onClose={() => {
            setDemoDate(null)
            setDemoPreset(null)
          }}
          onCreated={() => {
            setDemoDate(null)
            setDemoPreset(null)
          }}
        />
      )}
    </div>
  )
}

/* ================================================================
 * DayCell: cella giorno con droppable per drag & drop riprogrammazione
 * ============================================================== */
function DayCell({
  day,
  items,
  googleEvents,
  myEvents,
  inMonth,
  onAdd,
  onDemo,
  onOpen,
}: {
  day: Date
  items: CalendarItem[]
  googleEvents: GoogleEvent[]
  myEvents: MyEvent[]
  inMonth: boolean
  onAdd: () => void
  onDemo: () => void
  onOpen: () => void
}) {
  const dayKey = format(day, "yyyy-MM-dd")
  const { setNodeRef, isOver } = useDroppable({ id: dayKey })
  const today = isToday(day)

  // Massimo 3 elementi visibili in mese, "+N" altri quando overflow
  const visible = items.slice(0, 3)
  const overflow = items.length - visible.length

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group relative border-b border-r border-border p-1.5 flex flex-col gap-1 min-w-0",
        !inMonth && "bg-muted/30 text-muted-foreground",
        isOver && "bg-emerald-50 ring-2 ring-emerald-400 ring-inset",
      )}
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onOpen}
          className={cn(
            "text-xs font-medium px-1.5 py-0.5 rounded-md hover:bg-muted",
            today && "bg-emerald-600 text-white hover:bg-emerald-700",
          )}
        >
          {format(day, "d")}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              aria-label="Aggiungi in questo giorno"
              title="Aggiungi: demo o task"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border bg-background text-muted-foreground opacity-60 transition-opacity hover:bg-foreground hover:text-background hover:border-foreground group-hover:opacity-100 data-[state=open]:opacity-100 data-[state=open]:bg-foreground data-[state=open]:text-background"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                onDemo()
              }}
            >
              <Presentation className="h-4 w-4 mr-2 text-emerald-600" />
              Richiedi demo
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                onAdd()
              }}
            >
              <ListChecks className="h-4 w-4 mr-2" />
              Pianifica task
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex flex-col gap-0.5 min-w-0">
        {googleEvents.map((ev) => (
          <button
            type="button"
            key={ev.id}
            onClick={onOpen}
            className="flex w-full items-center gap-1 rounded-sm border border-sky-200 bg-sky-50 px-1 py-0.5 text-[11px] text-sky-800 text-left hover:bg-sky-100"
            style={
              ev.ownerColor
                ? { borderColor: `${ev.ownerColor}55`, backgroundColor: `${ev.ownerColor}1a`, color: ev.ownerColor }
                : undefined
            }
            title={`${ev.title}${ev.start && !ev.allDay ? " · " + format(parseISO(ev.start), "HH:mm") : ""}`}
          >
            <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-sky-500" style={ev.ownerColor ? { backgroundColor: ev.ownerColor } : undefined} />
            {ev.start && !ev.allDay && (
              <span className="shrink-0 font-semibold tabular-nums">{format(parseISO(ev.start), "HH:mm")}</span>
            )}
            <span className="truncate">{ev.title}</span>
            {ev.meetLink && <Video className="h-3 w-3 shrink-0 text-sky-600" aria-label="Demo con Google Meet" />}
          </button>
        ))}
        {myEvents.map((ev) => (
          <button
            type="button"
            key={ev.id}
            onClick={onOpen}
            className="flex w-full items-center gap-1 rounded-sm border px-1 py-0.5 text-[11px] text-left"
            style={{
              borderColor: `${ev.color}55`,
              backgroundColor: `${ev.color}1a`,
              color: ev.color,
            }}
            title={`${ev.title}${ev.start && !ev.allDay ? " · " + format(parseISO(ev.start), "HH:mm") : ""}`}
          >
            <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: ev.color }} />
            {ev.start && !ev.allDay && (
              <span className="shrink-0 font-semibold tabular-nums">{format(parseISO(ev.start), "HH:mm")}</span>
            )}
            <span className="truncate">{ev.title}</span>
          </button>
        ))}
        {visible.map((it) => (
          <CalendarChip key={it.id} item={it} />
        ))}
        {overflow > 0 && (
          <button
            type="button"
            onClick={onOpen}
            className="text-[11px] text-muted-foreground hover:text-foreground text-left px-1"
          >
            +{overflow} altro/i
          </button>
        )}
      </div>
    </div>
  )
}

/* ================================================================
 * CalendarChip: chip evento, draggable se task pending
 * ============================================================== */
const TYPE_COLORS: Record<string, string> = {
  call: "bg-blue-100 text-blue-800 border-blue-200",
  email: "bg-violet-100 text-violet-800 border-violet-200",
  visit: "bg-orange-100 text-orange-800 border-orange-200",
  meeting: "bg-amber-100 text-amber-800 border-amber-200",
  note: "bg-slate-100 text-slate-700 border-slate-200",
  system: "bg-zinc-100 text-zinc-600 border-zinc-200",
}

const TYPE_LABEL: Record<string, string> = {
  call: "Tel",
  email: "Mail",
  visit: "Visita",
  meeting: "Mtg",
  note: "Nota",
  system: "Sys",
}

function CalendarChip({ item }: { item: CalendarItem }) {
  const draggable = item.task_status === "pending"
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    disabled: !draggable,
  })

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined

  const time = item.task_status
    ? item.due_at
      ? format(parseISO(item.due_at), "HH:mm")
      : ""
    : item.happened_at
      ? format(parseISO(item.happened_at), "HH:mm")
      : ""

  // Stile differenziato:
  //  - task pending: chip con bordo evidenziato + icona drag
  //  - task done: chip barrato
  //  - task cancelled: chip muted
  //  - attivita' storica: chip neutro
  const isOverdue =
    item.task_status === "pending" &&
    item.due_at &&
    parseISO(item.due_at).getTime() < Date.now()
  const isDone = item.task_status === "done"
  const isCancelled = item.task_status === "cancelled"

  const baseColor = TYPE_COLORS[item.type] ?? TYPE_COLORS.note

  return (
    <a
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      href={`/sales/prospects/${item.prospect_id}`}
      onClick={(e) => {
        // Blocca navigazione se sto trascinando
        if (isDragging) e.preventDefault()
      }}
      style={style}
      className={cn(
        "block text-[11px] leading-tight px-1.5 py-1 rounded border truncate",
        baseColor,
        draggable && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-60 shadow-lg",
        isOverdue && "ring-1 ring-red-400 border-red-300",
        isDone && "opacity-70 line-through",
        isCancelled && "opacity-50",
      )}
      title={`${TYPE_LABEL[item.type]} · ${item.prospect?.name ?? "?"}${time ? " · " + time : ""}`}
    >
      <span className="font-medium tabular-nums">{time}</span>
      {time && " "}
      <span className="font-medium">{TYPE_LABEL[item.type]}:</span>{" "}
      <span>{item.prospect?.name ?? "—"}</span>
    </a>
  )
}

/* ================================================================
 * WeekHourGrid: vista Settimana con asse orario.
 * Mostra le ore lavorative su un asse verticale e posiziona demo/impegni
 * nella loro fascia, cosi' gli slot liberi sono leggibili a colpo d'occhio.
 * Gli eventi "tutto il giorno" (es. blocchi "Ufficio") vanno in una riga
 * dedicata in alto per non sporcare la griglia.
 * ============================================================== */
const WEEK_DAY_START_HOUR = 7
const WEEK_DAY_END_HOUR = 21
const WEEK_HOUR_PX = 48
const WEEK_GRID_COLS = "3.5rem repeat(7, minmax(0, 1fr))"

// Slot prenotabili: stessa regola del booking pubblico (lib/sales/lead-call.ts):
// lun-ven, fascia 9:00-18:00, slot da 30 minuti.
const SLOT_WORK_START_HOUR = 9
const SLOT_WORK_END_HOUR = 18
const SLOT_MINUTES = 30

type FreeSlot = { startMin: number; durMin: number; startHHmm: string; endHHmm: string }

/** Calcola gli slot liberi (futuri, in orario di lavoro) non occupati da eventi. */
function computeFreeSlots(day: Date, busy: WeekTimedEvent[]): FreeSlot[] {
  const dow = day.getDay() // 0 dom .. 6 sab
  if (dow === 0 || dow === 6) return [] // solo lun-ven
  const now = Date.now()
  const slots: FreeSlot[] = []
  for (let h = SLOT_WORK_START_HOUR; h < SLOT_WORK_END_HOUR; h++) {
    for (let mm = 0; mm < 60; mm += SLOT_MINUTES) {
      const s = new Date(day)
      s.setHours(h, mm, 0, 0)
      const e = new Date(s.getTime() + SLOT_MINUTES * 60000)
      if (s.getTime() <= now) continue // niente slot passati
      // libero solo se nessun evento si sovrappone
      const overlap = busy.some((ev) => ev.start.getTime() < e.getTime() && ev.end.getTime() > s.getTime())
      if (overlap) continue
      const startMin = (h - WEEK_DAY_START_HOUR) * 60 + mm
      slots.push({
        startMin,
        durMin: SLOT_MINUTES,
        startHHmm: format(s, "HH:mm"),
        endHHmm: format(e, "HH:mm"),
      })
    }
  }
  return slots
}

type WeekTimedEvent = {
  id: string
  kind: "google" | "my" | "item"
  title: string
  start: Date
  end: Date
  color?: string
  meetLink?: string | null
  itemType?: CalendarItem["type"]
  done?: boolean
  cancelled?: boolean
}

/** Assegna colonne affiancate agli eventi sovrapposti (per non accavallarli). */
function layoutOverlaps(events: WeekTimedEvent[]): Array<{ ev: WeekTimedEvent; col: number; cols: number }> {
  const sorted = [...events].sort(
    (a, b) => a.start.getTime() - b.start.getTime() || a.end.getTime() - b.end.getTime(),
  )
  const result: Array<{ ev: WeekTimedEvent; col: number; cols: number }> = []
  let cluster: Array<{ ev: WeekTimedEvent; col: number; cols: number }> = []
  let clusterEnd = 0
  let lanes: number[] = []
  const flush = () => {
    const cols = cluster.reduce((m, c) => Math.max(m, c.col + 1), 0)
    for (const c of cluster) c.cols = cols
    result.push(...cluster)
    cluster = []
  }
  for (const ev of sorted) {
    if (cluster.length > 0 && ev.start.getTime() >= clusterEnd) {
      flush()
      lanes = []
      clusterEnd = 0
    }
    let lane = lanes.findIndex((end) => end <= ev.start.getTime())
    if (lane === -1) {
      lane = lanes.length
      lanes.push(ev.end.getTime())
    } else {
      lanes[lane] = ev.end.getTime()
    }
    cluster.push({ ev, col: lane, cols: 1 })
    clusterEnd = Math.max(clusterEnd, ev.end.getTime())
  }
  flush()
  return result
}

/** Linea rossa dell'ora corrente (solo nella colonna di oggi). */
function NowLine() {
  const now = new Date()
  const min = (now.getHours() - WEEK_DAY_START_HOUR) * 60 + now.getMinutes()
  const total = (WEEK_DAY_END_HOUR - WEEK_DAY_START_HOUR + 1) * 60
  if (min < 0 || min > total) return null
  const top = (min / 60) * WEEK_HOUR_PX
  return (
    <div className="pointer-events-none absolute left-0 right-0 z-20" style={{ top }}>
      <div className="relative border-t-2 border-red-500">
        <span className="absolute -left-1 -top-[5px] h-2 w-2 rounded-full bg-red-500" />
      </div>
    </div>
  )
}

function WeekHourGrid({
  days,
  googleByDay,
  myEventsByDay,
  itemsByDay,
  onOpenDay,
  onPickSlot,
}: {
  days: Date[]
  googleByDay: Map<string, GoogleEvent[]>
  myEventsByDay: Map<string, MyEvent[]>
  itemsByDay: Map<string, CalendarItem[]>
  onOpenDay: (day: Date) => void
  onPickSlot: (day: Date, startHHmm: string, endHHmm: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // All'apertura posiziona la vista sull'orario lavorativo (~8:00).
    if (scrollRef.current) scrollRef.current.scrollTop = (8 - WEEK_DAY_START_HOUR) * WEEK_HOUR_PX
  }, [])

  const hours: number[] = []
  for (let h = WEEK_DAY_START_HOUR; h <= WEEK_DAY_END_HOUR; h++) hours.push(h)
  const gridHeight = (WEEK_DAY_END_HOUR - WEEK_DAY_START_HOUR + 1) * WEEK_HOUR_PX

  const perDay = days.map((day) => {
    const key = format(day, "yyyy-MM-dd")
    const timed: WeekTimedEvent[] = []
    const allDay: WeekTimedEvent[] = []

    for (const ev of googleByDay.get(key) ?? []) {
      if (!ev.start) continue
      const start = parseISO(ev.start)
      const end = ev.end ? parseISO(ev.end) : new Date(start.getTime() + 60 * 60000)
      const w: WeekTimedEvent = { id: ev.id, kind: "google", title: ev.title, start, end, meetLink: ev.meetLink, color: ev.ownerColor }
      ;(ev.allDay ? allDay : timed).push(w)
    }
    for (const ev of myEventsByDay.get(key) ?? []) {
      if (!ev.start) continue
      const start = parseISO(ev.start)
      const end = ev.end ? parseISO(ev.end) : new Date(start.getTime() + 60 * 60000)
      const w: WeekTimedEvent = { id: ev.id, kind: "my", title: ev.title, start, end, color: ev.color }
      ;(ev.allDay ? allDay : timed).push(w)
    }
    for (const it of itemsByDay.get(key) ?? []) {
      const whenStr = it.task_status ? it.due_at ?? it.happened_at : it.happened_at
      if (!whenStr) continue
      const start = parseISO(whenStr)
      timed.push({
        id: it.id,
        kind: "item",
        title: it.title || it.prospect?.name || TYPE_LABEL[it.type] || "Attività",
        start,
        end: new Date(start.getTime() + 30 * 60000),
        itemType: it.type,
        done: it.task_status === "done",
        cancelled: it.task_status === "cancelled",
      })
    }
    const freeSlots = computeFreeSlots(day, timed)
    return { day, key, timed: layoutOverlaps(timed), allDay, freeSlots }
  })

  const hasAllDay = perDay.some((d) => d.allDay.length > 0)

  return (
    <div>
      {/* Header giorni */}
      <div className="grid border-b border-border bg-muted/40" style={{ gridTemplateColumns: WEEK_GRID_COLS }}>
        <div className="border-r border-border" />
        {perDay.map(({ day, key }) => (
          <button
            key={key}
            type="button"
            onClick={() => onOpenDay(day)}
            className="flex flex-col items-center gap-0.5 px-1 py-2 hover:bg-muted"
          >
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {format(day, "EEE", { locale: it })}
            </span>
            <span
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold",
                isToday(day) ? "bg-emerald-600 text-white" : "text-foreground",
              )}
            >
              {format(day, "d")}
            </span>
          </button>
        ))}
      </div>

      {/* Riga eventi tutto il giorno (es. "Ufficio") */}
      {hasAllDay && (
        <div className="grid border-b border-border" style={{ gridTemplateColumns: WEEK_GRID_COLS }}>
          <div className="flex items-start justify-end border-r border-border px-1.5 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            Tutto il giorno
          </div>
          {perDay.map(({ day, key, allDay }) => (
            <button
              key={key}
              type="button"
              onClick={() => onOpenDay(day)}
              className="flex min-h-[2.25rem] flex-col gap-1 border-r border-border px-1 py-1 text-left last:border-r-0 hover:bg-muted/40"
            >
              {allDay.map((ev) => (
                <span
                  key={ev.kind + ev.id}
                  className={cn(
                    "truncate rounded px-1.5 py-0.5 text-[11px] font-medium",
                    ev.kind === "google" && !ev.color && "bg-sky-100 text-sky-800",
                  )}
                  style={ev.color ? { backgroundColor: `${ev.color}1a`, color: ev.color } : undefined}
                >
                  {ev.title}
                </span>
              ))}
            </button>
          ))}
        </div>
      )}

      {/* Griglia oraria scrollabile */}
      <div ref={scrollRef} className="max-h-[34rem] overflow-y-auto">
        <div className="grid" style={{ gridTemplateColumns: WEEK_GRID_COLS }}>
          {/* Colonna etichette ore */}
          <div className="relative border-r border-border" style={{ height: gridHeight }}>
            {hours.map((h, i) => (
              <div
                key={h}
                className="absolute right-1.5 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground"
                style={{ top: i * WEEK_HOUR_PX }}
              >
                {i === 0 ? "" : `${String(h).padStart(2, "0")}:00`}
              </div>
            ))}
          </div>

          {/* Colonne giorni */}
          {perDay.map(({ day, key, timed, freeSlots }) => (
            <div key={key} className="relative border-r border-border last:border-r-0" style={{ height: gridHeight }}>
              {hours.map((h, i) => (
                <div
                  key={h}
                  className="absolute left-0 right-0 border-t border-border/50"
                  style={{ top: i * WEEK_HOUR_PX }}
                />
              ))}
              {/* Slot liberi prenotabili (dietro gli eventi): click = richiedi demo */}
              {freeSlots.map((slot) => {
                const top = (slot.startMin / 60) * WEEK_HOUR_PX
                const height = Math.max(14, (slot.durMin / 60) * WEEK_HOUR_PX - 2)
                return (
                  <button
                    key={`free-${slot.startMin}`}
                    type="button"
                    onClick={() => onPickSlot(day, slot.startHHmm, slot.endHHmm)}
                    className="group absolute left-0.5 right-0.5 z-0 flex items-center justify-center gap-1 overflow-hidden rounded-sm border border-dashed border-emerald-300 bg-emerald-50/70 text-emerald-700 transition-colors hover:border-emerald-500 hover:bg-emerald-100"
                    style={{ top, height }}
                    title={`Slot libero ${slot.startHHmm}–${slot.endHHmm} · clicca per richiedere una demo`}
                    aria-label={`Slot libero ${slot.startHHmm}, richiedi una demo`}
                  >
                    <Plus className="h-3 w-3 shrink-0" />
                    <span className="text-[10px] font-medium leading-none">
                      <span className="tabular-nums">{slot.startHHmm}</span>
                      <span className="ml-1 hidden sm:inline">Libero</span>
                    </span>
                  </button>
                )
              })}
              {isToday(day) && <NowLine />}
              {timed.map(({ ev, col, cols }) => {
                const startMin = (ev.start.getHours() - WEEK_DAY_START_HOUR) * 60 + ev.start.getMinutes()
                const endMin = (ev.end.getHours() - WEEK_DAY_START_HOUR) * 60 + ev.end.getMinutes()
                const top = Math.min(gridHeight - 18, Math.max(0, (startMin / 60) * WEEK_HOUR_PX))
                const height = Math.max(18, ((endMin - startMin) / 60) * WEEK_HOUR_PX - 2)
                const widthPct = 100 / cols
                // In overlay le demo google hanno un colore proprietario (ev.color):
                // usa lo stile inline e non le classi sky di default.
                const colorClasses =
                  ev.kind === "google" && !ev.color
                    ? "border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100"
                    : ev.kind === "item"
                      ? cn(TYPE_COLORS[ev.itemType ?? "note"] ?? TYPE_COLORS.note, "hover:brightness-95")
                      : "hover:brightness-95"
                return (
                  <button
                    key={ev.kind + ev.id}
                    type="button"
                    onClick={() => onOpenDay(day)}
                    className={cn(
                      "absolute z-10 overflow-hidden rounded-md border px-1 py-0.5 text-left leading-tight",
                      colorClasses,
                      ev.done && "opacity-70 line-through",
                      ev.cancelled && "opacity-50",
                    )}
                    style={{
                      top,
                      height,
                      left: `calc(${col * widthPct}% + 2px)`,
                      width: `calc(${widthPct}% - 4px)`,
                      ...(ev.color
                        ? { borderColor: `${ev.color}55`, backgroundColor: `${ev.color}1a`, color: ev.color }
                        : {}),
                    }}
                    title={`${format(ev.start, "HH:mm")}–${format(ev.end, "HH:mm")} · ${ev.title}`}
                  >
                    <span className="flex items-center gap-1">
                      <span className="text-[11px] font-semibold tabular-nums">{format(ev.start, "HH:mm")}</span>
                      {ev.meetLink && <Video className="h-3 w-3 shrink-0" aria-label="Demo con Google Meet" />}
                    </span>
                    <span className="block truncate text-[11px]">{ev.title}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
