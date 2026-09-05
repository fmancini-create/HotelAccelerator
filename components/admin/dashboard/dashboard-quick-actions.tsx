"use client"

import { useEffect, useMemo, useState } from "react"
import { ImagePlus, Loader2, Paperclip, PhoneCall, Plus, Wrench, X } from "lucide-react"
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

type QuickTaskUser = { id: string; name: string | null; email: string }
type ManubotOperator = { id: string; full_name: string | null }
type ManubotGroup = { id: string; name: string; member_count?: number | null }
type ManubotAsset = { id: string; name: string; location?: string | null; property_id?: string | null }
type ManubotAssetCategory = { id: string; name: string }
type ManubotProperty = { id: string; name: string }
type ManubotProcedure = { id: string; title: string }
type ManubotTaskData = {
  operators: ManubotOperator[]
  operatorGroups: ManubotGroup[]
  assets: ManubotAsset[]
  assetCategories: ManubotAssetCategory[]
  properties: ManubotProperty[]
  procedures: ManubotProcedure[]
}
type UploadedManubotPhoto = { url: string; filename: string; size: number; type: string }
type TodoPriority = "low" | "normal" | "high" | "urgent"

const MANUBOT_ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])
const MANUBOT_MAX_PHOTOS = 5
const MANUBOT_MAX_PHOTO_BYTES = 10 * 1024 * 1024
const MANUBOT_MAX_TOTAL_BYTES = 25 * 1024 * 1024

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
  const [manubotError, setManubotError] = useState("")
  const [manubotData, setManubotData] = useState<ManubotTaskData | null>(null)
  const [manubotResponsible, setManubotResponsible] = useState("")
  const [manubotTarget, setManubotTarget] = useState("")
  const [manubotPropertyId, setManubotPropertyId] = useState("")
  const [manubotProcedureId, setManubotProcedureId] = useState("")
  const [expectedResolutionMinutes, setExpectedResolutionMinutes] = useState("60")
  const [requiresCompletionPhoto, setRequiresCompletionPhoto] = useState(false)
  const [photos, setPhotos] = useState<File[]>([])

  const selectedAsset = useMemo(() => {
    if (!manubotTarget.startsWith("asset:")) return null
    return manubotData?.assets.find((asset) => asset.id === manubotTarget.slice("asset:".length)) ?? null
  }, [manubotData, manubotTarget])

  const reset = () => {
    setTitle("")
    setDescription("")
    setPriority("normal")
    setDueDate("")
    setAssignee(adminUser?.id || "")
    setSendToManubot(false)
    setManubotActive(false)
    setManubotLoading(false)
    setManubotError("")
    setManubotData(null)
    setManubotResponsible("")
    setManubotTarget("")
    setManubotPropertyId("")
    setManubotProcedureId("")
    setExpectedResolutionMinutes("60")
    setRequiresCompletionPhoto(false)
    setPhotos([])
  }

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setAssignee((current) => current || adminUser?.id || "")
    setManubotLoading(true)
    setManubotError("")

    void Promise.all([
      fetch("/api/admin/users", { cache: "no-store" })
        .then(async (res) => (res.ok ? res.json() : null))
        .then((data) => { if (!cancelled) setUsers((data?.users || []) as QuickTaskUser[]) })
        .catch(() => { if (!cancelled) setUsers([]) }),
      fetch("/api/admin/manubot/task-data", { cache: "no-store" })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}))
          if (cancelled) return

          const active = data?.active === true
          setManubotActive(active)
          if (!active) {
            setSendToManubot(false)
            setManubotData(null)
            return
          }

          if (!res.ok) {
            setManubotError(data.message || data.error || "ManuBot non disponibile")
            setManubotData(null)
            return
          }

          const taskData = data as ManubotTaskData
          setManubotData({
            operators: taskData.operators || [],
            operatorGroups: taskData.operatorGroups || [],
            assets: taskData.assets || [],
            assetCategories: taskData.assetCategories || [],
            properties: taskData.properties || [],
            procedures: taskData.procedures || [],
          })
          if ((taskData.properties || []).length === 1) setManubotPropertyId(taskData.properties[0].id)
        })
        .catch(() => {
          if (!cancelled) {
            setManubotActive(false)
            setSendToManubot(false)
            setManubotData(null)
          }
        })
        .finally(() => { if (!cancelled) setManubotLoading(false) }),
    ])

    return () => { cancelled = true }
  }, [open, adminUser?.id])

  const onManubotTargetChange = (value: string) => {
    const next = value === "none" ? "" : value
    setManubotTarget(next)
    if (next.startsWith("asset:")) {
      const asset = manubotData?.assets.find((item) => item.id === next.slice("asset:".length))
      if (asset?.property_id) setManubotPropertyId(asset.property_id)
    }
  }

  const addPhotos = (files: FileList | null) => {
    const picked = Array.from(files || [])
    if (!picked.length) return
    const next = [...photos, ...picked]

    if (next.length > MANUBOT_MAX_PHOTOS) {
      toast.error(`ManuBot consente massimo ${MANUBOT_MAX_PHOTOS} foto per intervento`)
      return
    }
    if (next.some((file) => !MANUBOT_ALLOWED_PHOTO_TYPES.has(file.type))) {
      toast.error("Formato non compatibile con ManuBot: usa JPEG, PNG o WebP")
      return
    }
    if (next.some((file) => file.size <= 0 || file.size > MANUBOT_MAX_PHOTO_BYTES)) {
      toast.error("Ogni foto ManuBot può pesare al massimo 10 MB")
      return
    }
    if (next.reduce((sum, file) => sum + file.size, 0) > MANUBOT_MAX_TOTAL_BYTES) {
      toast.error("Le foto ManuBot possono pesare al massimo 25 MB complessivi")
      return
    }
    setPhotos(next)
  }

  const uploadPhotos = async (): Promise<UploadedManubotPhoto[]> => {
    if (photos.length === 0) return []
    const form = new FormData()
    photos.forEach((file) => form.append("files", file))
    const res = await fetch("/api/admin/manubot/task-photos", { method: "POST", body: form })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || "Upload foto ManuBot non riuscito")
    return Array.isArray(data.photos) ? data.photos : []
  }

  const parsedResponsible = () => {
    if (manubotResponsible.startsWith("operator:")) {
      return { assigneeIds: [manubotResponsible.slice("operator:".length)], groupIds: [] as string[] }
    }
    if (manubotResponsible.startsWith("group:")) {
      return { assigneeIds: [] as string[], groupIds: [manubotResponsible.slice("group:".length)] }
    }
    return { assigneeIds: [] as string[], groupIds: [] as string[] }
  }

  const parsedTarget = () => {
    if (manubotTarget.startsWith("asset:")) {
      return { assetIds: [manubotTarget.slice("asset:".length)], assetCategoryId: null }
    }
    if (manubotTarget.startsWith("category:")) {
      return { assetIds: [] as string[], assetCategoryId: manubotTarget.slice("category:".length) }
    }
    return { assetIds: [] as string[], assetCategoryId: null }
  }

  const canCreate = (() => {
    if (!title.trim() || saving) return false
    if (!sendToManubot) return true
    const minutes = Number(expectedResolutionMinutes)
    return Boolean(manubotData && manubotResponsible && Number.isInteger(minutes) && minutes >= 5 && minutes <= 1440)
  })()

  const submit = async () => {
    if (!canCreate) {
      if (sendToManubot && !manubotResponsible) toast.error("Scegli un responsabile ManuBot")
      return
    }

    setSaving(true)
    try {
      const shouldSendToManubot = manubotActive && sendToManubot
      const uploadedPhotos = shouldSendToManubot ? await uploadPhotos() : []
      const responsible = parsedResponsible()
      const target = parsedTarget()

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
          manubot_assignee_ids: responsible.assigneeIds,
          manubot_group_ids: responsible.groupIds,
          manubot_asset_ids: target.assetIds,
          manubot_asset_category_id: target.assetCategoryId,
          manubot_property_id: selectedAsset?.property_id || manubotPropertyId || null,
          manubot_photos: uploadedPhotos,
          manubot_procedure_ids: manubotProcedureId ? [manubotProcedureId] : [],
          manubot_requires_completion_photo: requiresCompletionPhoto,
          manubot_expected_resolution_minutes: Number(expectedResolutionMinutes),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Non è stato possibile creare l'attività")

      if (shouldSendToManubot && data.manubot_synced === true) {
        toast.success("Attività creata in HotelAccelerator e ManuBot")
      } else if (shouldSendToManubot) {
        toast.warning("Attività salvata in HotelAccelerator, ma ManuBot non ha confermato la sincronizzazione")
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
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Nuova attività</DialogTitle></DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="dashboard-quick-task-title">Titolo</Label>
              <Input id="dashboard-quick-task-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Cosa c'è da fare?" autoFocus />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dashboard-quick-task-description">Descrizione</Label>
              <Textarea id="dashboard-quick-task-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Dettagli opzionali" rows={3} />
            </div>

            <div className={`grid gap-3 ${users.length > 0 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
              <div className="space-y-1.5">
                <Label>Priorità</Label>
                <Select value={priority} onValueChange={(value) => setPriority(value as TodoPriority)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
                <Input id="dashboard-quick-task-date" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
              </div>

              {users.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Assegna in HotelAccelerator</Label>
                  <Select value={assignee || "unassigned"} onValueChange={(value) => setAssignee(value === "unassigned" ? "" : value)}>
                    <SelectTrigger><SelectValue placeholder="Persona" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Non assegnata</SelectItem>
                      {users.map((user) => <SelectItem key={user.id} value={user.id}>{user.name?.trim() || user.email}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {manubotActive && (
              <div className="rounded-xl border border-ha-brand/25 bg-ha-brand-soft/35 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 gap-2.5">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background text-ha-brand shadow-sm">
                      <Wrench className="h-4 w-4" />
                    </div>
                    <div>
                      <Label htmlFor="dashboard-task-manubot" className="cursor-pointer text-sm font-semibold">Inoltra anche a ManuBot</Label>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">Usa operatori, asset, procedure e allegati reali del ManuBot di questo tenant.</p>
                    </div>
                  </div>
                  <Switch
                    id="dashboard-task-manubot"
                    checked={sendToManubot}
                    onCheckedChange={(checked) => {
                      setSendToManubot(checked)
                      if (!checked) {
                        setManubotResponsible("")
                        setManubotTarget("")
                        setManubotProcedureId("")
                        setPhotos([])
                        setRequiresCompletionPhoto(false)
                      }
                    }}
                  />
                </div>

                {sendToManubot && (
                  <div className="mt-4 border-t border-ha-brand/15 pt-4">
                    {manubotLoading ? (
                      <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carico configurazione ManuBot…</div>
                    ) : manubotError ? (
                      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{manubotError}</div>
                    ) : manubotData ? (
                      <div className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label>Responsabile ManuBot *</Label>
                            <Select value={manubotResponsible || "none"} onValueChange={(value) => setManubotResponsible(value === "none" ? "" : value)}>
                              <SelectTrigger className="bg-background"><SelectValue placeholder="Tecnico o gruppo" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Seleziona responsabile</SelectItem>
                                {manubotData.operators.map((operator) => (
                                  <SelectItem key={`operator-${operator.id}`} value={`operator:${operator.id}`}>{operator.full_name || "Operatore ManuBot"}</SelectItem>
                                ))}
                                {manubotData.operatorGroups.map((group) => (
                                  <SelectItem key={`group-${group.id}`} value={`group:${group.id}`} disabled={group.member_count === 0}>
                                    Gruppo · {group.name}{group.member_count === 0 ? " (senza membri)" : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-1.5">
                            <Label>Asset / categoria</Label>
                            <Select value={manubotTarget || "none"} onValueChange={onManubotTargetChange}>
                              <SelectTrigger className="bg-background"><SelectValue placeholder="Opzionale" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Nessun asset specifico</SelectItem>
                                {manubotData.assets.map((asset) => (
                                  <SelectItem key={`asset-${asset.id}`} value={`asset:${asset.id}`}>{asset.name}{asset.location ? ` · ${asset.location}` : ""}</SelectItem>
                                ))}
                                {manubotData.assetCategories.map((category) => (
                                  <SelectItem key={`category-${category.id}`} value={`category:${category.id}`}>Categoria · {category.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                          {manubotData.properties.length > 1 && !selectedAsset?.property_id && (
                            <div className="space-y-1.5">
                              <Label>Sede ManuBot</Label>
                              <Select value={manubotPropertyId || "none"} onValueChange={(value) => setManubotPropertyId(value === "none" ? "" : value)}>
                                <SelectTrigger className="bg-background"><SelectValue placeholder="Sede" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">Automatica</SelectItem>
                                  {manubotData.properties.map((property) => <SelectItem key={property.id} value={property.id}>{property.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                          )}

                          <div className="space-y-1.5">
                            <Label>Procedura</Label>
                            <Select value={manubotProcedureId || "none"} onValueChange={(value) => setManubotProcedureId(value === "none" ? "" : value)}>
                              <SelectTrigger className="bg-background"><SelectValue placeholder="Opzionale" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Nessuna procedura</SelectItem>
                                {manubotData.procedures.map((procedure) => <SelectItem key={procedure.id} value={procedure.id}>{procedure.title}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-1.5">
                            <Label htmlFor="dashboard-manubot-resolution">Tempo stimato *</Label>
                            <div className="relative">
                              <Input id="dashboard-manubot-resolution" type="number" min={5} max={1440} step={5} value={expectedResolutionMinutes} onChange={(event) => setExpectedResolutionMinutes(event.target.value)} className="bg-background pr-12" />
                              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">min</span>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-lg border bg-background/70 p-3">
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <Label htmlFor="dashboard-manubot-completion-photo" className="cursor-pointer text-sm">Richiedi foto alla chiusura</Label>
                              <p className="mt-0.5 text-xs text-muted-foreground">L'operatore non potrà chiudere l'intervento senza una foto finale.</p>
                            </div>
                            <Switch id="dashboard-manubot-completion-photo" checked={requiresCompletionPhoto} onCheckedChange={setRequiresCompletionPhoto} />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center gap-2"><Paperclip className="h-4 w-4 text-ha-brand" /><Label htmlFor="dashboard-manubot-photos">Foto / allegati ManuBot</Label></div>
                          <Input
                            id="dashboard-manubot-photos"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            multiple
                            className="bg-background file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium"
                            onChange={(event) => {
                              addPhotos(event.currentTarget.files)
                              event.currentTarget.value = ""
                            }}
                          />
                          <p className="text-[11px] text-muted-foreground">Stessi limiti del form ManuBot: fino a 5 immagini JPEG/PNG/WebP, max 10 MB ciascuna e 25 MB totali.</p>

                          {photos.length > 0 && (
                            <div className="grid gap-2 sm:grid-cols-2">
                              {photos.map((file, index) => (
                                <div key={`${file.name}-${file.size}-${index}`} className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs">
                                  <ImagePlus className="h-3.5 w-3.5 shrink-0 text-ha-brand" />
                                  <span className="min-w-0 flex-1 truncate" title={file.name}>{file.name}</span>
                                  <span className="shrink-0 text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                                  <button type="button" className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Rimuovi ${file.name}`} onClick={() => setPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index))}>
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Annulla</Button>
            <Button type="button" onClick={() => void submit()} disabled={!canCreate}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {sendToManubot ? "Crea e inoltra" : "Crea attività"}
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
          <DialogHeader><DialogTitle>Nuova telefonata</DialogTitle></DialogHeader>
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
            <p className="text-xs leading-relaxed text-muted-foreground">Squilla prima il tuo interno; quando rispondi, il centralino compone il numero indicato.</p>
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
