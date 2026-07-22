"use client"

import useSWR from "swr"
import Link from "next/link"
import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ArrowRight, Plus, Users, Mail, MailCheck, Building2, Send, X, Clock, RefreshCw, DollarSign, Calendar, BarChart3 } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type AgentRow = {
  id: string
  display_name: string | null
  email: string | null
  phone: string | null
  default_commission_percentage: number | null
  is_active: boolean
  hotels_count: number
  active_hotels_count: number
  leads_count: number
  conversion_rate: number
}

export function SalesAgentsClient() {
  const { data, mutate, isLoading } = useSWR<{ agents: AgentRow[] }>(
    "/api/superadmin/sales/agents",
    fetcher,
  )

  const agents = data?.agents ?? []

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Venditori</h1>
          <p className="mt-1 text-sm text-gray-600">
            Gestione agenti commerciali, % commissioni e permessi.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/superadmin/sales/performance">
            <Button variant="outline"><BarChart3 className="h-4 w-4 mr-1.5" />Dashboard KPI</Button>
          </Link>
          <BackfillCommissionsButton />
          <Link href="/superadmin/sales/commissions">
            <Button variant="outline"><DollarSign className="h-4 w-4 mr-1.5" />Commissioni</Button>
          </Link>
          <Link href="/superadmin/sales/leads">
            <Button variant="outline">Lead</Button>
          </Link>
          <Link href="/superadmin/sales/email-template">
            <Button variant="outline">Template email</Button>
          </Link>
        </div>
        <NewAgentDialog onCreated={() => mutate()} />
      </div>

      <PendingInvitations />

      {isLoading ? (
        <div className="text-sm text-gray-500">Caricamento...</div>
      ) : agents.length === 0 ? (
        <Card className="p-12 text-center">
          <Users className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">Nessun venditore</h3>
          <p className="mt-1 text-sm text-gray-500">
            Crea il primo venditore con il pulsante in alto.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4">
          {agents.map((a) => (
            <Link key={a.id} href={`/superadmin/sales/${a.id}`}>
              <Card className="p-5 transition-all hover:border-gray-400 hover:shadow-md">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900 truncate">
                        {a.display_name ?? a.email ?? "—"}
                      </h3>
                      {!a.is_active && <Badge variant="secondary">Disattivato</Badge>}
                    </div>
                    <p className="text-sm text-gray-500 truncate flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {a.email ?? "—"}
                    </p>
                  </div>
                  <div className="flex gap-6 text-sm">
                    <Stat
                      label="Strutture"
                      value={`${a.active_hotels_count}/${a.hotels_count}`}
                      icon={<Building2 className="h-4 w-4" />}
                    />
                    <Stat
                      label="Lead"
                      value={String(a.leads_count)}
                      icon={<Users className="h-4 w-4" />}
                    />
                    <Stat
                      label="Conv."
                      value={`${(a.conversion_rate * 100).toFixed(0)}%`}
                    />
                    <Stat
                      label="% default"
                      value={
                        a.default_commission_percentage != null
                          ? `${a.default_commission_percentage}%`
                          : "—"
                      }
                    />
                  </div>
                  <SendWelcomeEmailButton agentId={a.id} email={a.email} />
                  <ArrowRight className="h-5 w-5 text-gray-400" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string
  value: string
  icon?: React.ReactNode
}) {
  return (
    <div className="text-right">
      <div className="text-xs text-gray-500 uppercase tracking-wide flex items-center gap-1 justify-end">
        {icon}
        {label}
      </div>
      <div className="font-semibold text-gray-900">{value}</div>
    </div>
  )
}

/**
 * Dialog "Nuovo venditore".
 *
 * Oltre ai dati base (email, nome, telefono, % commissione) espone gli STESSI
 * controlli di permessi e ruoli disponibili nel form di modifica del dettaglio
 * agente (agent-detail-client), cosi il super-admin puo' configurare tutto in
 * fase di creazione senza dover prima creare e poi rientrare.
 *
 * Il backend POST /api/superadmin/sales/agents gestisce 2 flussi:
 *  - utente gia' registrato -> promosso subito a sales_agent con TUTTI i campi
 *    (permessi + gerarchia capo area/override).
 *  - utente non registrato -> invito email; permessi, note ed eventuale capo
 *    area (parent) vengono salvati sull'invito e applicati all'accettazione.
 *    Il ruolo "e' un capo area" si imposta solo su agenti gia' esistenti
 *    (la tabella inviti non lo prevede), quindi per un nuovo invitato quel
 *    toggle viene ignorato dal backend.
 */
function NewAgentDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    email: "",
    display_name: "",
    phone: "",
    default_commission_percentage: "",
    global_can_view_subscription: false,
    global_can_view_payments: false,
    global_can_view_metrics: false,
    global_can_view_full_dashboard: false,
    notes: "",
    is_area_manager: false,
    parent_agent_id: "",
    area_manager_override_pct: "",
  })

  // Elenco capi area + default sistema (per la sezione gerarchia). Caricato
  // solo quando il dialog e' aperto.
  const { data: areaMeta } = useSWR<{
    default_pct: number
    area_managers: Array<{ id: string; display_name: string | null; is_active: boolean }>
  }>(open ? "/api/superadmin/sales/area-managers" : null, fetcher)

  function resetForm() {
    setForm({
      email: "",
      display_name: "",
      phone: "",
      default_commission_percentage: "",
      global_can_view_subscription: false,
      global_can_view_payments: false,
      global_can_view_metrics: false,
      global_can_view_full_dashboard: false,
      notes: "",
      is_area_manager: false,
      parent_agent_id: "",
      area_manager_override_pct: "",
    })
  }

  async function handleCreate() {
    setSubmitting(true)
    try {
      const res = await fetch("/api/superadmin/sales/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email.trim(),
          display_name: form.display_name.trim() || null,
          phone: form.phone.trim() || null,
          default_commission_percentage: form.default_commission_percentage
            ? Number.parseFloat(form.default_commission_percentage)
            : null,
          global_can_view_subscription: form.global_can_view_subscription,
          global_can_view_payments: form.global_can_view_payments,
          global_can_view_metrics: form.global_can_view_metrics,
          global_can_view_full_dashboard: form.global_can_view_full_dashboard,
          notes: form.notes.trim() || null,
          is_area_manager: form.is_area_manager,
          // se e' capo area, parent forzato a null (coerente col backend)
          parent_agent_id: form.is_area_manager ? null : form.parent_agent_id || null,
          area_manager_override_pct:
            form.is_area_manager && form.area_manager_override_pct
              ? Number.parseFloat(form.area_manager_override_pct)
              : null,
        }),
      })
      const j = await res.json()
      if (!res.ok) {
        const msg =
          j.error === "missing_user_id_or_email"
            ? "Email obbligatoria"
            : j.error === "invitation_already_pending"
              ? "Esiste gia' un invito pendente per questa email. Annullalo o reinvialo dalla sezione \"Inviti pendenti\"."
              : j.details || j.error || "Errore creazione venditore"
        alert(msg)
        return
      }
      // Il backend distingue 2 casi:
      //  - status=created: utente esistente promosso ad agent direttamente
      //  - status=invited: nessun utente, mandata email di invito
      if (j.status === "invited") {
        alert(
          `Email di invito spedita a ${form.email}. Il venditore potra' completare la registrazione cliccando il link.`,
        )
      }
      setOpen(false)
      resetForm()
      onCreated()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) resetForm()
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Nuovo venditore
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuovo venditore</DialogTitle>
          <DialogDescription>
            Se l&apos;email appartiene a un utente gia&apos; registrato, viene promosso
            a sales_agent con permessi e ruolo qui sotto. Altrimenti riceve subito
            un&apos;email di invito: permessi, note ed eventuale capo area vengono
            applicati al momento della registrazione.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="venditore@example.com"
            />
            <p className="mt-1 text-xs text-gray-500">
              Se l&apos;utente non ha ancora un account riceve un&apos;email di invito
              per registrarsi.
            </p>
          </div>
          <div>
            <Label htmlFor="display_name">Nome visualizzato</Label>
            <Input
              id="display_name"
              value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              placeholder="Mario Rossi"
            />
          </div>
          <div>
            <Label htmlFor="phone">Telefono</Label>
            <Input
              id="phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="comm">% commissione default</Label>
            <Input
              id="comm"
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={form.default_commission_percentage}
              onChange={(e) =>
                setForm({ ...form, default_commission_percentage: e.target.value })
              }
              placeholder="20"
            />
            <p className="mt-1 text-xs text-gray-500">
              Suggerimento iniziale per nuove strutture. Modificabile caso per caso.
            </p>
          </div>

          {/* Permessi globali — stessi del form di modifica */}
          <div>
            <Label className="mb-2 block">
              Permessi globali (validi per tutte le strutture, in OR coi permessi
              per-struttura)
            </Label>
            <div className="grid gap-2 md:grid-cols-2">
              <NewAgentPermissionToggle
                label="Vede abbonamento"
                checked={form.global_can_view_subscription}
                onChange={(v) => setForm({ ...form, global_can_view_subscription: v })}
              />
              <NewAgentPermissionToggle
                label="Vede pagamenti"
                checked={form.global_can_view_payments}
                onChange={(v) => setForm({ ...form, global_can_view_payments: v })}
              />
              <NewAgentPermissionToggle
                label="Vede metriche operative"
                checked={form.global_can_view_metrics}
                onChange={(v) => setForm({ ...form, global_can_view_metrics: v })}
              />
              <NewAgentPermissionToggle
                label="Vede dashboard completa (tutto come superadmin)"
                checked={form.global_can_view_full_dashboard}
                onChange={(v) =>
                  setForm({ ...form, global_can_view_full_dashboard: v })
                }
              />
            </div>
          </div>

          {/* Gerarchia / capo area — stessa logica del form di modifica */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <Label className="mb-3 block font-semibold">Gerarchia / Capo area</Label>
            <div className="flex items-center gap-3">
              <Switch
                checked={form.is_area_manager}
                onCheckedChange={(v) =>
                  setForm({
                    ...form,
                    is_area_manager: v,
                    parent_agent_id: v ? "" : form.parent_agent_id,
                  })
                }
              />
              <div>
                <Label className="cursor-pointer">È un capo area</Label>
                <p className="text-xs text-gray-500">
                  Riceve una % override sulle commissioni dei suoi agenti.
                </p>
              </div>
            </div>
            {form.is_area_manager ? (
              <div className="mt-3">
                <Label>% override (vuoto = default sistema)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    placeholder={
                      areaMeta?.default_pct != null
                        ? `Default ${areaMeta.default_pct}%`
                        : "Default 15%"
                    }
                    value={form.area_manager_override_pct}
                    onChange={(e) =>
                      setForm({ ...form, area_manager_override_pct: e.target.value })
                    }
                  />
                  <span className="text-sm text-gray-500">%</span>
                </div>
                <p className="mt-1 text-xs text-amber-700">
                  Il ruolo capo area viene applicato solo se l&apos;utente è già
                  registrato. Per un nuovo invitato, impostalo dopo la registrazione.
                </p>
              </div>
            ) : (
              <div className="mt-3">
                <Label>Capo area di riferimento (opzionale)</Label>
                <Select
                  value={form.parent_agent_id || "__none__"}
                  onValueChange={(v) =>
                    setForm({ ...form, parent_agent_id: v === "__none__" ? "" : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Nessun capo area" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nessun capo area</SelectItem>
                    {(areaMeta?.area_managers ?? [])
                      .filter((am) => am.is_active)
                      .map((am) => (
                        <SelectItem key={am.id} value={am.id}>
                          {am.display_name ?? "(senza nome)"}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-gray-500">
                  Se selezionato, ogni commissione di questo agente genera
                  automaticamente una riga override per il capo area.
                </p>
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="notes">Note interne</Label>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
            Annulla
          </Button>
          <Button onClick={handleCreate} disabled={!form.email || submitting}>
            {submitting ? "Creazione..." : "Crea venditore"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function NewAgentPermissionToggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-white p-2 text-sm">
      <Switch checked={checked} onCheckedChange={onChange} />
      <span>{label}</span>
    </div>
  )
}

/**
 * Pulsante "Invia email di benvenuto" inline nella card del venditore.
 * La card e' wrappata in un <Link>, quindi qui si fa preventDefault +
 * stopPropagation per non navigare al dettaglio quando il superadmin clicca.
 *
 * Usa POST /api/superadmin/sales/agents/[id]/welcome-email che spedisce
 * un'email "sei stato attivato come venditore, accedi qui" al venditore
 * GIA' registrato. Da non confondere con /invitations/[id] POST che invece
 * reinvia un invito-signup a un'email che non ha ancora un account.
 */
function SendWelcomeEmailButton({
  agentId,
  email,
}: {
  agentId: string
  email: string | null
}) {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!email) {
      alert("Questo venditore non ha un'email associata.")
      return
    }
    if (busy || done) return
    setBusy(true)
    try {
      const res = await fetch(
        `/api/superadmin/sales/agents/${agentId}/welcome-email`,
        { method: "POST" },
      )
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(j.details || j.error || "Errore invio email")
        return
      }
      setDone(true)
      // Ripristina lo stato dopo 4s, cosi il superadmin puo' eventualmente
      // rispedirla se serve.
      setTimeout(() => setDone(false), 4000)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-60"
      title={
        done
          ? "Email inviata"
          : "Invia un'email di benvenuto al venditore con il link di accesso"
      }
    >
      {done ? (
        <>
          <MailCheck className="h-3.5 w-3.5 text-emerald-600" />
          <span className="text-emerald-700">Inviata</span>
        </>
      ) : (
        <>
          <Send className="h-3.5 w-3.5" />
          <span>{busy ? "Invio..." : "Invia benvenuto"}</span>
        </>
      )}
    </button>
  )
}

type PendingInvitation = {
  id: string
  email: string
  display_name: string | null
  default_commission_percentage: number | null
  invited_by_name: string | null
  expires_at: string
  email_sent_count: number
  email_last_sent_at: string | null
  email_last_error: string | null
  created_at: string
  // Campi nuovi: flusso capo-area-invita / super-admin-approva.
  approval_status?: "pending" | "approved" | "rejected"
  approved_at?: string | null
  rejection_reason?: string | null
  invited_by_agent_id?: string | null
  invited_by_agent?: { display_name: string | null; email: string } | null
  parent_agent_id?: string | null
  }

/**
 * Sezione "Inviti pendenti" — mostra gli inviti venditore non ancora
 * accettati con azioni Reinvia e Annulla. Si nasconde automaticamente se
 * non ci sono inviti (per non aggiungere rumore alla pagina lista quando
 * il flusso email non e' usato).
 */
/**
 * Bottone per backfill commissioni con data di partenza selezionabile.
 * Permette di calcolare le commissioni storiche a partire da una data specifica.
 */
function BackfillCommissionsButton() {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [startDate, setStartDate] = useState(() => {
    // Default: primo giorno del mese corrente
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
  })
  const [result, setResult] = useState<{
    total_invoices: number
    already_in_ledger: number
    processed: number
    errors: number
  } | null>(null)

  async function run() {
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch("/api/superadmin/sales-commissions/backfill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ start_date: startDate }),
      })
      const data = await res.json()
      setResult(data)
      if (data.processed > 0) {
        toast.success(`Backfill completato: ${data.processed} commissioni create`)
      } else if (data.total_invoices === 0) {
        toast.info("Nessuna fattura con venditore trovata dal " + startDate)
      } else {
        toast.info("Tutte le commissioni erano gia' presenti")
      }
    } catch (e: any) {
      toast.error("Errore backfill: " + e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <RefreshCw className="h-4 w-4 mr-1.5" />
        Backfill commissioni
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Backfill Commissioni Venditori</DialogTitle>
            <DialogDescription>
              Calcola le commissioni per tutte le fatture emesse a partire dalla data selezionata.
              Le commissioni già presenti nel ledger non vengono duplicate.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="start-date" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Data di partenza
              </Label>
              <input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1.5 w-full border rounded-md px-3 py-2 text-sm bg-background"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Le fatture con data emissione anteriore a questa data verranno ignorate.
              </p>
            </div>
            {result && (
              <div className="rounded-md border p-3 bg-muted/50 text-sm space-y-1">
                <div>Fatture trovate: <strong>{result.total_invoices}</strong></div>
                <div>Già nel ledger: <strong>{result.already_in_ledger}</strong></div>
                <div className="text-emerald-700">Commissioni create: <strong>{result.processed}</strong></div>
                {result.errors > 0 && (
                  <div className="text-red-600">Errori: <strong>{result.errors}</strong></div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Chiudi
            </Button>
            <Button onClick={run} disabled={busy || !startDate}>
              {busy ? "Elaborazione..." : "Avvia Backfill"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function PendingInvitations() {
  const { data, mutate } = useSWR<{ invitations: PendingInvitation[] }>(
    "/api/superadmin/sales/invitations",
    fetcher,
  )
  const [busyId, setBusyId] = useState<string | null>(null)

  const invitations = data?.invitations ?? []
  if (invitations.length === 0) return null

  async function approve(id: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/superadmin/sales/invitations/${id}/approval`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(j.details || j.error || "Errore approvazione")
        return
      }
      alert("Invito approvato. Email inviata all'agente.")
      mutate()
    } finally {
      setBusyId(null)
    }
  }

  async function reject(id: string) {
    const reason = prompt("Motivazione del rifiuto (verrà inviata al capo area):")
    if (!reason || !reason.trim()) return
    setBusyId(id)
    try {
      const res = await fetch(`/api/superadmin/sales/invitations/${id}/approval`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reject", reason: reason.trim() }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(j.details || j.error || "Errore rifiuto")
        return
      }
      mutate()
    } finally {
      setBusyId(null)
    }
  }

  async function resend(id: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/superadmin/sales/invitations/${id}`, {
        method: "POST",
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        alert(j.details || j.error || "Errore reinvio invito")
        return
      }
      alert("Email di invito reinviata. La scadenza e' stata estesa di 7 giorni.")
      mutate()
    } finally {
      setBusyId(null)
    }
  }

  async function cancel(id: string, email: string) {
    if (!confirm(`Annullare l'invito a ${email}? Il link diventera' invalido.`))
      return
    setBusyId(id)
    try {
      const res = await fetch(`/api/superadmin/sales/invitations/${id}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        alert(j.details || j.error || "Errore annullamento invito")
        return
      }
      mutate()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mb-8">
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-gray-900">
        <Clock className="h-4 w-4 text-amber-600" />
        Inviti pendenti ({invitations.length})
      </h2>
      <Card className="divide-y border-amber-100 bg-amber-50/30">
        {invitations.map((inv) => {
          const expired = new Date(inv.expires_at).getTime() < Date.now()
          const isPending = inv.approval_status === "pending"
          const isRejected = inv.approval_status === "rejected"
          return (
            <div
              key={inv.id}
              className={`flex items-center justify-between gap-3 px-4 py-3 ${
                isPending ? "bg-orange-50/60" : ""
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="truncate font-medium text-gray-900">
                    {inv.display_name || inv.email}
                  </span>
                  {isPending && (
                    <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">
                      Da approvare
                    </Badge>
                  )}
                  {isRejected && (
                    <Badge variant="secondary" className="bg-red-100 text-red-700">
                      Rifiutato
                    </Badge>
                  )}
                  {expired && !isPending && (
                    <Badge variant="secondary" className="bg-red-100 text-red-700">
                      Scaduto
                    </Badge>
                  )}
                  {inv.email_last_error && (
                    <Badge
                      variant="secondary"
                      className="bg-red-100 text-red-700"
                      title={inv.email_last_error}
                    >
                      Email fallita
                    </Badge>
                  )}
                </div>
                <div className="mt-0.5 truncate text-xs text-gray-500">
                  {inv.email}
                  {inv.default_commission_percentage != null &&
                    inv.default_commission_percentage > 0 && (
                      <> &middot; {inv.default_commission_percentage}% commissione</>
                    )}
                  {inv.invited_by_agent ? (
                    <>
                      {" "}
                      &middot; Invitato dal capo area{" "}
                      <strong>
                        {inv.invited_by_agent.display_name ||
                          inv.invited_by_agent.email}
                      </strong>
                    </>
                  ) : (
                    <>
                      {" "}
                      &middot; Inviato{" "}
                      {inv.email_last_sent_at
                        ? new Date(inv.email_last_sent_at).toLocaleDateString("it-IT")
                        : "mai"}
                      {inv.email_sent_count > 1
                        ? ` (${inv.email_sent_count} volte)`
                        : ""}
                    </>
                  )}
                </div>
                {isRejected && inv.rejection_reason && (
                  <div className="mt-1 text-xs text-red-700">
                    Motivo rifiuto: {inv.rejection_reason}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                {isPending ? (
                  <>
                    <Button
                      size="sm"
                      onClick={() => approve(inv.id)}
                      disabled={busyId === inv.id}
                    >
                      Approva
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => reject(inv.id)}
                      disabled={busyId === inv.id}
                    >
                      Rifiuta
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resend(inv.id)}
                      disabled={busyId === inv.id}
                      title="Reinvia email"
                    >
                      <Send className="mr-1.5 h-3.5 w-3.5" />
                      Reinvia
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => cancel(inv.id, inv.email)}
                      disabled={busyId === inv.id}
                      title="Annulla invito"
                    >
                      <X className="h-4 w-4 text-red-600" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </Card>
    </div>
  )
}
