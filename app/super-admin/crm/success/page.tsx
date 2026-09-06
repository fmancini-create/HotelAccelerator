"use client"

import { useEffect, useMemo, useState } from "react"
import { CalendarClock, CheckCircle2, HeartHandshake, Loader2, Plus, ShieldAlert, Sparkles } from "lucide-react"
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

type SuccessAction = {
  id: string
  customer_account_id: string
  product_key: PlatformProductKey | null
  action_type: string
  title: string
  notes: string | null
  priority: "low" | "normal" | "high" | "critical"
  status: "open" | "done" | "cancelled"
  due_at: string | null
  owner_label: string | null
  completed_at: string | null
  created_at: string
}

type SuccessResponse = { actions: SuccessAction[]; stats: { open: number; overdue: number; done: number } }
type CrmResponse = { accounts: PlatformCustomerAccount[] }

type PriorityCustomer = {
  account: PlatformCustomerAccount
  score: number
  reasons: string[]
  suggestedType: string
  suggestedTitle: string
}

const ACTION_LABELS: Record<string, string> = {
  onboarding: "Onboarding",
  adoption: "Adozione",
  health_recovery: "Recupero cliente",
  renewal: "Rinnovo",
  upsell: "Upsell",
  check_in: "Check-in cliente",
  training: "Formazione",
  other: "Altro",
}

function accountName(account?: PlatformCustomerAccount) {
  if (!account) return "Cliente non disponibile"
  return account.profile.display_name || account.profile.legal_name || `Cliente #${account.account_number}`
}

function formatDate(value: string | null) {
  if (!value) return "—"
  return new Date(value).toLocaleDateString("it-IT")
}

