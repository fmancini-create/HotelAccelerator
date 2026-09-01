"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Building2, GripVertical, Loader2, Plus, Save, Settings2, Trash2, Users } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type Group = { id: string; name: string; color: string | null }
type Stage = { id?: string; stage_key: string; name: string; category: "open" | "won" | "lost"; color: string | null; sort_order: number }
type Field = { id?: string; field_key: string; label: string; field_type: "text" | "number" | "date" | "select" | "boolean"; options: string[]; is_required: boolean; sort_order: number }
type Workspace = {
  id: string
  name: string
  slug: string
  kind: "hotel" | "spa" | "restaurant" | "company" | "agency" | "sales" | "custom"
  description: string | null
  color: string | null
  mode: "generic" | "hotel_date_requests"
  is_default: boolean
  is_active: boolean
  sort_order: number
  groupIds: string[]
  pipeline: { id: string; name: string; stages: Stage[] } | null
  fields: Field[]
}
type ResponseData = { propertyType: string; canConfigure: boolean; groups: Group[]; workspaces: Workspace[] }
type DraftStage = { stageKey: string; name: string; category: "open" | "won" | "lost"; color: string | null; sortOrder: number }
type DraftField = { fieldKey: string; label: string; fieldType: "text" | "number" | "date" | "select" | "boolean"; optionsText: string; isRequired: boolean; sortOrder: number }
type Draft = {
  id?: string
  name: string
  slug: string
  kind: Workspace["kind"]
  description: string
  color: string
  mode: Workspace["mode"]
  isDefault: boolean
  isActive: boolean
  sortOrder: number
  groupIds: string[]
  stages: DraftStage[]
  fields: DraftField[]
}

const GENERIC_STAGES: DraftStage[] = [
  { stageKey: "nuovo", name: "Nuovo", category: "open", color: null, sortOrder: 10 },
  { stageKey: "in_lavorazione", name: "In lavorazione", category: "open", color: null, sortOrder: 20 },
  { stageKey: "concluso", name: "Concluso", category: "won", color: null, sortOrder: 30 },
  { stageKey: "perso", name: "Perso", category: "lost", color: null, sortOrder: 40 },
]

const TEMPLATES: Record<string, Array<{ name: string; kind: Workspace["kind"]; stages: DraftStage[]; fields: DraftField[] }>> = {
  hotel: [
    {
      name: "SPA",
      kind: "spa",
      stages: [
        { stageKey: "richiesta", name: "Richiesta", category: "open", color: null, sortOrder: 10 },
        { stageKey: "da_ricontattare", name: "Da ricontattare", category: "open", color: null, sortOrder: 20 },
        { stageKey: "proposta", name: "Proposta trattamento", category: "open", color: null, sortOrder: 30 },
        { stageKey: "prenotato", name: "Prenotato", category: "won", color: null, sortOrder: 40 },
        { stageKey: "perso", name: "Perso", category: "lost", color: null, sortOrder: 50 },
      ],
      fields: [
        { fieldKey: "trattamento", label: "Trattamento", fieldType: "text", optionsText: "", isRequired: false, sortOrder: 10 },
        { fieldKey: "data_orario", label: "Data/orario", fieldType: "date", optionsText: "", isRequired: false, sortOrder: 20 },
      ],
    },
    {
      name: "Ristorante",
      kind: "restaurant",
      stages: [
        { stageKey: "richiesta", name: "Richiesta", category: "open", color: null, sortOrder: 10 },
        { stageKey: "disponibilita", name: "Disponibilità verificata", category: "open", color: null, sortOrder: 20 },
        { stageKey: "proposta", name: "Proposta", category: "open", color: null, sortOrder: 30 },
        { stageKey: "prenotato", name: "Prenotato", category: "won", color: null, sortOrder: 40 },
        { stageKey: "perso", name: "Perso", category: "lost", color: null, sortOrder: 50 },
      ],
      fields: [
        { fieldKey: "coperti", label: "Coperti", fieldType: "number", optionsText: "", isRequired: false, sortOrder: 10 },
        { fieldKey: "occasione", label: "Occasione", fieldType: "text", optionsText: "", isRequired: false, sortOrder: 20 },
      ],
    },
    { name: "Eventi", kind: "custom", stages: GENERIC_STAGES, fields: [] },
  ],
  company: [
    { name: "Vendite", kind: "sales", stages: [
      { stageKey: "nuovo", name: "Nuovo prospect", category: "open", color: null, sortOrder: 10 },
      { stageKey: "contatto", name: "Contattato", category: "open", color: null, sortOrder: 20 },
      { stageKey: "demo", name: "Demo", category: "open", color: null, sortOrder: 30 },
      { stageKey: "proposta", name: "Proposta", category: "open", color: null, sortOrder: 40 },
      { stageKey: "trattativa", name: "Trattativa", category: "open", color: null, sortOrder: 50 },
      { stageKey: "vinto", name: "Vinto", category: "won", color: null, sortOrder: 60 },
      { stageKey: "perso", name: "Perso", category: "lost", color: null, sortOrder: 70 },
    ], fields: [] },
    { name: "Customer Success", kind: "custom", stages: GENERIC_STAGES, fields: [] },
  ],
  agency: [
    { name: "Partner", kind: "agency", stages: GENERIC_STAGES, fields: [] },
  ],
}

