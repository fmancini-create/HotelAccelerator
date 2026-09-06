"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, Clock3, Headphones, Loader2, Plus, Search, UserRoundCheck } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { PLATFORM_PRODUCT_LABELS, type PlatformCustomerAccount, type PlatformProductKey } from "@/lib/platform/customer-intelligence"

type SupportCase = {
  id: string
  case_number: number
  customer_account_id: string
  product_key: PlatformProductKey | null
  title: string
  description: string | null
  case_type: string
  priority: "low" | "normal" | "high" | "critical"
  status: "new" | "assigned" | "waiting_customer" | "in_progress" | "resolved" | "closed"
  channel: string
  assignee_label: string | null
  team_label: string | null
  sla_first_response_due_at: string | null
  sla_resolution_due_at: string | null
  first_responded_at: string | null
  resolved_at: string | null
  github_issue_url: string | null
  created_at: string
}

type SupportResponse = {
  cases: SupportCase[]
  stats: { open: number; critical: number; waitingCustomer: number; overdue: number }
}

type CrmResponse = { accounts: PlatformCustomerAccount[] }

const STATUS_LABELS: Record<SupportCase["status"], string> = {
  new: "Nuovo",
  assigned: "Preso in carico",
  waiting_customer: "In attesa cliente",
  in_progress: "In lavorazione",
  resolved: "Risolto",
  closed: "Chiuso",
}

const PRIORITY_LABELS: Record<SupportCase["priority"], string> = {
  low: "Bassa",
  normal: "Normale",
  high: "Alta",
  critical: "Critica",
}

const TYPE_LABELS: Record<string, string> = {
  bug: "Bug / errore",
  configuration: "Configurazione",
  training: "Formazione",
  administration: "Amministrazione",
  billing: "Fatturazione",
  integration: "Integrazione",
  feature_request: "Richiesta funzione",
  commercial: "Commerciale",
  other: "Altro",
}

function accountName(account?: PlatformCustomerAccount) {
  if (!account) return "Cliente non disponibile"
  return account.profile.display_name || account.profile.legal_name || `Cliente #${account.account_number}`
}

function dateTime(value: string | null) {
  if (!value) return "—"
  return new Date(value).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })
}

function isSlaOverdue(row: SupportCase) {
  if (["resolved", "closed"].includes(row.status)) return false
  const now = Date.now()
  if (!row.first_responded_at && row.sla_first_response_due_at && new Date(row.sla_first_response_due_at).getTime() < now) return true
  return Boolean(!row.resolved_at && row.sla_resolution_due_at && new Date(row.sla_resolution_due_at).getTime() < now)
}

