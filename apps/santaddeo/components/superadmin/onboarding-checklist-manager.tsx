"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  X,
  Rocket,
  AlertTriangle,
} from "lucide-react"

type Checklist = {
  id: string
  subscription_id: string
  hotel_id: string
  status: "pending" | "in_progress" | "awaiting_review" | "configuring" | "live"
  notes: string | null
  configuration_started_at: string | null
  went_live_at: string | null
}

type Task = {
  id: string
  checklist_id: string
  template_id: string | null
  title: string
  description: string | null
  category: string | null
  task_order: number
  due_date: string | null
  status: "todo" | "completed" | "approved" | "rejected"
  rejection_reason: string | null
  completed_at: string | null
  approved_at: string | null
}

type Template = {
  id: string
  title: string
  description: string | null
  category: string | null
  default_order: number
  is_active: boolean
}

const STATUS_LABEL: Record<Checklist["status"], { label: string; color: string }> = {
  pending: { label: "Da iniziare", color: "bg-zinc-100 text-zinc-700" },
  in_progress: { label: "In corso", color: "bg-blue-100 text-blue-700" },
  awaiting_review: { label: "In revisione", color: "bg-amber-100 text-amber-800" },
  configuring: { label: "Configurazione in corso", color: "bg-indigo-100 text-indigo-700" },
  live: { label: "LIVE", color: "bg-emerald-100 text-emerald-700" },
}

interface Props {
  subscriptionId?: string
  hotelId: string
  isSuperAdmin: boolean
}

