"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import {
  addDays,
  addMonths,
  addWeeks,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns"
import { it } from "date-fns/locale"
import { ChevronLeft, ChevronRight, ExternalLink, Loader2, RefreshCw, UserPlus, Users, Video } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

type GoogleEvent = {
  id: string
  title: string
  start: string | null
  end: string | null
  allDay: boolean
  meetLink?: string | null
  htmlLink?: string | null
  ownerName?: string | null
}

type Prospect = { id: string; name: string; city?: string | null }

type CalendarItem = {
  id: string
  prospect_id: string
  agent_id: string | null
  agent_name: string | null
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

type Agent = { id: string; name: string }
type View = "month" | "week"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

// Palette per colorare gli eventi in base al venditore (max 8, poi cicla).
const AGENT_PALETTE = [
  "#0d9488", // teal
  "#2563eb", // blue
  "#d97706", // amber
  "#db2777", // pink
  "#7c3aed", // violet
  "#059669", // emerald
  "#dc2626", // red
  "#0891b2", // cyan
]

const TYPE_LABEL: Record<string, string> = {
  call: "Tel",
  email: "Mail",
  visit: "Visita",
  meeting: "Mtg",
  note: "Nota",
  system: "Sys",
}

export function SuperAdminCalendarClient() {
  const [view, setView] = useState<View>("month")
  const [anchor, setAnchor] = useState<Date>(() => new Date())
  const [hiddenAgents, setHiddenAgents] = useState<Set<string>>(new Set())
  const [openDay, setOpenDay] = useState<Date | null>(null)

  const { rangeStart, rangeEnd, gridStart, gridEnd, days } = useMemo(() => {
    if (view === "month") {
      const monthStart = startOfMonth(anchor)
      const monthEnd = endOfMonth(anchor)
      const gStart = startOfWeek(monthStart, { weekStartsOn: 1 })
      const gEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
      const ds: Date[] = []
      let d = gStart
      while (d <= gEnd) {
        ds.push(d)
        d = addDays(d, 1)
      }
      return { rangeStart: monthStart, rangeEnd: monthEnd, gridStart: gStart, gridEnd: gEnd, days: ds }
    }
    const wStart = startOfWeek(anchor, { weekStartsOn: 1 })
    const wEnd = endOfWeek(anchor, { weekStartsOn: 1 })
    const ds: Date[] = []
    let d = wStart
    while (d <= wEnd) {
      ds.push(d)
      d = addDays(d, 1)
    }
    return { rangeStart: wStart, rangeEnd: wEnd, gridStart: wStart, gridEnd: wEnd, days: ds }
  }, [view, anchor])

  const apiFrom = startOfDay(gridStart).toISOString()
  const apiTo = endOfDay(gridEnd).toISOString()

  const { data, isLoading, mutate } = useSWR<{ items: CalendarItem[]; agents: Agent[] }>(
    `/api/superadmin/calendar?from=${encodeURIComponent(apiFrom)}&to=${encodeURIComponent(apiTo)}`,
    fetcher,
  )
  const { data: googleData, mutate: mutateGoogle } = useSWR<{ configured: boolean; events: GoogleEvent[] }>(
    `/api/sales/calendar/google-availability?from=${encodeURIComponent(apiFrom)}&to=${encodeURIComponent(apiTo)}`,
    fetcher,
  )
  const googleConfigured = googleData?.configured ?? false

  const agents = data?.agents ?? []
  const colorByAgent = useMemo(() => {
    const map = new Map<string, string>()
    agents.forEach((a, i) => map.set(a.id, AGENT_PALETTE[i % AGENT_PALETTE.length]))
    return map
  }, [agents])

  const visibleItems = useMemo(
    () => (data?.items ?? []).filter((it) => !it.agent_id || !hiddenAgents.has(it.agent_id)),
    [data, hiddenAgents],
  )

  const itemsByDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>()
    for (const it of visibleItems) {
      const d = it.task_status ? it.due_at ?? it.happened_at : it.happened_at
      if (!d) continue
      const key = format(parseISO(d), "yyyy-MM-dd")
      const arr = map.get(key) ?? []
      arr.push(it)
      map.set(key, arr)
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const da = parseISO(a.task_status ? a.due_at ?? a.happened_at : a.happened_at).getTime()
        const db = parseISO(b.task_status ? b.due_at ?? b.happened_at : b.happened_at).getTime()
        return da - db
      })
    }
    return map
  }, [visibleItems])

  const googleByDay = useMemo(() => {
    const map = new Map<string, GoogleEvent[]>()
    for (const ev of googleData?.events ?? []) {
      if (!ev.start) continue
      const key = format(parseISO(ev.start), "yyyy-MM-dd")
      const arr = map.get(key) ?? []
      arr.push(ev)
      map.set(key, arr)
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.start && b.start ? parseISO(a.start).getTime() - parseISO(b.start).getTime() : 0))
    }
    return map
  }, [googleData])

  const goPrev = () => setAnchor((a) => (view === "month" ? addMonths(a, -1) : addWeeks(a, -1)))
  const goNext = () => setAnchor((a) => (view === "month" ? addMonths(a, 1) : addWeeks(a, 1)))
  const goToday = () => setAnchor(new Date())

  const toggleAgent = (id: string) =>
    setHiddenAgents((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const totalCount = (data?.items.length ?? 0) + (googleData?.events?.length ?? 0)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Calendario generale</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Vista d&apos;insieme: demo su clienti@4bid.it e attivit&agrave; di tutti i venditori.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
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
          <h2 className="text-base font-semibold capitalize ml-2">
            {view === "month"
              ? format(rangeStart, "MMMM yyyy", { locale: it })
              : `${format(rangeStart, "d MMM", { locale: it })} - ${format(rangeEnd, "d MMM yyyy", { locale: it })}`}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Users className="h-4 w-4 mr-2" />
                Venditori
                {hiddenAgents.size > 0 ? ` (${agents.length - hiddenAgents.size}/${agents.length})` : ""}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Mostra venditori</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {agents.length === 0 && (
                <div className="px-2 py-1.5 text-sm text-muted-foreground">Nessun venditore</div>
              )}
              {agents.map((a) => (
                <DropdownMenuCheckboxItem
                  key={a.id}
                  checked={!hiddenAgents.has(a.id)}
                  onCheckedChange={() => toggleAgent(a.id)}
                  onSelect={(e) => e.preventDefault()}
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm mr-2"
                    style={{ backgroundColor: colorByAgent.get(a.id) }}
                  />
                  {a.name}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="hidden sm:flex items-center rounded-md border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setView("month")}
              className={cn("px-3 py-1.5 text-sm", view === "month" ? "bg-emerald-600 text-white" : "hover:bg-muted")}
            >
              Mese
            </button>
            <button
              type="button"
              onClick={() => setView("week")}
              className={cn("px-3 py-1.5 text-sm", view === "week" ? "bg-emerald-600 text-white" : "hover:bg-muted")}
            >
              Settimana
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={() => mutate()} title="Aggiorna">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Legenda */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {googleConfigured && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-sky-500" />
            Demo su clienti@4bid.it
          </span>
        )}
        {agents
          .filter((a) => !hiddenAgents.has(a.id))
          .map((a) => (
            <span key={a.id} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: colorByAgent.get(a.id) }} />
              {a.name}
            </span>
          ))}
        <span className="tabular-nums ml-auto">
          {isLoading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Caricamento
            </span>
          ) : (
            `${totalCount} elementi`
          )}
        </span>
      </div>

      {/* Griglia desktop */}
      <Card className="hidden md:block overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border bg-muted/40 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map((d) => (
            <div key={d} className="px-3 py-2 text-center">
              {d}
            </div>
          ))}
        </div>
        <div
          className={cn(
            "grid grid-cols-7",
            view === "month" ? "auto-rows-[minmax(7rem,1fr)]" : "auto-rows-[minmax(20rem,1fr)]",
          )}
        >
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd")
            const items = itemsByDay.get(key) ?? []
            const gEvents = googleByDay.get(key) ?? []
            const inMonth = view === "week" || isSameMonth(day, anchor)
            const visible = items.slice(0, 3)
            const overflow = items.length - visible.length
            return (
              <div
                key={key}
                className={cn(
                  "border-b border-r border-border p-1.5 flex flex-col gap-1 min-w-0",
                  !inMonth && "bg-muted/30 text-muted-foreground",
                )}
              >
                <button
                  type="button"
                  onClick={() => setOpenDay(day)}
                  className={cn(
                    "self-start text-xs font-medium px-1.5 py-0.5 rounded-md hover:bg-muted",
                    isToday(day) && "bg-emerald-600 text-white hover:bg-emerald-700",
                  )}
                >
                  {format(day, "d")}
                </button>
                <div className="flex flex-col gap-0.5 min-w-0">
                  {gEvents.map((ev) => (
                    <button
                      type="button"
                      key={ev.id}
                      onClick={() => setOpenDay(day)}
                      className="flex w-full items-center gap-1 rounded-sm border border-sky-200 bg-sky-50 px-1 py-0.5 text-[11px] text-sky-800 text-left hover:bg-sky-100"
                      title={`${ev.title}${ev.start && !ev.allDay ? " · " + format(parseISO(ev.start), "HH:mm") : ""}${ev.ownerName ? " · " + ev.ownerName : ""}`}
                    >
                      <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-sky-500" />
                      <span className="truncate">
                        {ev.start && !ev.allDay ? `${format(parseISO(ev.start), "HH:mm")} ` : ""}
                        {ev.title}
                        {ev.ownerName ? <span className="opacity-70"> · {ev.ownerName}</span> : null}
                      </span>
                      {ev.meetLink && <Video className="h-3 w-3 shrink-0 text-sky-600" aria-label="Demo con Google Meet" />}
                    </button>
                  ))}
                  {visible.map((it) => (
                    <ItemChip key={it.id} item={it} color={it.agent_id ? colorByAgent.get(it.agent_id) : undefined} />
                  ))}
                  {overflow > 0 && (
                    <button
                      type="button"
                      onClick={() => setOpenDay(day)}
                      className="text-[11px] text-muted-foreground hover:text-foreground text-left px-1"
                    >
                      +{overflow} altro/i
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Agenda mobile */}
      <div className="md:hidden space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          (() => {
            const agendaDays = days.filter((day) => {
              if (view === "month" && !isSameMonth(day, anchor)) return false
              const key = format(day, "yyyy-MM-dd")
              return (itemsByDay.get(key)?.length ?? 0) + (googleByDay.get(key)?.length ?? 0) > 0
            })
            if (agendaDays.length === 0) {
              return (
                <Card className="p-8 text-center text-sm text-muted-foreground">
                  Nessun impegno in questo periodo.
                </Card>
              )
            }
            return agendaDays.map((day) => {
              const key = format(day, "yyyy-MM-dd")
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
                        isToday(day) ? "bg-emerald-600 text-white" : "bg-muted text-foreground",
                      )}
                    >
                      {format(day, "d")}
                    </span>
                    <span className="text-sm font-medium capitalize">{format(day, "EEEE", { locale: it })}</span>
                  </button>
                  <div className="space-y-1.5 pl-10">
                    {(googleByDay.get(key) ?? []).map((ev) => (
                      <div
                        key={ev.id}
                        className="flex items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-2.5 py-2 text-sm text-sky-800"
                      >
                        <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-sky-500" />
                        <span className="truncate">
                          {ev.start && !ev.allDay ? `${format(parseISO(ev.start), "HH:mm")} · ` : ""}
                          {ev.title}
                          {ev.ownerName ? <span className="opacity-70"> · {ev.ownerName}</span> : null}
                        </span>
                        {ev.meetLink && <Video className="h-3.5 w-3.5 shrink-0 text-sky-600" aria-label="Demo con Google Meet" />}
                      </div>
                    ))}
                    {(itemsByDay.get(key) ?? []).map((it) => (
                      <ItemChip key={it.id} item={it} color={it.agent_id ? colorByAgent.get(it.agent_id) : undefined} block />
                    ))}
                  </div>
                </div>
              )
            })
          })()
        )}
      </div>

      {openDay && (
        <DayDialog
          day={openDay}
          items={itemsByDay.get(format(openDay, "yyyy-MM-dd")) ?? []}
          googleEvents={googleByDay.get(format(openDay, "yyyy-MM-dd")) ?? []}
          colorByAgent={colorByAgent}
          agents={agents}
          onClose={() => setOpenDay(null)}
          onAssigned={() => mutateGoogle()}
        />
      )}
    </div>
  )
}

