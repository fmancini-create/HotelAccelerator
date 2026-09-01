"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowRight, Building2, CalendarRange, Loader2, Plus, RefreshCw, Search, Settings2, Users } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Workspace = { id: string; name: string; kind: string; description: string | null; color: string | null; mode: "generic" | "hotel_date_requests"; is_default: boolean; can_write: boolean; groupIds: string[] }
type Stage = { id: string; stage_key: string; name: string; category: "open" | "won" | "lost"; color: string | null; sort_order: number }
type Field = { id: string; field_key: string; label: string; field_type: "text" | "number" | "date" | "select" | "boolean"; options: string[]; is_required: boolean; sort_order: number }
type Opportunity = { id: string; stage_id: string; contact_id: string | null; title: string; company_name: string | null; value_cents: number | null; currency: string; next_action: string | null; next_action_at: string | null; custom_values: Record<string, unknown>; contacts: { name?: string | null; email?: string | null; company?: string | null } | null }
type Board = { workspace: Workspace; mode: Workspace["mode"]; legacyPipelineHref?: string; contactCount: number; fields: Field[]; pipeline: { id: string; name: string; stages: Stage[] } | null; opportunities: Opportunity[] }
type Contact = { id: string; name: string | null; email: string | null; company: string | null }

function euro(value: number | null) {
  if (value === null) return null
  return (value / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })
}

