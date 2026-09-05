"use client"

import { useEffect, useState } from "react"
import { Loader2, PhoneCall, Plus } from "lucide-react"
import { toast } from "sonner"

import { OmnichannelCompose } from "@/components/admin/inbox/omnichannel-compose"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useAdminAuth } from "@/lib/admin-hooks"

type QuickTaskUser = {
  id: string
  name: string | null
  email: string
}

type TodoPriority = "low" | "normal" | "high" | "urgent"

function QuickPlusButton({ label, onClick, disabled = false }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="h-8 w-8 shrink-0 rounded-md text-muted-foreground hover:border-ha-brand/40 hover:bg-ha-brand-soft hover:text-ha-brand"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      <Plus className="h-4 w-4" />
    </Button>
  )
}

/**
 * Riusa la compose omnicanale completa senza duplicarne logica e regole.
 * Il bottone originale resta il vero trigger accessibile; qui lo rendiamo
 * trasparente e gli sovrapponiamo visivamente il + compatto della dashboard.
 */
export function DashboardMessageQuickAction() {
  return (
    <div className="group relative h-8 w-8 shrink-0" title="Nuovo messaggio">
      <div className="absolute inset-0 overflow-hidden [&>button]:absolute [&>button]:inset-0 [&>button]:z-10 [&>button]:h-8 [&>button]:w-8 [&>button]:min-w-0 [&>button]:rounded-md [&>button]:p-0 [&>button]:opacity-0">
        <OmnichannelCompose />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors group-hover:border-ha-brand/40 group-hover:bg-ha-brand-soft group-hover:text-ha-brand"
      >
        <Plus className="h-4 w-4" />
      </div>
    </div>
  )
}

export function DashboardTaskQuickAction({ onCreated }: { onCreated?: () => void | Promise<void> }) {
  const { adminUser } = useAdminAuth()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [users, setUsers] = useState<QuickTaskUser[]>([])
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState<TodoPriority>("normal")
  const [dueDate, setDueDate] = useState("")
  const [assignee, setAssignee] = useState("")

  const reset = () => {
    setTitle("")
    setDescription("")
    setPriority("normal")
    setDueDate("")
    setAssignee(adminUser?.id || "")
  }

  useEffect(() => {
    if (!open) return
    setAssignee((current) => current || adminUser?.id || "")

    // Per i membri non amministratori questa rotta risponde 403: in quel caso
    // il task viene semplicemente assegnato a se stessi tramite adminUser.id.
    fetch("/api/admin/users", { cache: "no-store" })
      .then(async (res) => (res.ok ? res.json() : null))
      .then((data) => setUsers((data?.users || []) as QuickTaskUser[]))
      .catch(() => setUsers([]))
  }, [open, adminUser?.id])

  const submit = async () => {
    if (!title.trim() || saving) return
    setSaving(true)
    try {
      const res = await fetch("/api/admin/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
          assigned_to: assignee || adminUser?.id || null,
          due_date: dueDate || undefined,
          tags: [],
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Non è stato possibile creare l'attività")

      toast.success("Attività creata")
      setOpen(false)
      reset()
      await onCreated?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Creazione attività non riuscita")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <QuickPlusButton label="Nuova attività" onClick={() => setOpen(true)} />
      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next && !saving) reset() }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuova attività</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="dashboard-quick-task-title">Titolo</Label>
              <Input
                id="dashboard-quick-task-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Cosa c'è da fare?"
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault()
                    void submit()
                  }
                }}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dashboard-quick-task-description">Descrizione</Label>
              <Textarea
                id="dashboard-quick-task-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Dettagli opzionali"
                rows={3}
              />
            </div>

            <div className={`grid gap-3 ${users.length > 0 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
              <div className="space-y-1.5">
                <Label>Priorità</Label>
                <Select value={priority} onValueChange={(value) => setPriority(value as TodoPriority)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Bassa</SelectItem>
                    <SelectItem value="normal">Normale</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                    <SelectItem value="urgent">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="dashboard-quick-task-date">Scadenza</Label>
                <Input
                  id="dashboard-quick-task-date"
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </div>

              {users.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Assegna a</Label>
                  <Select value={assignee || "unassigned"} onValueChange={(value) => setAssignee(value === "unassigned" ? "" : value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Persona" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Non assegnata</SelectItem>
                      {users.map((user) => (
                        <SelectItem key={user.id} value={user.id}>{user.name?.trim() || user.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Annulla</Button>
            <Button type="button" onClick={() => void submit()} disabled={!title.trim() || saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Crea attività
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function DashboardCallQuickAction({ onStarted }: { onStarted?: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [number, setNumber] = useState("")
  const [calling, setCalling] = useState(false)

  const startCall = async () => {
    const destination = number.trim()
    if (!destination || calling) return
    setCalling(true)
    try {
      const res = await fetch("/api/telephony/click-to-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Non è stato possibile avviare la telefonata")

      toast.success(data.message || "Telefonata avviata")
      setNumber("")
      setOpen(false)
      await onStarted?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Avvio telefonata non riuscito")
    } finally {
      setCalling(false)
    }
  }

  return (
    <>
      <QuickPlusButton label="Nuova telefonata" onClick={() => setOpen(true)} />
      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next && !calling) setNumber("") }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuova telefonata</DialogTitle>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <Label htmlFor="dashboard-quick-call-number">Numero da chiamare</Label>
            <Input
              id="dashboard-quick-call-number"
              inputMode="tel"
              value={number}
              onChange={(event) => setNumber(event.target.value)}
              placeholder="+39 e il numero, oppure un interno"
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  void startCall()
                }
              }}
            />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Squilla prima il tuo interno; quando rispondi, il centralino compone il numero indicato.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={calling}>Annulla</Button>
            <Button type="button" onClick={() => void startCall()} disabled={!number.trim() || calling}>
              {calling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PhoneCall className="mr-2 h-4 w-4" />}
              Chiama
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
