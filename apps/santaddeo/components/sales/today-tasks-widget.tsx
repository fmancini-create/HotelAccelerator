"use client"

import useSWR from "swr"
import Link from "next/link"
import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Phone,
  Mail,
  MapPin,
  MessageSquare,
  StickyNote,
  ArrowRight,
  Clock,
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
  prospect: { id: string; name: string; city: string | null; status: string | null } | null
}

type TasksResponse = {
  tasks: Task[]
  counters: {
    today: number
    overdue: number
    week: number
    upcoming: number
    total_pending: number
  }
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

/**
 * Widget per la dashboard /sales: mostra task scaduti + task in giornata,
 * permette di completarli inline. Lo scopo e' rispondere alla domanda "che
 * cosa devo fare adesso?" senza dover navigare nei singoli prospect.
 */
export function TodayTasksWidget() {
  // Carico tutti i task pending entro fine settimana (oggi + scaduti +
  // prossimi 7gg), poi raggruppo client-side.
  const { data, mutate, isLoading } = useSWR<TasksResponse>(
    "/api/sales/tasks?range=week&status=pending&limit=50",
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 60_000 },
  )

  // Carico anche gli scaduti separatamente (oltre la settimana indietro).
  const { data: overdueData, mutate: mutateOverdue } = useSWR<TasksResponse>(
    "/api/sales/tasks?range=overdue&status=pending&limit=50",
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 60_000 },
  )

  const allTasks = [...(overdueData?.tasks ?? []), ...(data?.tasks ?? [])]
  // Dedup per id (gli overdue possono sovrapporsi se anche dentro la week
  // window — overdue.range non lo include ma per sicurezza dedup).
  const seen = new Set<string>()
  const tasks = allTasks.filter((t) => {
    if (seen.has(t.id)) return false
    seen.add(t.id)
    return true
  })

  const counters = data?.counters
  const now = Date.now()

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="text-sm text-muted-foreground">Caricamento promemoria...</div>
      </Card>
    )
  }

  if (!tasks.length) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold flex items-center gap-2">
            <Calendar className="h-4 w-4 text-emerald-700" />
            Cosa fare oggi
          </h3>
          {(counters?.upcoming ?? 0) > 0 && (
            <Link
              href="/sales/tasks?range=all"
              className="text-xs text-emerald-700 hover:underline inline-flex items-center gap-1"
            >
              {counters?.upcoming} programmati <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Nessun promemoria in scadenza. Aggiungi un task da una scheda prospect per pianificare
          il prossimo contatto.
        </p>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-emerald-700" />
          <h3 className="font-semibold">Cosa fare oggi</h3>
          {counters && counters.overdue > 0 && (
            <Badge variant="destructive" className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {counters.overdue} scadut{counters.overdue === 1 ? "o" : "i"}
            </Badge>
          )}
        </div>
        <Link
          href="/sales/tasks"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          Tutti i task <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <ul className="divide-y divide-border">
        {tasks.slice(0, 8).map((t) => {
          const Icon = TYPE_ICON[t.type] || StickyNote
          const due = new Date(t.due_at).getTime()
          const isOverdue = due < now
          return (
            <li key={t.id} className="px-6 py-3 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div
                  className={`shrink-0 mt-0.5 rounded-md p-1.5 ${
                    isOverdue ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-xs uppercase text-muted-foreground font-medium">
                      {TYPE_LABEL[t.type]}
                    </span>
                    <DueLabel due={t.due_at} />
                  </div>
                  <div className="text-sm font-medium truncate mt-0.5">
                    {t.title || "(nessun titolo)"}
                  </div>
                  {t.prospect ? (
                    <Link
                      href={`/sales/prospects/${t.prospect.id}`}
                      className="text-xs text-muted-foreground hover:text-emerald-700 inline-flex items-center gap-1 mt-0.5"
                    >
                      {t.prospect.name}
                      {t.prospect.city ? ` · ${t.prospect.city}` : ""}
                    </Link>
                  ) : null}
                </div>
              </div>
              <CompleteButton
                task={t}
                onDone={() => {
                  mutate()
                  mutateOverdue()
                }}
              />
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function DueLabel({ due }: { due: string }) {
  const d = new Date(due)
  const now = new Date()
  const diff = d.getTime() - now.getTime()
  const oneDay = 24 * 60 * 60 * 1000
  const isToday = d.toDateString() === now.toDateString()
  const isOverdue = diff < 0

  if (isOverdue) {
    return (
      <span className="text-xs text-red-700 inline-flex items-center gap-1">
        <Clock className="h-3 w-3" />
        Scaduto {fmtRelative(d)}
      </span>
    )
  }
  if (isToday) {
    return (
      <span className="text-xs text-amber-700 inline-flex items-center gap-1">
        <Clock className="h-3 w-3" />
        Oggi alle {d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
      </span>
    )
  }
  if (diff < oneDay * 2) {
    return (
      <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
        <Clock className="h-3 w-3" />
        Domani alle {d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
      </span>
    )
  }
  return (
    <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
      <Clock className="h-3 w-3" />
      {d.toLocaleDateString("it-IT", { day: "2-digit", month: "short" })} alle{" "}
      {d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
    </span>
  )
}

function fmtRelative(d: Date) {
  const diffMs = Date.now() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay >= 1) return `da ${diffDay}g`
  if (diffHr >= 1) return `da ${diffHr}h`
  if (diffMin >= 1) return `da ${diffMin}m`
  return "ora"
}

function CompleteButton({ task, onDone }: { task: Task; onDone: () => void }) {
  const [pending, setPending] = useState(false)
  async function markDone() {
    setPending(true)
    try {
      const res = await fetch(
        `/api/sales/prospects/${task.prospect_id}/activities/${task.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task_status: "done" }),
        },
      )
      if (!res.ok) {
        console.error("[today-tasks] complete failed", await res.text())
      }
      onDone()
    } finally {
      setPending(false)
    }
  }
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={markDone}
      disabled={pending}
      className="shrink-0 gap-1"
    >
      <CheckCircle2 className="h-3.5 w-3.5" />
      Fatto
    </Button>
  )
}
