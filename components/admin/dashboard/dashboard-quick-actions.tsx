"use client"

import { useEffect, useState } from "react"
import { Loader2, PhoneCall, Plus, Wrench } from "lucide-react"
import { toast } from "sonner"

import { OmnichannelCompose } from "@/components/admin/inbox/omnichannel-compose"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useAdminAuth } from "@/lib/admin-hooks"

type QuickTaskUser = {
  id: string
  name: string | null
  email: string
}

type ManubotTeamMember = {
  id: string
  full_name: string
  email: string
  role: string
}

type ManubotAsset = {
  id: string
  name: string
  location: string
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
  const [manubotActive, setManubotActive] = useState(false)
  const [sendToManubot, setSendToManubot] = useState(false)
  const [manubotLoading, setManubotLoading] = useState(false)
  const [manubotTeam, setManubotTeam] = useState<ManubotTeamMember[]>([])
  const [manubotAssets, setManubotAssets] = useState<ManubotAsset[]>([])
  const [manubotAssignee, setManubotAssignee] = useState("")
  const [manubotAssetId, setManubotAssetId] = useState("")

  const reset = () => {
    setTitle("")
    setDescription("")
    setPriority("normal")
    setDueDate("")
    setAssignee(adminUser?.id || "")
    setSendToManubot(false)
    setManubotTeam([])
    setManubotAssets([])
    setManubotAssignee("")
    setManubotAssetId("")
  }

  useEffect(() => {
    if (!open) return
    setAssignee((current) => current || adminUser?.id || "")

    void Promise.all([
      fetch("/api/admin/users", { cache: "no-store" })
        .then(async (res) => (res.ok ? res.json() : null))
        .then((data) => setUsers((data?.users || []) as QuickTaskUser[]))
        .catch(() => setUsers([])),
      fetch("/api/platform/modules", { cache: "no-store" })
        .then(async (res) => (res.ok ? res.json() : null))
        .then((data) => {
          const activeModules = Array.isArray(data?.activeModules) ? data.activeModules : []
          const active = activeModules.includes("manubot")
          setManubotActive(active)
          if (!active) setSendToManubot(false)
        })
        .catch(() => {
          setManubotActive(false)
          setSendToManubot(false)
        }),
    ])
  }, [open, adminUser?.id])

  useEffect(() => {
    if (!open || !manubotActive || !sendToManubot) return
    let cancelled = false
    setManubotLoading(true)

    void Promise.all([
      fetch("/api/admin/manubot/team", { cache: "no-store" })
        .then(async (res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!cancelled) setManubotTeam((data?.team || []) as ManubotTeamMember[])
        })
        .catch(() => {
          if (!cancelled) setManubotTeam([])
        }),
      fetch("/api/admin/manubot/assets", { cache: "no-store" })
        .then(async (res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!cancelled) setManubotAssets((data?.assets || []) as ManubotAsset[])
        })
        .catch(() => {
          if (!cancelled) setManubotAssets([])
        }),
    ]).finally(() => {
      if (!cancelled) setManubotLoading(false)
    })

    return () => { cancelled = true }
  }, [open, manubotActive, sendToManubot])

  const submit = async () => {
    if (!title.trim() || saving) return
    setSaving(true)
    const shouldSendToManubot = manubotActive && sendToManubot

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
          send_to_manubot: shouldSendToManubot,
          manubot_assigned_to: shouldSendToManubot ? manubotAssignee || null : null,
          manubot_asset_id: shouldSendToManubot ? manubotAssetId || null : null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Non è stato possibile creare l'attività")

      if (shouldSendToManubot && data?.todo?.external_id) {
        toast.success("Attività creata e inoltrata a ManuBot")
      } else if (shouldSendToManubot) {
        toast.warning("Attività creata in HotelAccelerator, ma l'inoltro a ManuBot non è riuscito")
      } else {
        toast.success("Attività creata")
      }

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

            {manubotActive && (
              <div className="rounded-xl border border-ha-brand/20 bg-ha-brand-soft/40 p-3.5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 gap-2.5">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background text-ha-brand shadow-sm">
                      <Wrench className="h-4 w-4" />
                    </div>
                    <div>
                      <Label htmlFor="dashboard-quick-task-manubot" className="cursor-pointer text-sm font-semibold">Inoltra anche a ManuBot</Label>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                        Crea la stessa attività nel modulo manutenzioni del tenant.
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="dashboard-quick-task-manubot"
                    checked={sendToManubot}
                    onCheckedChange={(checked) => {
                      setSendToManubot(checked)
                      if (!checked) {
                        setManubotAssignee("")
                        setManubotAssetId("")
                      }
                    }}
                    aria-label="Inoltra attività a ManuBot"
                  />
                </div>

                {sendToManubot && (
                  <div className="mt-3 border-t border-ha-brand/15 pt-3">
                    {manubotLoading ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carico team e impianti ManuBot…
                      </div>
                    ) : manubotTeam.length > 0 || manubotAssets.length > 0 ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {manubotTeam.length > 0 && (
                          <div className="space-y-1.5">
                            <Label>Tecnico ManuBot</Label>
                            <Select value={manubotAssignee || "unassigned"} onValueChange={(value) => setManubotAssignee(value === "unassigned" ? "" : value)}>
                              <SelectTrigger className="bg-background">
                                <SelectValue placeholder="Opzionale" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="unassigned">Non assegnato</SelectItem>
                                {manubotTeam.map((member) => (
                                  <SelectItem key={member.id} value={member.id}>{member.full_name || member.email}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {manubotAssets.length > 0 && (
                          <div className="space-y-1.5">
                            <Label>Impianto / asset</Label>
                            <Select value={manubotAssetId || "unassigned"} onValueChange={(value) => setManubotAssetId(value === "unassigned" ? "" : value)}>
                              <SelectTrigger className="bg-background">
                                <SelectValue placeholder="Opzionale" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="unassigned">Nessun impianto</SelectItem>
                                {manubotAssets.map((asset) => (
                                  <SelectItem key={asset.id} value={asset.id}>{asset.name}{asset.location ? ` · ${asset.location}` : ""}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        L'attività verrà comunque inoltrata a ManuBot senza tecnico o impianto preassegnati.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Annulla</Button>
            <Button type="button" onClick={() => void submit()} disabled={!title.trim() || saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {sendToManubot && manubotActive ? "Crea e inoltra" : "Crea attività"}
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
