"use client"

import { useState } from "react"
import { mutate as globalMutate } from "swr"
import { format, parseISO } from "date-fns"
import { it } from "date-fns/locale"
import { Check, ExternalLink, Loader2, UserPlus, Video, X } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

type AssignableAgent = { id: string; display_name?: string | null; email?: string | null }

type CalendarItem = {
  id: string
  prospect_id: string
  type: "note" | "call" | "email" | "visit" | "meeting" | "system"
  title: string | null
  description: string | null
  outcome: "positive" | "neutral" | "negative" | null
  happened_at: string
  due_at: string | null
  task_status: "pending" | "done" | "cancelled" | null
  prospect: { id: string; name: string; city?: string | null } | null
}

// Appuntamento sola lettura (demo su clienti@4bid.it o calendario personale)
type ReadonlyEvent = {
  id: string
  title: string
  start: string | null
  end: string | null
  allDay: boolean
  color?: string
  meetLink?: string | null
  htmlLink?: string | null
}

const TYPE_LABEL: Record<string, string> = {
  call: "Chiamata",
  email: "Email",
  visit: "Visita",
  meeting: "Riunione",
  note: "Nota",
  system: "Sistema",
}

export function DayDetailDialog({
  open,
  day,
  items,
  googleEvents = [],
  myEvents = [],
  assignableAgents = [],
  onClose,
  onChange,
  onAssigned,
}: {
  open: boolean
  day: Date
  items: CalendarItem[]
  googleEvents?: ReadonlyEvent[]
  myEvents?: ReadonlyEvent[]
  /** Venditori a cui il viewer (capo area/super admin) può assegnare un evento. */
  assignableAgents?: AssignableAgent[]
  onClose: () => void
  onChange: () => void
  onAssigned?: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [assigning, setAssigning] = useState<string | null>(null)
  const dayKey = format(day, "yyyy-MM-dd")

  // Collega un evento Google (creato a mano) a un venditore: crea la riga
  // demo_requests ponte. I dettagli evento vengono letti REALI lato server.
  const assignToAgent = async (googleEventId: string, agentId: string) => {
    setAssigning(googleEventId)
    try {
      const res = await fetch("/api/sales/calendar/assign-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ google_event_id: googleEventId, agent_id: agentId, day: dayKey }),
      })
      if (!res.ok) throw new Error(await res.text())
      onAssigned?.()
    } catch (e) {
      console.error("[v0] assegnazione venditore fallita:", e)
      alert("Assegnazione non riuscita. Riprova o contatta il supporto.")
    } finally {
      setAssigning(null)
    }
  }

  const updateStatus = async (item: CalendarItem, status: "done" | "cancelled" | "pending") => {
    setBusy(item.id)
    try {
      const res = await fetch(
        `/api/sales/prospects/${item.prospect_id}/activities/${item.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task_status: status }),
        },
      )
      if (!res.ok) throw new Error(await res.text())
      globalMutate((key) => typeof key === "string" && key.startsWith("/api/sales/tasks"))
      onChange()
    } catch (e) {
      console.error("[v0] update status failed:", e)
    } finally {
      setBusy(null)
    }
  }

  const tasks = items.filter((i) => i.task_status)
  const activities = items.filter((i) => !i.task_status)
  // Tag della provenienza: solo gli eventi Google (calendario condiviso) sono
  // assegnabili a un venditore; gli impegni personali ICS no.
  const appointments = [
    ...googleEvents.map((ev) => ({ ev, isGoogle: true })),
    ...myEvents.map((ev) => ({ ev, isGoogle: false })),
  ]
  const canAssign = assignableAgents.length > 0
  const totalCount = items.length + appointments.length

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="capitalize">
            {format(day, "EEEE d MMMM yyyy", { locale: it })}
          </DialogTitle>
          <DialogDescription>
            {totalCount} elemento/i in calendario
          </DialogDescription>
        </DialogHeader>

        {appointments.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Appuntamenti ({appointments.length})
            </h3>
            <div className="space-y-2">
              {appointments.map(({ ev, isGoogle }) => {
                const color = ev.color || "#0ea5e9"
                return (
                  <div
                    key={(isGoogle ? "g-" : "m-") + ev.id}
                    className="rounded-md border p-3"
                    style={{ borderColor: `${color}55`, backgroundColor: `${color}12` }}
                  >
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {ev.allDay
                          ? "Tutto il giorno"
                          : ev.start
                            ? `${format(parseISO(ev.start), "HH:mm")}${ev.end ? " - " + format(parseISO(ev.end), "HH:mm") : ""}`
                            : ""}
                      </span>
                    </div>
                    {/* Titolo completo, niente truncate: e' il punto del fix */}
                    <p className="font-medium text-pretty break-words">{ev.title}</p>
                    {/* Link demo: il Meet (se presente) evita di dover cercare
                        la mail; in alternativa apre l'evento su Google Calendar. */}
                    {(ev.meetLink || ev.htmlLink || (isGoogle && canAssign)) && (
                      <div className="mt-2 flex flex-wrap gap-2">
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
                            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Apri evento
                          </a>
                        )}
                        {/* Assegna l'evento Google a un venditore (capo area/
                            super admin): crea il collegamento demo_requests. */}
                        {isGoogle && canAssign && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm" className="h-auto px-2.5 py-1.5 text-xs" disabled={assigning === ev.id}>
                                {assigning === ev.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <UserPlus className="h-3.5 w-3.5" />
                                )}
                                <span className="ml-1.5">Assegna a venditore</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-y-auto">
                              {assignableAgents.map((a) => (
                                <DropdownMenuItem
                                  key={a.id}
                                  onSelect={(e) => {
                                    e.preventDefault()
                                    assignToAgent(ev.id, a.id)
                                  }}
                                >
                                  {a.display_name ?? a.email ?? "(senza nome)"}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {tasks.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Task ({tasks.length})
            </h3>
            <div className="space-y-2">
              {tasks.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "rounded-md border border-border p-3 flex items-start gap-3",
                    item.task_status === "done" && "bg-muted/30 opacity-70",
                    item.task_status === "cancelled" && "opacity-50",
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge variant="outline" className="text-xs">
                        {TYPE_LABEL[item.type]}
                      </Badge>
                      {item.due_at && (
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {format(parseISO(item.due_at), "HH:mm")}
                        </span>
                      )}
                      {item.task_status === "done" && (
                        <Badge className="bg-emerald-600 text-white text-xs">
                          Fatto
                        </Badge>
                      )}
                      {item.task_status === "cancelled" && (
                        <Badge variant="secondary" className="text-xs">
                          Annullato
                        </Badge>
                      )}
                    </div>
                    <a
                      href={`/sales/prospects/${item.prospect_id}`}
                      className="font-medium hover:text-emerald-600 truncate block"
                    >
                      {item.prospect?.name ?? "—"}
                    </a>
                    {item.title && (
                      <p className="text-sm text-muted-foreground truncate">
                        {item.title}
                      </p>
                    )}
                    {item.description && (
                      <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-3">
                        {item.description}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    {item.task_status === "pending" && (
                      <>
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700"
                          disabled={busy === item.id}
                          onClick={() => updateStatus(item, "done")}
                          title="Segna come fatto"
                        >
                          {busy === item.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy === item.id}
                          onClick={() => updateStatus(item, "cancelled")}
                          title="Annulla"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                    {item.task_status === "done" && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy === item.id}
                        onClick={() => updateStatus(item, "pending")}
                      >
                        Riapri
                      </Button>
                    )}
                    {item.task_status === "cancelled" && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy === item.id}
                        onClick={() => updateStatus(item, "pending")}
                      >
                        Riapri
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activities.length > 0 && (
          <div className="space-y-2 mt-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Attivit&agrave; ({activities.length})
            </h3>
            <div className="space-y-2">
              {activities.map((item) => (
                <div
                  key={item.id}
                  className="rounded-md border border-border p-3"
                >
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Badge variant="outline" className="text-xs">
                      {TYPE_LABEL[item.type]}
                    </Badge>
                    {item.happened_at && (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {format(parseISO(item.happened_at), "HH:mm")}
                      </span>
                    )}
                    {item.outcome && (
                      <Badge
                        className={cn(
                          "text-xs",
                          item.outcome === "positive" && "bg-emerald-600 text-white",
                          item.outcome === "negative" && "bg-red-600 text-white",
                          item.outcome === "neutral" && "bg-slate-200 text-slate-800",
                        )}
                      >
                        {item.outcome === "positive"
                          ? "Positivo"
                          : item.outcome === "negative"
                            ? "Negativo"
                            : "Neutro"}
                      </Badge>
                    )}
                  </div>
                  <a
                    href={`/sales/prospects/${item.prospect_id}`}
                    className="font-medium hover:text-emerald-600 truncate block"
                  >
                    {item.prospect?.name ?? "—"}
                  </a>
                  {item.title && (
                    <p className="text-sm text-muted-foreground truncate">{item.title}</p>
                  )}
                  {item.description && (
                    <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-3">
                      {item.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {totalCount === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Nessun elemento in calendario per questo giorno.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Chiudi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
