"use client"

import { useEffect, useMemo, useState } from "react"
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns"
import { it } from "date-fns/locale"
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  Link2,
  Loader2,
  Paperclip,
  Plus,
  RefreshCw,
  Repeat2,
  Settings2,
  Trash2,
  Users,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Permission = "view" | "edit" | "manage"
type ViewMode = "day" | "week" | "month"
type RecurrencePreset = "none" | "daily" | "weekdays" | "weekly" | "monthly" | "yearly" | "custom"
type RecurrenceEnd = "never" | "until" | "count"

type Source = {
  id: string
  label: string
  color: string
  kind: "personal" | "shared" | "platform_demo"
  permission: Permission
  provider: "google"
  isPersonal: boolean
  supportsAttachments: boolean
}

type Attendee = {
  email: string
  displayName?: string | null
  responseStatus?: string | null
}

type Attachment = {
  fileUrl: string
  title: string
  mimeType: string | null
  fileId?: string | null
}

type EventItem = {
  id: string
  title: string
  description: string | null
  location: string | null
  start: string | null
  end: string | null
  allDay: boolean
  htmlLink: string | null
  attendees: Attendee[]
  attachments: Attachment[]
  recurringEventId: string | null
  sourceId: string
  sourceLabel: string
  sourceColor: string
  sourceKind: Source["kind"]
  permission: Permission
}

type SharingUser = { id: string; name: string; email: string; role: string; is_tenant_admin: boolean }
type SharingGrant = { id: string; source_id: string; admin_user_id: string; permission: Permission }

const permissionLabel: Record<Permission, string> = {
  view: "Sola lettura",
  edit: "Può modificare",
  manage: "Gestione",
}

const HOURS = Array.from({ length: 24 }, (_, index) => index)
const HOUR_HEIGHT = 56
const DAY_HEIGHT = HOURS.length * HOUR_HEIGHT

