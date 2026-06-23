"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Plus, CheckCircle2, Circle, Clock, AlertCircle,
  Trash2, ExternalLink, Calendar, Filter, RefreshCw,
  Users, User, Send, Wrench, Tag, Edit2, Settings
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AdminHeader } from "@/components/admin/admin-header"
import { useAdminAuth } from "@/lib/admin-hooks"
import { format, isToday, isPast, isTomorrow } from "date-fns"
import { it } from "date-fns/locale"
import { Badge } from "@/components/ui/badge"

interface ManubotTeamMember { id: string; full_name: string; email: string; role: string }
interface ManubotAsset { id: string; name: string; location: string }

type TodoStatus = "open" | "in_progress" | "done" | "cancelled"
type TodoPriority = "low" | "normal" | "high" | "urgent"

interface AdminUser {
  id: string
  name: string
  email: string
  role: string
}

interface Todo {
  id: string
  title: string
  description?: string
  status: TodoStatus
  priority: TodoPriority
  assigned_to?: string
  assigned_to_name?: string
  due_date?: string
  external_id?: string
  external_source?: string
  external_url?: string
  tags: string[]
  send_to_manubot?: boolean
  manubot_synced?: boolean
  created_at: string
  updated_at: string
  completed_at?: string
}

const STATUS_CONFIG: Record<TodoStatus, { label: string; icon: typeof Circle; color: string }> = {
  open:        { label: "Da fare",     icon: Circle,       color: "text-gray-400"  },
  in_progress: { label: "In corso",   icon: Clock,        color: "text-blue-500"  },
  done:        { label: "Completato", icon: CheckCircle2, color: "text-green-500" },
  cancelled:   { label: "Annullato",  icon: AlertCircle,  color: "text-red-400"   },
}

const PRIORITY_CONFIG: Record<TodoPriority, { label: string; dot: string; text: string }> = {
  low:    { label: "Bassa",   dot: "bg-gray-300",   text: "text-gray-500"  },
  normal: { label: "Normale", dot: "bg-blue-400",   text: "text-blue-600"  },
  high:   { label: "Alta",    dot: "bg-orange-400", text: "text-orange-600"},
  urgent: { label: "Urgente", dot: "bg-red-500",    text: "text-red-600"   },
}

function DueDateBadge({ date }: { date?: string }) {
  if (!date) return null
  const d = new Date(date)
  const overdue = isPast(d) && !isToday(d)
  const today = isToday(d)
  const tomorrow = isTomorrow(d)
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium ${
      overdue  ? "bg-red-100 text-red-600" :
      today    ? "bg-orange-100 text-orange-600" :
      tomorrow ? "bg-yellow-100 text-yellow-700" :
                 "bg-gray-100 text-gray-500"
    }`}>
      <Calendar className="w-3 h-3" />
      {overdue ? "Scaduto" : today ? "Oggi" : tomorrow ? "Domani" : format(d, "d MMM", { locale: it })}
    </span>
  )
}

function Avatar({ name, size = "sm" }: { name?: string; size?: "sm" | "md" }) {
  if (!name) return null
  const s = size === "sm" ? "w-5 h-5 text-[10px]" : "w-6 h-6 text-xs"
  return (
    <span className={`${s} rounded-full bg-[#e8ddd0] text-[#8b7355] flex items-center justify-center font-semibold flex-shrink-0`}>
      {name.charAt(0).toUpperCase()}
    </span>
  )
}