function itemTime(it: CalendarItem): string {
  const d = it.task_status ? it.due_at ?? it.happened_at : it.happened_at
  return d ? format(parseISO(d), "HH:mm") : ""
}

function ItemChip({ item, color, block }: { item: CalendarItem; color?: string; block?: boolean }) {
  const time = itemTime(item)
  const isDone = item.task_status === "done"
  const isCancelled = item.task_status === "cancelled"
  const c = color ?? "#475569"
  return (
    <a
      href={`/superadmin/prospects?focus=${item.prospect_id}`}
      className={cn(
        "block text-[11px] leading-tight px-1.5 py-1 rounded border truncate",
        block && "text-sm px-2.5 py-2",
        isDone && "opacity-70 line-through",
        isCancelled && "opacity-50",
      )}
      style={{ borderColor: `${c}55`, backgroundColor: `${c}1a`, color: c }}
      title={`${item.agent_name ?? "?"} · ${TYPE_LABEL[item.type]} · ${item.prospect?.name ?? "?"}${time ? " · " + time : ""}`}
    >
      <span className="font-medium tabular-nums">{time}</span>
      {time && " "}
      <span className="font-medium">{TYPE_LABEL[item.type]}:</span> {item.prospect?.name ?? "—"}
      {item.agent_name ? <span className="opacity-70"> · {item.agent_name}</span> : null}
    </a>
  )
}

