"use client"

import Link from "next/link"
import { useCallback, useEffect, useState, type FormEvent } from "react"
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  ExternalLink,
  Filter,
  Loader2,
  Plus,
  RefreshCw,
  Wrench,
} from "lucide-react"
import { format, isPast, isToday, isTomorrow } from "date-fns"
import { it } from "date-fns/locale"

import { AdminHeader } from "@/components/admin/admin-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useAdminAuth } from "@/lib/admin-hooks"

type TodoStatus = "open" | "in_progress" | "done" | "cancelled"
type TodoPriority = "low" | "normal" | "high" | "urgent"
type AddonState =
  | "loading"
  | "active"
  | "inactive"
  | "configuration_required"
  | "forbidden"
  | "unavailable"

type ManubotOperator = { id: string; full_name: string | null }
type ManubotGroup = { id: string; name: string; member_count?: number | null }
type ManubotAsset = { id: string; name: string; location?: string | null }
type ManubotTaskData = {
  operators?: ManubotOperator[]
  operatorGroups?: ManubotGroup[]
  assets?: ManubotAsset[]
}
type AddonContext = {
  status?: "active" | "inactive" | "configuration_required"
  active?: boolean
  reason?: string | null
  task_data?: ManubotTaskData | null
}

interface Todo {
  id: string
  title: string
  description?: string | null
  status: TodoStatus
  priority: TodoPriority
  due_date?: string | null
  external_id?: string | null
  external_source?: string | null
  external_url?: string | null
  external_data?: {
    assigned_to_name?: string | null
    asset_name?: string | null
    asset_location?: string | null
  } | null
  created_at: string
  updated_at: string
  completed_at?: string | null
}

const STATUS_CONFIG: Record<TodoStatus, { label: string; icon: typeof Circle; color: string }> = {
  open: { label: "Da fare", icon: Circle, color: "text-muted-foreground" },
  in_progress: { label: "In corso", icon: Clock, color: "text-ha-info-soft-foreground" },
  done: { label: "Completato", icon: CheckCircle2, color: "text-ha-success-soft-foreground" },
  cancelled: { label: "Annullato", icon: AlertCircle, color: "text-ha-error-soft-foreground" },
}

const PRIORITY_CONFIG: Record<TodoPriority, { label: string; dot: string; text: string }> = {
  low: { label: "Bassa", dot: "bg-gray-300", text: "text-gray-500" },
  normal: { label: "Normale", dot: "bg-ha-info", text: "text-ha-info-soft-foreground" },
  high: { label: "Alta", dot: "bg-ha-warning", text: "text-ha-warning-soft-foreground" },
  urgent: { label: "Urgente", dot: "bg-ha-error", text: "text-ha-error-soft-foreground" },
}

function createEmptyForm() {
  return {
    title: "",
    description: "",
    priority: "normal" as TodoPriority,
    responsible: "",
    assetId: "",
    expectedResolutionMinutes: "60",
  }
}