function datetimeLocal(value: string | null) {
  if (!value || /^\d{4}-\d{2}-\d{2}$/.test(value)) return ""
  const date = new Date(value)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function toIso(value: string) {
  return new Date(value).toISOString()
}

function parseEmails(value: string) {
  const emails = Array.from(new Set(
    value
      .split(/[\s,;]+/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  ))
  const invalid = emails.find((email) => !/^\S+@\S+\.\S+$/.test(email))
  return { emails, invalid }
}

function recurrenceRule(form: FormData, startLocal: string) {
  const preset = String(form.get("recurrencePreset") || "none") as RecurrencePreset
  if (preset === "none") return undefined

  const parts: string[] = []
  if (preset === "daily") parts.push("FREQ=DAILY")
  if (preset === "weekdays") parts.push("FREQ=WEEKLY", "BYDAY=MO,TU,WE,TH,FR")
  if (preset === "weekly") parts.push("FREQ=WEEKLY")
  if (preset === "monthly") parts.push("FREQ=MONTHLY")
  if (preset === "yearly") parts.push("FREQ=YEARLY")
  if (preset === "custom") {
    const frequency = String(form.get("recurrenceFrequency") || "WEEKLY").toUpperCase()
    const allowed = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]
    const interval = Math.min(99, Math.max(1, Number(form.get("recurrenceInterval") || 1)))
    parts.push(`FREQ=${allowed.includes(frequency) ? frequency : "WEEKLY"}`)
    if (interval > 1) parts.push(`INTERVAL=${interval}`)
  }

  const end = String(form.get("recurrenceEnd") || "never") as RecurrenceEnd
  if (end === "until") {
    const raw = String(form.get("recurrenceUntil") || "")
    if (raw) {
      const until = new Date(`${raw}T23:59:59`)
      if (!Number.isNaN(until.getTime())) {
        parts.push(`UNTIL=${until.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`)
      }
    }
  }
  if (end === "count") {
    const count = Math.min(999, Math.max(1, Number(form.get("recurrenceCount") || 1)))
    parts.push(`COUNT=${count}`)
  }

  if (!startLocal || !parts.length) return undefined
  return [`RRULE:${parts.join(";")}`]
}

function eventMinutes(event: EventItem) {
  if (!event.start || event.allDay) return { top: 0, height: 0 }
  const start = parseISO(event.start)
  const end = event.end ? parseISO(event.end) : new Date(start.getTime() + 30 * 60_000)
  const startMinutes = start.getHours() * 60 + start.getMinutes()
  const duration = Math.max(15, (end.getTime() - start.getTime()) / 60_000)
  return {
    top: (startMinutes / 60) * HOUR_HEIGHT,
    height: Math.max(24, (Math.min(duration, 24 * 60) / 60) * HOUR_HEIGHT),
  }
}

export function CrmCalendarClient() {
  const [anchor, setAnchor] = useState(() => new Date())
  const [view, setView] = useState<ViewMode>("week")
  const [sources, setSources] = useState<Source[]>([])
  const [events, setEvents] = useState<EventItem[]>([])
  const [hiddenSources, setHiddenSources] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [canManageShared, setCanManageShared] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<EventItem | null>(null)
  const [recurrencePreset, setRecurrencePreset] = useState<RecurrencePreset>("none")
  const [recurrenceEnd, setRecurrenceEnd] = useState<RecurrenceEnd>("never")
  const [sharingOpen, setSharingOpen] = useState(false)
  const [sharingUsers, setSharingUsers] = useState<SharingUser[]>([])
  const [sharingGrants, setSharingGrants] = useState<SharingGrant[]>([])
  const [sharingSourceId, setSharingSourceId] = useState("")
  const [sharingUserId, setSharingUserId] = useState("")
  const [sharingPermission, setSharingPermission] = useState<Permission>("view")

  const weekStart = useMemo(() => startOfWeek(anchor, { weekStartsOn: 1 }), [anchor])
  const weekEnd = useMemo(() => endOfWeek(anchor, { weekStartsOn: 1 }), [anchor])
  const monthGridStart = useMemo(() => startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 }), [anchor])
  const monthGridEnd = useMemo(() => endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 }), [anchor])
  const monthDays = useMemo(() => eachDayOfInterval({ start: monthGridStart, end: monthGridEnd }), [monthGridStart, monthGridEnd])
  const timeGridDays = useMemo(() => view === "day" ? [anchor] : Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [view, anchor, weekStart])
  const range = useMemo(() => {
    if (view === "day") return { from: startOfDay(anchor), to: endOfDay(anchor) }
    if (view === "week") return { from: weekStart, to: endOfDay(weekEnd) }
    return { from: monthGridStart, to: endOfDay(monthGridEnd) }
  }, [view, anchor, weekStart, weekEnd, monthGridStart, monthGridEnd])
  const writableSources = sources.filter((source) => source.permission !== "view")
  const visibleEvents = events.filter((event) => !hiddenSources.has(event.sourceId))

  const periodLabel = view === "day"
    ? format(anchor, "EEEE d MMMM yyyy", { locale: it })
    : view === "week"
      ? `${format(weekStart, "d MMM", { locale: it })} – ${format(weekEnd, "d MMM yyyy", { locale: it })}`
      : format(anchor, "MMMM yyyy", { locale: it })

  async function loadSources() {
    const response = await fetch("/api/admin/crm/calendar/sources", { cache: "no-store" })
    const json = await response.json()
    if (!response.ok) throw new Error(json.error || "Impossibile caricare i calendari")
    setSources(json.sources || [])
    setCanManageShared(Boolean(json.canManageShared))
    setIsSuperAdmin(Boolean(json.isSuperAdmin))
  }

  async function loadEvents() {
    const response = await fetch(
      `/api/admin/crm/calendar/events?from=${encodeURIComponent(range.from.toISOString())}&to=${encodeURIComponent(range.to.toISOString())}`,
      { cache: "no-store" },
    )
    const json = await response.json()
    if (!response.ok) throw new Error(json.error || "Impossibile caricare gli eventi")
    setEvents(json.events || [])
    if (json.errors?.length) toast.warning(`${json.errors.length} calendario/i non sincronizzato/i. Gli altri restano disponibili.`)
  }

  async function reload() {
    setLoading(true)
    try {
      await loadSources()
      await loadEvents()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Errore calendario")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, range.from.getTime(), range.to.getTime()])

  async function connect(intent: "personal" | "shared") {
    try {
      const response = await fetch("/api/admin/crm/calendar/oauth/google/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent }),
      })
      const json = await response.json()
      if (!response.ok || !json.authUrl) throw new Error(json.error || "Collegamento non disponibile")
      window.location.assign(json.authUrl)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Errore collegamento")
    }
  }

  function openNew(day?: Date, hour = 9, minute = 0) {
    if (!writableSources.length) {
      toast.error("Collega o abilita un calendario modificabile prima di creare un evento.")
      return
    }
    const start = day ? new Date(day) : new Date()
    if (day) start.setHours(hour, minute, 0, 0)
    else start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15, 0, 0)
    const end = new Date(start.getTime() + 60 * 60_000)
    setRecurrencePreset("none")
    setRecurrenceEnd("never")
    setEditing({
      id: "",
      title: "",
      description: null,
      location: null,
      start: start.toISOString(),
      end: end.toISOString(),
      allDay: false,
      htmlLink: null,
      attendees: [],
      attachments: [],
      recurringEventId: null,
      sourceId: writableSources[0]?.id || "",
      sourceLabel: writableSources[0]?.label || "",
      sourceColor: writableSources[0]?.color || "#2563eb",
      sourceKind: writableSources[0]?.kind || "personal",
      permission: writableSources[0]?.permission || "edit",
    })
    setEditorOpen(true)
  }

  function openEdit(event: EventItem) {
    setRecurrencePreset("none")
    setRecurrenceEnd("never")
    setEditing(event)
    setEditorOpen(true)
  }

  async function uploadAttachments(sourceId: string, files: File[]) {
    if (!files.length) return [] as Attachment[]
    const form = new FormData()
    form.set("sourceId", sourceId)
    files.forEach((file) => form.append("files", file))
    const response = await fetch("/api/admin/crm/calendar/attachments", { method: "POST", body: form })
    const json = await response.json()
    if (!response.ok) throw new Error(json.error || "Impossibile caricare gli allegati")
    return (json.attachments || []) as Attachment[]
  }

  async function saveEvent(form: FormData) {
    if (!editing || saving) return
    const sourceId = String(form.get("sourceId") || editing.sourceId)
    const summary = String(form.get("summary") || "").trim()
    const startLocal = String(form.get("start") || "")
    const endLocal = String(form.get("end") || "")
    if (!sourceId || !summary || !startLocal || !endLocal) {
      toast.error("Compila calendario, titolo, inizio e fine.")
      return
    }

    const { emails, invalid } = parseEmails(String(form.get("attendees") || ""))
    if (invalid) {
      toast.error(`Indirizzo invitato non valido: ${invalid}`)
      return
    }

    const files = form.getAll("attachments").filter((entry): entry is File => entry instanceof File && entry.size > 0)
    const source = sources.find((item) => item.id === sourceId)
    if (files.length && !source?.supportsAttachments) {
      toast.error("Gli allegati sono disponibili sui calendari Google collegati con il tuo account.")
      return
    }

    setSaving(true)
    try {
      const uploaded = await uploadAttachments(sourceId, files)
      const attachments = source?.supportsAttachments ? [...(editing.attachments || []), ...uploaded] : undefined
      const body = {
        sourceId,
        summary,
        description: String(form.get("description") || ""),
        location: String(form.get("location") || ""),
        startIso: toIso(startLocal),
        endIso: toIso(endLocal),
        timeZone: "Europe/Rome",
        attendees: emails,
        ...(attachments !== undefined ? { attachments } : {}),
        ...(!editing.id ? { recurrence: recurrenceRule(form, startLocal) } : {}),
      }
      const url = editing.id ? `/api/admin/crm/calendar/events/${encodeURIComponent(editing.id)}` : "/api/admin/crm/calendar/events"
      const response = await fetch(url, {
        method: editing.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || "Impossibile salvare l'evento")
      toast.success(editing.id ? "Evento aggiornato" : "Evento creato")
      setEditorOpen(false)
      await loadEvents()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Errore durante il salvataggio")
    } finally {
      setSaving(false)
    }
  }

  async function deleteEvent() {
    if (!editing?.id || saving) return
    if (!window.confirm(editing.recurringEventId ? "Eliminare questa occorrenza dell'evento ricorrente?" : "Eliminare questo evento dal calendario originale?")) return
    setSaving(true)
    try {
      const response = await fetch(
        `/api/admin/crm/calendar/events/${encodeURIComponent(editing.id)}?sourceId=${encodeURIComponent(editing.sourceId)}`,
        { method: "DELETE" },
      )
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || "Impossibile eliminare l'evento")
      toast.success("Evento eliminato")
      setEditorOpen(false)
      await loadEvents()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossibile eliminare l'evento")
    } finally {
      setSaving(false)
    }
  }

  async function openSharing() {
    setSharingOpen(true)
    try {
      const response = await fetch("/api/admin/crm/calendar/sharing", { cache: "no-store" })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || "Impossibile caricare i permessi")
      setSharingUsers(json.users || [])
      setSharingGrants(json.grants || [])
      if (!sharingSourceId && json.sources?.[0]?.id) setSharingSourceId(json.sources[0].id)
      if (!sharingUserId && json.users?.[0]?.id) setSharingUserId(json.users[0].id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Errore permessi")
    }
  }

  async function saveGrant() {
    if (!sharingSourceId || !sharingUserId) return
    const response = await fetch("/api/admin/crm/calendar/sharing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId: sharingSourceId, adminUserId: sharingUserId, permission: sharingPermission }),
    })
    const json = await response.json()
    if (!response.ok) {
      toast.error(json.error || "Impossibile salvare il permesso")
      return
    }
    toast.success("Permesso calendario aggiornato")
    await openSharing()
  }

  function movePeriod(direction: -1 | 1) {
    if (view === "day") setAnchor((current) => addDays(current, direction))
    else if (view === "week") setAnchor((current) => addWeeks(current, direction))
    else setAnchor((current) => addMonths(current, direction))
  }

  function eventsForDay(day: Date) {
    return visibleEvents.filter((event) => event.start && isSameDay(parseISO(event.start), day))
  }

  function renderTimeGrid(days: Date[]) {
    const columns = `72px repeat(${days.length}, minmax(${days.length === 1 ? 420 : 145}px, 1fr))`
    const now = new Date()
    return (
      <div className="overflow-auto rounded-xl border bg-card" style={{ maxHeight: 760 }}>
        <div style={{ minWidth: days.length === 1 ? 620 : 1120 }}>
          <div className="sticky top-0 z-30 grid border-b bg-card" style={{ gridTemplateColumns: columns }}>
            <div className="border-r p-2 text-xs text-muted-foreground">Ora</div>
            {days.map((day) => {
              const allDay = eventsForDay(day).filter((event) => event.allDay)
              return (
                <div key={day.toISOString()} className="min-w-0 border-r p-2 last:border-r-0">
                  <button type="button" onClick={() => openNew(day, 9)} className="flex w-full items-center justify-between rounded-md px-1 py-1 text-left hover:bg-muted">
                    <div>
                      <div className="text-xs font-medium capitalize text-muted-foreground">{format(day, "EEE", { locale: it })}</div>
                      <div className="text-sm font-semibold">{format(day, "d MMM", { locale: it })}</div>
                    </div>
                    <Plus className="h-4 w-4 text-muted-foreground" />
                  </button>
                  {allDay.length > 0 && (
                    <div className="mt-2 flex flex-col gap-1">
                      {allDay.slice(0, 3).map((event) => (
                        <button key={`${event.sourceId}-${event.id}`} type="button" onClick={() => openEdit(event)} className="truncate rounded border px-2 py-1 text-left text-xs" style={{ borderLeft: `4px solid ${event.sourceColor}` }}>
                          {event.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div className="grid" style={{ gridTemplateColumns: columns }}>
            <div className="relative border-r bg-muted/10" style={{ height: DAY_HEIGHT }}>
              {HOURS.map((hour) => (
                <div key={hour} className="absolute left-0 right-0 border-t px-2 text-right text-[11px] text-muted-foreground" style={{ top: hour * HOUR_HEIGHT, height: HOUR_HEIGHT }}>
                  <span className="relative -top-2 bg-card px-1">{String(hour).padStart(2, "0")}:00</span>
                </div>
              ))}
            </div>
            {days.map((day) => {
              const timed = eventsForDay(day).filter((event) => !event.allDay)
              const showNow = isSameDay(day, now)
              const nowTop = ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_HEIGHT
              return (
                <div key={day.toISOString()} className="relative min-w-0 border-r last:border-r-0" style={{ height: DAY_HEIGHT }}>
                  {HOURS.map((hour) => (
                    <button
                      key={hour}
                      type="button"
                      aria-label={`Crea evento ${format(day, "d MMM", { locale: it })} alle ${String(hour).padStart(2, "0")}:00`}
                      onClick={() => openNew(day, hour)}
                      className="absolute left-0 right-0 border-t transition hover:bg-muted/30"
                      style={{ top: hour * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                    />
                  ))}
                  {showNow && <div className="pointer-events-none absolute left-0 right-0 z-10 border-t-2 border-destructive" style={{ top: nowTop }} />}
                  {timed.map((event) => {
                    const { top, height } = eventMinutes(event)
                    return (
                      <button
                        key={`${event.sourceId}-${event.id}`}
                        type="button"
                        onClick={() => openEdit(event)}
                        className="absolute left-1 right-1 z-20 overflow-hidden rounded-md border bg-background px-2 py-1 text-left text-xs shadow-sm hover:bg-muted"
                        style={{ top, height, borderLeft: `4px solid ${event.sourceColor}` }}
                      >
                        <div className="truncate font-semibold">{event.title}</div>
                        <div className="truncate text-[10px] text-muted-foreground">
                          {event.start ? format(parseISO(event.start), "HH:mm") : ""}{event.end ? ` – ${format(parseISO(event.end), "HH:mm")}` : ""}
                        </div>
                        {height >= 48 && <div className="truncate text-[10px] text-muted-foreground">{event.sourceLabel}</div>}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  function renderMonth() {
    return (
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="grid grid-cols-7 border-b bg-muted/20">
          {Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), index)).map((day) => (
            <div key={day.toISOString()} className="border-r px-2 py-2 text-xs font-medium capitalize text-muted-foreground last:border-r-0">{format(day, "EEE", { locale: it })}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {monthDays.map((day) => {
            const dayEvents = eventsForDay(day)
            const muted = !isSameMonth(day, anchor)
            return (
              <div key={day.toISOString()} className={`min-h-32 border-b border-r p-1.5 last:border-r-0 ${muted ? "bg-muted/10" : ""}`}>
                <button type="button" onClick={() => openNew(day, 9)} className="mb-1 flex w-full items-center justify-between rounded px-1 py-1 hover:bg-muted">
                  <span className={`text-sm font-semibold ${muted ? "text-muted-foreground" : ""}`}>{format(day, "d")}</span>
                  <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                <div className="flex flex-col gap-1">
                  {dayEvents.slice(0, 4).map((event) => (
                    <button key={`${event.sourceId}-${event.id}`} type="button" onClick={() => openEdit(event)} className="truncate rounded border px-1.5 py-1 text-left text-[11px] hover:bg-muted" style={{ borderLeft: `4px solid ${event.sourceColor}` }}>
                      {!event.allDay && event.start ? `${format(parseISO(event.start), "HH:mm")} ` : ""}{event.title}
                    </button>
                  ))}
                  {dayEvents.length > 4 && <div className="px-1 text-[11px] text-muted-foreground">+{dayEvents.length - 4} altri</div>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => movePeriod(-1)} aria-label="Periodo precedente"><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" onClick={() => setAnchor(new Date())}>Oggi</Button>
          <Button variant="outline" size="icon" onClick={() => movePeriod(1)} aria-label="Periodo successivo"><ChevronRight className="h-4 w-4" /></Button>
          <div className="ml-1 text-sm font-semibold capitalize">{periodLabel}</div>
          <div className="ml-2 inline-flex rounded-md border p-1">
            {(["day", "week", "month"] as ViewMode[]).map((mode) => (
              <Button key={mode} type="button" variant={view === mode ? "default" : "ghost"} size="sm" onClick={() => setView(mode)}>
                {mode === "day" ? "Giorno" : mode === "week" ? "Settimana" : "Mese"}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => connect("personal")}><Link2 className="mr-2 h-4 w-4" /> Il mio Google Calendar</Button>
          {canManageShared && <Button variant="outline" onClick={() => connect("shared")}><Link2 className="mr-2 h-4 w-4" /> Calendario condiviso</Button>}
          {canManageShared && <Button variant="outline" onClick={openSharing}><Settings2 className="mr-2 h-4 w-4" /> Permessi</Button>}
          <Button onClick={() => openNew(view === "day" ? anchor : undefined)} disabled={!writableSources.length}><Plus className="mr-2 h-4 w-4" /> Nuovo evento</Button>
        </div>
      </div>

      {isSuperAdmin && sources.some((source) => source.kind === "platform_demo") && (
        <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
          <strong>Demo 4Bid attivo.</strong> Gli appuntamenti sono letti dallo stesso Google Calendar già usato dai siti delle piattaforme: nessuna copia e nessun doppione.
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">Calendari visibili</CardTitle>
            <Button variant="ghost" size="sm" onClick={reload} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} Aggiorna
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessun calendario collegato. Collega il tuo Google Calendar per iniziare.</p>
          ) : sources.map((source) => {
            const hidden = hiddenSources.has(source.id)
            return (
              <button
                key={source.id}
                type="button"
                onClick={() => setHiddenSources((current) => {
                  const next = new Set(current)
                  hidden ? next.delete(source.id) : next.add(source.id)
                  return next
                })}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${hidden ? "opacity-45" : ""}`}
                title={hidden ? "Mostra calendario" : "Nascondi calendario"}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: source.color }} />
                {source.label}<span className="text-muted-foreground">· {permissionLabel[source.permission]}</span>
              </button>
            )
          })}
        </CardContent>
      </Card>

      {view === "month" ? renderMonth() : renderTimeGrid(timeGridDays)}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editing?.id ? "Modifica evento" : "Nuovo evento"}</DialogTitle></DialogHeader>
          {editing && (
            <form action={saveEvent} className="flex flex-col gap-4">
              <div className="grid gap-2">
                <Label htmlFor="calendar-source">Calendario</Label>
                {editing.id ? <Input value={editing.sourceLabel} disabled /> : (
                  <select id="calendar-source" name="sourceId" defaultValue={editing.sourceId} className="h-10 rounded-md border bg-background px-3 text-sm">
                    {writableSources.map((source) => <option key={source.id} value={source.id}>{source.label}</option>)}
                  </select>
                )}
              </div>

              <div className="grid gap-2"><Label htmlFor="summary">Titolo</Label><Input id="summary" name="summary" defaultValue={editing.title} required /></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2"><Label htmlFor="start">Inizio</Label><Input id="start" name="start" type="datetime-local" defaultValue={datetimeLocal(editing.start)} required /></div>
                <div className="grid gap-2"><Label htmlFor="end">Fine</Label><Input id="end" name="end" type="datetime-local" defaultValue={datetimeLocal(editing.end)} required /></div>
              </div>
              <div className="grid gap-2"><Label htmlFor="location">Luogo</Label><Input id="location" name="location" defaultValue={editing.location || ""} /></div>

              <div className="grid gap-2">
                <Label htmlFor="attendees" className="flex items-center gap-2"><Users className="h-4 w-4" /> Invitati</Label>
                <Input id="attendees" name="attendees" defaultValue={(editing.attendees || []).map((item) => item.email).join(", ")} placeholder="nome@azienda.it, altro@azienda.it" />
                <p className="text-xs text-muted-foreground">Separali con virgola, spazio o punto e virgola. Google invierà gli aggiornamenti agli invitati.</p>
              </div>

              {!editing.id && (
                <div className="rounded-lg border p-3">
                  <Label htmlFor="recurrencePreset" className="mb-2 flex items-center gap-2"><Repeat2 className="h-4 w-4" /> Ripetizione</Label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <select id="recurrencePreset" name="recurrencePreset" value={recurrencePreset} onChange={(event) => setRecurrencePreset(event.target.value as RecurrencePreset)} className="h-10 rounded-md border bg-background px-3 text-sm">
                      <option value="none">Non si ripete</option>
                      <option value="daily">Ogni giorno</option>
                      <option value="weekdays">Dal lunedì al venerdì</option>
                      <option value="weekly">Ogni settimana</option>
                      <option value="monthly">Ogni mese</option>
                      <option value="yearly">Ogni anno</option>
                      <option value="custom">Personalizzata…</option>
                    </select>
                    {recurrencePreset !== "none" && (
                      <select name="recurrenceEnd" value={recurrenceEnd} onChange={(event) => setRecurrenceEnd(event.target.value as RecurrenceEnd)} className="h-10 rounded-md border bg-background px-3 text-sm">
                        <option value="never">Non termina</option>
                        <option value="until">Termina il…</option>
                        <option value="count">Dopo un numero di occorrenze</option>
                      </select>
                    )}
                  </div>
                  {recurrencePreset === "custom" && (
                    <div className="mt-3 grid grid-cols-[90px_1fr] gap-3">
                      <Input name="recurrenceInterval" type="number" min={1} max={99} defaultValue={1} aria-label="Intervallo ricorrenza" />
                      <select name="recurrenceFrequency" defaultValue="WEEKLY" className="h-10 rounded-md border bg-background px-3 text-sm">
                        <option value="DAILY">giorno/i</option>
                        <option value="WEEKLY">settimana/e</option>
                        <option value="MONTHLY">mese/i</option>
                        <option value="YEARLY">anno/i</option>
                      </select>
                    </div>
                  )}
                  {recurrencePreset !== "none" && recurrenceEnd === "until" && <Input className="mt-3" name="recurrenceUntil" type="date" required />}
                  {recurrencePreset !== "none" && recurrenceEnd === "count" && <Input className="mt-3" name="recurrenceCount" type="number" min={1} max={999} defaultValue={10} required />}
                </div>
              )}

              {editing.recurringEventId && (
                <div className="flex items-center gap-2 rounded-md bg-muted p-3 text-sm text-muted-foreground"><Repeat2 className="h-4 w-4" /> Questa è un'occorrenza di una serie ricorrente. Le modifiche qui riguardano questa occorrenza.</div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="attachments" className="flex items-center gap-2"><Paperclip className="h-4 w-4" /> Allegati</Label>
                {editing.attachments?.length > 0 && (
                  <div className="flex flex-col gap-1 rounded-md border p-2">
                    {editing.attachments.map((attachment) => (
                      <a key={`${attachment.fileId || attachment.fileUrl}`} href={attachment.fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 truncate text-sm text-primary hover:underline">
                        <Paperclip className="h-3.5 w-3.5 shrink-0" /> {attachment.title}
                      </a>
                    ))}
                  </div>
                )}
                <Input id="attachments" name="attachments" type="file" multiple />
                <p className="text-xs text-muted-foreground">I nuovi file vengono caricati nel Google Drive del calendario e allegati all'evento. Massimo 4 MB complessivi per singolo salvataggio.</p>
              </div>

              <div className="grid gap-2"><Label htmlFor="description">Note</Label><textarea id="description" name="description" defaultValue={editing.description || ""} className="min-h-24 rounded-md border bg-background p-3 text-sm" /></div>

              {editing.htmlLink && (
                <a href={editing.htmlLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-primary hover:underline"><CalendarDays className="h-4 w-4" /> Apri in Google Calendar <ExternalLink className="h-3.5 w-3.5" /></a>
              )}

              {editing.permission === "view" ? (
                <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">Hai accesso in sola lettura a questo calendario.</div>
              ) : (
                <div className="flex justify-between gap-2">
                  <div>{editing.id && <Button type="button" variant="destructive" onClick={deleteEvent} disabled={saving}><Trash2 className="mr-2 h-4 w-4" />Elimina</Button>}</div>
                  <Button type="submit" disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clock3 className="mr-2 h-4 w-4" />}Salva</Button>
                </div>
              )}
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={sharingOpen} onOpenChange={setSharingOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>Permessi calendari condivisi</DialogTitle></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label>Calendario</Label>
              <select value={sharingSourceId} onChange={(event) => setSharingSourceId(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm">
                {sources.filter((source) => source.kind !== "personal").map((source) => <option key={source.id} value={source.id}>{source.label}</option>)}
              </select>
            </div>
            <div className="grid gap-2">
              <Label>Utente</Label>
              <select value={sharingUserId} onChange={(event) => setSharingUserId(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm">
                {sharingUsers.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}
              </select>
            </div>
            <div className="grid gap-2">
              <Label>Permesso</Label>
              <select value={sharingPermission} onChange={(event) => setSharingPermission(event.target.value as Permission)} className="h-10 rounded-md border bg-background px-3 text-sm">
                <option value="view">Sola lettura</option>
                <option value="edit">Può modificare eventi</option>
                <option value="manage">Gestione</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end"><Button onClick={saveGrant}>Salva permesso</Button></div>
          <div className="max-h-64 overflow-auto rounded-md border">
            {sharingGrants.length === 0 ? <p className="p-3 text-sm text-muted-foreground">Nessun permesso assegnato.</p> : sharingGrants.map((grant) => {
              const user = sharingUsers.find((item) => item.id === grant.admin_user_id)
              const source = sources.find((item) => item.id === grant.source_id)
              return <div key={grant.id} className="flex items-center justify-between gap-3 border-b px-3 py-2 text-sm last:border-b-0"><span>{source?.label || "Calendario"} → {user?.name || user?.email || "Utente"}</span><span className="text-muted-foreground">{permissionLabel[grant.permission]}</span></div>
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