export function OnboardingChecklistManager({ subscriptionId, hotelId, isSuperAdmin }: Props) {
  const [loading, setLoading] = useState(true)
  const [checklist, setChecklist] = useState<Checklist | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [busy, setBusy] = useState(false)

  // Init dialog (super_admin)
  const [initOpen, setInitOpen] = useState(false)
  const [selectedTpl, setSelectedTpl] = useState<Set<string>>(new Set())

  // Add custom task dialog (super_admin)
  const [customOpen, setCustomOpen] = useState(false)
  const [customTask, setCustomTask] = useState<{
    title: string
    description: string
    category: string
    due_date: string
  }>({ title: "", description: "", category: "", due_date: "" })

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/onboarding/checklist?hotel_id=${hotelId}`, {
        cache: "no-store",
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setChecklist(data.checklist)
        setTasks(data.tasks || [])
      }
    } finally {
      setLoading(false)
    }
  }, [hotelId])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    if (!isSuperAdmin) return
    fetch("/api/superadmin/onboarding-templates", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setTemplates(d.templates || []))
      .catch(() => {})
  }, [isSuperAdmin])

  const totalTasks = tasks.length
  const approvedTasks = tasks.filter((t) => t.status === "approved").length
  const completedNotApproved = tasks.filter((t) => t.status === "completed").length
  const allApproved = totalTasks > 0 && approvedTasks === totalTasks

  async function createChecklist() {
    if (!subscriptionId) return
    setBusy(true)
    try {
      const res = await fetch("/api/onboarding/checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription_id: subscriptionId,
          template_ids: Array.from(selectedTpl),
        }),
      })
      if (!res.ok) {
        alert("Errore inizializzazione checklist")
      } else {
        setInitOpen(false)
        setSelectedTpl(new Set())
        await reload()
      }
    } finally {
      setBusy(false)
    }
  }

  async function patchTask(id: string, body: Record<string, unknown>) {
    setBusy(true)
    try {
      const res = await fetch(`/api/onboarding/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const txt = await res.text().catch(() => "")
        alert("Errore: " + txt)
      }
      await reload()
    } finally {
      setBusy(false)
    }
  }

  async function deleteTask(id: string) {
    if (!confirm("Eliminare questo task?")) return
    setBusy(true)
    try {
      await fetch(`/api/onboarding/tasks/${id}`, { method: "DELETE" })
      await reload()
    } finally {
      setBusy(false)
    }
  }

  async function addCustomTask() {
    if (!checklist?.id || !customTask.title) return
    setBusy(true)
    try {
      const res = await fetch("/api/onboarding/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checklist_id: checklist.id,
          title: customTask.title,
          description: customTask.description || null,
          category: customTask.category || null,
          due_date: customTask.due_date || null,
        }),
      })
      if (!res.ok) {
        alert("Errore aggiunta task")
      } else {
        setCustomOpen(false)
        setCustomTask({ title: "", description: "", category: "", due_date: "" })
        await reload()
      }
    } finally {
      setBusy(false)
    }
  }

  async function setChecklistAction(action: "go_configuring" | "go_live") {
    if (!checklist?.id) return
    if (action === "go_live" && !confirm("Confermare go-live? Questa azione marca la struttura come attiva.")) return
    setBusy(true)
    try {
      const res = await fetch("/api/onboarding/checklist", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checklist_id: checklist.id, action }),
      })
      if (!res.ok) alert("Errore")
      await reload()
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Caricamento checklist...
      </div>
    )
  }

  // Nessuna checklist ancora creata
  if (!checklist) {
    if (!isSuperAdmin) {
      return (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>La checklist post-firma non &egrave; ancora stata creata.</p>
            <p className="text-sm">Sar&agrave; il consulente a inviartela non appena pronta.</p>
          </CardContent>
        </Card>
      )
    }
    return (
      <Card>
        <CardHeader>
          <CardTitle>Inizializza onboarding</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Crea la checklist di onboarding per questa subscription. Seleziona i template che
            vuoi includere come punto di partenza.
          </p>
          <Button onClick={() => setInitOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Crea checklist
          </Button>
        </CardContent>

        <Dialog open={initOpen} onOpenChange={setInitOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Seleziona template</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              {templates.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Nessun template disponibile. Vai su <em>SuperAdmin &gt; Onboarding Templates</em>.
                </p>
              )}
              {templates.map((t) => {
                const checked = selectedTpl.has(t.id)
                return (
                  <label
                    key={t.id}
                    className="flex items-start gap-3 p-3 border rounded cursor-pointer hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked}
                      onChange={(e) => {
                        const next = new Set(selectedTpl)
                        if (e.target.checked) next.add(t.id)
                        else next.delete(t.id)
                        setSelectedTpl(next)
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{t.title}</span>
                        {t.category && <Badge variant="secondary">{t.category}</Badge>}
                      </div>
                      {t.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                      )}
                    </div>
                  </label>
                )
              })}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInitOpen(false)} disabled={busy}>
                Annulla
              </Button>
              <Button onClick={createChecklist} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crea checklist"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Card>
    )
  }

  // Checklist esistente
  const statusInfo = STATUS_LABEL[checklist.status]

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Badge className={`${statusInfo.color} hover:${statusInfo.color}`}>
              {statusInfo.label}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {approvedTasks}/{totalTasks} approvati
              {completedNotApproved > 0 && ` (${completedNotApproved} in attesa di revisione)`}
            </span>
          </div>
          {isSuperAdmin && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setCustomOpen(true)} disabled={busy}>
                <Plus className="h-4 w-4 mr-1" /> Aggiungi task
              </Button>
              {checklist.status !== "configuring" && checklist.status !== "live" && (
                <Button
                  size="sm"
                  onClick={() => setChecklistAction("go_configuring")}
                  disabled={busy || !allApproved}
                  title={
                    !allApproved
                      ? "Tutti i task devono essere approvati prima di avviare la configurazione"
                      : ""
                  }
                >
                  <ShieldCheck className="h-4 w-4 mr-1" /> Avvia configurazione
                </Button>
              )}
              {checklist.status === "configuring" && (
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => setChecklistAction("go_live")}
                  disabled={busy}
                >
                  <Rocket className="h-4 w-4 mr-1" /> Vai LIVE
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-2">
        {tasks.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            isSuperAdmin={isSuperAdmin}
            disabled={busy}
            onComplete={() => patchTask(t.id, { action: "complete" })}
            onUncomplete={() => patchTask(t.id, { action: "uncomplete" })}
            onApprove={() => patchTask(t.id, { action: "approve" })}
            onReject={(reason) => patchTask(t.id, { action: "reject", rejection_reason: reason })}
            onDelete={() => deleteTask(t.id)}
          />
        ))}
        {tasks.length === 0 && (
          <p className="text-sm text-muted-foreground">Nessun task ancora aggiunto.</p>
        )}
      </div>

      {/* Add custom task */}
      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aggiungi task</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Titolo</Label>
              <Input
                value={customTask.title}
                onChange={(e) => setCustomTask({ ...customTask, title: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Descrizione</Label>
              <Textarea
                value={customTask.description}
                onChange={(e) => setCustomTask({ ...customTask, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Input
                  value={customTask.category}
                  onChange={(e) => setCustomTask({ ...customTask, category: e.target.value })}
                  placeholder="documenti, tecnico, ..."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Scadenza</Label>
                <Input
                  type="date"
                  value={customTask.due_date}
                  onChange={(e) => setCustomTask({ ...customTask, due_date: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomOpen(false)} disabled={busy}>
              Annulla
            </Button>
            <Button onClick={addCustomTask} disabled={busy || !customTask.title}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aggiungi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TaskRow({
  task,
  isSuperAdmin,
  disabled,
  onComplete,
  onUncomplete,
  onApprove,
  onReject,
  onDelete,
}: {
  task: Task
  isSuperAdmin: boolean
  disabled: boolean
  onComplete: () => void
  onUncomplete: () => void
  onApprove: () => void
  onReject: (reason: string) => void
  onDelete: () => void
}) {
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState("")

  let icon = <Circle className="h-5 w-5 text-zinc-400" />
  let badge: React.ReactNode = null
  if (task.status === "completed") {
    icon = <CheckCircle2 className="h-5 w-5 text-amber-500" />
    badge = <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">In revisione</Badge>
  } else if (task.status === "approved") {
    icon = <CheckCircle2 className="h-5 w-5 text-emerald-600" />
    badge = <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Approvato</Badge>
  } else if (task.status === "rejected") {
    icon = <AlertTriangle className="h-5 w-5 text-red-500" />
    badge = <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Da rifare</Badge>
  }

  return (
    <Card>
      <CardContent className="py-3 flex items-start gap-3">
        <div className="pt-0.5">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{task.title}</span>
            {task.category && <Badge variant="secondary">{task.category}</Badge>}
            {badge}
            {task.due_date && (
              <span className="text-xs text-muted-foreground">
                scadenza {new Date(task.due_date).toLocaleDateString("it-IT")}
              </span>
            )}
          </div>
          {task.description && (
            <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
          )}
          {task.status === "rejected" && task.rejection_reason && (
            <p className="text-sm text-red-600 mt-1">
              <strong>Motivo rifiuto:</strong> {task.rejection_reason}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          {/* Tenant actions */}
          {!isSuperAdmin && task.status !== "approved" && (
            <Button
              variant={task.status === "completed" ? "outline" : "default"}
              size="sm"
              disabled={disabled}
              onClick={task.status === "completed" ? onUncomplete : onComplete}
            >
              {task.status === "completed" ? "Annulla completamento" : "Segna completata"}
            </Button>
          )}
          {/* SuperAdmin actions */}
          {isSuperAdmin && (
            <div className="flex items-center gap-1">
              {task.status === "completed" && (
                <>
                  <Button size="sm" disabled={disabled} onClick={onApprove}>
                    Approva
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={disabled}
                    onClick={() => setRejectOpen(true)}
                  >
                    Rimanda
                  </Button>
                </>
              )}
              {task.status === "approved" && (
                <Button variant="ghost" size="sm" disabled={disabled} onClick={onUncomplete}>
                  <X className="h-4 w-4 mr-1" /> Riapri
                </Button>
              )}
              <Button variant="ghost" size="icon" disabled={disabled} onClick={onDelete}>
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          )}
        </div>

        <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rimanda task al tenant</DialogTitle>
            </DialogHeader>
            <Textarea
              placeholder="Motivo del rifiuto..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectOpen(false)}>
                Annulla
              </Button>
              <Button
                onClick={() => {
                  onReject(reason)
                  setRejectOpen(false)
                  setReason("")
                }}
                disabled={!reason.trim()}
              >
                Conferma
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