function slugify(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80)
}

function blankDraft(template?: { name: string; kind: Workspace["kind"]; stages: DraftStage[]; fields: DraftField[] }): Draft {
  const name = template?.name ?? "Nuovo workspace"
  return {
    name,
    slug: slugify(name),
    kind: template?.kind ?? "custom",
    description: "",
    color: "",
    mode: "generic",
    isDefault: false,
    isActive: true,
    sortOrder: 100,
    groupIds: [],
    stages: (template?.stages ?? GENERIC_STAGES).map((s) => ({ ...s })),
    fields: (template?.fields ?? []).map((f) => ({ ...f })),
  }
}

function fromWorkspace(workspace: Workspace): Draft {
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    kind: workspace.kind,
    description: workspace.description ?? "",
    color: workspace.color ?? "",
    mode: workspace.mode,
    isDefault: workspace.is_default,
    isActive: workspace.is_active,
    sortOrder: workspace.sort_order,
    groupIds: workspace.groupIds,
    stages: (workspace.pipeline?.stages ?? []).map((s) => ({ stageKey: s.stage_key, name: s.name, category: s.category, color: s.color, sortOrder: s.sort_order })),
    fields: workspace.fields.map((f) => ({ fieldKey: f.field_key, label: f.label, fieldType: f.field_type, optionsText: (f.options ?? []).join(", "), isRequired: f.is_required, sortOrder: f.sort_order })),
  }
}