function DayDialog({
  day,
  items,
  googleEvents,
  colorByAgent,
  agents,
  onClose,
  onAssigned,
}: {
  day: Date
  items: CalendarItem[]
  googleEvents: GoogleEvent[]
  colorByAgent: Map<string, string>
  agents: Agent[]
  onClose: () => void
  onAssigned: () => void
}) {
  const [assigning, setAssigning] = useState<string | null>(null)
  const dayKey = format(day, "yyyy-MM-dd")

  // Assegna un evento Google (creato a mano sul calendario condiviso) a un
  // venditore: crea/aggiorna la riga demo_requests ponte. Dettagli evento letti
  // REALI lato server. Il super_admin può assegnare a qualunque venditore.
  const assignToAgent = async (googleEventId: string, agentId: string) => {
    setAssigning(googleEventId)
    try {
      const res = await fetch("/api/sales/calendar/assign-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ google_event_id: googleEventId, agent_id: agentId, day: dayKey }),
      })
      if (!res.ok) throw new Error(await res.text())
      onAssigned()
    } catch (e) {
      console.error("[v0] assegnazione venditore fallita:", e)
      alert("Assegnazione non riuscita. Riprova o contatta il supporto.")
    } finally {
      setAssigning(null)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="capitalize">{format(day, "EEEE d MMMM yyyy", { locale: it })}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {googleEvents.length === 0 && items.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">Nessun impegno in questa giornata.</p>
          )}
          {googleEvents.map((ev) => (
            <div
              key={ev.id}
              className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800"
            >
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-sky-500" />
                <span className="font-medium tabular-nums">
                  {ev.start && !ev.allDay ? format(parseISO(ev.start), "HH:mm") : "Tutto il giorno"}
                </span>
                <span className="truncate">{ev.title}</span>
              </div>
              {ev.ownerName && (
                <div className="mt-1 flex items-center gap-1.5 pl-4 text-xs text-sky-700">
                  <Users className="h-3.5 w-3.5" />
                  <span>
                    Venditore: <span className="font-medium">{ev.ownerName}</span>
                  </span>
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-2 pl-4">
                {ev.meetLink && (
                  <a
                    href={ev.meetLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                  >
                    <Video className="h-3.5 w-3.5" />
                    Partecipa al Meet
                  </a>
                )}
                {ev.htmlLink && (
                  <a
                    href={ev.htmlLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-sky-300 bg-white px-2.5 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-100"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Apri evento
                  </a>
                )}
                {/* Assegna l'evento a un venditore (super_admin: qualunque). Crea
                    il collegamento demo_requests cosi' l'evento risulta suo. */}
                {agents.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-auto border-sky-300 bg-white px-2.5 py-1.5 text-xs text-sky-800 hover:bg-sky-100"
                        disabled={assigning === ev.id}
                      >
                        {assigning === ev.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <UserPlus className="h-3.5 w-3.5" />
                        )}
                        <span className="ml-1.5">{ev.ownerName ? "Riassegna" : "Assegna a venditore"}</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-y-auto">
                      {agents.map((a) => (
                        <DropdownMenuItem
                          key={a.id}
                          onSelect={(e) => {
                            e.preventDefault()
                            assignToAgent(ev.id, a.id)
                          }}
                        >
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-sm mr-2"
                            style={{ backgroundColor: colorByAgent.get(a.id) }}
                          />
                          {a.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          ))}
          {items.map((it) => {
            const c = it.agent_id ? colorByAgent.get(it.agent_id) ?? "#475569" : "#475569"
            const time = itemTime(it)
            return (
              <a
                key={it.id}
                href={`/superadmin/prospects?focus=${it.prospect_id}`}
                className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm"
                style={{ borderColor: `${c}55`, backgroundColor: `${c}1a` }}
              >
                <span className="inline-block h-2 w-2 mt-1.5 shrink-0 rounded-full" style={{ backgroundColor: c }} />
                <div className="min-w-0">
                  <div className="font-medium" style={{ color: c }}>
                    {time ? `${time} · ` : ""}
                    {TYPE_LABEL[it.type]}: {it.prospect?.name ?? "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {it.agent_name ?? "?"}
                    {it.title ? ` · ${it.title}` : ""}
                    {it.task_status ? ` · ${it.task_status}` : ""}
                  </div>
                </div>
              </a>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