export default function SuperAdminSupportPage() {
  const [support, setSupport] = useState<SupportResponse | null>(null)
  const [crm, setCrm] = useState<CrmResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("open")
  const [form, setForm] = useState({
    customer_account_id: "",
    product_key: "suite",
    title: "",
    description: "",
    case_type: "other",
    priority: "normal",
    channel: "manual",
    assignee_label: "",
  })

  const load = async () => {
    setLoading(true)
    try {
      const [supportRes, crmRes] = await Promise.all([
        fetch("/api/super-admin/crm/support", { cache: "no-store" }),
        fetch("/api/super-admin/crm", { cache: "no-store" }),
      ])
      const supportBody = await supportRes.json().catch(() => null)
      const crmBody = await crmRes.json().catch(() => null)
      if (!supportRes.ok) throw new Error(supportBody?.error || "Impossibile caricare i ticket")
      if (!crmRes.ok) throw new Error(crmBody?.error || "Impossibile caricare i clienti")
      setSupport(supportBody)
      setCrm(crmBody)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Errore di caricamento")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const accounts = useMemo(
    () => (crm?.accounts ?? []).filter((account) => account.profile.lifecycle_stage !== "internal"),
    [crm],
  )
  const accountMap = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts])

  const rows = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("it-IT")
    return (support?.cases ?? []).filter((row) => {
      if (statusFilter === "open" && ["resolved", "closed"].includes(row.status)) return false
      if (statusFilter !== "all" && statusFilter !== "open" && row.status !== statusFilter) return false
      if (!q) return true
      const account = accountMap.get(row.customer_account_id)
      const haystack = [row.case_number, row.title, row.description, row.assignee_label, row.team_label, accountName(account), row.product_key ? PLATFORM_PRODUCT_LABELS[row.product_key] : "suite 4bid"]
        .map((value) => String(value ?? "").toLocaleLowerCase("it-IT"))
        .join(" ")
      return haystack.includes(q)
    })
  }, [support, search, statusFilter, accountMap])

  const createCase = async () => {
    if (!form.customer_account_id || !form.title.trim()) {
      toast.error("Seleziona il cliente e inserisci un titolo")
      return
    }
    setSaving(true)
    try {
      const response = await fetch("/api/super-admin/crm/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, product_key: form.product_key === "suite" ? null : form.product_key }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || "Creazione ticket non riuscita")
      toast.success(`Ticket #${body.case.case_number} creato`)
      setDialogOpen(false)
      setForm({ customer_account_id: "", product_key: "suite", title: "", description: "", case_type: "other", priority: "normal", channel: "manual", assignee_label: "" })
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Creazione ticket non riuscita")
    } finally {
      setSaving(false)
    }
  }

  const updateCase = async (id: string, updates: Record<string, unknown>) => {
    try {
      const response = await fetch("/api/super-admin/crm/support", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...updates }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || "Aggiornamento non riuscito")
      setSupport((current) => current ? { ...current, cases: current.cases.map((row) => row.id === id ? body.case : row) } : current)
      void load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Aggiornamento non riuscito")
    }
  }

  return (
    <div className="mx-auto max-w-[1700px] space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2"><Headphones className="h-5 w-5" /><Badge variant="outline">Solo Super Admin</Badge></div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Assistenza 4BID</h1>
          <p className="mt-1 max-w-3xl text-muted-foreground">Ticket di tutti i clienti e prodotti della suite, con priorità, SLA, assegnazione e stato operativo.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}><Plus className="mr-2 h-4 w-4" />Nuovo ticket</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardDescription>Aperti</CardDescription><CardTitle className="text-3xl">{support?.stats.open ?? 0}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Critici aperti</CardDescription><CardTitle className="flex items-center gap-2 text-3xl"><AlertTriangle className="h-6 w-6" />{support?.stats.critical ?? 0}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>SLA scaduti</CardDescription><CardTitle className="flex items-center gap-2 text-3xl"><Clock3 className="h-6 w-6" />{support?.stats.overdue ?? 0}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>In attesa cliente</CardDescription><CardTitle className="flex items-center gap-2 text-3xl"><UserRoundCheck className="h-6 w-6" />{support?.stats.waitingCustomer ?? 0}</CardTitle></CardHeader></Card>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cerca ticket, cliente, prodotto, responsabile…" /></div>
        <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-full lg:w-[220px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="open">Tutti gli aperti</SelectItem><SelectItem value="new">Nuovi</SelectItem><SelectItem value="assigned">Presi in carico</SelectItem><SelectItem value="waiting_customer">In attesa cliente</SelectItem><SelectItem value="in_progress">In lavorazione</SelectItem><SelectItem value="resolved">Risolti</SelectItem><SelectItem value="closed">Chiusi</SelectItem><SelectItem value="all">Tutti</SelectItem></SelectContent></Select>
      </div>

      <Card>
        <CardHeader><CardTitle>Coda assistenza</CardTitle><CardDescription>{rows.length} ticket visualizzati. Lo SLA iniziale è calcolato in ore solari dalla creazione del ticket.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {loading && !support ? <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Caricamento…</div> : null}
          {!loading && rows.length === 0 ? <div className="py-12 text-center text-sm text-muted-foreground">Nessun ticket con questi filtri.</div> : null}
          {rows.map((row) => {
            const account = accountMap.get(row.customer_account_id)
            const overdue = isSlaOverdue(row)
            return (
              <div key={row.id} className="grid gap-4 rounded-xl border p-4 xl:grid-cols-[1fr_190px_170px] xl:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">#{row.case_number} · {row.title}</span>
                    <Badge variant={row.priority === "critical" ? "destructive" : "outline"}>{PRIORITY_LABELS[row.priority]}</Badge>
                    {overdue ? <Badge variant="destructive">SLA scaduto</Badge> : null}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    <span>{accountName(account)}</span><span>·</span><span>{row.product_key ? PLATFORM_PRODUCT_LABELS[row.product_key] : "Suite 4BID"}</span><span>·</span><span>{TYPE_LABELS[row.case_type] ?? row.case_type}</span>
                  </div>
                  {row.description ? <p className="mt-2 line-clamp-2 text-sm">{row.description}</p> : null}
                  <p className="mt-2 text-xs text-muted-foreground">Prima risposta: {row.first_responded_at ? dateTime(row.first_responded_at) : `entro ${dateTime(row.sla_first_response_due_at)}`} · Risoluzione: {row.resolved_at ? dateTime(row.resolved_at) : `entro ${dateTime(row.sla_resolution_due_at)}`}</p>
                </div>
                <div><div className="mb-1 text-xs text-muted-foreground">Responsabile</div><Input defaultValue={row.assignee_label ?? ""} placeholder="Non assegnato" onBlur={(event) => { if (event.target.value !== (row.assignee_label ?? "")) void updateCase(row.id, { assignee_label: event.target.value }) }} /></div>
                <div><div className="mb-1 text-xs text-muted-foreground">Stato</div><Select value={row.status} onValueChange={(value) => void updateCase(row.id, { status: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Nuovo ticket assistenza</DialogTitle><DialogDescription>Il ticket resta collegato all’unico account cliente 4BID, anche se coinvolge un prodotto specifico.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2"><Label>Cliente</Label><Select value={form.customer_account_id} onValueChange={(value) => setForm((current) => ({ ...current, customer_account_id: value }))}><SelectTrigger><SelectValue placeholder="Seleziona cliente" /></SelectTrigger><SelectContent>{accounts.map((account) => <SelectItem key={account.id} value={account.id}>{accountName(account)}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Prodotto</Label><Select value={form.product_key} onValueChange={(value) => setForm((current) => ({ ...current, product_key: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="suite">Suite 4BID / generale</SelectItem>{Object.entries(PLATFORM_PRODUCT_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Tipo richiesta</Label><Select value={form.case_type} onValueChange={(value) => setForm((current) => ({ ...current, case_type: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(TYPE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2 sm:col-span-2"><Label>Titolo</Label><Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Descrivi il problema in una riga" /></div>
            <div className="space-y-2 sm:col-span-2"><Label>Descrizione</Label><Textarea rows={5} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Dettagli, passaggi, impatto sul cliente…" /></div>
            <div className="space-y-2"><Label>Priorità</Label><Select value={form.priority} onValueChange={(value) => setForm((current) => ({ ...current, priority: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Bassa</SelectItem><SelectItem value="normal">Normale</SelectItem><SelectItem value="high">Alta</SelectItem><SelectItem value="critical">Critica</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label>Responsabile</Label><Input value={form.assignee_label} onChange={(event) => setForm((current) => ({ ...current, assignee_label: event.target.value }))} placeholder="Nome o reparto" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button><Button onClick={createCase} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Crea ticket</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
