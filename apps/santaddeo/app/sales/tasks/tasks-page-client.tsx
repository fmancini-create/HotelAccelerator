"use client"

import useSWR from "swr"
import Link from "next/link"
import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  Phone,
  Mail,
  MapPin,
  MessageSquare,
  StickyNote,
  Clock,
  XCircle,
  RotateCcw,
  Calendar,
} from "lucide-react"

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json())

type Task = {
  id: string
  prospect_id: string
  type: "note" | "call" | "email" | "visit" | "meeting"
  title: string | null
  description: string | null
  due_at: string
  task_status: "pending" | "done" | "cancelled"
  completed_at: string | null
  prospect: { id: string; name: string; city: string | null; status: string | null } | null
}

type TasksResp = {
  tasks: Task[]
  counters: { today: number; overdue: number; week: number; upcoming: number; total_pending: number }
}

const TYPE_ICON: Record<string, any> = {
  call: Phone,
  email: Mail,
  visit: MapPin,
  meeting: MessageSquare,
  note: StickyNote,
}
const TYPE_LABEL: Record<string, string> = {
  call: "Chiamata",
  email: "Email",
  visit: "Visita",
  meeting: "Meeting",
  note: "Promemoria",
}

export function TasksPageClient() {
  const [tab, setTab] = useState<"today" | "overdue" | "week" | "all" | "done">("today")

  // Mappa la tab in query params; "done" mostra task completati
  const apiUrl = (() => {
    if (tab === "done") return "/api/sales/tasks?status=done&range=all&limit=100"
    return `/api/sales/tasks?status=pending&range=${tab}&limit=200`
  })()

  const { data, mutate, isLoading } = useSWR<TasksResp>(apiUrl, fetcher, {
    revalidateOnFocus: false,
    refreshInterval: 60_000,
  })

  // Carico anche i counters globali con una query stabile (range=all) per
  // popolare i badge sui tab.
  const { data: globalData } = useSWR<TasksResp>(
    "/api/sales/tasks?status=pending&range=all&limit=1",
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: true },
  )
  const c = globalData?.counters

  return (
    <div className="container mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <CalendarCheck className="h-6 w-6 text-emerald-700" />
            I miei task
          </h2>
          <p className="text-sm text-muted-foreground">
            Promemoria e attivita&apos; pianificate per i tuoi prospect.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {c && c.overdue > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              {c.overdue} scadut{c.overdue === 1 ? "o" : "i"}
            </Badge>
          )}
          {c && (
            <Badge variant="secondary">{c.total_pending} pendin{c.total_pending === 1 ? "g" : "g"}</Badge>
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="mb-4 w-full justify-start overflow-x-auto flex-nowrap sm:w-auto">
          <TabsTrigger value="today" className="gap-2 shrink-0">
            Oggi {c && c.today > 0 ? <Badge variant="secondary">{c.today}</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="overdue" className="gap-2 shrink-0">
            Scaduti {c && c.overdue > 0 ? <Badge variant="destructive">{c.overdue}</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="week" className="gap-2 shrink-0">
            Settimana {c && c.week > 0 ? <Badge variant="secondary">{c.week}</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="all" className="gap-2 shrink-0">
            Tutti {c && c.total_pending > 0 ? <Badge variant="secondary">{c.total_pending}</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="done" className="shrink-0">Completati</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-0">
          <TasksList
            tasks={data?.tasks || []}
            isLoading={isLoading}
            onChanged={() => mutate()}
            emptyHint={
              tab === "today"
                ? "Nessun task in giornata. Pianifica un follow-up dalla scheda di un prospect."
                : tab === "overdue"
                  ? "Nessun task scaduto. Sei in regola."
                  : tab === "done"
                    ? "Nessun task completato finora."
                    : "Nessun task in questa vista."
            }
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function TasksList({
  tasks,
  isLoading,
  onChanged,
  emptyHint,
}: {
  tasks: Task[]
  isLoading: boolean
  onChanged: () => void
  emptyHint: string
}) {
  if (isLoading) {
    return (
      <Card className="p-12 text-center text-muted-foreground">Caricamento task...</Card>
    )
  }
  if (!tasks.length) {
    return (
      <Card className="p-12 text-center">
        <Calendar className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">{emptyHint}</p>
      </Card>
    )
  }

  // Raggruppo per giorno di scadenza per dare struttura visiva
  const groups: Record<string, Task[]> = {}
  for (const t of tasks) {
    const dayKey = new Date(t.due_at).toLocaleDateString("it-IT", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    })
    if (!groups[dayKey]) groups[dayKey] = []
    groups[dayKey].push(t)
  }

  return (
    <div className="space-y-6">
      {Object.entries(groups).map(([day, dayTasks]) => (
        <div key={day}>
          <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-2 px-1">
            {day}
          </h3>
          <Card className="overflow-hidden">
            <ul className="divide-y divide-border">
              {dayTasks.map((t) => (
                <TaskRow key={t.id} task={t} onChanged={onChanged} />
              ))}
            </ul>
          </Card>
        </div>
      ))}
    </div>
  )
}

function TaskRow({ task, onChanged }: { task: Task; onChanged: () => void }) {
  const Icon = TYPE_ICON[task.type] || StickyNote
  const due = new Date(task.due_at)
  const now = Date.now()
  const isOverdue = task.task_status === "pending" && due.getTime() < now
  const isDone = task.task_status === "done"
  const isCancelled = task.task_status === "cancelled"
  const [busy, setBusy] = useState<"done" | "cancel" | "reopen" | null>(null)

  async function patch(body: any, label: "done" | "cancel" | "reopen") {
    setBusy(label)
    try {
      const res = await fetch(
        `/api/sales/prospects/${task.prospect_id}/activities/${task.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      )
      if (!res.ok) {
        const t = await res.text()
        console.error("[tasks] patch failed", t)
      }
      onChanged()
    } finally {
      setBusy(null)
    }
  }

  return (
    <li className="px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <div
          className={`shrink-0 mt-0.5 rounded-md p-1.5 ${
            isDone
              ? "bg-emerald-50 text-emerald-700"
              : isCancelled
                ? "bg-muted text-muted-foreground"
                : isOverdue
                  ? "bg-red-50 text-red-700"
                  : "bg-amber-50 text-amber-700"
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-xs uppercase text-muted-foreground font-medium">
              {TYPE_LABEL[task.type]}
            </span>
            <span
              className={
                "text-xs inline-flex items-center gap-1 " +
                (isOverdue ? "text-red-700 font-medium" : "text-muted-foreground")
              }
            >
              <Clock className="h-3 w-3" />
              {due.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
              {isOverdue && " · in ritardo"}
            </span>
            {isDone && task.completed_at && (
              <span className="text-xs text-emerald-700">
                Completato{" "}
                {new Date(task.completed_at).toLocaleDateString("it-IT", {
                  day: "2-digit",
                  month: "short",
                })}
              </span>
            )}
            {isCancelled && (
              <span className="text-xs text-muted-foreground italic">Annullato</span>
            )}
          </div>
          <div
            className={
              "text-sm font-medium mt-0.5 " +
              (isDone || isCancelled ? "line-through text-muted-foreground" : "")
            }
          >
            {task.title || "(nessun titolo)"}
          </div>
          {task.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {task.description}
            </p>
          )}
          {task.prospect && (
            <Link
              href={`/sales/prospects/${task.prospect.id}`}
              className="text-xs text-emerald-700 hover:underline inline-flex items-center gap-1 mt-1"
            >
              {task.prospect.name}
              {task.prospect.city ? ` · ${task.prospect.city}` : ""}
            </Link>
          )}
        </div>
      </div>
      <div className="flex flex-row sm:flex-col items-stretch sm:items-end gap-2 sm:gap-1 shrink-0 pl-9 sm:pl-0">
        {task.task_status === "pending" && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => patch({ task_status: "done" }, "done")}
              disabled={!!busy}
              className="gap-1 flex-1 sm:flex-none"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Fatto
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => patch({ task_status: "cancelled" }, "cancel")}
              disabled={!!busy}
              className="text-muted-foreground gap-1 flex-1 sm:flex-none"
            >
              <XCircle className="h-3.5 w-3.5" />
              Annulla
            </Button>
          </>
        )}
        {(task.task_status === "done" || task.task_status === "cancelled") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => patch({ task_status: "pending" }, "reopen")}
            disabled={!!busy}
            className="text-muted-foreground gap-1"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Riapri
          </Button>
        )}
      </div>
    </li>
  )
}
