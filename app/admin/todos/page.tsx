"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Plus, CheckCircle2, Circle, Clock, AlertCircle,
  Trash2, ExternalLink, Calendar, Filter, RefreshCw, Users, User
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AdminHeader } from "@/components/admin/admin-header"
import { useAdminAuth } from "@/lib/admin-hooks"
import { format, isToday, isPast, isTomorrow } from "date-fns"
import { it } from "date-fns/locale"

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
  created_at: string
  updated_at: string
  completed_at?: string
}

const STATUS_CONFIG: Record<TodoStatus, { label: string; icon: typeof Circle; color: string; bg: string }> = {
  open:        { label: "Da fare",     icon: Circle,       color: "text-gray-400",  bg: "bg-gray-50" },
  in_progress: { label: "In corso",   icon: Clock,        color: "text-blue-500",  bg: "bg-blue-50" },
  done:        { label: "Completato", icon: CheckCircle2, color: "text-green-500", bg: "bg-green-50" },
  cancelled:   { label: "Annullato",  icon: AlertCircle,  color: "text-red-400",   bg: "bg-red-50" },
}

const PRIORITY_CONFIG: Record<TodoPriority, { label: string; dot: string }> = {
  low:    { label: "Bassa",   dot: "bg-gray-300" },
  normal: { label: "Normale", dot: "bg-blue-400" },
  high:   { label: "Alta",    dot: "bg-orange-400" },
  urgent: { label: "Urgente", dot: "bg-red-500" },
}

const DEV_USERS: AdminUser[] = [
  { id: "dev-user-1", name: "Marco Rossi",    email: "marco@hotel.it",   role: "admin" },
  { id: "dev-user-2", name: "Giulia Bianchi", email: "giulia@hotel.it",  role: "manager" },
  { id: "dev-user-3", name: "Luca Ferrari",   email: "luca@hotel.it",    role: "staff" },
]

const DEV_TODOS: Todo[] = [
  { id: "dev-1", title: "Preparare preventivo sala conferenze", description: "Cliente Rossi per evento 15 persone", status: "open", priority: "high", assigned_to: "dev-user-1", assigned_to_name: "Marco Rossi", due_date: new Date(Date.now() + 86400000).toISOString(), tags: ["commerciale"], created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: "dev-2", title: "Verifica impianto idraulico camera 204", status: "in_progress", priority: "urgent", assigned_to: "dev-user-3", assigned_to_name: "Luca Ferrari", tags: ["manutenzione"], external_source: "manubot", external_id: "INT-1024", created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: "dev-3", title: "Aggiornare listino prezzi estate", status: "open", priority: "normal", tags: ["revenue"], due_date: new Date(Date.now() + 3 * 86400000).toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: "dev-4", title: "Check-in VIP prenotazione #8821", status: "done", priority: "high", assigned_to: "dev-user-2", assigned_to_name: "Giulia Bianchi", tags: ["reception"], created_at: new Date().toISOString(), updated_at: new Date().toISOString(), completed_at: new Date().toISOString() },
]