export default function CrmWorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [canConfigure, setCanConfigure] = useState(false)
  const [selectedId, setSelectedId] = useState("")
  const [board, setBoard] = useState<Board | null>(null)
  const [loading, setLoading] = useState(true)
  const [boardLoading, setBoardLoading] = useState(false)
  const [error, setError] = useState("")
  const [showNew, setShowNew] = useState(false)
  const [title, setTitle] = useState("")
  const [value, setValue] = useState("")
  const [contactSearch, setContactSearch] = useState("")
  const [contactResults, setContactResults] = useState<Contact[]>([])
  const [contactId, setContactId] = useState<string | null>(null)
  const [customValues, setCustomValues] = useState<Record<string, string | boolean>>({})
  const [saving, setSaving] = useState(false)

  const loadWorkspaces = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const response = await fetch("/api/admin/crm/workspaces", { cache: "no-store" })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || "Impossibile caricare le aree CRM")
      const list = (body.workspaces ?? []) as Workspace[]
      setWorkspaces(list); setCanConfigure(Boolean(body.canConfigure))
      setSelectedId((current) => current && list.some((w) => w.id === current) ? current : (list.find((w) => w.is_default)?.id ?? list[0]?.id ?? ""))
    } catch (e) { setError(e instanceof Error ? e.message : "Errore inatteso") }
    finally { setLoading(false) }
  }, [])

  const loadBoard = useCallback(async (workspaceId: string) => {
    if (!workspaceId) { setBoard(null); return }
    setBoardLoading(true); setError("")
    try {
      const response = await fetch(`/api/admin/crm/workspace-board?workspace=${encodeURIComponent(workspaceId)}`, { cache: "no-store" })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || "Impossibile caricare il workspace")
      setBoard(body)
    } catch (e) { setBoard(null); setError(e instanceof Error ? e.message : "Errore inatteso") }
    finally { setBoardLoading(false) }
  }, [])

  useEffect(() => { void loadWorkspaces() }, [loadWorkspaces])
  useEffect(() => { void loadBoard(selectedId) }, [selectedId, loadBoard])

  useEffect(() => {
    if (!showNew || contactSearch.trim().length < 2) { setContactResults([]); return }
    const timer = window.setTimeout(async () => {
      const response = await fetch(`/api/admin/crm/contacts?search=${encodeURIComponent(contactSearch.trim())}&limit=12`)
      if (response.ok) setContactResults((await response.json()) as Contact[])
    }, 250)
    return () => window.clearTimeout(timer)
  }, [contactSearch, showNew])

  const opportunitiesByStage = useMemo(() => {
    const map = new Map<string, Opportunity[]>()
    for (const opportunity of board?.opportunities ?? []) {
      const list = map.get(opportunity.stage_id) ?? []
      list.push(opportunity); map.set(opportunity.stage_id, list)
    }
    return map
  }, [board])

  const move = async (opportunityId: string, stageId: string) => {
    if (!board) return
    try {
      const response = await fetch("/api/admin/crm/workspace-board", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "move", workspaceId: board.workspace.id, opportunityId, stageId }) })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || "Spostamento non riuscito")
      setBoard((current) => current ? ({ ...current, opportunities: current.opportunities.map((o) => o.id === opportunityId ? { ...o, stage_id: stageId } : o) }) : current)
    } catch (e) { toast.error(e instanceof Error ? e.message : "Spostamento non riuscito") }
  }

  const createOpportunity = async () => {
    if (!board || !title.trim()) return
    setSaving(true)
    try {
      const cents = value.trim() ? Math.round(Number(value.replace(",", ".")) * 100) : null
      if (cents !== null && (!Number.isFinite(cents) || cents < 0)) throw new Error("Valore opportunità non valido")
      const response = await fetch("/api/admin/crm/workspace-board", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create", workspaceId: board.workspace.id, contactId, title: title.trim(), valueCents: cents, customValues }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || "Creazione non riuscita")
      toast.success("Opportunità creata")
      setShowNew(false); setTitle(""); setValue(""); setContactId(null); setContactSearch(""); setCustomValues({})
      await loadBoard(board.workspace.id)
    } catch (e) { toast.error(e instanceof Error ? e.message : "Creazione non riuscita") }
    finally { setSaving(false) }
  }

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div><div className="flex items-center gap-2"><Building2 className="h-6 w-6 text-ha-brand" /><h1 className="text-2xl font-bold">Aree CRM</h1></div><p className="mt-1 text-muted-foreground">Lavora con pipeline diverse per Hotel, SPA, Ristorante, commerciale o altri gruppi senza duplicare i contatti.</p></div>
      <div className="flex flex-wrap gap-2">{canConfigure && <Button asChild variant="outline"><Link href="/admin/crm/settings/workspaces"><Settings2 className="mr-2 h-4 w-4" />Configura aree</Link></Button>}<Button variant="outline" onClick={() => { void loadWorkspaces(); if (selectedId) void loadBoard(selectedId) }}><RefreshCw className="mr-2 h-4 w-4" />Aggiorna</Button></div>
    </div>

    {error && <Card className="border-destructive/40"><CardContent className="pt-6 text-destructive" role="alert">{error}</CardContent></Card>}

    <div className="flex gap-2 overflow-x-auto pb-1">{workspaces.map((workspace) => <Button key={workspace.id} variant={selectedId === workspace.id ? "default" : "outline"} className="shrink-0" onClick={() => setSelectedId(workspace.id)}>{workspace.name}{workspace.is_default ? " · principale" : ""}</Button>)}</div>

    {(loading || boardLoading) && !board ? <Card><CardContent className="flex items-center justify-center gap-2 py-14 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Caricamento area CRM…</CardContent></Card> : null}

    {board && <>
      <div className="grid gap-3 md:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardDescription>Area</CardDescription><CardTitle>{board.workspace.name}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Contatti associati</CardDescription><CardTitle className="text-3xl">{board.contactCount}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Accesso</CardDescription><CardTitle className="text-base">{board.workspace.groupIds.length ? `${board.workspace.groupIds.length} gruppi autorizzati` : "Tutti gli utenti CRM"}</CardTitle></CardHeader></Card>
      </div>

      {board.mode === "hotel_date_requests" ? <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><CalendarRange className="h-5 w-5" />Pipeline Hotel</CardTitle><CardDescription>Questa area usa la pipeline reale delle richieste soggiorno già alimentata da Inbox, telefonate e calendario domanda.</CardDescription></CardHeader>
        <CardContent><Button asChild><Link href={board.legacyPipelineHref || "/admin/crm/pipeline"}>Apri pipeline Hotel<ArrowRight className="ml-2 h-4 w-4" /></Link></Button></CardContent>
      </Card> : <>
        <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">{board.pipeline?.name || "Pipeline"}</h2><p className="text-sm text-muted-foreground">{board.opportunities.length} opportunità</p></div>{board.workspace.can_write && <Button onClick={() => setShowNew(true)}><Plus className="mr-2 h-4 w-4" />Nuova opportunità</Button>}</div>
        <div className="grid auto-cols-[minmax(260px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-4">{(board.pipeline?.stages ?? []).map((stage) => <section key={stage.id} className="min-h-64 rounded-xl border bg-muted/20 p-3"><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">{stage.name}</h3><Badge variant={stage.category === "won" ? "default" : "secondary"}>{(opportunitiesByStage.get(stage.id) ?? []).length}</Badge></div><div className="space-y-2">{(opportunitiesByStage.get(stage.id) ?? []).map((opportunity) => {
          const contact = Array.isArray(opportunity.contacts) ? opportunity.contacts[0] : opportunity.contacts
          return <Card key={opportunity.id}><CardContent className="space-y-3 pt-4"><div><p className="font-medium">{opportunity.title}</p><p className="text-xs text-muted-foreground">{contact?.name || opportunity.company_name || contact?.company || "Senza contatto"}</p></div>{opportunity.value_cents !== null && <p className="font-semibold">{euro(opportunity.value_cents)}</p>}{opportunity.next_action && <p className="text-xs">Prossimo: {opportunity.next_action}</p>}{board.workspace.can_write && <select aria-label={`Sposta ${opportunity.title}`} value={opportunity.stage_id} onChange={(e) => void move(opportunity.id, e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">{(board.pipeline?.stages ?? []).map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}</select>}</CardContent></Card>
        })}{!(opportunitiesByStage.get(stage.id) ?? []).length && <div className="rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground">Nessuna opportunità</div>}</div></section>)}</div>
      </>}
    </>}

    <Dialog open={showNew} onOpenChange={setShowNew}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Nuova opportunità · {board?.workspace.name}</DialogTitle></DialogHeader><div className="space-y-4">
      <div className="space-y-2"><Label>Titolo</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Es. Pacchetto SPA weekend" /></div>
      <div className="space-y-2"><Label>Valore previsto (€)</Label><Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" /></div>
      <div className="space-y-2"><Label>Collega un contatto (opzionale)</Label><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={contactSearch} onChange={(e) => { setContactSearch(e.target.value); setContactId(null) }} placeholder="Cerca nome, email o azienda" /></div>{contactId && <Badge>Contatto selezionato</Badge>}{contactResults.length > 0 && !contactId && <div className="max-h-40 overflow-y-auto rounded-md border">{contactResults.map((contact) => <button key={contact.id} type="button" onClick={() => { setContactId(contact.id); setContactSearch(contact.name || contact.email || contact.company || "Contatto"); setContactResults([]) }} className="block w-full border-b p-2 text-left text-sm last:border-b-0 hover:bg-muted"><span className="font-medium">{contact.name || contact.email || "Contatto"}</span><span className="ml-2 text-muted-foreground">{contact.company || contact.email || ""}</span></button>)}</div>}</div>
      {(board?.fields ?? []).map((field) => <div key={field.id} className="space-y-2"><Label>{field.label}{field.is_required ? " *" : ""}</Label>{field.field_type === "select" ? <select value={String(customValues[field.field_key] ?? "")} onChange={(e) => setCustomValues((v) => ({ ...v, [field.field_key]: e.target.value }))} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="">Seleziona…</option>{field.options.map((option) => <option key={option} value={option}>{option}</option>)}</select> : field.field_type === "boolean" ? <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(customValues[field.field_key])} onChange={(e) => setCustomValues((v) => ({ ...v, [field.field_key]: e.target.checked }))} />Sì</label> : <Input type={field.field_type === "number" ? "number" : field.field_type === "date" ? "date" : "text"} value={String(customValues[field.field_key] ?? "")} onChange={(e) => setCustomValues((v) => ({ ...v, [field.field_key]: e.target.value }))} />}</div>)}
    </div><DialogFooter><Button variant="outline" onClick={() => setShowNew(false)}>Annulla</Button><Button onClick={() => void createOpportunity()} disabled={saving || !title.trim()}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Crea</Button></DialogFooter></DialogContent></Dialog>

    {!loading && !workspaces.length && <Card><CardContent className="flex flex-col items-center py-12 text-center"><Users className="mb-3 h-10 w-10 text-muted-foreground" /><p className="font-medium">Nessuna area CRM disponibile</p>{canConfigure && <Button asChild className="mt-4"><Link href="/admin/crm/settings/workspaces">Configura CRM</Link></Button>}</CardContent></Card>}
  </div>
}
