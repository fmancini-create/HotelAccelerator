"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Gauge,
  Mail,
  MessageSquareText,
  Phone,
  PhoneCall,
  Settings2,
  Target,
  TriangleAlert,
} from "lucide-react"

import { DashboardCard } from "@/components/admin/dashboard/dashboard-cards"
import { PlatformOverviewPanel } from "@/components/platform/platform-overview-panel"
import { Progress } from "@/components/ui/progress"
import { DASHBOARD_PANELS, PANEL_KIND_LABEL, PANEL_ORDER, type PanelKind } from "@/lib/platform/dashboard"

type BaseDashboard = {
  isAdmin: boolean
  isPlatformAdmin?: boolean
  profilo: string
  panels: string[]
  dati: Record<string, any>
}

type HomeDashboard = {
  hiddenPanels: string[]
  goals: {
    responsesTarget: number | null
    conversationsTarget: number | null
    medianResponseSecondsTarget: number | null
  }
  performance: {
    enabled: boolean | null
    days: number
    responses: number | null
    conversations: number | null
    medianResponseSeconds: number | null
    measuredResponses: number
  }
  todos: null | Array<{
    id: string
    title: string
    status: string
    priority: string
    due_date: string | null
    external_source: string | null
  }>
  messages: null | Array<{
    id: string
    subject: string | null
    channel: string
    unreadCount: number
    lastMessageAt: string
    contactName: string
    preview: string
  }>
  calls: null | {
    latest: CallRow[]
    callbacks: CallRow[]
  }
}

type CallRow = {
  id: string
  direction: string | null
  status: string
  number: string | null
  startedAt: string | null
  durationSeconds: number | null
  contactName: string | null
  handledBy: string | null
  needsCallback: boolean
}

const SPECIAL = new Set(["my-performance", "backlog", "my-todos", "calls"])

function relativeTime(value: string | null | undefined) {
  if (!value) return "—"
  const delta = Date.now() - new Date(value).getTime()
  const minutes = Math.max(0, Math.round(delta / 60_000))
  if (minutes < 1) return "adesso"
  if (minutes < 60) return `${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h`
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short" }).format(new Date(value))
}

function duration(seconds: number | null) {
  if (seconds === null) return "—"
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`
}

function responseTime(seconds: number | null) {
  if (seconds === null) return "Non misurabile"
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`
  return `${(seconds / 3600).toFixed(1)} h`
}

function progressAtLeast(value: number | null, target: number | null) {
  if (value === null || target === null || target <= 0) return null
  return Math.min(100, Math.round((value / target) * 100))
}

function progressAtMost(value: number | null, target: number | null) {
  if (value === null || target === null || target <= 0) return null
  if (value <= target) return 100
  return Math.max(0, Math.min(100, Math.round((target / value) * 100)))
}

function MetricCard({
  label,
  value,
  target,
  progress,
  note,
}: {
  label: string
  value: string
  target: string | null
  progress: number | null
  note?: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-3">
        <span className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">{value}</span>
        {progress !== null && (
          <span className={`text-xs font-semibold ${progress >= 100 ? "text-ha-success" : "text-muted-foreground"}`}>
            {progress}%
          </span>
        )}
      </div>
      {progress !== null && <Progress value={progress} className="mt-3 h-1.5" />}
      <p className="mt-2 text-[11px] text-muted-foreground">{target ?? note ?? "Obiettivo non configurato"}</p>
    </div>
  )
}

function PerformanceStrip({ home }: { home: HomeDashboard }) {
  const p = home.performance
  const g = home.goals

  if (p.enabled === false) {
    return (
      <section className="mb-6 rounded-2xl border border-ha-warning/25 bg-ha-warning-soft p-5">
        <div className="flex items-start gap-3">
          <Gauge className="mt-0.5 h-5 w-5 text-ha-warning-soft-foreground" />
          <div>
            <h2 className="font-semibold text-foreground">Le tue performance</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              I KPI personali non sono attivi per questo utente. Nessun dato storico viene ricostruito artificialmente: la misurazione parte solo dall'attivazione del tenant.
            </p>
          </div>
        </div>
      </section>
    )
  }

  if (p.enabled === null) {
    return (
      <section className="mb-6 rounded-2xl border border-destructive/25 bg-destructive/5 p-5 text-sm text-destructive">
        <div className="flex items-center gap-2"><TriangleAlert className="h-4 w-4" /> Performance temporaneamente non misurabili.</div>
      </section>
    )
  }

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-ha-brand-soft via-card to-card shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border/70 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-ha-brand" />
            <h2 className="text-base font-semibold">Le tue performance</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Finestra ultimi {p.days} giorni · solo dati misurati dopo l'attivazione KPI.</p>
        </div>
        <span className="w-fit rounded-full bg-ha-success-soft px-3 py-1 text-xs font-medium text-ha-success-soft-foreground">KPI attivi</span>
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-3">
        <MetricCard
          label="Risposte inviate"
          value={(p.responses ?? 0).toLocaleString("it-IT")}
          target={g.responsesTarget ? `Obiettivo: ${g.responsesTarget.toLocaleString("it-IT")}` : null}
          progress={progressAtLeast(p.responses, g.responsesTarget)}
        />
        <MetricCard
          label="Conversazioni gestite"
          value={(p.conversations ?? 0).toLocaleString("it-IT")}
          target={g.conversationsTarget ? `Obiettivo: ${g.conversationsTarget.toLocaleString("it-IT")}` : null}
          progress={progressAtLeast(p.conversations, g.conversationsTarget)}
        />
        <MetricCard
          label="Tempo mediano di risposta"
          value={responseTime(p.medianResponseSeconds)}
          target={g.medianResponseSecondsTarget ? `Obiettivo: entro ${responseTime(g.medianResponseSecondsTarget)}` : null}
          progress={progressAtMost(p.medianResponseSeconds, g.medianResponseSecondsTarget)}
          note={p.measuredResponses > 0 ? `Calcolato su ${p.measuredResponses} risposte misurabili` : "Non ci sono ancora risposte misurabili"}
        />
      </div>
    </section>
  )
}

