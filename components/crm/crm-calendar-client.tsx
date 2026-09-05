"use client"

import { useEffect, useMemo, useState } from "react"
import { addDays, addWeeks, endOfWeek, format, isSameDay, parseISO, startOfWeek } from "date-fns"
import { it } from "date-fns/locale"
import { CalendarDays, ChevronLeft, ChevronRight, Link2, Loader2, Plus, RefreshCw, Settings2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

 type Permission = "view" | "edit" | "manage"
 type Source = {
  id: string
  label: string
  color: string
  kind: "personal" | "shared" | "platform_demo"
  permission: Permission
  provider: "google"
  isPersonal: boolean
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

function datetimeLocal(value: string | null) {
  if (!value || /^\d{4}-\d{2}-\d{2}$/.test(value)) return ""
  const date = new Date(value)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function toIso(value: string) {
  return new Date(value).toISOString()
}

export function CrmCalendarClient() {
  const [anchor, setAnchor] = useState(() => new Date())
  const [sources, setSources] = useState<Source[]>([])
  const [events, setEvents] = useState<EventItem[]>([])
  const [hiddenSources, setHiddenSources] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [canManageShared, setCanManageShared] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<EventItem | null>(null)
  const [sharingOpen, setSharingOpen] = useState(false)
  const [sharingUsers, setSharingUsers] = useState<SharingUser[]>([])
  const [sharingGrants, setSharingGrants] = useState<SharingGrant[]>([])
  const [sharingSourceId, setSharingSourceId] = useState("")
  const [sharingUserId, setSharingUserId] = useState("")
  const [sharingPermission, setSharingPermission] = useState<Permission>("view")

  const weekStart = useMemo(() => startOfWeek(anchor, { weekStartsOn: 1 }), [anchor])
  const weekEnd = useMemo(() => endOfWeek(anchor, { weekStartsOn: 1 }), [anchor])
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const writableSources = sources.filter((source) => source.permission !== "view")

  async function loadSources() {
    const response = await fetch("/api/admin/crm/calendar/sources", { cache: "no-store" })
    const json = await response.json()
    if (!response.ok) throw new Error(json.error || "Impossibile caricare i calendari")
    setSources(json.sources || [])
    setCanManageShared(Boolean(json.canManageShared))
    setIsSuperAdmin(Boolean(json.isSuperAdmin))
  }

  async function loadEvents() {
    const from = weekStart.toISOString()
    const to = addDays(weekEnd, 1).toISOString()
    const response = await fetch(`/api/admin/crm/calendar/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { cache: "no-store" })
    const json = await response.json()
    if (!response.ok) throw new Error(json.error || "Impossibile caricare gli eventi")
    setEvents(json.events || [])
    if (json.errors?.length) {
      toast.warning(`${json.errors.length} calendario/i non sincronizzato/i. Gli altri restano disponibili.`)
    }
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
  }, [weekStart.getTime()])

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

  function openNew(day?: Date) {
    const start = day ? new Date(day) : new Date()
    if (day) start.setHours(9, 0, 0, 0)
    const end = new Date(start.getTime() + 60 * 60_000)
    setEditing({
      id: "",
      title: "",
      description: null,
      location: null,
      start: start.toISOString(),
      end: end.toISOString(),
      allDay: false,
      htmlLink: null,
      sourceId: writableSources[0]?.id || "",
      sourceLabel: writableSources[0]?.label || "",
      sourceColor: writableSources[0]?.color || "#2563eb",
      sourceKind: writableSources[0]?.kind || "personal",
      permission: writableSources[0]?.permission || "edit",
    })
    setEditorOpen(true)
  }

  function openEdit(event: EventItem) {
    setEditing(event)
    setEditorOpen(true)
  }

  async function saveEvent(form: FormData) {
    if (!editing) return
    const sourceId = String(form.get("sourceId") || editing.sourceId)
    const summary = String(form.get("summary") || "").trim()
    const startLocal = String(form.get("start") || "")
    const endLocal = String(form.get("end") || "")
    if (!sourceId || !summary || !startLocal || !endLocal) {
      toast.error("Compila calendario, titolo, inizio e fine.")
      return
    }
    const body = {
      sourceId,
      summary,
      description: String(form.get("description") || ""),
      location: String(form.get("location") || ""),
      startIso: toIso(startLocal),
      endIso: toIso(endLocal),
      timeZone: "Europe/Rome",
    }
    const url = editing.id ? `/api/admin/crm/calendar/events/${encodeURIComponent(editing.id)}` : "/api/admin/crm/calendar/events"
    const response = await fetch(url, {
      method: editing.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const json = await response.json()
    if (!response.ok) {
      toast.error(json.error || "Impossibile salvare l'evento")
      return
    }
    toast.success(editing.id ? "Evento aggiornato" : "Evento creato")
    setEditorOpen(false)
    await loadEvents()
  }

  async function deleteEvent() {
    if (!editing?.id) return
    if (!window.confirm("Eliminare questo evento dal calendario originale?")) return
    const response = await fetch(
      `/api/admin/crm/calendar/events/${encodeURIComponent(editing.id)}?sourceId=${encodeURIComponent(editing.sourceId)}`,
      { method: "DELETE" },
    )
    const json = await response.json()
    if (!response.ok) {
      toast.error(json.error || "Impossibile eliminare l'evento")
      return
    }
    toast.success("Evento eliminato")
    setEditorOpen(false)
    await loadEvents()
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

  const visibleEvents = events.filter((event) => !hiddenSources.has(event.sourceId))

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setAnchor(addWeeks(anchor, -1))} aria-label="Settimana precedente">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={() => setAnchor(new Date())}>Oggi</Button>
          <Button variant="outline" size="icon" onClick={() => setAnchor(addWeeks(anchor, 1))} aria-label="Settimana successiva">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="ml-2 text-sm font-semibold capitalize">
            {format(weekStart, "d MMM", { locale: it })} – {format(weekEnd, "d MMM yyyy", { locale: it })}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => connect("personal")}>
            <Link2 className="mr-2 h-4 w-4" /> Il mio Google Calendar
          </Button>
          {canManageShared && (
            <Button variant="outline" onClick={() => connect("shared")}>
              <Link2 className="mr-2 h-4 w-4" /> Calendario condiviso
            </Button>
          )}
          {canManageShared && (
            <Button variant="outline" onClick={openSharing}>
              <Settings2 className="mr-2 h-4 w-4" /> Permessi
            </Button>
          )}
          <Button onClick={() => openNew()} disabled={!writableSources.length}>
            <Plus className="mr-2 h-4 w-4" /> Nuovo evento
          </Button>
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
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Aggiorna
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
                {source.label}
                <span className="text-muted-foreground">· {permissionLabel[source.permission]}</span>
              </button>
            )
          })}
        </CardContent>
      </Card>

      <div className="grid min-h-[520px] grid-cols-1 overflow-hidden rounded-xl border bg-card md:grid-cols-7">
        {days.map((day) => {
          const dayEvents = visibleEvents.filter((event) => event.start && isSameDay(parseISO(event.start), day))
          return (
            <div key={day.toISOString()} className="min-w-0 border-b p-2 md:border-b-0 md:border-r last:border-r-0">
              <button type="button" onClick={() => openNew(day)} className="mb-2 flex w-full items-center justify-between rounded-md px-1 py-1 text-left hover:bg-muted">
                <span className="text-xs font-medium capitalize text-muted-foreground">{format(day, "EEE", { locale: it })}</span>
                <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${isSameDay(day, new Date()) ? "bg-primary text-primary-foreground" : ""}`}>
                  {format(day, "d")}
                </span>
              </button>
              <div className="flex flex-col gap-2">
                {dayEvents.map((event) => (
                  <button
                    key={`${event.sourceId}-${event.id}`}
                    type="button"
                    onClick={() => openEdit(event)}
                    className="rounded-lg border p-2 text-left text-xs shadow-sm transition hover:bg-muted/50"
                    style={{ borderLeft: `4px solid ${event.sourceColor}` }}
                  >
                    <div className="font-semibold line-clamp-2">{event.title}</div>
                    <div className="mt-1 text-muted-foreground">
                      {event.allDay ? "Tutto il giorno" : event.start ? format(parseISO(event.start), "HH:mm") : ""}
                      {!event.allDay && event.end ? ` – ${format(parseISO(event.end), "HH:mm")}` : ""}
                    </div>
                    <div className="mt-1 truncate text-[10px] text-muted-foreground">{event.sourceLabel}</div>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editing?.id ? "Modifica evento" : "Nuovo evento"}</DialogTitle></DialogHeader>
          {editing && (
            <form action={saveEvent} className="flex flex-col gap-4">
              <div className="grid gap-2">
                <Label htmlFor="calendar-source">Calendario</Label>
                {editing.id ? (
                  <Input value={editing.sourceLabel} disabled />
                ) : (
                  <select id="calendar-source" name="sourceId" defaultValue={editing.sourceId} className="h-10 rounded-md border bg-background px-3 text-sm">
                    {writableSources.map((source) => <option key={source.id} value={source.id}>{source.label}</option>)}
                  </select>
                )}
              </div>
              <div className="grid gap-2"><Label htmlFor="summary">Titolo</Label><Input id="summary" name="summary" defaultValue={editing.title} required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2"><Label htmlFor="start">Inizio</Label><Input id="start" name="start" type="datetime-local" defaultValue={datetimeLocal(editing.start)} required /></div>
                <div className="grid gap-2"><Label htmlFor="end">Fine</Label><Input id="end" name="end" type="datetime-local" defaultValue={datetimeLocal(editing.end)} required /></div>
              </div>
              <div className="grid gap-2"><Label htmlFor="location">Luogo</Label><Input id="location" name="location" defaultValue={editing.location || ""} /></div>
              <div className="grid gap-2"><Label htmlFor="description">Note</Label><textarea id="description" name="description" defaultValue={editing.description || ""} className="min-h-24 rounded-md border bg-background p-3 text-sm" /></div>
              {editing.permission === "view" ? (
                <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">Hai accesso in sola lettura a questo calendario.</div>
              ) : (
                <div className="flex justify-between gap-2">
                  <div>{editing.id && <Button type="button" variant="destructive" onClick={deleteEvent}><Trash2 className="mr-2 h-4 w-4" />Elimina</Button>}</div>
                  <Button type="submit">Salva</Button>
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
