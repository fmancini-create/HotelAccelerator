"use client"

import { useState } from "react"
import useSWR from "swr"
import { toast } from "sonner"
import {
  Phone,
  Mail,
  MapPin,
  CalendarClock,
  StickyNote,
  Cog,
  Loader2,
  Trash2,
  Pencil,
  CheckCircle2,
  MinusCircle,
  AlertCircle,
  X,
  Save,
  Plus,
  Clock,
  XCircle,
  RotateCcw,
  ListChecks,
  Presentation,
  ExternalLink,
  Users,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type DemoRequest = {
  id: string
  status: "pending" | "approved" | "rejected" | "cancelled"
  requested_start: string | null
  requested_end: string | null
  google_event_link: string | null
  decision_notes: string | null
}

type Activity = {
  id: string
  prospect_id: string
  agent_id: string | null
  type: "note" | "call" | "email" | "visit" | "meeting" | "demo" | "system"
  title: string | null
  description: string | null
  outcome: "positive" | "neutral" | "negative" | null
  happened_at: string
  due_at: string | null
  task_status: "pending" | "done" | "cancelled" | null
  completed_at: string | null
  created_at: string
  demo_request_id: string | null
  demo_request: DemoRequest | null
  agent: { id: string; display_name: string | null; email: string | null } | null
}

const TYPE_META: Record<
  Activity["type"],
  { icon: any; label: string; color: string }
> = {
  call: { icon: Phone, label: "Chiamata", color: "bg-blue-50 text-blue-700 border-blue-200" },
  email: { icon: Mail, label: "Email", color: "bg-violet-50 text-violet-700 border-violet-200" },
  visit: { icon: MapPin, label: "Visita", color: "bg-amber-50 text-amber-700 border-amber-200" },
  meeting: { icon: CalendarClock, label: "Riunione", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  demo: { icon: Presentation, label: "Demo", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  note: { icon: StickyNote, label: "Nota", color: "bg-slate-50 text-slate-700 border-slate-200" },
  system: { icon: Cog, label: "Sistema", color: "bg-gray-50 text-gray-600 border-gray-200" },
}

const DEMO_STATUS_META: Record<
  DemoRequest["status"],
  { label: string; className: string }
> = {
  pending: { label: "In attesa di conferma", className: "bg-amber-50 text-amber-700 border-amber-200" },
  approved: { label: "Demo confermata", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rejected: { label: "Demo rifiutata", className: "bg-red-50 text-red-700 border-red-200" },
  cancelled: { label: "Annullata", className: "bg-slate-50 text-slate-600 border-slate-200" },
}

const OUTCOME_META: Record<
  NonNullable<Activity["outcome"]>,
  { icon: any; label: string; className: string }
> = {
  positive: { icon: CheckCircle2, label: "Positivo", className: "text-emerald-600" },
  neutral: { icon: MinusCircle, label: "Neutro", className: "text-slate-500" },
  negative: { icon: AlertCircle, label: "Negativo", className: "text-red-600" },
}

function fmtDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function ActivityTimeline({ prospectId }: { prospectId: string }) {
  const { data, isLoading, mutate } = useSWR<{ activities: Activity[] }>(
    `/api/sales/prospects/${prospectId}/activities`,
    fetcher,
  )

  // Modalita' del form: 'log' = registra attivita' svolta, 'task' = pianifica
  // un promemoria per il futuro. Il default e' 'log'.
  const [formMode, setFormMode] = useState<"log" | "task" | "demo" | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const all = data?.activities || []

  // Split per visualizzazione: task pending in cima (ordinati per due_at ASC),
  // poi storico ordinato come arriva dal server (happened_at DESC).
  const pendingTasks = all
    .filter((a) => a.task_status === "pending")
    .sort((x, y) => new Date(x.due_at!).getTime() - new Date(y.due_at!).getTime())
  const history = all
    .filter((a) => a.task_status !== "pending")

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 gap-2 flex-wrap">
        <CardTitle className="text-base">Attivita&apos; e promemoria</CardTitle>
        {!formMode && !editingId && (
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => setFormMode("demo")}>
              <Presentation className="h-4 w-4 mr-1" />
              Programma demo
            </Button>
            <Button size="sm" variant="outline" onClick={() => setFormMode("task")}>
              <Clock className="h-4 w-4 mr-1" />
              Pianifica task
            </Button>
            <Button size="sm" onClick={() => setFormMode("log")}>
              <Plus className="h-4 w-4 mr-1" />
              Registra attivita&apos;
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {formMode && (
          <ActivityForm
            prospectId={prospectId}
            mode={formMode}
            onCancel={() => setFormMode(null)}
            onSaved={() => {
              setFormMode(null)
              mutate()
            }}
          />
        )}

        {isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
            Caricamento attivita&apos;...
          </div>
        ) : all.length === 0 ? (
          !formMode && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Nessuna attivita&apos; registrata. Inizia con una chiamata, una nota o pianifica un
              promemoria.
            </div>
          )
        ) : (
          <div className="space-y-5">
            {/* Sezione TASK PENDING (in cima, sempre visibile se ce ne sono) */}
            {pendingTasks.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2 text-xs uppercase text-muted-foreground font-medium">
                  <ListChecks className="h-3.5 w-3.5" />
                  Task da fare ({pendingTasks.length})
                </div>
                <ul className="relative space-y-3">
                  {pendingTasks.map((a) => (
                    <ActivityRow
                      key={a.id}
                      activity={a}
                      isEditing={editingId === a.id}
                      onStartEdit={() => setEditingId(a.id)}
                      onCancelEdit={() => setEditingId(null)}
                      onSaved={() => {
                        setEditingId(null)
                        mutate()
                      }}
                      onDeleted={() => mutate()}
                      prospectId={prospectId}
                    />
                  ))}
                </ul>
              </div>
            )}

            {/* Sezione STORICO (attivita' svolte + task completati/cancellati) */}
            {history.length > 0 && (
              <div>
                {pendingTasks.length > 0 && (
                  <div className="flex items-center gap-2 mb-2 text-xs uppercase text-muted-foreground font-medium">
                    Storico
                  </div>
                )}
                <ul className="relative space-y-4">
                  {history.map((a) => (
                    <ActivityRow
                      key={a.id}
                      activity={a}
                      isEditing={editingId === a.id}
                      onStartEdit={() => setEditingId(a.id)}
                      onCancelEdit={() => setEditingId(null)}
                      onSaved={() => {
                        setEditingId(null)
                        mutate()
                      }}
                      onDeleted={() => mutate()}
                      prospectId={prospectId}
                    />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ActivityRow({
  activity: a,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSaved,
  onDeleted,
  prospectId,
}: {
  activity: Activity
  isEditing: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaved: () => void
  onDeleted: () => void
  prospectId: string
}) {
  const meta = TYPE_META[a.type]
  const Icon = meta.icon
  const outcome = a.outcome ? OUTCOME_META[a.outcome] : null
  const OIcon = outcome?.icon

  const isPending = a.task_status === "pending"
  const isDone = a.task_status === "done"
  const isCancelled = a.task_status === "cancelled"
  const dueDate = a.due_at ? new Date(a.due_at) : null
  const isOverdue = isPending && dueDate && dueDate.getTime() < Date.now()

  const [deleting, setDeleting] = useState(false)
  const [busy, setBusy] = useState<"done" | "cancel" | "reopen" | null>(null)

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch(
        `/api/sales/prospects/${prospectId}/activities/${a.id}`,
        { method: "DELETE" },
      )
      if (!res.ok) {
        const j = await res.json()
        throw new Error(j.error || "Errore eliminazione")
      }
      toast.success("Eliminato")
      onDeleted()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setDeleting(false)
    }
  }

  async function patchTask(body: any, label: "done" | "cancel" | "reopen") {
    setBusy(label)
    try {
      const res = await fetch(
        `/api/sales/prospects/${prospectId}/activities/${a.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      )
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || "Errore")
      if (label === "done") toast.success("Task completato")
      else if (label === "cancel") toast.success("Task annullato")
      else toast.success("Task riaperto")
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }

  if (isEditing) {
    return (
      <li>
        <ActivityForm
          prospectId={prospectId}
          activity={a}
          mode={a.type === "demo" ? "demo" : isPending ? "task" : "log"}
          onCancel={onCancelEdit}
          onSaved={onSaved}
        />
      </li>
    )
  }

  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <div
          className={`flex items-center justify-center h-9 w-9 rounded-full border ${
            isPending
              ? isOverdue
                ? "bg-red-50 text-red-700 border-red-200"
                : "bg-amber-50 text-amber-700 border-amber-200"
              : meta.color
          }`}
          aria-hidden
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 w-px bg-border mt-1" aria-hidden />
      </div>

      <div className="flex-1 min-w-0 pb-4">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span
            className={
              "text-sm font-medium " +
              (isCancelled ? "line-through text-muted-foreground" : "")
            }
          >
            {a.title || meta.label}
          </span>

          {/* Date label: per i task uso due_at, per le storiche happened_at */}
          {isPending && dueDate ? (
            <span
              className={
                "text-xs inline-flex items-center gap-1 " +
                (isOverdue ? "text-red-700 font-medium" : "text-amber-700")
              }
            >
              <Clock className="h-3 w-3" />
              {isOverdue ? "Scaduto " : "In scadenza "}
              {fmtDateTime(a.due_at!)}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {fmtDateTime(a.happened_at)}
            </span>
          )}

          {isDone && a.completed_at && (
            <Badge variant="secondary" className="gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
              Completato {fmtDateTime(a.completed_at)}
            </Badge>
          )}
          {isCancelled && (
            <Badge variant="outline" className="gap-1 text-muted-foreground">
              <XCircle className="h-3 w-3" />
              Annullato
            </Badge>
          )}

          {outcome && OIcon && (
            <span
              className={`inline-flex items-center gap-1 text-xs ${outcome.className}`}
            >
              <OIcon className="h-3.5 w-3.5" />
              {outcome.label}
            </span>
          )}
          {a.agent?.display_name && (
            <span className="text-xs text-muted-foreground">
              · {a.agent.display_name}
            </span>
          )}
        </div>
        {a.description && (
          <p className="text-sm whitespace-pre-wrap leading-relaxed text-muted-foreground">
            {a.description}
          </p>
        )}

        {/* Stato richiesta demo sul calendario condiviso clienti@4bid.it */}
        {a.type === "demo" && a.demo_request && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md border ${DEMO_STATUS_META[a.demo_request.status].className}`}
            >
              <Users className="h-3 w-3" />
              {DEMO_STATUS_META[a.demo_request.status].label}
              <span className="opacity-70">· admin Santaddeo</span>
            </span>
            {a.demo_request.status === "approved" && a.demo_request.google_event_link && (
              <a
                href={a.demo_request.google_event_link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                Apri su Google Calendar
              </a>
            )}
            {a.demo_request.status === "rejected" && a.demo_request.decision_notes && (
              <span className="text-xs text-red-600">
                Motivo: {a.demo_request.decision_notes}
              </span>
            )}
          </div>
        )}

        {a.type !== "system" && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {isPending && (
              <>
                <Button
                  variant="default"
                  size="sm"
                  className="h-7 px-2 text-xs gap-1"
                  onClick={() => patchTask({ task_status: "done" }, "done")}
                  disabled={!!busy}
                >
                  <CheckCircle2 className="h-3 w-3" /> Completa
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground gap-1"
                  onClick={() => patchTask({ task_status: "cancelled" }, "cancel")}
                  disabled={!!busy}
                >
                  <XCircle className="h-3 w-3" /> Annulla
                </Button>
              </>
            )}
            {(isDone || isCancelled) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground gap-1"
                onClick={() => patchTask({ task_status: "pending" }, "reopen")}
                disabled={!!busy}
              >
                <RotateCcw className="h-3 w-3" /> Riapri
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={onStartEdit}
            >
              <Pencil className="h-3 w-3 mr-1" /> Modifica
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-red-600 hover:text-red-700"
                >
                  <Trash2 className="h-3 w-3 mr-1" /> Elimina
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Eliminare?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Questa operazione non puo&apos; essere annullata.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleting}>Annulla</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    disabled={deleting}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    {deleting && (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    )}
                    Elimina
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>
    </li>
  )
}

function ActivityForm({
  prospectId,
  activity,
  mode,
  onCancel,
  onSaved,
}: {
  prospectId: string
  activity?: Activity
  mode: "log" | "task" | "demo"
  onCancel: () => void
  onSaved: () => void
}) {
  const isEdit = !!activity
  const isTask = mode === "task"
  const isDemo = mode === "demo"
  const [type, setType] = useState<Activity["type"]>(
    activity?.type || (isDemo ? "demo" : "call"),
  )
  const [title, setTitle] = useState(activity?.title || "")
  const [description, setDescription] = useState(activity?.description || "")
  const [outcome, setOutcome] = useState<string>(activity?.outcome || "none")

  // datetime-local format
  const pad = (n: number) => String(n).padStart(2, "0")
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  const fmtDay = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const fmtTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

  const [happenedAt, setHappenedAt] = useState(() => {
    const d = activity?.happened_at ? new Date(activity.happened_at) : new Date()
    return fmt(d)
  })

  // Default due_at: domani alle 9:00, oppure il valore esistente per edit.
  const [dueAt, setDueAt] = useState(() => {
    if (activity?.due_at) return fmt(new Date(activity.due_at))
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(9, 0, 0, 0)
    return fmt(d)
  })

  // --- Stato specifico DEMO: giorno + orario inizio/fine + coinvolgi admin
  const demoBaseStart = activity?.demo_request?.requested_start
    ? new Date(activity.demo_request.requested_start)
    : activity?.due_at
      ? new Date(activity.due_at)
      : (() => {
          const d = new Date()
          d.setDate(d.getDate() + 1)
          d.setHours(10, 0, 0, 0)
          return d
        })()
  const demoBaseEnd = activity?.demo_request?.requested_end
    ? new Date(activity.demo_request.requested_end)
    : new Date(demoBaseStart.getTime() + 30 * 60 * 1000)
  const [demoDay, setDemoDay] = useState(() => fmtDay(demoBaseStart))
  const [demoStart, setDemoStart] = useState(() => fmtTime(demoBaseStart))
  const [demoEnd, setDemoEnd] = useState(() => fmtTime(demoBaseEnd))
  // Di default coinvolgiamo l'admin: e' il senso della "demo" sul calendario
  // condiviso. In edit lo deriviamo dalla presenza di una richiesta collegata.
  const [involveAdmin, setInvolveAdmin] = useState(
    isEdit ? !!activity?.demo_request_id : true,
  )

  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!description.trim() && type === "note" && !isTask && !isDemo) {
      toast.error("Aggiungi una descrizione per la nota")
      return
    }
    setSaving(true)
    try {
      const payload: any = {
        type,
        title: title.trim() || null,
        description: description.trim() || null,
      }
      if (isDemo) {
        const start = new Date(`${demoDay}T${demoStart}:00`)
        const end = new Date(`${demoDay}T${demoEnd}:00`)
        if (isNaN(start.getTime())) {
          toast.error("Seleziona giorno e ora di inizio della demo")
          setSaving(false)
          return
        }
        if (isNaN(end.getTime()) || end <= start) {
          toast.error("L'orario di fine deve essere successivo all'inizio")
          setSaving(false)
          return
        }
        payload.requested_start = start.toISOString()
        payload.requested_end = end.toISOString()
        payload.involve_admin = involveAdmin
      } else if (isTask) {
        payload.due_at = new Date(dueAt).toISOString()
      } else {
        payload.outcome = outcome === "none" ? null : outcome
        payload.happened_at = new Date(happenedAt).toISOString()
      }

      const url = isEdit
        ? `/api/sales/prospects/${prospectId}/activities/${activity!.id}`
        : `/api/sales/prospects/${prospectId}/activities`
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Errore salvataggio")
      toast.success(
        isEdit
          ? "Aggiornato"
          : isDemo
            ? involveAdmin
              ? "Demo programmata, richiesta inviata all'admin"
              : "Demo programmata"
            : isTask
              ? "Task pianificato"
              : "Attivita' registrata",
      )
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={
        "rounded-lg border p-4 space-y-3 " +
        (isDemo
          ? "bg-emerald-50/50 border-emerald-200"
          : isTask
            ? "bg-amber-50/50 border-amber-200"
            : "bg-muted/30")
      }
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs uppercase font-medium text-muted-foreground flex items-center gap-1.5">
          {isDemo && <Presentation className="h-3.5 w-3.5 text-emerald-600" />}
          {isDemo
            ? isEdit
              ? "Modifica demo"
              : "Programma una demo"
            : isTask
              ? isEdit
                ? "Modifica task"
                : "Pianifica un task"
              : isEdit
                ? "Modifica attivita'"
                : "Registra attivita' svolta"}
        </div>
      </div>

      {!isDemo && (
        <Tabs value={type} onValueChange={(v) => setType(v as Activity["type"])}>
          <TabsList className="grid grid-cols-5 h-auto">
            <TabsTrigger value="call" className="text-xs gap-1">
              <Phone className="h-3.5 w-3.5" /> Chiamata
            </TabsTrigger>
            <TabsTrigger value="email" className="text-xs gap-1">
              <Mail className="h-3.5 w-3.5" /> Email
            </TabsTrigger>
            <TabsTrigger value="visit" className="text-xs gap-1">
              <MapPin className="h-3.5 w-3.5" /> Visita
            </TabsTrigger>
            <TabsTrigger value="meeting" className="text-xs gap-1">
              <CalendarClock className="h-3.5 w-3.5" /> Riunione
            </TabsTrigger>
            <TabsTrigger value="note" className="text-xs gap-1">
              <StickyNote className="h-3.5 w-3.5" /> Nota
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {isDemo && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="demo_day" className="text-xs">
                Giorno
              </Label>
              <Input
                id="demo_day"
                type="date"
                value={demoDay}
                onChange={(e) => setDemoDay(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="demo_start" className="text-xs">
                Inizio
              </Label>
              <Input
                id="demo_start"
                type="time"
                value={demoStart}
                onChange={(e) => setDemoStart(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="demo_end" className="text-xs">
                Fine
              </Label>
              <Input
                id="demo_end"
                type="time"
                value={demoEnd}
                onChange={(e) => setDemoEnd(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Toggle: coinvolgere l'admin Santaddeo via calendario condiviso */}
          <button
            type="button"
            onClick={() => setInvolveAdmin((v) => !v)}
            aria-pressed={involveAdmin}
            className={
              "w-full flex items-start gap-3 rounded-lg border p-3 text-left transition-colors " +
              (involveAdmin
                ? "bg-emerald-100/60 border-emerald-300"
                : "bg-background border-border hover:bg-muted/50")
            }
          >
            <span
              className={
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border " +
                (involveAdmin
                  ? "bg-emerald-600 border-emerald-600 text-white"
                  : "bg-background border-input")
              }
              aria-hidden
            >
              {involveAdmin && <CheckCircle2 className="h-4 w-4" />}
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Users className="h-4 w-4 text-emerald-600" />
                Coinvolgi l&apos;admin Santaddeo
              </span>
              <span className="block text-xs text-muted-foreground mt-0.5">
                Invia la richiesta sul calendario condiviso clienti@4bid.it. L&apos;admin
                conferma e l&apos;evento viene aggiunto a Google Calendar. Se la disattivi,
                la demo resta solo un tuo promemoria.
              </span>
            </span>
          </button>
        </>
      )}

      <div className={"grid grid-cols-1 sm:grid-cols-2 gap-3" + (isDemo ? " hidden" : "")}>
        {isTask ? (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="due_at" className="text-xs">
              Scadenza
            </Label>
            <Input
              id="due_at"
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              required
            />
            <QuickDueChips onPick={(d) => setDueAt(fmt(d))} />
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="happened_at" className="text-xs">
                Data e ora
              </Label>
              <Input
                id="happened_at"
                type="datetime-local"
                value={happenedAt}
                onChange={(e) => setHappenedAt(e.target.value)}
                required
              />
            </div>
            {type !== "note" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Esito</Label>
                <Select value={outcome} onValueChange={setOutcome}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nessuno</SelectItem>
                    <SelectItem value="positive">Positivo</SelectItem>
                    <SelectItem value="neutral">Neutro</SelectItem>
                    <SelectItem value="negative">Negativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="act_title" className="text-xs">
          {isDemo ? "Titolo demo (opzionale)" : `Oggetto ${isTask ? "" : "(opzionale)"}`}
        </Label>
        <Input
          id="act_title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={
            isDemo
              ? 'es. "Demo Santaddeo" (default dal nome del prospect)'
              : isTask
                ? type === "call"
                  ? "Es. Richiamare per follow-up offerta"
                  : type === "email"
                    ? "Es. Inviare brochure aggiornata"
                    : "Cosa devi fare"
                : type === "call"
                  ? "Es. Primo contatto"
                  : type === "email"
                    ? "Es. Invio brochure"
                    : "Riassunto in una riga"
          }
          maxLength={200}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="act_desc" className="text-xs">
          {isTask || isDemo ? "Note (opzionale)" : "Descrizione"}
        </Label>
        <Textarea
          id="act_desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={
            isDemo
              ? "Contesto per chi conferma: link, riferimenti, esigenze del cliente..."
              : isTask
                ? "Dettagli su cosa fare, contesto, contatti rilevanti..."
                : "Cosa e' stato detto, prossimi passi, dettagli..."
          }
          rows={isTask || isDemo ? 3 : 4}
          maxLength={5000}
        />
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          <X className="h-4 w-4 mr-1" /> Annulla
        </Button>
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-1" />
          )}
          {isEdit
            ? "Salva modifiche"
            : isDemo
              ? involveAdmin
                ? "Programma e invia richiesta"
                : "Programma demo"
              : isTask
                ? "Pianifica"
                : "Registra"}
        </Button>
      </div>
    </form>
  )
}

function QuickDueChips({ onPick }: { onPick: (d: Date) => void }) {
  const chips = [
    {
      label: "Tra 1 ora",
      build: () => {
        const d = new Date()
        d.setHours(d.getHours() + 1)
        d.setMinutes(0, 0, 0)
        return d
      },
    },
    {
      label: "Stasera 18:00",
      build: () => {
        const d = new Date()
        d.setHours(18, 0, 0, 0)
        return d
      },
    },
    {
      label: "Domani 9:00",
      build: () => {
        const d = new Date()
        d.setDate(d.getDate() + 1)
        d.setHours(9, 0, 0, 0)
        return d
      },
    },
    {
      label: "Tra 3 giorni",
      build: () => {
        const d = new Date()
        d.setDate(d.getDate() + 3)
        d.setHours(9, 0, 0, 0)
        return d
      },
    },
    {
      label: "Prossima settimana",
      build: () => {
        const d = new Date()
        d.setDate(d.getDate() + 7)
        d.setHours(9, 0, 0, 0)
        return d
      },
    },
  ]
  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {chips.map((c) => (
        <button
          key={c.label}
          type="button"
          onClick={() => onPick(c.build())}
          className="text-xs px-2 py-1 rounded-md border border-border bg-background hover:bg-muted"
        >
          {c.label}
        </button>
      ))}
    </div>
  )
}