function DueDateBadge({ date }: { date?: string }) {
  if (!date) return null
  const d = new Date(date)
  const overdue = isPast(d) && !isToday(d)
  const today = isToday(d)
  const tomorrow = isTomorrow(d)
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${
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

function isDevOrPreview() {
  if (typeof window === "undefined") return false
  const h = window.location.hostname
  return h.includes("vusercontent.net") || h.includes("vercel.run") || h.includes("localhost") || h.includes("127.0.0.1")
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
  const [error, setError] = useState("")

  const [form, setForm] = useState({
    title: "",
    description: "",
    priority: "normal" as TodoPriority,
    assigned_to: "",
    due_date: "",
    tags: "",
  })

  const dev = isDevOrPreview()
  const effectiveAdmin = adminUser || (dev ? { id: "dev-user", name: "Dev Admin", email: "dev@hotelaccelerator.local" } : null)

  // Load users for the property
  const loadUsers = useCallback(async () => {
    if (dev) { setUsers(DEV_USERS); return }
    try {
      const res = await fetch("/api/admin/users")
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users || [])
      }
    } catch { /* silent */ }
  }, [dev])

  const loadTodos = useCallback(async () => {
    setLoading(true)
    try {
      if (dev) {
        await new Promise(r => setTimeout(r, 300))
        let filtered = DEV_TODOS
        if (filterStatus !== "all") filtered = filtered.filter(t => t.status === filterStatus)
        if (filterAssignee !== "all") filtered = filtered.filter(t => t.assigned_to === filterAssignee)
        setTodos(filtered)
        setLoading(false)
        return
      }
      const params = new URLSearchParams()
      if (filterStatus !== "all") params.set("status", filterStatus)
      if (filterAssignee !== "all") params.set("assigned_to", filterAssignee)
      const res = await fetch(`/api/admin/todos?${params}`)
      if (res.ok) {
        const data = await res.json()
        setTodos(data.todos || [])
      }
    } catch { setError("Errore nel caricamento dei task") }
    finally { setLoading(false) }
  }, [filterStatus, filterAssignee, dev])

  useEffect(() => { loadUsers() }, [loadUsers])
  useEffect(() => { loadTodos() }, [loadTodos])

  const resetForm = () => {
    setForm({ title: "", description: "", priority: "normal", assigned_to: "", due_date: "", tags: "" })
    setEditingTodo(null)
    setShowForm(false)
    setError("")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) { setError("Titolo obbligatorio"); return }

    const assignedUser = users.find(u => u.id === form.assigned_to)
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      priority: form.priority,
      assigned_to: form.assigned_to || null,
      due_date: form.due_date || undefined,
      tags: form.tags ? form.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
    }

    if (dev) {
      const newTodo: Todo = {
        id: editingTodo?.id || crypto.randomUUID(),
        ...payload,
        assigned_to_name: assignedUser?.name,
        status: editingTodo?.status || "open",
        tags: payload.tags,
        created_at: editingTodo?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      if (editingTodo) {
        setTodos(prev => prev.map(t => t.id === editingTodo.id ? newTodo : t))
      } else {
        setTodos(prev => [newTodo, ...prev])
      }
      resetForm()
      return
    }

    try {
      const res = await fetch(
        editingTodo ? `/api/admin/todos/${editingTodo.id}` : "/api/admin/todos",
        { method: editingTodo ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
      )
      if (!res.ok) throw new Error("Errore nel salvataggio")
      await loadTodos()
      resetForm()
    } catch (e: any) { setError(e.message) }
  }

  const updateStatus = async (todo: Todo, status: TodoStatus) => {
    setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, status } : t))
    if (!dev) {
      try {
        await fetch(`/api/admin/todos/${todo.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        })
      } catch { setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, status: todo.status } : t)) }
    }
  }

  const deleteTodo = async (id: string) => {
    if (!confirm("Eliminare questo task?")) return
    setTodos(prev => prev.filter(t => t.id !== id))
    if (!dev) await fetch(`/api/admin/todos/${id}`, { method: "DELETE" })
  }

  const openEdit = (todo: Todo) => {
    setForm({
      title: todo.title,
      description: todo.description || "",
      priority: todo.priority,
      assigned_to: todo.assigned_to || "",
      due_date: todo.due_date ? todo.due_date.slice(0, 10) : "",
      tags: todo.tags.join(", "),
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
  if (!effectiveAdmin) return null

  const allTodos = filterStatus === "all" && filterAssignee === "all" ? todos : todos
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

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">

        {/* Stats bar */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Da fare",   value: stats.open,        color: "border-gray-300" },
            { label: "In corso",  value: stats.in_progress, color: "border-blue-300" },
            { label: "Completati",value: stats.done,        color: "border-green-300" },
            { label: "Urgenti",   value: stats.urgent,      color: "border-red-300" },
          ].map(s => (
            <div key={s.label} className={`bg-white rounded-xl border-l-4 ${s.color} px-4 py-3 shadow-sm`}>
              <p className="text-2xl font-semibold text-gray-800">{s.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* New / Edit form */}
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
                <Select value={form.assigned_to || "unassigned"} onValueChange={v => setForm(f => ({ ...f, assigned_to: v === "unassigned" ? "" : v }))}>
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
                          <span className="w-5 h-5 rounded-full bg-[#e8ddd0] text-[#8b7355] text-xs flex items-center justify-center font-medium">
                            {u.name.charAt(0).toUpperCase()}
                          </span>
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
                  placeholder="Tag (virgola)"
                  value={form.tags}
                  onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                  className="text-sm h-9"
                />
              </div>

              {error && <p className="text-xs text-red-500">{error}</p>}
              <div className="flex gap-2 justify-end pt-1">
                <Button type="button" variant="ghost" size="sm" onClick={resetForm}>Annulla</Button>
                <Button type="submit" size="sm" className="bg-[#8b7355] hover:bg-[#7a6548] text-white">
                  {editingTodo ? "Salva modifiche" : "Crea task"}
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

          <div className="flex items-center gap-2">
            {/* Assignee filter */}
            <div className="flex items-center gap-1.5">
              <Users className="w-4 h-4 text-gray-400" />
              <Select value={filterAssignee} onValueChange={setFilterAssignee}>
                <SelectTrigger className="h-7 text-xs border-gray-200 w-36">
                  <SelectValue placeholder="Tutti gli utenti" />
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
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-[#8b7355]" />
          </div>
        ) : todos.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 py-16 text-center">
            <CheckCircle2 className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-500">
              {filterStatus === "all" && filterAssignee === "all"
                ? "Nessun task. Crea il primo."
                : "Nessun task con questo filtro."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {todos.map(todo => {
              const statusCfg = STATUS_CONFIG[todo.status]
              const priorityCfg = PRIORITY_CONFIG[todo.priority]
              const StatusIcon = statusCfg.icon
              const isDone = todo.status === "done"
              const assignedUser = users.find(u => u.id === todo.assigned_to)
              const assigneeName = assignedUser?.name || todo.assigned_to_name

              return (
                <div
                  key={todo.id}
                  className={`bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-start gap-3 group hover:border-[#c8b99a] transition-colors ${isDone ? "opacity-60" : ""}`}
                >
                  {/* Status toggle */}
                  <button
                    onClick={() => updateStatus(todo, isDone ? "open" : "done")}
                    className="mt-0.5 flex-shrink-0"
                    title={isDone ? "Riapri" : "Segna come completato"}
                  >
                    <StatusIcon className={`w-5 h-5 ${statusCfg.color} hover:scale-110 transition-transform`} />
                  </button>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        onClick={() => openEdit(todo)}
                        className={`text-sm font-medium text-left hover:text-[#8b7355] transition-colors ${isDone ? "line-through text-gray-400" : "text-gray-800"}`}
                      >
                        {todo.title}
                      </button>
                      <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        {todo.external_url && (
                          <a href={todo.external_url} target="_blank" rel="noopener noreferrer" title="Apri in sistema esterno">
                            <ExternalLink className="w-3.5 h-3.5 text-gray-400 hover:text-blue-500" />
                          </a>
                        )}
                        <button onClick={() => deleteTodo(todo.id)}>
                          <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                        </button>
                      </div>
                    </div>

                    {todo.description && (
                      <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{todo.description}</p>
                    )}

                    <div className="flex items-center flex-wrap gap-2 mt-1.5">
                      {/* Priority */}
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <span className={`w-2 h-2 rounded-full ${priorityCfg.dot}`} />
                        {priorityCfg.label}
                      </span>

                      {/* Status chip for non-open */}
                      {todo.status !== "open" && (
                        <Select value={todo.status} onValueChange={v => updateStatus(todo, v as TodoStatus)}>
                          <SelectTrigger className={`h-5 text-xs px-2 py-0 border-0 ${statusCfg.bg} ${statusCfg.color} rounded-full gap-1 w-auto`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(STATUS_CONFIG) as TodoStatus[]).map(s => (
                              <SelectItem key={s} value={s} className="text-xs">{STATUS_CONFIG[s].label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}

                      {/* Assignee badge */}
                      {assigneeName ? (
                        <span className="inline-flex items-center gap-1 text-xs bg-[#f0ebe4] text-[#8b7355] px-1.5 py-0.5 rounded-full">
                          <span className="w-3.5 h-3.5 rounded-full bg-[#c8b99a] text-white text-[9px] flex items-center justify-center font-bold">
                            {assigneeName.charAt(0).toUpperCase()}
                          </span>
                          {assigneeName}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-300">
                          <User className="w-3 h-3" />
                          Non assegnato
                        </span>
                      )}

                      <DueDateBadge date={todo.due_date} />

                      {/* External badge */}
                      {todo.external_source && (
                        <span className="text-xs px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded border border-purple-100">
                          {todo.external_source}
                          {todo.external_id && ` #${todo.external_id}`}
                        </span>
                      )}

                      {/* Tags */}
                      {todo.tags?.map(tag => (
                        <span key={tag} className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