function DueDateBadge({ date }: { date?: string | null }) {
  if (!date) return null
  const parsed = new Date(date)
  const overdue = isPast(parsed) && !isToday(parsed)
  const today = isToday(parsed)
  const tomorrow = isTomorrow(parsed)

  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${
        overdue
          ? "bg-ha-error-soft text-ha-error-soft-foreground"
          : today
            ? "bg-ha-warning-soft text-ha-warning-soft-foreground"
            : tomorrow
              ? "bg-ha-warning-soft text-ha-warning-soft-foreground"
              : "bg-muted text-muted-foreground"
      }`}
    >
      <Calendar className="h-3 w-3" />
      {overdue ? "Scaduto" : today ? "Oggi" : tomorrow ? "Domani" : format(parsed, "d MMM", { locale: it })}
    </span>
  )
}

export default function TodosPage() {
  const { isLoading: authLoading, adminUser } = useAdminAuth()
  const [addonState, setAddonState] = useState<AddonState>("loading")
  const [taskData, setTaskData] = useState<ManubotTaskData | null>(null)
  const [todos, setTodos] = useState<Todo[]>([])
  const [loadingTodos, setLoadingTodos] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [form, setForm] = useState(createEmptyForm)

  const loadAddonContext = useCallback(async () => {
    setAddonState("loading")
    setTaskData(null)
    setError("")

    try {
      const res = await fetch("/api/admin/manubot/addon-context", { cache: "no-store" })
      const data = (await res.json().catch(() => ({}))) as AddonContext & { error?: string }

      if (res.status === 401 || res.status === 403) {
        setAddonState("forbidden")
        return
      }
      if (!res.ok) {
        setAddonState("unavailable")
        return
      }
      if (data.status === "inactive") {
        setAddonState("inactive")
        return
      }
      if (data.status === "configuration_required") {
        setAddonState("configuration_required")
        return
      }
      if (data.status !== "active" || data.active !== true || !data.task_data) {
        setAddonState("unavailable")
        return
      }

      setTaskData(data.task_data)
      setAddonState("active")
    } catch {
      setAddonState("unavailable")
    }
  }, [])

  const loadTodos = useCallback(async () => {
    setLoadingTodos(true)
    setError("")

    try {
      const params = new URLSearchParams()
      if (filterStatus !== "all") params.set("status", filterStatus)
      const res = await fetch(`/api/admin/todos?${params}`, { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Errore nel caricamento")

      // La pagina To-Do e' la superficie ManuBot: i vecchi task locali non
      // devono ricreare visivamente un secondo modulo parallelo.
      const manubotTodos = Array.isArray(data.todos)
        ? (data.todos as Todo[]).filter((todo) => todo.external_source === "manubot")
        : []
      setTodos(manubotTodos)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Errore nel caricamento")
    } finally {
      setLoadingTodos(false)
    }
  }, [filterStatus])

  useEffect(() => {
    if (!authLoading && adminUser) void loadAddonContext()
  }, [adminUser, authLoading, loadAddonContext])

  useEffect(() => {
    if (addonState === "active") void loadTodos()
  }, [addonState, loadTodos])

  const resetForm = () => {
    setForm(createEmptyForm())
    setShowForm(false)
    setError("")
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form.title.trim()) {
      setError("Inserisci il titolo dell'attività")
      return
    }
    if (!form.responsible) {
      setError("Scegli un tecnico o un gruppo responsabile")
      return
    }

    const expectedMinutes = Number(form.expectedResolutionMinutes)
    if (!Number.isInteger(expectedMinutes) || expectedMinutes < 5 || expectedMinutes > 1440) {
      setError("Il tempo stimato deve essere compreso tra 5 e 1440 minuti")
      return
    }

    const assigneeIds = form.responsible.startsWith("operator:") ? [form.responsible.slice(9)] : []
    const groupIds = form.responsible.startsWith("group:") ? [form.responsible.slice(6)] : []

    setSubmitting(true)
    setError("")
    try {
      const res = await fetch("/api/admin/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          priority: form.priority,
          tags: ["manubot"],
          send_to_manubot: true,
          manubot_assignee_ids: assigneeIds,
          manubot_group_ids: groupIds,
          manubot_asset_ids: form.assetId ? [form.assetId] : [],
          manubot_expected_resolution_minutes: expectedMinutes,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Creazione attività non riuscita")
      if (data.manubot_synced !== true) throw new Error("ManuBot non ha confermato la creazione dell'attività")

      resetForm()
      await loadTodos()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Creazione attività non riuscita")
    } finally {
      setSubmitting(false)
    }
  }

  const updateStatus = async (todo: Todo, status: TodoStatus) => {
    setTodos((current) => current.map((item) => (item.id === todo.id ? { ...item, status } : item)))
    try {
      const res = await fetch(`/api/admin/todos/${todo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Aggiornamento non riuscito")
    } catch (cause) {
      setTodos((current) => current.map((item) => (item.id === todo.id ? { ...item, status: todo.status } : item)))
      setError(cause instanceof Error ? cause.message : "Aggiornamento non riuscito")
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-full items-center justify-center bg-muted">
        <Loader2 className="h-8 w-8 animate-spin text-ha-brand" />
      </div>
    )
  }
  if (!adminUser) return null

  const stats = {
    open: todos.filter((todo) => todo.status === "open").length,
    inProgress: todos.filter((todo) => todo.status === "in_progress").length,
    done: todos.filter((todo) => todo.status === "done").length,
    urgent: todos.filter((todo) => todo.priority === "urgent" && todo.status !== "done").length,
  }

  const operators = taskData?.operators || []
  const groups = taskData?.operatorGroups || []
  const assets = taskData?.assets || []
  const active = addonState === "active"

  return (
    <div className="min-h-full bg-muted">
      <AdminHeader
        title="To-Do · ManuBot"
        subtitle="Le attività operative di HotelAccelerator sono gestite da ManuBot"
        actions={
          active ? (
            <Button
              onClick={() => {
                resetForm()
                setShowForm(true)
              }}
              className="h-8 gap-1.5 bg-ha-brand px-3 text-sm text-white hover:bg-ha-brand/90"
            >
              <Plus className="h-4 w-4" />
              Nuova attività
            </Button>
          ) : undefined
        }
      />

      <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
        {addonState === "loading" ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card py-16 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Verifico il modulo ManuBot…
          </div>
        ) : addonState === "inactive" ? (
          <div className="rounded-2xl border border-dashed border-ha-brand/35 bg-card p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-ha-brand-soft">
              <Wrench className="h-6 w-6 text-ha-brand" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">I To-Do di Accelerator sono gestiti da ManuBot</h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Non esiste una seconda lista To-Do separata. Attiva l'addon ManuBot per creare, assegnare e seguire tutte le attività operative direttamente dalla suite.
            </p>
            <Button asChild className="mt-5 bg-ha-brand text-white hover:bg-ha-brand/90">
              <Link href="/admin/modules?focus=manubot">Attiva ManuBot</Link>
            </Button>
          </div>
        ) : addonState === "configuration_required" ? (
          <div className="rounded-2xl border border-dashed border-ha-warning-soft bg-card p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-ha-warning-soft">
              <Wrench className="h-6 w-6 text-ha-warning-soft-foreground" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">ManuBot è attivo, manca il collegamento tecnico</h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              L'addon risulta già previsto per questa struttura. Completa la configurazione: non verrà proposta una seconda attivazione e non verranno creati To-Do locali.
            </p>
            <Button asChild variant="outline" className="mt-5">
              <Link href="/admin/modules?focus=manubot">Completa configurazione</Link>
            </Button>
          </div>
        ) : addonState === "forbidden" ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
            <AlertCircle className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Non hai i permessi per accedere alle attività ManuBot.</p>
          </div>
        ) : addonState === "unavailable" ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
            <AlertCircle className="mx-auto mb-3 h-8 w-8 text-ha-error-soft-foreground" />
            <h2 className="text-base font-semibold text-foreground">ManuBot momentaneamente non disponibile</h2>
            <p className="mt-1 text-sm text-muted-foreground">Non mostro un To-Do locale come ripiego, per evitare due sistemi paralleli.</p>
            <Button variant="outline" className="mt-4" onClick={() => void loadAddonContext()}>
              Riprova
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ha-brand/20 bg-ha-brand-soft/30 px-4 py-3">
              <div className="flex items-center gap-2 text-sm">
                <Wrench className="h-4 w-4 text-ha-brand" />
                <span className="font-medium text-foreground">Un solo sistema attività: ManuBot</span>
                <span className="text-muted-foreground">· Accelerator ne mostra e gestisce la vista integrata.</span>
              </div>
              <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                <Link href="/admin/modules?focus=manubot">Impostazioni ManuBot</Link>
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Da fare", value: stats.open, border: "border-border" },
                { label: "In corso", value: stats.inProgress, border: "border-ha-info-soft" },
                { label: "Completati", value: stats.done, border: "border-ha-success-soft" },
                { label: "Urgenti", value: stats.urgent, border: "border-ha-error-soft" },
              ].map((stat) => (
                <div key={stat.label} className={`rounded-xl border-l-4 ${stat.border} bg-card px-4 py-3 shadow-sm`}>
                  <p className="text-2xl font-semibold text-foreground">{stat.value}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>

            {showForm && (
              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-ha-brand" />
                  <h3 className="text-sm font-semibold text-foreground">Nuova attività ManuBot</h3>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      placeholder="Cosa c'è da fare? *"
                      value={form.title}
                      onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                      className="sm:col-span-2"
                      autoFocus
                    />
                    <Textarea
                      placeholder="Descrizione (opzionale)"
                      value={form.description}
                      onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                      rows={3}
                      className="resize-none sm:col-span-2"
                    />

                    <Select
                      value={form.priority}
                      onValueChange={(value) => setForm((current) => ({ ...current, priority: value as TodoPriority }))}
                    >
                      <SelectTrigger><SelectValue placeholder="Priorità" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Bassa</SelectItem>
                        <SelectItem value="normal">Normale</SelectItem>
                        <SelectItem value="high">Alta</SelectItem>
                        <SelectItem value="urgent">Urgente</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select
                      value={form.responsible || "none"}
                      onValueChange={(value) => setForm((current) => ({ ...current, responsible: value === "none" ? "" : value }))}
                    >
                      <SelectTrigger><SelectValue placeholder="Responsabile *" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Scegli responsabile</SelectItem>
                        {operators.map((operator) => (
                          <SelectItem key={operator.id} value={`operator:${operator.id}`}>
                            {operator.full_name || "Operatore"}
                          </SelectItem>
                        ))}
                        {groups.map((group) => (
                          <SelectItem key={group.id} value={`group:${group.id}`} disabled={group.member_count === 0}>
                            Gruppo · {group.name}{group.member_count === 0 ? " (senza membri)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={form.assetId || "none"}
                      onValueChange={(value) => setForm((current) => ({ ...current, assetId: value === "none" ? "" : value }))}
                    >
                      <SelectTrigger><SelectValue placeholder="Asset / impianto" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nessun asset specifico</SelectItem>
                        {assets.map((asset) => (
                          <SelectItem key={asset.id} value={asset.id}>
                            {asset.name}{asset.location ? ` · ${asset.location}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <div className="relative">
                      <Input
                        type="number"
                        min={5}
                        max={1440}
                        step={5}
                        value={form.expectedResolutionMinutes}
                        onChange={(event) => setForm((current) => ({ ...current, expectedResolutionMinutes: event.target.value }))}
                        aria-label="Tempo stimato in minuti"
                        className="pr-16"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">minuti</span>
                    </div>
                  </div>

                  {error && <p className="text-xs text-ha-error-soft-foreground">{error}</p>}

                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={resetForm}>Annulla</Button>
                    <Button type="submit" size="sm" disabled={submitting} className="bg-ha-brand text-white hover:bg-ha-brand/90">
                      {submitting ? "Creazione…" : "Crea in ManuBot"}
                    </Button>
                  </div>
                </form>
              </div>
            )}

            {!showForm && error && (
              <div className="rounded-lg border border-ha-error-soft bg-ha-error-soft/40 px-3 py-2 text-sm text-ha-error-soft-foreground">
                {error}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Filter className="h-4 w-4 shrink-0 text-muted-foreground" />
                {(["all", "open", "in_progress", "done", "cancelled"] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setFilterStatus(status)}
                    className={`rounded-full px-3 py-1 text-xs transition-colors ${
                      filterStatus === status
                        ? "bg-ha-brand text-white"
                        : "border border-border bg-card text-muted-foreground hover:border-ha-brand hover:text-ha-brand-soft-foreground"
                    }`}
                  >
                    {status === "all" ? "Tutti" : STATUS_CONFIG[status].label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void loadTodos()}
                className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingTodos ? "animate-spin" : ""}`} />
                Aggiorna
              </button>
            </div>

            {loadingTodos ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-ha-brand" />
              </div>
            ) : todos.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card py-16 text-center">
                <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-gray-200" />
                <p className="text-sm text-muted-foreground">
                  {filterStatus === "all" ? "Nessuna attività ManuBot." : "Nessuna attività ManuBot con questo filtro."}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {todos.map((todo) => {
                  const statusConfig = STATUS_CONFIG[todo.status]
                  const priorityConfig = PRIORITY_CONFIG[todo.priority] || PRIORITY_CONFIG.normal
                  const StatusIcon = statusConfig.icon
                  const isDone = todo.status === "done"
                  const assignedToName = todo.external_data?.assigned_to_name
                  const assetName = todo.external_data?.asset_name
                  const assetLocation = todo.external_data?.asset_location

                  return (
                    <div
                      key={todo.id}
                      className={`group flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-all hover:border-ha-brand/40 ${isDone ? "opacity-60" : ""}`}
                    >
                      <button
                        type="button"
                        onClick={() => void updateStatus(todo, isDone ? "open" : "done")}
                        className="mt-0.5 shrink-0"
                        title={isDone ? "Riapri in ManuBot" : "Segna come completato in ManuBot"}
                      >
                        <StatusIcon className={`h-5 w-5 ${statusConfig.color} transition-transform hover:scale-110`} />
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className={`text-sm font-medium ${isDone ? "line-through text-muted-foreground" : "text-foreground"}`}>
                              {todo.title}
                            </p>
                            {todo.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{todo.description}</p>}
                          </div>

                          {todo.external_url && (
                            <Button asChild variant="ghost" size="sm" className="h-7 shrink-0 gap-1 px-2 text-xs">
                              <a href={todo.external_url} target="_blank" rel="noreferrer">
                                Apri in ManuBot <ExternalLink className="h-3 w-3" />
                              </a>
                            </Button>
                          )}
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          <span className={`inline-flex items-center gap-1 text-xs ${priorityConfig.text}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${priorityConfig.dot}`} />
                            {priorityConfig.label}
                          </span>
                          <span className="text-xs text-muted-foreground">{statusConfig.label}</span>
                          <DueDateBadge date={todo.due_date} />
                          {assignedToName && <span className="text-xs text-muted-foreground">Responsabile: {assignedToName}</span>}
                          {assetName && (
                            <span className="text-xs text-muted-foreground">
                              {assetName}{assetLocation ? ` · ${assetLocation}` : ""}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