function MessagesCard({ messages }: { messages: HomeDashboard["messages"] }) {
  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2"><MessageSquareText className="h-4 w-4 text-ha-brand" /><h3 className="text-sm font-semibold">Messaggi recenti</h3></div>
        <Link href="/admin/inbox" className="text-xs font-medium text-ha-brand hover:underline">Apri inbox</Link>
      </div>
      <div className="divide-y">
        {messages === null ? (
          <div className="p-4 text-sm text-destructive">Messaggi non misurabili in questo momento.</div>
        ) : messages.length === 0 ? (
          <div className="p-5 text-sm text-muted-foreground">Nessuna conversazione aperta.</div>
        ) : messages.slice(0, 4).map((message) => (
          <Link key={message.id} href={`/admin/inbox?conversation=${message.id}`} className="block px-4 py-3 hover:bg-muted/40">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${message.unreadCount > 0 ? "bg-ha-brand" : "bg-border"}`} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{message.contactName}</span>
              <span className="text-[11px] text-muted-foreground">{relativeTime(message.lastMessageAt)}</span>
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">{message.subject || message.preview || "Conversazione"}</p>
            {message.preview && message.subject && <p className="mt-0.5 truncate text-[11px] text-muted-foreground/80">{message.preview}</p>}
          </Link>
        ))}
      </div>
    </section>
  )
}

function TasksCard({ todos }: { todos: HomeDashboard["todos"] }) {
  const priorityClass = (priority: string) =>
    priority === "urgent" || priority === "high"
      ? "bg-destructive/10 text-destructive"
      : priority === "normal"
        ? "bg-ha-warning-soft text-ha-warning-soft-foreground"
        : "bg-ha-success-soft text-ha-success-soft-foreground"

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-ha-brand" /><h3 className="text-sm font-semibold">Attività da fare</h3></div>
        <Link href="/admin/todos" className="text-xs font-medium text-ha-brand hover:underline">Vedi tutte</Link>
      </div>
      <div className="divide-y">
        {todos === null ? (
          <div className="p-4 text-sm text-destructive">Attività non leggibili in questo momento.</div>
        ) : todos.length === 0 ? (
          <div className="p-5 text-sm text-muted-foreground">Nessuna attività assegnata aperta.</div>
        ) : todos.slice(0, 5).map((todo) => (
          <Link key={todo.id} href="/admin/todos" className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
            <span className="h-4 w-4 shrink-0 rounded border border-border bg-background" />
            <span className="min-w-0 flex-1 truncate text-sm">{todo.title}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${priorityClass(todo.priority)}`}>{todo.priority}</span>
            <span className="hidden text-[11px] text-muted-foreground sm:block">{todo.due_date ? relativeTime(todo.due_date) : ""}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

function CallIdentity({ call }: { call: CallRow }) {
  return <span className="truncate">{call.contactName || call.number || "Numero sconosciuto"}</span>
}

function CallsCard({ calls }: { calls: HomeDashboard["calls"] }) {
  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-ha-brand" /><h3 className="text-sm font-semibold">Telefonate</h3></div>
        <Link href="/admin/calls" className="text-xs font-medium text-ha-brand hover:underline">Registro chiamate</Link>
      </div>
      {calls === null ? (
        <div className="p-4 text-sm text-destructive">Registro telefonico non leggibile in questo momento.</div>
      ) : (
        <div>
          {calls.callbacks.length > 0 && (
            <div className="border-b bg-destructive/[0.035] px-4 py-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-destructive">Da richiamare · {calls.callbacks.length}</p>
              <div className="space-y-2">
                {calls.callbacks.slice(0, 2).map((call) => (
                  <div key={call.id} className="flex items-center gap-2 text-sm">
                    <PhoneCall className="h-3.5 w-3.5 shrink-0 text-destructive" />
                    <CallIdentity call={call} />
                    <span className="ml-auto text-[11px] text-muted-foreground">{relativeTime(call.startedAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="divide-y">
            {calls.latest.length === 0 ? (
              <div className="p-5 text-sm text-muted-foreground">Nessuna telefonata registrata.</div>
            ) : calls.latest.slice(0, 4).map((call) => (
              <div key={call.id} className="flex items-center gap-3 px-4 py-3">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${call.status === "missed" ? "bg-destructive/10 text-destructive" : "bg-ha-success-soft text-ha-success-soft-foreground"}`}>
                  <Phone className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium"><CallIdentity call={call} />{call.needsCallback && <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[9px] text-destructive">richiama</span>}</div>
                  <p className="text-[11px] text-muted-foreground">{call.direction === "inbound" ? "Entrante" : "Uscente"}{call.handledBy ? ` · ${call.handledBy}` : ""}</p>
                </div>
                <div className="text-right text-[11px] text-muted-foreground"><div>{relativeTime(call.startedAt)}</div><div>{duration(call.durationSeconds)}</div></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

export default function PersonalizedDashboard() {
  const [base, setBase] = useState<BaseDashboard | null>(null)
  const [home, setHome] = useState<HomeDashboard | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [baseResponse, homeResponse] = await Promise.all([
          fetch("/api/platform/dashboard"),
          fetch("/api/platform/dashboard-home"),
        ])
        if (!baseResponse.ok || !homeResponse.ok) {
          throw new Error(`Dashboard non disponibile (${baseResponse.status}/${homeResponse.status})`)
        }
        const [baseData, homeData] = await Promise.all([baseResponse.json(), homeResponse.json()])
        if (alive) {
          setBase(baseData)
          setHome(homeData)
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Dashboard non disponibile")
      }
    })()
    return () => { alive = false }
  }, [])

  const visibleIds = useMemo(() => {
    if (!base || !home) return new Set<string>()
    const hidden = new Set(home.hiddenPanels ?? [])
    return new Set(base.panels.filter((id) => !hidden.has(id)))
  }, [base, home])

  if (error) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6">
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
          <TriangleAlert className="h-5 w-5" /> {error}
        </div>
      </main>
    )
  }

  if (!base || !home) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6">
        <div className="h-28 animate-pulse rounded-2xl bg-muted" />
        <div className="mt-5 grid gap-4 lg:grid-cols-3">{[0,1,2].map((i) => <div key={i} className="h-64 animate-pulse rounded-xl bg-muted" />)}</div>
      </main>
    )
  }

  const genericPanels = DASHBOARD_PANELS.filter((panel) => visibleIds.has(panel.id) && !SPECIAL.has(panel.id))

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 md:py-8">
      <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ha-brand">Cruscotto {base.profilo}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">La tua giornata, in un solo posto</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Priorità, conversazioni, attività e telefonate costruite sui tuoi permessi e sulle impostazioni del tenant.</p>
        </div>
        {base.isAdmin && (
          <Link href="/admin/settings/dashboard" className="inline-flex w-fit items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium transition-colors hover:border-ha-brand/40 hover:text-ha-brand">
            <Settings2 className="h-4 w-4" /> Configura dashboard utenti
          </Link>
        )}
      </header>

      {base.isPlatformAdmin && <div className="mb-6"><PlatformOverviewPanel /></div>}

      {visibleIds.has("my-performance") && <PerformanceStrip home={home} />}

      <section className="mb-8 grid gap-4 lg:grid-cols-3">
        {visibleIds.has("backlog") && <MessagesCard messages={home.messages} />}
        {visibleIds.has("my-todos") && <TasksCard todos={home.todos} />}
        {visibleIds.has("calls") && <CallsCard calls={home.calls} />}
      </section>

      {PANEL_ORDER.map((kind: PanelKind) => {
        const group = genericPanels.filter((panel) => panel.kind === kind)
        if (group.length === 0) return null
        return (
          <section key={kind} className="mb-8">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-foreground">{PANEL_KIND_LABEL[kind]}</h2>
              <span className="text-[11px] text-muted-foreground">{group.length} {group.length === 1 ? "card" : "card"}</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.map((panel) => <DashboardCard key={panel.id} panel={panel} dati={base.dati} />)}
            </div>
          </section>
        )
      })}

      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        <Mail className="h-3.5 w-3.5 text-ha-brand" />
        <span>Le card rispettano permessi, moduli e configurazione dell'amministratore.</span>
        <Link href="/admin/my-work" className="ml-auto inline-flex items-center gap-1 font-medium text-ha-brand hover:underline">Le mie attività <ArrowRight className="h-3 w-3" /></Link>
      </div>
    </main>
  )
}