export default function CrmWorkspaceSettingsPage() {
  const [data, setData] = useState<ResponseData | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const response = await fetch("/api/admin/crm/workspaces", { cache: "no-store" })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || "Impossibile leggere la configurazione CRM")
      setData(body)
      setDraft((current) => current?.id ? fromWorkspace((body.workspaces as Workspace[]).find((w) => w.id === current.id) ?? body.workspaces[0]) : current)
    } catch (e) { setError(e instanceof Error ? e.message : "Errore inatteso") }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  const templates = useMemo(() => TEMPLATES[data?.propertyType ?? ""] ?? [{ name: "Area CRM", kind: "custom" as const, stages: GENERIC_STAGES, fields: [] }], [data?.propertyType])

  const save = async () => {
    if (!draft) return
    setSaving(true)
    try {
      const response = await fetch("/api/admin/crm/workspaces", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "save", id: draft.id, name: draft.name, slug: draft.slug, kind: draft.kind,
          description: draft.description || null, color: draft.color || null, mode: draft.mode,
          isDefault: draft.isDefault, isActive: draft.isActive, sortOrder: draft.sortOrder, groupIds: draft.groupIds,
          stages: draft.stages.map((s, index) => ({ ...s, stageKey: s.stageKey || `fase_${index + 1}`, sortOrder: (index + 1) * 10 })),
          fields: draft.fields.map((f, index) => ({ fieldKey: f.fieldKey, label: f.label, fieldType: f.fieldType, options: f.optionsText.split(",").map((v) => v.trim()).filter(Boolean), isRequired: f.isRequired, sortOrder: (index + 1) * 10 })),
        }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || "Salvataggio non riuscito")
      toast.success("Workspace CRM salvato")
      setDraft(null)
      await load()
    } catch (e) { toast.error(e instanceof Error ? e.message : "Salvataggio non riuscito") }
    finally { setSaving(false) }
  }

  const archive = async () => {
    if (!draft?.id || draft.isDefault) return
    if (!window.confirm(`Archiviare il workspace “${draft.name}”? I dati restano nel database.`)) return
    setSaving(true)
    try {
      const response = await fetch("/api/admin/crm/workspaces", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "archive", id: draft.id }) })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || "Archiviazione non riuscita")
      toast.success("Workspace archiviato")
      setDraft(null); await load()
    } catch (e) { toast.error(e instanceof Error ? e.message : "Archiviazione non riuscita") }
    finally { setSaving(false) }
  }

  if (loading && !data) return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>

  return <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-3"><Link href="/admin/crm/settings"><ArrowLeft className="mr-2 h-4 w-4" />Impostazioni CRM</Link></Button>
        <h1 className="mt-2 text-2xl font-bold">Struttura del CRM</h1>
        <p className="mt-1 text-muted-foreground">Crea aree diverse per reparti o linee di business, mantenendo un’unica anagrafica contatti.</p>
      </div>
      <Badge variant="outline">Tipo tenant: {data?.propertyType ?? "—"}</Badge>
    </div>

    {error && <Card className="border-destructive/40"><CardContent className="pt-6 text-destructive" role="alert">{error}</CardContent></Card>}
    {data && !data.canConfigure && <Card><CardContent className="pt-6 text-sm text-muted-foreground">Solo l’amministratore del tenant può modificare la struttura CRM.</CardContent></Card>}

    {data?.canConfigure && <Card>
      <CardHeader><CardTitle className="text-lg">Aggiungi da un modello</CardTitle><CardDescription>I modelli cambiano in base al tipo di struttura. Puoi modificarli prima di salvarli.</CardDescription></CardHeader>
      <CardContent className="flex flex-wrap gap-2">{templates.map((template) => <Button key={template.name} variant="outline" onClick={() => setDraft(blankDraft(template))}><Plus className="mr-2 h-4 w-4" />{template.name}</Button>)}</CardContent>
    </Card>}

    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <Card className="h-fit">
        <CardHeader><CardTitle className="text-lg">Workspace</CardTitle><CardDescription>Le aree visibili nel CRM.</CardDescription></CardHeader>
        <CardContent className="space-y-2">{data?.workspaces.length ? data.workspaces.map((workspace) => <button key={workspace.id} type="button" onClick={() => setDraft(fromWorkspace(workspace))} className={`w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 ${draft?.id === workspace.id ? "border-primary bg-primary/5" : ""}`}>
          <div className="flex items-center justify-between gap-2"><span className="font-medium">{workspace.name}</span>{workspace.is_default && <Badge>Predefinito</Badge>}</div>
          <div className="mt-1 flex flex-wrap gap-1 text-xs text-muted-foreground"><span>{workspace.kind}</span><span>·</span><span>{workspace.groupIds.length ? `${workspace.groupIds.length} gruppi` : "tutti i gruppi"}</span></div>
        </button>) : <p className="text-sm text-muted-foreground">Nessun workspace configurato.</p>}</CardContent>
      </Card>

      {draft ? <div className="space-y-5">
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Settings2 className="h-5 w-5" />{draft.id ? "Modifica workspace" : "Nuovo workspace"}</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2"><Label>Nome</Label><Input value={draft.name} onChange={(e) => setDraft((d) => d && ({ ...d, name: e.target.value, ...(!d.id ? { slug: slugify(e.target.value) } : {}) }))} /></div>
          <div className="space-y-2"><Label>Identificativo</Label><Input value={draft.slug} onChange={(e) => setDraft((d) => d && ({ ...d, slug: slugify(e.target.value) }))} disabled={draft.isDefault} /></div>
          <div className="space-y-2"><Label>Tipo</Label><select value={draft.kind} onChange={(e) => setDraft((d) => d && ({ ...d, kind: e.target.value as Workspace["kind"] }))} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="hotel">Hotel</option><option value="spa">SPA</option><option value="restaurant">Ristorante</option><option value="company">Azienda</option><option value="agency">Agenzia</option><option value="sales">Vendite</option><option value="custom">Personalizzato</option></select></div>
          <div className="space-y-2"><Label>Colore (opzionale)</Label><Input value={draft.color} onChange={(e) => setDraft((d) => d && ({ ...d, color: e.target.value }))} placeholder="#0b57d0" /></div>
          <div className="space-y-2 md:col-span-2"><Label>Descrizione</Label><Textarea value={draft.description} onChange={(e) => setDraft((d) => d && ({ ...d, description: e.target.value }))} /></div>
        </CardContent></Card>

        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Users className="h-5 w-5" />Chi può usare quest’area</CardTitle><CardDescription>Se non selezioni gruppi, il workspace è disponibile a tutti gli utenti che hanno accesso al CRM.</CardDescription></CardHeader><CardContent className="grid gap-2 sm:grid-cols-2">{data?.groups.length ? data.groups.map((group) => <label key={group.id} className="flex items-center gap-3 rounded-md border p-3 text-sm"><Checkbox checked={draft.groupIds.includes(group.id)} onCheckedChange={(checked) => setDraft((d) => d && ({ ...d, groupIds: checked ? [...d.groupIds, group.id] : d.groupIds.filter((id) => id !== group.id) }))} /><span>{group.name}</span></label>) : <p className="text-sm text-muted-foreground">Non ci sono gruppi. Creali prima in Team & Permessi se vuoi limitare l’accesso per reparto.</p>}</CardContent></Card>

        <Card><CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle className="text-lg">Pipeline</CardTitle><CardDescription>Ogni workspace ha fasi indipendenti.</CardDescription></div>{draft.mode === "generic" && <Button size="sm" variant="outline" onClick={() => setDraft((d) => d && ({ ...d, stages: [...d.stages, { stageKey: `fase_${d.stages.length + 1}`, name: "Nuova fase", category: "open", color: null, sortOrder: (d.stages.length + 1) * 10 }] }))}><Plus className="mr-2 h-4 w-4" />Fase</Button>}</div></CardHeader><CardContent className="space-y-2">{draft.mode === "hotel_date_requests" && <p className="rounded-md bg-muted p-3 text-sm">Il workspace Hotel usa la pipeline richieste/prenotazioni già collegata all’Inbox e al calendario domanda. Puoi rinominare le fasi, ma la modalità resta protetta.</p>}{draft.stages.map((stage, index) => <div key={`${stage.stageKey}-${index}`} className="grid gap-2 rounded-md border p-3 md:grid-cols-[24px_1fr_180px_auto] md:items-center"><GripVertical className="h-4 w-4 text-muted-foreground" /><Input value={stage.name} onChange={(e) => setDraft((d) => d && ({ ...d, stages: d.stages.map((s, i) => i === index ? { ...s, name: e.target.value, stageKey: d.id ? s.stageKey : slugify(e.target.value).replace(/-/g, "_") } : s) }))} /><select value={stage.category} onChange={(e) => setDraft((d) => d && ({ ...d, stages: d.stages.map((s, i) => i === index ? { ...s, category: e.target.value as DraftStage["category"] } : s) }))} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="open">Aperta</option><option value="won">Vinta/conclusa</option><option value="lost">Persa</option></select><Button type="button" variant="ghost" size="icon" disabled={draft.mode !== "generic" || draft.stages.length <= 2} onClick={() => setDraft((d) => d && ({ ...d, stages: d.stages.filter((_, i) => i !== index) }))}><Trash2 className="h-4 w-4" /></Button></div>)}</CardContent></Card>

        <Card><CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle className="text-lg">Campi specifici</CardTitle><CardDescription>Dati che esistono solo in questo workspace; l’anagrafica base resta comune.</CardDescription></div><Button size="sm" variant="outline" onClick={() => setDraft((d) => d && ({ ...d, fields: [...d.fields, { fieldKey: `campo_${d.fields.length + 1}`, label: "Nuovo campo", fieldType: "text", optionsText: "", isRequired: false, sortOrder: (d.fields.length + 1) * 10 }] }))}><Plus className="mr-2 h-4 w-4" />Campo</Button></div></CardHeader><CardContent className="space-y-2">{draft.fields.length ? draft.fields.map((field, index) => <div key={`${field.fieldKey}-${index}`} className="grid gap-2 rounded-md border p-3 md:grid-cols-[1fr_150px_1fr_auto] md:items-center"><Input value={field.label} onChange={(e) => setDraft((d) => d && ({ ...d, fields: d.fields.map((f, i) => i === index ? { ...f, label: e.target.value, fieldKey: slugify(e.target.value).replace(/-/g, "_") || f.fieldKey } : f) }))} /><select value={field.fieldType} onChange={(e) => setDraft((d) => d && ({ ...d, fields: d.fields.map((f, i) => i === index ? { ...f, fieldType: e.target.value as DraftField["fieldType"] } : f) }))} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="text">Testo</option><option value="number">Numero</option><option value="date">Data</option><option value="select">Scelta</option><option value="boolean">Sì/No</option></select><Input value={field.optionsText} onChange={(e) => setDraft((d) => d && ({ ...d, fields: d.fields.map((f, i) => i === index ? { ...f, optionsText: e.target.value } : f) }))} placeholder={field.fieldType === "select" ? "Opzione 1, Opzione 2" : "Opzioni solo per Scelta"} disabled={field.fieldType !== "select"} /><Button variant="ghost" size="icon" onClick={() => setDraft((d) => d && ({ ...d, fields: d.fields.filter((_, i) => i !== index) }))}><Trash2 className="h-4 w-4" /></Button></div>) : <p className="text-sm text-muted-foreground">Nessun campo specifico: va bene così se l’anagrafica comune è sufficiente.</p>}</CardContent></Card>

        <div className="flex flex-wrap justify-between gap-3 border-t pt-4"><div>{draft.id && !draft.isDefault && <Button variant="ghost" className="text-destructive" onClick={() => void archive()} disabled={saving}><Trash2 className="mr-2 h-4 w-4" />Archivia</Button>}</div><div className="flex gap-2"><Button variant="outline" onClick={() => setDraft(null)} disabled={saving}>Annulla</Button><Button onClick={() => void save()} disabled={saving || draft.stages.length < 2}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Salva</Button></div></div>
      </div> : <Card><CardContent className="flex min-h-72 flex-col items-center justify-center text-center"><Building2 className="mb-3 h-10 w-10 text-muted-foreground" /><p className="font-medium">Seleziona un workspace o creane uno nuovo</p><p className="mt-1 max-w-md text-sm text-muted-foreground">Hotel, SPA, Ristorante e altri reparti possono lavorare con pipeline e campi diversi senza duplicare i clienti.</p></CardContent></Card>}
    </div>
  </div>
}