function derivePriorities(accounts: PlatformCustomerAccount[]): PriorityCustomer[] {
  const now = Date.now()
  return accounts
    .filter((account) => account.profile.lifecycle_stage !== "internal")
    .map((account) => {
      let score = 0
      const reasons: string[] = []
      let suggestedType = "check_in"
      let suggestedTitle = "Contattare il cliente"

      if (["risk", "critical"].includes(account.profile.health_status) || account.profile.lifecycle_stage === "at_risk") {
        score += account.profile.health_status === "critical" ? 50 : 35
        reasons.push(`Customer health: ${account.profile.health_status}`)
        suggestedType = "health_recovery"
        suggestedTitle = "Piano di recupero customer health"
      }
      if ((account.profile.churn_risk_score ?? 0) >= 60) {
        score += 35
        reasons.push(`Rischio churn ${account.profile.churn_risk_score}%`)
        suggestedType = "health_recovery"
        suggestedTitle = "Contatto anti-churn"
      }

      for (const product of account.products) {
        if (product.status === "onboarding") {
          score += 30
          reasons.push(`${PLATFORM_PRODUCT_LABELS[product.product_key]} in onboarding`)
          if (suggestedType === "check_in") {
            suggestedType = "onboarding"
            suggestedTitle = `Completare onboarding ${PLATFORM_PRODUCT_LABELS[product.product_key]}`
          }
        }
        if (product.usage_score !== null && product.usage_score < 30 && ["active", "trial", "onboarding"].includes(product.status)) {
          score += 20
          reasons.push(`${PLATFORM_PRODUCT_LABELS[product.product_key]} poco utilizzato (${product.usage_score}%)`)
          if (suggestedType === "check_in") {
            suggestedType = "adoption"
            suggestedTitle = `Aumentare adozione ${PLATFORM_PRODUCT_LABELS[product.product_key]}`
          }
        }
        if (product.last_activity_at) {
          const age = now - new Date(product.last_activity_at).getTime()
          if (Number.isFinite(age) && age >= 14 * 86400000 && ["active", "trial", "onboarding"].includes(product.status)) {
            score += 15
            reasons.push(`${PLATFORM_PRODUCT_LABELS[product.product_key]} inattivo da 14+ giorni`)
          }
        }
      }

      const renewalDates = [account.profile.next_renewal_at, ...account.products.map((product) => product.renewal_at || product.expires_at)].filter(Boolean) as string[]
      if (renewalDates.some((value) => {
        const due = new Date(value).getTime()
        return due >= now && due <= now + 30 * 86400000
      })) {
        score += 25
        reasons.push("Rinnovo entro 30 giorni")
        if (suggestedType === "check_in") {
          suggestedType = "renewal"
          suggestedTitle = "Preparare rinnovo cliente"
        }
      }

      return { account, score: Math.min(score, 100), reasons, suggestedType, suggestedTitle }
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
}

export default function SuperAdminCustomerSuccessPage() {
  const [crm, setCrm] = useState<CrmResponse | null>(null)
  const [success, setSuccess] = useState<SuccessResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState({ customer_account_id: "", product_key: "suite", action_type: "check_in", title: "", notes: "", priority: "normal", due_at: "", owner_label: "" })

  const load = async () => {
    setLoading(true)
    try {
      const [crmRes, successRes] = await Promise.all([
        fetch("/api/super-admin/crm", { cache: "no-store" }),
        fetch("/api/super-admin/crm/success", { cache: "no-store" }),
      ])
      const crmBody = await crmRes.json().catch(() => null)
      const successBody = await successRes.json().catch(() => null)
      if (!crmRes.ok) throw new Error(crmBody?.error || "Impossibile caricare i clienti")
      if (!successRes.ok) throw new Error(successBody?.error || "Impossibile caricare Customer Success")
      setCrm(crmBody)
      setSuccess(successBody)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Errore di caricamento")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const accounts = useMemo(() => (crm?.accounts ?? []).filter((account) => account.profile.lifecycle_stage !== "internal"), [crm])
  const accountMap = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts])
  const priorities = useMemo(() => derivePriorities(accounts), [accounts])
  const onboardingCount = useMemo(() => accounts.filter((account) => account.products.some((product) => product.status === "onboarding")).length, [accounts])
  const riskCount = useMemo(() => accounts.filter((account) => ["risk", "critical"].includes(account.profile.health_status) || account.profile.lifecycle_stage === "at_risk" || (account.profile.churn_risk_score ?? 0) >= 60).length, [accounts])
  const renewalCount = useMemo(() => {
    const now = Date.now()
    return accounts.filter((account) => [account.profile.next_renewal_at, ...account.products.map((product) => product.renewal_at || product.expires_at)].filter(Boolean).some((value) => {
      const due = new Date(String(value)).getTime()
      return due >= now && due <= now + 30 * 86400000
    })).length
  }, [accounts])

  const openDialogFor = (row?: PriorityCustomer) => {
    setForm({
      customer_account_id: row?.account.id ?? "",
      product_key: "suite",
      action_type: row?.suggestedType ?? "check_in",
      title: row?.suggestedTitle ?? "",
      notes: row?.reasons.join("; ") ?? "",
      priority: row && row.score >= 70 ? "high" : "normal",
      due_at: "",
      owner_label: row?.account.profile.owner_label ?? "",
    })
    setDialogOpen(true)
  }

  const createAction = async () => {
    if (!form.customer_account_id || !form.title.trim()) {
      toast.error("Seleziona il cliente e inserisci un titolo")
      return
    }
    setSaving(true)
    try {
      const response = await fetch("/api/super-admin/crm/success", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, product_key: form.product_key === "suite" ? null : form.product_key, due_at: form.due_at ? `${form.due_at}T12:00:00` : null }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || "Creazione azione non riuscita")
      toast.success("Azione Customer Success creata")
      setDialogOpen(false)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Creazione azione non riuscita")
    } finally {
      setSaving(false)
    }
  }

  const markDone = async (id: string) => {
    try {
      const response = await fetch("/api/super-admin/crm/success", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "done" }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || "Aggiornamento non riuscito")
      toast.success("Azione completata")
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Aggiornamento non riuscito")
    }
  }

  return (
    <div className="mx-auto max-w-[1700px] space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2"><HeartHandshake className="h-5 w-5" /><Badge variant="outline">Solo Super Admin</Badge></div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Customer Success</h1>
          <p className="mt-1 max-w-3xl text-muted-foreground">Priorità post-vendita calcolate da health, churn, onboarding, utilizzo e rinnovi. Ogni segnale può diventare un’azione assegnata.</p>
        </div>
        <Button onClick={() => openDialogFor()}><Plus className="mr-2 h-4 w-4" />Nuova azione</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardDescription>Clienti da recuperare</CardDescription><CardTitle className="flex items-center gap-2 text-3xl"><ShieldAlert className="h-6 w-6" />{riskCount}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Onboarding in corso</CardDescription><CardTitle className="flex items-center gap-2 text-3xl"><Sparkles className="h-6 w-6" />{onboardingCount}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Rinnovi entro 30 gg</CardDescription><CardTitle className="flex items-center gap-2 text-3xl"><CalendarClock className="h-6 w-6" />{renewalCount}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Azioni aperte</CardDescription><CardTitle className="text-3xl">{success?.stats.open ?? 0}</CardTitle><CardDescription>{success?.stats.overdue ?? 0} scadute</CardDescription></CardHeader></Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
        <Card>
          <CardHeader><CardTitle>Clienti prioritari</CardTitle><CardDescription>Il punteggio serve a ordinare il lavoro: non avvia azioni automatiche.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {loading && !crm ? <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Caricamento…</div> : null}
            {!loading && priorities.length === 0 ? <div className="py-12 text-center text-sm text-muted-foreground">Nessuna criticità Customer Success rilevata.</div> : null}
            {priorities.slice(0, 30).map((row) => (
              <div key={row.account.id} className="flex flex-col gap-3 rounded-xl border p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{accountName(row.account)}</span><Badge variant={row.score >= 70 ? "destructive" : "outline"}>Priorità {row.score}/100</Badge></div>
                  <div className="mt-2 flex flex-wrap gap-1.5">{row.account.products.filter((product) => ["active", "trial", "onboarding"].includes(product.status)).map((product) => <Badge key={product.product_key} variant="secondary">{PLATFORM_PRODUCT_LABELS[product.product_key]}{product.status === "onboarding" ? " · onboarding" : ""}</Badge>)}</div>
                  <p className="mt-2 text-sm text-muted-foreground">{row.reasons.join(" · ")}</p>
                </div>
                <Button variant="outline" onClick={() => openDialogFor(row)}>Crea azione</Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Azioni operative</CardTitle><CardDescription>Follow-up, onboarding, recupero health, training e rinnovi.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {(success?.actions ?? []).filter((action) => action.status === "open").map((action) => {
              const overdue = Boolean(action.due_at && new Date(action.due_at).getTime() < Date.now())
              return (
                <div key={action.id} className="rounded-xl border p-4">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{action.title}</span><Badge variant={action.priority === "critical" || overdue ? "destructive" : "outline"}>{overdue ? "Scaduta" : action.priority}</Badge></div>
                  <p className="mt-1 text-sm text-muted-foreground">{accountName(accountMap.get(action.customer_account_id))} · {ACTION_LABELS[action.action_type] ?? action.action_type}</p>
                  {action.notes ? <p className="mt-2 text-sm">{action.notes}</p> : null}
                  <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>Scadenza {formatDate(action.due_at)} · {action.owner_label || "Non assegnata"}</span><Button size="sm" variant="outline" onClick={() => void markDone(action.id)}><CheckCircle2 className="mr-2 h-4 w-4" />Fatta</Button></div>
                </div>
              )
            })}
            {!loading && (success?.actions ?? []).filter((action) => action.status === "open").length === 0 ? <div className="py-10 text-center text-sm text-muted-foreground">Nessuna azione aperta.</div> : null}
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Nuova azione Customer Success</DialogTitle><DialogDescription>Trasforma un segnale del CRM in un’attività concreta, con responsabile e scadenza.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2"><Label>Cliente</Label><Select value={form.customer_account_id} onValueChange={(value) => setForm((current) => ({ ...current, customer_account_id: value }))}><SelectTrigger><SelectValue placeholder="Seleziona cliente" /></SelectTrigger><SelectContent>{accounts.map((account) => <SelectItem key={account.id} value={account.id}>{accountName(account)}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Tipo azione</Label><Select value={form.action_type} onValueChange={(value) => setForm((current) => ({ ...current, action_type: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(ACTION_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Prodotto</Label><Select value={form.product_key} onValueChange={(value) => setForm((current) => ({ ...current, product_key: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="suite">Suite / generale</SelectItem>{Object.entries(PLATFORM_PRODUCT_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2 sm:col-span-2"><Label>Titolo</Label><Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></div>
            <div className="space-y-2 sm:col-span-2"><Label>Note</Label><Textarea rows={4} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></div>
            <div className="space-y-2"><Label>Priorità</Label><Select value={form.priority} onValueChange={(value) => setForm((current) => ({ ...current, priority: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Bassa</SelectItem><SelectItem value="normal">Normale</SelectItem><SelectItem value="high">Alta</SelectItem><SelectItem value="critical">Critica</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label>Scadenza</Label><Input type="date" value={form.due_at} onChange={(event) => setForm((current) => ({ ...current, due_at: event.target.value }))} /></div>
            <div className="space-y-2 sm:col-span-2"><Label>Responsabile</Label><Input value={form.owner_label} onChange={(event) => setForm((current) => ({ ...current, owner_label: event.target.value }))} placeholder="Nome o reparto" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button><Button onClick={createAction} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Crea azione</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