export default function TodosPage() {
  const { isLoading: authLoading, adminUser } = useAdminAuth()
  const [todos, setTodos] = useState<Todo[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [filterAssignee, setFilterAssignee] = useState<string>("all")
  const [showForm, setShowForm] = useState(false)
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  const [manubotTeam, setManubotTeam] = useState<ManubotTeamMember[]>([])
  const [manubotAssets, setManubotAssets] = useState<ManubotAsset[]>([])

  const [form, setForm] = useState({
    title: "",
    description: "",
    priority: "normal" as TodoPriority,
    assigned_to: "",
    due_date: "",
    tags: "",
    send_to_manubot: false,
    manubot_assigned_to: "",
    manubot_asset_id: "",
  })

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users")
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users || [])
      }
    } catch { /* silent */ }
  }, [])

  const loadTodos = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterStatus !== "all") params.set("status", filterStatus)
      if (filterAssignee !== "all") params.set("assigned_to", filterAssignee)
      const res = await fetch(`/api/admin/todos?${params}`)
      if (res.ok) {
        const data = await res.json()
        setTodos(data.todos || [])
      }
    } catch { setError("Errore nel caricamento") }
    finally { setLoading(false) }
  }, [filterStatus, filterAssignee])

  useEffect(() => { loadUsers() }, [loadUsers])
  useEffect(() => { loadTodos() }, [loadTodos])

  // Carica team e asset Manubot quando send_to_manubot viene attivato
  useEffect(() => {
    if (!form.send_to_manubot) return
    const loadManubot = async () => {
      try {
        const [teamRes, assetsRes] = await Promise.all([
          fetch("/api/admin/manubot/team"),
          fetch("/api/admin/manubot/assets"),
        ])
        if (teamRes.ok) { const d = await teamRes.json(); setManubotTeam(d.team || []) }
        if (assetsRes.ok) { const d = await assetsRes.json(); setManubotAssets(d.assets || []) }
      } catch { /* silent */ }
    }
    loadManubot()
  }, [form.send_to_manubot])

  const resetForm = () => {
    setForm({ title: "", description: "", priority: "normal", assigned_to: "", due_date: "", tags: "", send_to_manubot: false, manubot_assigned_to: "", manubot_asset_id: "" })
    setEditingTodo(null)
    setShowForm(false)
    setError("")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) { setError("Titolo obbligatorio"); return }
    setSubmitting(true)

    const assignedUser = users.find(u => u.id === form.assigned_to)
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      priority: form.priority,
      assigned_to: form.assigned_to || null,
      due_date: form.due_date || undefined,
      tags: form.tags ? form.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
      send_to_manubot: form.send_to_manubot,
      manubot_assigned_to: form.manubot_assigned_to || null,
      manubot_asset_id: form.manubot_asset_id || null,
    }

    try {
      const res = await fetch(
        editingTodo ? `/api/admin/todos/${editingTodo.id}` : "/api/admin/todos",
        { method: editingTodo ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
      )
      if (!res.ok) throw new Error("Errore nel salvataggio")
      await loadTodos()
      resetForm()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const updateStatus = async (todo: Todo, status: TodoStatus) => {
    setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, status } : t))
    try {
      await fetch(`/api/admin/todos/${todo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
    } catch {
      setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, status: todo.status } : t))
    }
  }

  const deleteTodo = async (id: string) => {
    if (!confirm("Eliminare questo task?")) return
    setTodos(prev => prev.filter(t => t.id !== id))
    await fetch(`/api/admin/todos/${id}`, { method: "DELETE" })
  }

  const openEdit = (todo: Todo) => {
    setForm({
      title: todo.title,
      description: todo.description || "",
      priority: todo.priority,
      assigned_to: todo.assigned_to || "",
      due_date: todo.due_date ? todo.due_date.slice(0, 10) : "",
      tags: todo.tags.join(", "),
      send_to_manubot: todo.send_to_manubot || false,
      manubot_assigned_to: "",
      manubot_asset_id: "",
    })
    setEditingTodo(todo)
    setShowForm(true)
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#f8f7f4] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-[#8b7355]" />
      </div>
    )
  }
  if (!adminUser) return null

  const stats = {
    open:        todos.filter(t => t.status === "open").length,
    in_progress: todos.filter(t => t.status === "in_progress").length,
    done:        todos.filter(t => t.status === "done").length,
    urgent:      todos.filter(t => t.priority === "urgent" && t.status !== "done").length,
  }

  return (
    <div className="min-h-screen bg-[#f8f7f4]">
      <AdminHeader
        title="Task & To-Do"
        subtitle="Gestisci attività e deleghe al team"
        actions={
          <Button
            onClick={() => { resetForm(); setShowForm(true) }}
            className="bg-[#8b7355] hover:bg-[#7a6548] text-white h-8 px-3 text-sm gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Nuovo task
          </Button>
        }
      />

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Da fare",    value: stats.open,        border: "border-gray-300" },
            { label: "In corso",   value: stats.in_progress, border: "border-blue-300" },
            { label: "Completati", value: stats.done,        border: "border-green-300" },
            { label: "Urgenti",    value: stats.urgent,      border: "border-red-300" },
          ].map(s => (
            <div key={s.label} className={`bg-white rounded-xl border-l-4 ${s.border} px-4 py-3 shadow-sm`}>
              <p className="text-2xl font-semibold text-gray-800">{s.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">
              {editingTodo ? "Modifica task" : "Nuovo task"}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <Input
                placeholder="Titolo del task *"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="text-sm"
                autoFocus
              />
              <Textarea
                placeholder="Descrizione (opzionale)"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
                className="text-sm resize-none"
              />

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {/* Priority */}
                <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v as TodoPriority }))}>
                  <SelectTrigger className="text-sm h-9">
                    <SelectValue placeholder="Priorità" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Bassa</SelectItem>
                    <SelectItem value="normal">Normale</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                    <SelectItem value="urgent">Urgente</SelectItem>
                  </SelectContent>
                </Select>

                {/* Assignee */}
                <Select
                  value={form.assigned_to || "unassigned"}
                  onValueChange={v => setForm(f => ({ ...f, assigned_to: v === "unassigned" ? "" : v }))}
                >
                  <SelectTrigger className="text-sm h-9">
                    <SelectValue placeholder="Assegna a..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">
                      <span className="flex items-center gap-2 text-gray-400">
                        <User className="w-3.5 h-3.5" />
                        Non assegnato
                      </span>
                    </SelectItem>
                    {users.map(u => (
                      <SelectItem key={u.id} value={u.id}>
                        <span className="flex items-center gap-2">
                          <Avatar name={u.name} size="sm" />
                          {u.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Due date */}
                <Input
                  type="date"
                  value={form.due_date}
                  onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                  className="text-sm h-9"
                />

                {/* Tags */}
                <Input
                  placeholder="Tag (es: manutenzione)"
                  value={form.tags}
                  onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                  className="text-sm h-9"
                />
              </div>

              {/* Send to Manubot toggle */}
              <div className="border border-gray-100 rounded-xl p-3 bg-gray-50/50 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer group w-fit">
                  <div
                    onClick={() => setForm(f => ({ ...f, send_to_manubot: !f.send_to_manubot }))}
                    className={`w-10 h-5 rounded-full transition-colors flex-shrink-0 relative ${
                      form.send_to_manubot ? "bg-[#8b7355]" : "bg-gray-200"
                    }`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${
                      form.send_to_manubot ? "left-5" : "left-0.5"
                    }`} />
                  </div>
                  <span className="flex items-center gap-1.5 text-sm text-gray-700 font-medium group-hover:text-gray-900">
                    <Wrench className="w-3.5 h-3.5 text-[#8b7355]" />
                    Invia a Manubot
                    <span className="text-xs text-gray-400 font-normal">(crea intervento di manutenzione)</span>
                  </span>
                </label>

                {/* Campi Manubot — visibili solo se send_to_manubot è attivo */}
                {form.send_to_manubot && (
                  <div className="grid grid-cols-2 gap-3 pt-1 border-t border-gray-100">
                    {/* Tecnico Manubot */}
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-500 flex items-center gap-1">
                        <Wrench className="w-3 h-3" /> Tecnico Manubot
                      </label>
                      <Select
                        value={form.manubot_assigned_to || "none"}
                        onValueChange={v => setForm(f => ({ ...f, manubot_assigned_to: v === "none" ? "" : v }))}
                      >
                        <SelectTrigger className="text-sm h-9 bg-white">
                          <SelectValue placeholder="Seleziona tecnico..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">
                            <span className="text-gray-400">Nessun tecnico</span>
                          </SelectItem>
                          {manubotTeam.map(m => (
                            <SelectItem key={m.id} value={m.id}>
                              <span className="flex items-center gap-2">
                                <Avatar name={m.full_name} size="sm" />
                                {m.full_name}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Impianto/Asset Manubot */}
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-500 flex items-center gap-1">
                        <Settings className="w-3 h-3" /> Impianto / Asset
                      </label>
                      <Select
                        value={form.manubot_asset_id || "none"}
                        onValueChange={v => setForm(f => ({ ...f, manubot_asset_id: v === "none" ? "" : v }))}
                      >
                        <SelectTrigger className="text-sm h-9 bg-white">
                          <SelectValue placeholder="Seleziona impianto..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">
                            <span className="text-gray-400">Nessun impianto</span>
                          </SelectItem>
                          {manubotAssets.map(a => (
                            <SelectItem key={a.id} value={a.id}>
                              <span className="flex flex-col">
                                <span>{a.name}</span>
                                {a.location && <span className="text-xs text-gray-400">{a.location}</span>}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>

              {error && <p className="text-xs text-red-500">{error}</p>}

              <div className="flex gap-2 justify-end pt-1">
                <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
                  Annulla
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={submitting}
                  className="bg-[#8b7355] hover:bg-[#7a6548] text-white"
                >
                  {submitting ? "Salvataggio..." : editingTodo ? "Salva modifiche" : form.send_to_manubot ? "Crea e invia a Manubot" : "Crea task"}
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-gray-400 flex-shrink-0" />
            {(["all", "open", "in_progress", "done", "cancelled"] as const).map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`text-xs px-3 py-1 rounded-full transition-colors ${
                  filterStatus === s
                    ? "bg-[#8b7355] text-white"
                    : "bg-white text-gray-500 border border-gray-200 hover:border-[#8b7355] hover:text-[#8b7355]"
                }`}
              >
                {s === "all" ? "Tutti" : STATUS_CONFIG[s].label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Users className="w-4 h-4 text-gray-400" />
              <Select value={filterAssignee} onValueChange={setFilterAssignee}>
                <SelectTrigger className="h-7 text-xs border-gray-200 w-36">
                  <SelectValue placeholder="Tutti" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti</SelectItem>
                  {users.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <button
              onClick={loadTodos}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Todo list */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-[#8b7355]" />
          </div>
        ) : todos.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 py-16 text-center">
            <CheckCircle2 className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400">
              {filterStatus === "all" && filterAssignee === "all"
                ? "Nessun task. Crea il primo."
                : "Nessun task con questo filtro."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {todos.map(todo => {
              const cfg = STATUS_CONFIG[todo.status]
              const pCfg = PRIORITY_CONFIG[todo.priority]
              const StatusIcon = cfg.icon
              const isDone = todo.status === "done"
              const assigneeName = users.find(u => u.id === todo.assigned_to)?.name || todo.assigned_to_name

              return (
                <div
                  key={todo.id}
                  className={`bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-start gap-3 group hover:border-[#c8b99a] transition-all ${isDone ? "opacity-55" : ""}`}
                >
                  {/* Status toggle */}
                  <button
                    onClick={() => updateStatus(todo, isDone ? "open" : "done")}
                    className="mt-0.5 flex-shrink-0"
                    title={isDone ? "Riapri" : "Segna come completato"}
                  >
                    <StatusIcon className={`w-5 h-5 ${cfg.color} hover:scale-110 transition-transform`} />
                  </button>

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <button
                        onClick={() => openEdit(todo)}
                        className={`text-sm font-medium text-left hover:text-[#8b7355] transition-colors ${isDone ? "line-through text-gray-400" : "text-gray-800"}`}
                      >
                        {todo.title}
                      </button>

                      {/* Actions (visible on hover) */}
                      <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        {todo.external_url && (
                          <a href={todo.external_url} target="_blank" rel="noopener noreferrer"
                            className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
                            title="Apri in Manubot"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <button
                          onClick={() => openEdit(todo)}
                          className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
                          title="Modifica"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => deleteTodo(todo.id)}
                          className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-500"
                          title="Elimina"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {todo.description && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{todo.description}</p>
                    )}

                    {/* Footer row */}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">

                      {/* Priority dot */}
                      <span className={`inline-flex items-center gap-1 text-xs ${pCfg.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${pCfg.dot}`} />
                        {pCfg.label}
                      </span>

                      {/* Status change */}
                      {!isDone && (
                        <Select
                          value={todo.status}
                          onValueChange={(v) => updateStatus(todo, v as TodoStatus)}
                        >
                          <SelectTrigger className="h-5 text-xs border-0 shadow-none p-0 w-auto gap-1 text-gray-400 hover:text-gray-600 focus:ring-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="open">Da fare</SelectItem>
                            <SelectItem value="in_progress">In corso</SelectItem>
                            <SelectItem value="done">Completato</SelectItem>
                            <SelectItem value="cancelled">Annullato</SelectItem>
                          </SelectContent>
                        </Select>
                      )}

                      {/* Assignee */}
                      {assigneeName ? (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                          <Avatar name={assigneeName} size="sm" />
                          {assigneeName}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-300">
                          <User className="w-3 h-3" />
                          Non assegnato
                        </span>
                      )}

                      {/* Due date */}
                      <DueDateBadge date={todo.due_date} />

                      {/* Tags */}
                      {todo.tags?.map(tag => (
                        <span key={tag} className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">
                          <Tag className="w-2.5 h-2.5" />
                          {tag}
                        </span>
                      ))}

                      {/* Manubot badge */}
                      {todo.external_source === "manubot" && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-orange-200 text-orange-600 bg-orange-50 gap-1">
                          <Wrench className="w-2.5 h-2.5" />
                          Manubot {todo.external_id && `#${todo.external_id}`}
                        </Badge>
                      )}

                      {/* Pending sync to Manubot */}
                      {todo.send_to_manubot && todo.external_source !== "manubot" && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-blue-200 text-blue-500 bg-blue-50 gap-1">
                          <Send className="w-2.5 h-2.5" />
                          Da inviare a Manubot
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Manubot info box */}
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex gap-3">
          <Wrench className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-orange-700 space-y-1">
            <p className="font-semibold">Integrazione Manubot</p>
            <p>I task con badge arancione provengono da Manubot. I task creati qui con "Invia a Manubot" attivo vengono inviati come nuovi interventi non appena Manubot configura il webhook ricevente.</p>
            <p className="font-mono text-[10px] bg-orange-100 px-2 py-1 rounded mt-1">
              POST {typeof window !== "undefined" ? window.location.origin : "https://tuodominio"}/api/external/manubot
            </p>
          </div>
        </div>

      </div>
    </div>
  )
}
