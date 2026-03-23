"use client"

import { useState, useEffect, useCallback } from "react"
import { Plus, CheckCircle2, Circle, Clock, AlertCircle, ChevronDown, Trash2, ExternalLink, User, Calendar, Tag, Filter, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AdminHeader } from "@/components/admin/admin-header"
import { useAdminAuth } from "@/lib/admin-hooks"
import { format, isToday, isPast, isTomorrow } from "date-fns"
import { it } from "date-fns/locale"

type TodoStatus = "open" | "in_progress" | "done" | "cancelled"
type TodoPriority = "low" | "normal" | "high" | "urgent"

interface Todo {
  id: string
  title: string
  description?: string
  status: TodoStatus
  priority: TodoPriority
  assigned_to?: string
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
  open:        { label: "Da fare",     icon: Circle,       color: "text-gray-400",   bg: "bg-gray-50" },
  in_progress: { label: "In corso",   icon: Clock,        color: "text-blue-500",   bg: "bg-blue-50" },
  done:        { label: "Completato", icon: CheckCircle2, color: "text-green-500",  bg: "bg-green-50" },
  cancelled:   { label: "Annullato",  icon: AlertCircle,  color: "text-red-400",    bg: "bg-red-50" },
}

const PRIORITY_CONFIG: Record<TodoPriority, { label: string; color: string; dot: string }> = {
  low:    { label: "Bassa",   color: "text-gray-400",  dot: "bg-gray-300" },
  normal: { label: "Normale", color: "text-blue-500",  dot: "bg-blue-400" },
  high:   { label: "Alta",    color: "text-orange-500",dot: "bg-orange-400" },
  urgent: { label: "Urgente", color: "text-red-600",   dot: "bg-red-500" },
}

function DueDateBadge({ date }: { date?: string }) {
  if (!date) return null
  const d = new Date(date)
  const overdue = isPast(d) && !isToday(d)
  const today = isToday(d)
  const tomorrow = isTomorrow(d)

  return (
    <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${
      overdue ? "bg-red-100 text-red-600" :
      today   ? "bg-orange-100 text-orange-600" :
      tomorrow? "bg-yellow-100 text-yellow-700" :
                "bg-gray-100 text-gray-500"
    }`}>
      <Calendar className="w-3 h-3" />
      {overdue ? "Scaduto" : today ? "Oggi" : tomorrow ? "Domani" : format(d, "d MMM", { locale: it })}
    </span>
  )
}

export default function TodosPage() {
  const { isLoading: authLoading, adminUser } = useAdminAuth()
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [showForm, setShowForm] = useState(false)
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null)
  const [error, setError] = useState("")

  const [form, setForm] = useState({
    title: "",
    description: "",
    priority: "normal" as TodoPriority,
    due_date: "",
    tags: "",
  })

  const loadTodos = useCallback(async () => {
    setLoading(true)
    try {
      const url = filterStatus === "all"
        ? "/api/admin/todos"
        : `/api/admin/todos?status=${filterStatus}`
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setTodos(data.todos || [])
      }
    } catch (e) {
      setError("Errore nel caricamento dei task")
    } finally {
      setLoading(false)
    }
  }, [filterStatus])

  useEffect(() => {
    loadTodos()
  }, [loadTodos])

  const resetForm = () => {
    setForm({ title: "", description: "", priority: "normal", due_date: "", tags: "" })
    setEditingTodo(null)
    setShowForm(false)
    setError("")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) { setError("Titolo obbligatorio"); return }

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      priority: form.priority,
      due_date: form.due_date || undefined,
      tags: form.tags ? form.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
    }

    try {
      const res = await fetch(
        editingTodo ? `/api/admin/todos/${editingTodo.id}` : "/api/admin/todos",
        {
          method: editingTodo ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      )
      if (!res.ok) throw new Error("Errore nel salvataggio")
      await loadTodos()
      resetForm()
    } catch (e: any) {
      setError(e.message)
    }
  }

  const updateStatus = async (todo: Todo, status: TodoStatus) => {
    // Optimistic update
    setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, status } : t))
    try {
      await fetch(`/api/admin/todos/${todo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
    } catch {
      // Revert
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
      due_date: todo.due_date ? todo.due_date.slice(0, 10) : "",
      tags: todo.tags.join(", "),
    })
    setEditingTodo(todo)
    setShowForm(true)
  }

  // Dev/preview: create fake admin user
  const hostname = typeof window !== "undefined" ? window.location.hostname : ""
  const isDevOrPreview = hostname.includes("vusercontent.net") || hostname.includes("localhost") || hostname.includes("vercel.run")
  const effectiveAdminUser = adminUser || (isDevOrPreview ? { id: "dev-user", name: "Dev Admin", email: "dev@hotelaccelerator.local" } : null)

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#f8f7f4] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-[#8b7355]" />
      </div>
    )
  }

  if (!effectiveAdminUser) return null

  // Stats
  const stats = {
    open:        todos.filter(t => t.status === "open").length,
    in_progress: todos.filter(t => t.status === "in_progress").length,
    done:        todos.filter(t => t.status === "done").length,
    urgent:      todos.filter(t => t.priority === "urgent" && t.status !== "done").length,
  }

  const visibleTodos = filterStatus === "all"
    ? todos
    : todos.filter(t => t.status === filterStatus)

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
            { label: "Da fare",  value: stats.open,        color: "border-gray-300" },
            { label: "In corso", value: stats.in_progress, color: "border-blue-300" },
            { label: "Completati",value: stats.done,       color: "border-green-300" },
            { label: "Urgenti",  value: stats.urgent,      color: "border-red-300" },
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
              <div className="flex gap-3">
                <div className="flex-1">
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
                </div>
                <Input
                  type="date"
                  value={form.due_date}
                  onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                  className="text-sm h-9 flex-1"
                />
                <Input
                  placeholder="Tag (virgola)"
                  value={form.tags}
                  onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                  className="text-sm h-9 flex-1"
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

        {/* Filter + refresh bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
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
                {s !== "all" && (
                  <span className="ml-1.5 opacity-70">
                    {todos.filter(t => t.status === s).length}
                  </span>
                )}
              </button>
            ))}
          </div>
          <button
            onClick={loadTodos}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Aggiorna
          </button>
        </div>

        {/* Todo list */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-[#8b7355]" />
          </div>
        ) : visibleTodos.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 py-16 text-center">
            <CheckCircle2 className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-500">
              {filterStatus === "all" ? "Nessun task. Crea il primo." : "Nessun task con questo filtro."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleTodos.map(todo => {
              const statusCfg = STATUS_CONFIG[todo.status]
              const priorityCfg = PRIORITY_CONFIG[todo.priority]
              const StatusIcon = statusCfg.icon
              const isDone = todo.status === "done"

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
                      {/* Priority dot */}
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <span className={`w-2 h-2 rounded-full ${priorityCfg.dot}`} />
                        {priorityCfg.label}
                      </span>

                      {/* Status chip (for non-open) */}
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

                      <DueDateBadge date={todo.due_date} />

                      {/* External source badge */}
                      {todo.external_source && (
                        <span className="text-xs px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded border border-purple-100">
                          {todo.external_source}
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
