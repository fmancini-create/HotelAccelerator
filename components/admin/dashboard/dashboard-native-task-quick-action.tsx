"use client"

import { useEffect, useMemo, useState } from "react"
import { ImagePlus, Loader2, Paperclip, Plus, Wrench, X } from "lucide-react"
import { toast } from "sonner"

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
  active?: boolean
  operators: ManubotOperator[]
  operatorGroups: ManubotGroup[]
  assets: ManubotAsset[]
  assetCategories: ManubotAssetCategory[]
  properties: ManubotProperty[]
  procedures: ManubotProcedure[]
}
type UploadedManubotPhoto = { url: string; filename: string; size: number; type: string }
type TodoPriority = "low" | "normal" | "high" | "urgent"

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])
const MAX_PHOTOS = 5
const MAX_PHOTO_BYTES = 10 * 1024 * 1024
const MAX_TOTAL_BYTES = 25 * 1024 * 1024

export function DashboardNativeTaskQuickAction({ onCreated }: { onCreated?: () => void | Promise<void> }) {
  const { adminUser } = useAdminAuth()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [users, setUsers] = useState<QuickTaskUser[]>([])
  const [manubotActive, setManubotActive] = useState(false)
  const [manubotError, setManubotError] = useState("")
  const [manubotData, setManubotData] = useState<ManubotTaskData | null>(null)

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState<TodoPriority>("normal")
  const [dueDate, setDueDate] = useState("")
  const [assignee, setAssignee] = useState("")
  const [responsible, setResponsible] = useState("")
  const [target, setTarget] = useState("")
  const [propertyId, setPropertyId] = useState("")
  const [procedureId, setProcedureId] = useState("")
  const [expectedResolutionMinutes, setExpectedResolutionMinutes] = useState("60")
  const [requiresCompletionPhoto, setRequiresCompletionPhoto] = useState(false)
  const [photos, setPhotos] = useState<File[]>([])

  const selectedAsset = useMemo(() => {
    if (!target.startsWith("asset:")) return null
    return manubotData?.assets.find((asset) => asset.id === target.slice("asset:".length)) ?? null
  }, [manubotData, target])

  const reset = () => {
    setTitle("")
    setDescription("")
    setPriority("normal")
    setDueDate("")
    setAssignee(adminUser?.id || "")
    setResponsible("")
    setTarget("")
    setPropertyId("")
    setProcedureId("")
    setExpectedResolutionMinutes("60")
    setRequiresCompletionPhoto(false)
    setPhotos([])
    setManubotError("")
    setManubotData(null)
    setManubotActive(false)
  }

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setAssignee((current) => current || adminUser?.id || "")

    void Promise.all([
      fetch("/api/admin/users", { cache: "no-store" })
        .then(async (res) => (res.ok ? res.json() : null))
        .then((data) => { if (!cancelled) setUsers((data?.users || []) as QuickTaskUser[]) })
        .catch(() => { if (!cancelled) setUsers([]) }),
      fetch("/api/admin/manubot/task-data", { cache: "no-store" })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}))
          if (cancelled) return
          if (res.status === 404 && data?.error === "module_inactive") {
            setManubotActive(false)
            setManubotData(null)
            return
          }
          if (!res.ok) {
            setManubotActive(true)
            setManubotError(data.message || data.error || "ManuBot non disponibile")
            setManubotData(null)
            return
          }
          const taskData = data as ManubotTaskData
          setManubotActive(taskData.active === true)
          setManubotData({
            ...taskData,
            operators: taskData.operators || [],
            operatorGroups: taskData.operatorGroups || [],
            assets: taskData.assets || [],
            assetCategories: taskData.assetCategories || [],
            properties: taskData.properties || [],
            procedures: taskData.procedures || [],
          })
          if ((taskData.properties || []).length === 1) setPropertyId(taskData.properties[0].id)
        })
        .catch(() => {
          if (!cancelled) {
            setManubotActive(false)
            setManubotData(null)
          }
        }),
    ]).finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [open, adminUser?.id])

  const addPhotos = (files: FileList | null) => {
    const next = [...photos, ...Array.from(files || [])]
    if (next.length > MAX_PHOTOS) return toast.error(`Puoi allegare massimo ${MAX_PHOTOS} foto`)
    if (next.some((file) => !ALLOWED_TYPES.has(file.type))) return toast.error("Usa immagini JPEG, PNG o WebP")
    if (next.some((file) => file.size <= 0 || file.size > MAX_PHOTO_BYTES)) return toast.error("Ogni foto può pesare al massimo 10 MB")
    if (next.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_BYTES) return toast.error("Gli allegati possono pesare al massimo 25 MB complessivi")
    setPhotos(next)
  }

  const uploadPhotos = async (): Promise<UploadedManubotPhoto[]> => {
    if (photos.length === 0) return []
    const form = new FormData()
    photos.forEach((file) => form.append("files", file))
    const res = await fetch("/api/admin/manubot/task-photos", { method: "POST", body: form })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || "Upload allegati non riuscito")
    return Array.isArray(data.photos) ? data.photos : []
  }

  const parsedResponsible = () => {
    if (responsible.startsWith("operator:")) return { assigneeIds: [responsible.slice(9)], groupIds: [] as string[] }
    if (responsible.startsWith("group:")) return { assigneeIds: [] as string[], groupIds: [responsible.slice(6)] }
    return { assigneeIds: [] as string[], groupIds: [] as string[] }
  }

  const parsedTarget = () => {
    if (target.startsWith("asset:")) return { assetIds: [target.slice(6)], assetCategoryId: null }
    if (target.startsWith("category:")) return { assetIds: [] as string[], assetCategoryId: target.slice(9) }
    return { assetIds: [] as string[], assetCategoryId: null }
  }

  const canCreate = (() => {
    if (!title.trim() || saving || loading) return false
    if (!manubotActive) return true
    const minutes = Number(expectedResolutionMinutes)
    return Boolean(manubotData && responsible && Number.isInteger(minutes) && minutes >= 5 && minutes <= 1440 && !manubotError)
  })()

  const submit = async () => {
    if (!canCreate) {
      if (manubotActive && !responsible) toast.error("Scegli un responsabile")
      return
    }
    setSaving(true)
    try {
      const uploadedPhotos = manubotActive ? await uploadPhotos() : []
      const parsedResp = parsedResponsible()
      const parsedTgt = parsedTarget()
      const res = await fetch("/api/admin/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
          assigned_to: manubotActive ? null : (assignee || adminUser?.id || null),
          due_date: dueDate || undefined,
          tags: manubotActive ? ["manubot"] : [],
          send_to_manubot: manubotActive,
          manubot_assignee_ids: parsedResp.assigneeIds,
          manubot_group_ids: parsedResp.groupIds,
          manubot_asset_ids: parsedTgt.assetIds,
          manubot_asset_category_id: parsedTgt.assetCategoryId,
          manubot_property_id: selectedAsset?.property_id || propertyId || null,
          manubot_photos: uploadedPhotos,
          manubot_procedure_ids: procedureId ? [procedureId] : [],
          manubot_requires_completion_photo: requiresCompletionPhoto,
          manubot_expected_resolution_minutes: Number(expectedResolutionMinutes),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Creazione non riuscita")
      if (manubotActive && data.manubot_synced !== true) throw new Error("ManuBot non ha confermato la creazione dell'intervento")

      toast.success(manubotActive ? "Intervento ManuBot creato" : "Attività creata")
      setOpen(false)
      reset()
      await onCreated?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Creazione non riuscita")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0 rounded-md" aria-label="Nuova attività" title="Nuova attività" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next && !saving) reset() }}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{manubotActive ? "Nuovo intervento" : "Nuova attività"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="native-task-title">Titolo</Label>
              <Input id="native-task-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Cosa c'è da fare?" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="native-task-description">Descrizione</Label>
              <Textarea id="native-task-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Dettagli opzionali" rows={3} />
            </div>

            {loading ? (
              <div className="flex items-center gap-2 rounded-lg border p-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carico configurazione…</div>
            ) : manubotActive ? (
              <div className="space-y-4 rounded-xl border border-ha-brand/25 bg-ha-brand-soft/25 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold"><Wrench className="h-4 w-4 text-ha-brand" /> Intervento ManuBot</div>
                {manubotError ? (
                  <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{manubotError}</div>
                ) : manubotData ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Priorità</Label>
                        <Select value={priority} onValueChange={(value) => setPriority(value as TodoPriority)}>
                          <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">Bassa</SelectItem><SelectItem value="normal">Normale</SelectItem><SelectItem value="high">Alta</SelectItem><SelectItem value="urgent">Urgente</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Responsabile *</Label>
                        <Select value={responsible || "none"} onValueChange={(value) => setResponsible(value === "none" ? "" : value)}>
                          <SelectTrigger className="bg-background"><SelectValue placeholder="Tecnico o gruppo" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Seleziona responsabile</SelectItem>
                            {manubotData.operators.map((operator) => <SelectItem key={operator.id} value={`operator:${operator.id}`}>{operator.full_name || "Operatore"}</SelectItem>)}
                            {manubotData.operatorGroups.map((group) => <SelectItem key={group.id} value={`group:${group.id}`} disabled={group.member_count === 0}>Gruppo · {group.name}{group.member_count === 0 ? " (senza membri)" : ""}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Asset / categoria</Label>
                        <Select value={target || "none"} onValueChange={(value) => {
                          const next = value === "none" ? "" : value
                          setTarget(next)
                          if (next.startsWith("asset:")) {
                            const asset = manubotData.assets.find((item) => item.id === next.slice(6))
                            if (asset?.property_id) setPropertyId(asset.property_id)
                          }
                        }}>
                          <SelectTrigger className="bg-background"><SelectValue placeholder="Opzionale" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Nessun asset specifico</SelectItem>
                            {manubotData.assets.map((asset) => <SelectItem key={asset.id} value={`asset:${asset.id}`}>{asset.name}{asset.location ? ` · ${asset.location}` : ""}</SelectItem>)}
                            {manubotData.assetCategories.map((category) => <SelectItem key={category.id} value={`category:${category.id}`}>Categoria · {category.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Procedura</Label>
                        <Select value={procedureId || "none"} onValueChange={(value) => setProcedureId(value === "none" ? "" : value)}>
                          <SelectTrigger className="bg-background"><SelectValue placeholder="Opzionale" /></SelectTrigger>
                          <SelectContent><SelectItem value="none">Nessuna procedura</SelectItem>{manubotData.procedures.map((procedure) => <SelectItem key={procedure.id} value={procedure.id}>{procedure.title}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      {manubotData.properties.length > 1 && !selectedAsset?.property_id && (
                        <div className="space-y-1.5">
                          <Label>Sede</Label>
                          <Select value={propertyId || "none"} onValueChange={(value) => setPropertyId(value === "none" ? "" : value)}>
                            <SelectTrigger className="bg-background"><SelectValue placeholder="Sede" /></SelectTrigger>
                            <SelectContent><SelectItem value="none">Automatica</SelectItem>{manubotData.properties.map((property) => <SelectItem key={property.id} value={property.id}>{property.name}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                      )}
                      <div className="space-y-1.5">
                        <Label htmlFor="native-task-resolution">Tempo stimato *</Label>
                        <Input id="native-task-resolution" type="number" min={5} max={1440} step={5} value={expectedResolutionMinutes} onChange={(e) => setExpectedResolutionMinutes(e.target.value)} className="bg-background" />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="native-task-date">Scadenza</Label>
                        <Input id="native-task-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="bg-background" />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4 rounded-lg border bg-background/70 p-3">
                      <div><Label htmlFor="native-task-completion-photo" className="cursor-pointer">Richiedi foto alla chiusura</Label><p className="mt-0.5 text-xs text-muted-foreground">L'operatore dovrà allegare una foto prima di chiudere.</p></div>
                      <Switch id="native-task-completion-photo" checked={requiresCompletionPhoto} onCheckedChange={setRequiresCompletionPhoto} />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2"><Paperclip className="h-4 w-4 text-ha-brand" /><Label htmlFor="native-task-photos">Foto / allegati</Label></div>
                      <Input id="native-task-photos" type="file" accept="image/jpeg,image/png,image/webp" multiple className="bg-background" onChange={(event) => { addPhotos(event.currentTarget.files); event.currentTarget.value = "" }} />
                      {photos.length > 0 && <div className="grid gap-2 sm:grid-cols-2">{photos.map((file, index) => <div key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs"><ImagePlus className="h-3.5 w-3.5 text-ha-brand" /><span className="min-w-0 flex-1 truncate">{file.name}</span><button type="button" aria-label={`Rimuovi ${file.name}`} onClick={() => setPhotos((current) => current.filter((_, i) => i !== index))}><X className="h-3.5 w-3.5" /></button></div>)}</div>}
                    </div>
                  </>
                ) : null}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5"><Label>Priorità</Label><Select value={priority} onValueChange={(value) => setPriority(value as TodoPriority)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Bassa</SelectItem><SelectItem value="normal">Normale</SelectItem><SelectItem value="high">Alta</SelectItem><SelectItem value="urgent">Urgente</SelectItem></SelectContent></Select></div>
                <div className="space-y-1.5"><Label htmlFor="native-ha-date">Scadenza</Label><Input id="native-ha-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
                {users.length > 0 && <div className="space-y-1.5"><Label>Assegna a</Label><Select value={assignee || "unassigned"} onValueChange={(value) => setAssignee(value === "unassigned" ? "" : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unassigned">Non assegnata</SelectItem>{users.map((user) => <SelectItem key={user.id} value={user.id}>{user.name?.trim() || user.email}</SelectItem>)}</SelectContent></Select></div>}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Annulla</Button>
            <Button type="button" onClick={() => void submit()} disabled={!canCreate}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{manubotActive ? "Crea intervento" : "Crea attività"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
