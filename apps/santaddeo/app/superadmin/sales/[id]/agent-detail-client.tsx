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
import { ArrowLeft, Save, Trash2, Building2, Users, Mail, Plus, Send, MailCheck, History } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { AgentCommissionPeriodsEditor } from "@/components/superadmin/agent-commission-periods-editor"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

/**
 * Genera l'alias mittente suggerito nel formato n.cognome@santaddeo.com a
 * partire dal nome del venditore (display_name) o, in mancanza, dalla parte
 * locale della sua email. Rimuove accenti, spazi e caratteri non validi.
 */
function suggestSenderAlias(agent: any): string {
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // accenti
      .toLowerCase()
      .replace(/[^a-z\s'-]/g, "")
      .trim()

  const raw: string = (agent?.display_name ?? "").trim()
  let first = ""
  let last = ""
  if (raw) {
    const parts = norm(raw).split(/\s+/).filter(Boolean)
    if (parts.length >= 2) {
      first = parts[0]
      last = parts.slice(1).join("")
    } else if (parts.length === 1) {
      last = parts[0]
    }
  }
  // Fallback sulla parte locale dell'email personale (es. m.rossi@...).
  if (!last && typeof agent?.email === "string" && agent.email.includes("@")) {
    const local = norm(agent.email.split("@")[0].replace(/[._-]+/g, " "))
    const parts = local.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) {
      first = parts[0]
      last = parts.slice(1).join("")
    } else if (parts.length === 1) {
      last = parts[0]
    }
  }
  if (!last) return ""
  const initial = first ? `${first[0]}.` : ""
  return `${initial}${last.replace(/[\s'-]/g, "")}@santaddeo.com`
}

type AgentDetail = {
  agent: any
  associations: Array<{
    id: string
    hotel_id: string
    commission_percentage: number | null
    commission_basis: "mrr" | "one_time" | "mrr_first_only"
    lead_status: string
    can_view_subscription: boolean
    can_view_payments: boolean
    can_view_metrics: boolean
    can_view_full_dashboard: boolean
    attached_at: string
    attached_via: string
    activated_at: string | null
    notes: string | null
    hotels: { id: string; name: string; is_active: boolean } | null
  }>
  ledger: Array<{
    id: string
    period_year: number
    period_month: number
    amount: number
    status: string
    notes: string | null
  }>
  leads: Array<{
    id: string
    first_name: string
    last_name: string
    email: string
    hotel_name: string
    status: string
    email_sent_at: string | null
    registered_at: string | null
    converted_at: string | null
    created_at: string
  }>
}

const STATUS_LABEL: Record<string, string> = {
  lead: "Lead",
  invited: "Invitato",
  registered: "Registrato",
  configured: "Configurato",
  active: "Attivo",
  suspended: "Sospeso",
  churned: "Disattivato",
}

const STATUS_COLOR: Record<string, string> = {
  lead: "bg-gray-100 text-gray-700",
  invited: "bg-blue-100 text-blue-700",
  registered: "bg-purple-100 text-purple-700",
  configured: "bg-amber-100 text-amber-800",
  active: "bg-emerald-100 text-emerald-700",
  suspended: "bg-orange-100 text-orange-700",
  churned: "bg-red-100 text-red-700",
}

export function AgentDetailClient({ agentId }: { agentId: string }) {
  const { data, mutate, isLoading } = useSWR<AgentDetail>(
    `/api/superadmin/sales/agents/${agentId}`,
    fetcher,
  )

  if (isLoading) return <div className="p-8 text-sm text-gray-500">Caricamento...</div>
  if (!data?.agent)
    return (
      <div className="p-8">
        <Link href="/superadmin/sales" className="text-sm text-gray-600 hover:underline">
          ← Torna alla lista
        </Link>
        <p className="mt-4 text-red-600">Venditore non trovato.</p>
      </div>
    )

  return (
    <div className="container mx-auto px-4 py-6">
      <Link
        href="/superadmin/sales"
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-600 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Tutti i venditori
      </Link>

      <AgentHeader agent={data.agent} agentId={agentId} onChange={() => mutate()} />

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Building2 className="h-5 w-5" /> Strutture associate (
                {data.associations.length})
              </h2>
              <AssociateHotelDialog
                agentId={agentId}
                defaultCommission={data.agent.default_commission_percentage}
                alreadyAssociatedIds={data.associations
                  .map((a) => a.hotel_id)
                  .filter(Boolean)}
                onAssociated={() => mutate()}
              />
            </div>
            {data.associations.length === 0 ? (
              <Card className="p-6 text-sm text-gray-500">
                Nessuna struttura associata. Le strutture vengono associate automaticamente quando un
                lead invitato si registra e completa l&apos;onboarding, oppure manualmente con il
                pulsante <strong>Associa struttura</strong> qui sopra.
              </Card>
            ) : (
              <div className="space-y-3">
                {data.associations.map((a) => (
                  <AssociationCard key={a.id} a={a} agentId={agentId} onChange={() => mutate()} />
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold flex items-center gap-2">
              <Users className="h-5 w-5" /> Lead inseriti ({data.leads.length})
            </h2>
            {data.leads.length === 0 ? (
              <Card className="p-6 text-sm text-gray-500">Nessun lead.</Card>
            ) : (
              <Card className="divide-y">
                {data.leads.slice(0, 50).map((l) => (
                  <div key={l.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {l.first_name} {l.last_name}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {l.email} · {l.hotel_name}
                      </div>
                    </div>
                    <Badge className={STATUS_COLOR[l.status] ?? ""} variant="secondary">
                      {STATUS_LABEL[l.status] ?? l.status}
                    </Badge>
                  </div>
                ))}
              </Card>
            )}
          </section>
        </div>

        <div>
          <Card className="p-5">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Storico commissioni
            </h3>
            {data.ledger.length === 0 ? (
              <p className="text-sm text-gray-500">Nessuna commissione registrata.</p>
            ) : (
              <div className="space-y-2">
                {data.ledger.map((l) => (
                  <div key={l.id} className="flex items-center justify-between text-sm">
                    <span>
                      {String(l.period_month).padStart(2, "0")}/{l.period_year}
                    </span>
                    <span className="font-medium">€ {Number(l.amount).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 text-xs text-gray-400">
              Le commissioni si registrano qui mensilmente da un job dedicato (in arrivo).
            </p>
          </Card>
        </div>
      </div>
    </div>
  )
}

function AgentHeader({
  agent,
  agentId,
  onChange,
}: {
  agent: any
  agentId: string
  onChange: () => void
}) {
  const [edit, setEdit] = useState(false)
  const [form, setForm] = useState({
    display_name: agent.display_name ?? "",
    phone: agent.phone ?? "",
    sender_email: agent.sender_email ?? "",
    sender_name: agent.sender_name ?? "",
    default_commission_percentage:
      agent.default_commission_percentage != null
        ? String(agent.default_commission_percentage)
        : "",
    is_active: agent.is_active,
    global_can_view_subscription: agent.global_can_view_subscription,
    global_can_view_payments: agent.global_can_view_payments,
    global_can_view_metrics: agent.global_can_view_metrics,
    global_can_view_full_dashboard: agent.global_can_view_full_dashboard,
    notes: agent.notes ?? "",
    // Gerarchia capo area
    is_area_manager: !!agent.is_area_manager,
    parent_agent_id: agent.parent_agent_id ?? "",
    area_manager_override_pct:
      agent.area_manager_override_pct != null
        ? String(agent.area_manager_override_pct)
        : "",
  })

  // Carica elenco capi area + default sistema. Non blocchiamo il form se
  // fallisce: il super-admin puo' comunque salvare gli altri campi.
  const { data: areaMeta } = useSWR<{
    default_pct: number
    area_managers: Array<{ id: string; display_name: string | null; is_active: boolean }>
  }>(edit ? "/api/superadmin/sales/area-managers" : null, fetcher)

  async function save() {
    const res = await fetch(`/api/superadmin/sales/agents/${agentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        display_name: form.display_name || null,
        phone: form.phone || null,
        sender_email: form.sender_email.trim().toLowerCase() || null,
        sender_name: form.sender_name || null,
        default_commission_percentage: form.default_commission_percentage
          ? Number.parseFloat(form.default_commission_percentage)
          : null,
        is_active: form.is_active,
        global_can_view_subscription: form.global_can_view_subscription,
        global_can_view_payments: form.global_can_view_payments,
        global_can_view_metrics: form.global_can_view_metrics,
        global_can_view_full_dashboard: form.global_can_view_full_dashboard,
        notes: form.notes || null,
        is_area_manager: form.is_area_manager,
        // Se e' area manager, parent va forzato a null (anche il server lo fa,
        // qui per coerenza UI). Se non e' area manager, manda l'eventuale parent.
        parent_agent_id: form.is_area_manager
          ? null
          : form.parent_agent_id || null,
        area_manager_override_pct:
          form.is_area_manager && form.area_manager_override_pct
            ? Number.parseFloat(form.area_manager_override_pct)
            : null,
      }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      alert(j.error || "Errore salvataggio")
      return
    }
    setEdit(false)
    onChange()
  }

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">
            {agent.display_name ?? agent.email ?? "—"}
          </h1>
          <p className="mt-1 text-sm text-gray-500 flex items-center gap-1">
            <Mail className="h-3 w-3" />
            {agent.email}
          </p>
          <p className="mt-1 text-xs flex items-center gap-1">
            <Send className="h-3 w-3 text-gray-400" />
            {agent.sender_email ? (
              <span className="text-teal-700">
                Invia come: <strong>{agent.sender_email}</strong>
              </span>
            ) : (
              <span className="text-gray-400">
                Invia come: noreply@santaddeo.com (default)
              </span>
            )}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {!agent.is_active && <Badge variant="secondary">Disattivato</Badge>}
            {agent.is_area_manager && (
              <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">
                Capo area
              </Badge>
            )}
            {agent.parent_agent_id && (
              <Badge variant="outline" className="text-xs">
                Sotto capo area
              </Badge>
            )}
          </div>
        </div>
        {edit ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEdit(false)}>
              Annulla
            </Button>
            <Button onClick={save}>
              <Save className="mr-2 h-4 w-4" />
              Salva
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <SendWelcomeEmailButton agentId={agentId} email={agent.email} />
            <Button variant="outline" onClick={() => setEdit(true)}>
              Modifica
            </Button>
          </div>
        )}
      </div>

      {edit && (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div>
            <Label>Nome visualizzato</Label>
            <Input
              value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            />
          </div>
          <div>
            <Label>Telefono</Label>
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div className="md:col-span-2 rounded-lg border border-teal-200 bg-teal-50 p-4">
            <Label className="mb-1 block font-semibold text-teal-900">
              Identità mittente email (CRM)
            </Label>
            <p className="mb-3 text-xs text-teal-800">
              Indirizzo <strong>@santaddeo.com</strong> da cui partono le email di questo venditore.
              Deve essere un alias <strong>verificato</strong> in &quot;Invia messaggi come&quot;
              sull&apos;account <strong>noreply@santaddeo.com</strong> (l&apos;account SMTP di invio),
              altrimenti Gmail riscriverà il mittente. Lascia vuoto per usare il mittente di default
              (noreply@santaddeo.com).
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Email mittente</Label>
                <Input
                  type="email"
                  placeholder="n.cognome@santaddeo.com"
                  value={form.sender_email}
                  onChange={(e) => setForm({ ...form, sender_email: e.target.value })}
                />
                {(() => {
                  const suggested = suggestSenderAlias(agent)
                  if (!suggested) return null
                  const alreadySet = form.sender_email.trim().toLowerCase() === suggested
                  return (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-teal-800">
                      <span>
                        Alias suggerito: <strong className="font-mono">{suggested}</strong>
                      </span>
                      {alreadySet ? (
                        <span className="rounded-full bg-teal-100 px-2 py-0.5 font-medium text-teal-700">
                          impostato
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="rounded-full border border-teal-300 bg-white px-2 py-0.5 font-medium text-teal-700 hover:bg-teal-100"
                          onClick={() => setForm({ ...form, sender_email: suggested })}
                        >
                          Usa
                        </button>
                      )}
                    </div>
                  )
                })()}
              </div>
              <div>
                <Label>Nome visualizzato mittente</Label>
                <Input
                  placeholder="Es. Mario Rossi (lascia vuoto = nome venditore)"
                  value={form.sender_name}
                  onChange={(e) => setForm({ ...form, sender_name: e.target.value })}
                />
              </div>
            </div>
          </div>
          <div>
            <Label>% commissione default</Label>
            <Input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={form.default_commission_percentage}
              onChange={(e) =>
                setForm({ ...form, default_commission_percentage: e.target.value })
              }
            />
          </div>
          <div className="flex items-center gap-3 pt-6">
            <Switch
              checked={form.is_active}
              onCheckedChange={(v) => setForm({ ...form, is_active: v })}
            />
            <Label>Venditore attivo</Label>
          </div>
          <div className="md:col-span-2">
            <Label className="mb-2 block">
              Permessi globali (validi per tutte le strutture, in OR coi permessi per-struttura)
            </Label>
            <div className="grid gap-2 md:grid-cols-2">
              <PermissionToggle
                label="Vede abbonamento"
                checked={form.global_can_view_subscription}
                onChange={(v) =>
                  setForm({ ...form, global_can_view_subscription: v })
                }
              />
              <PermissionToggle
                label="Vede pagamenti"
                checked={form.global_can_view_payments}
                onChange={(v) => setForm({ ...form, global_can_view_payments: v })}
              />
              <PermissionToggle
                label="Vede metriche operative"
                checked={form.global_can_view_metrics}
                onChange={(v) => setForm({ ...form, global_can_view_metrics: v })}
              />
              <PermissionToggle
                label="Vede dashboard completa (tutto come superadmin)"
                checked={form.global_can_view_full_dashboard}
                onChange={(v) =>
                  setForm({ ...form, global_can_view_full_dashboard: v })
                }
              />
            </div>
          </div>
          <div className="md:col-span-2 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <Label className="mb-3 block font-semibold">Gerarchia / Capo area</Label>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex items-center gap-3">
                <Switch
                  checked={form.is_area_manager}
                  onCheckedChange={(v) =>
                    setForm({
                      ...form,
                      is_area_manager: v,
                      // se diventa capo area, sgancia da eventuale parent
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
                <div>
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
                        setForm({
                          ...form,
                          area_manager_override_pct: e.target.value,
                        })
                      }
                    />
                    <span className="text-sm text-gray-500">%</span>
                  </div>
                </div>
              ) : (
                <div>
                  <Label>Capo area di riferimento (opzionale)</Label>
                  <Select
                    value={form.parent_agent_id || "__none__"}
                    onValueChange={(v) =>
                      setForm({
                        ...form,
                        parent_agent_id: v === "__none__" ? "" : v,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Nessun capo area" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Nessun capo area</SelectItem>
                      {(areaMeta?.area_managers ?? [])
                        .filter((am) => am.is_active && am.id !== agentId)
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
          </div>
          <div className="md:col-span-2">
            <Label>Note interne</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
            />
          </div>
        </div>
      )}
    </Card>
  )
}

/**
 * Pulsante "Invia email di benvenuto" nell'header del dettaglio venditore.
 * A differenza della versione in `sales-agents-client.tsx` (che vive dentro
 * un <Link> con preventDefault), qui e' un Button shadcn standard. Stesso
 * endpoint backend.
 */
function SendWelcomeEmailButton({
  agentId,
  email,
}: {
  agentId: string
  email: string | null | undefined
}) {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function handleClick() {
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
      setTimeout(() => setDone(false), 4000)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      variant="outline"
      onClick={handleClick}
      disabled={busy || !email}
      title={
        done
          ? "Email inviata"
          : "Invia un'email di benvenuto al venditore con il link di accesso"
      }
    >
      {done ? (
        <>
          <MailCheck className="mr-2 h-4 w-4 text-emerald-600" />
          <span className="text-emerald-700">Email inviata</span>
        </>
      ) : (
        <>
          <Send className="mr-2 h-4 w-4" />
          {busy ? "Invio..." : "Invia email di benvenuto"}
        </>
      )}
    </Button>
  )
}

function PermissionToggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-gray-200 p-2 text-sm">
      <Switch checked={checked} onCheckedChange={onChange} />
      <span>{label}</span>
    </div>
  )
}

/**
 * Dialog "Associa struttura" — fa upsert su sales_agent_hotels via
 * POST /api/superadmin/sales/agent-hotels.
 *
 * Usa l'endpoint /api/superadmin/hotels-list che restituisce TUTTE le
 * strutture; in client filtriamo via `alreadyAssociatedIds` per non
 * mostrarne di gia' presenti (l'upsert sarebbe comunque idempotente, ma
 * l'UX e' piu' chiara).
 */
function AssociateHotelDialog({
  agentId,
  defaultCommission,
  alreadyAssociatedIds,
  onAssociated,
}: {
  agentId: string
  defaultCommission: number | null | undefined
  alreadyAssociatedIds: string[]
  onAssociated: () => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [hotelId, setHotelId] = useState<string>("")
  const [commissionPct, setCommissionPct] = useState<string>(
    defaultCommission != null ? String(defaultCommission) : "",
  )
  const [commissionBasis, setCommissionBasis] = useState<
    "mrr" | "one_time" | "mrr_first_only"
  >("mrr")
  const [perms, setPerms] = useState({
    can_view_subscription: false,
    can_view_payments: false,
    can_view_metrics: false,
    can_view_full_dashboard: false,
  })
  const [busy, setBusy] = useState(false)
  const [listOpen, setListOpen] = useState(true)

  const { data: hotelsData } = useSWR<{
    hotels: Array<{ id: string; name: string; total_rooms: number | null }>
  }>(open ? "/api/superadmin/hotels-list" : null, fetcher)

  const associatedSet = new Set(alreadyAssociatedIds)
  const filteredHotels = (hotelsData?.hotels ?? [])
    .filter((h) => !associatedSet.has(h.id))
    .filter((h) =>
      search.trim() ? h.name.toLowerCase().includes(search.toLowerCase()) : true,
    )

  function reset() {
    setHotelId("")
    setSearch("")
    setListOpen(true)
    setCommissionPct(defaultCommission != null ? String(defaultCommission) : "")
    setCommissionBasis("mrr")
    setPerms({
      can_view_subscription: false,
      can_view_payments: false,
      can_view_metrics: false,
      can_view_full_dashboard: false,
    })
  }

  async function submit() {
    if (!hotelId) {
      alert("Seleziona una struttura")
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/superadmin/sales/agent-hotels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sales_agent_id: agentId,
          hotel_id: hotelId,
          commission_percentage: commissionPct
            ? Number.parseFloat(commissionPct)
            : null,
          commission_basis: commissionBasis,
          lead_status: "configured",
          can_view_subscription: perms.can_view_subscription,
          can_view_payments: perms.can_view_payments,
          can_view_metrics: perms.can_view_metrics,
          can_view_full_dashboard: perms.can_view_full_dashboard,
          attached_via: "manual_admin",
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        alert(j.error || "Errore associazione")
        return
      }
      onAssociated()
      setOpen(false)
      reset()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) reset()
      }}
    >
      <Button onClick={() => setOpen(true)} size="sm">
        <Plus className="mr-2 h-4 w-4" />
        Associa struttura
      </Button>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Associa una struttura al venditore</DialogTitle>
          <DialogDescription>
            La struttura selezionata verra&apos; collegata immediatamente. Il venditore
            potra&apos; vederla nella sua dashboard secondo i permessi qui sotto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Struttura</Label>
            {/* Se hotel selezionato e lista chiusa, mostra bottone con nome hotel */}
            {hotelId && !listOpen ? (
              <button
                type="button"
                onClick={() => setListOpen(true)}
                className="flex w-full cursor-pointer items-center justify-between rounded-md border bg-amber-50 px-3 py-2 text-left text-sm hover:bg-amber-100"
              >
                <span className="font-medium">
                  {hotelsData?.hotels?.find((h) => h.id === hotelId)?.name ?? "Struttura selezionata"}
                </span>
                <span className="text-xs text-amber-600">Cambia</span>
              </button>
            ) : (
              <>
                <Input
                  placeholder="Cerca per nome..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="mb-2"
                />
                <div className="max-h-48 overflow-y-auto rounded-md border bg-white">
                  {filteredHotels.length === 0 ? (
                    <div className="p-3 text-center text-xs text-gray-500">
                      {hotelsData?.hotels
                        ? alreadyAssociatedIds.length > 0
                          ? "Tutte le strutture sono gia' associate o non corrispondono alla ricerca."
                          : "Nessuna struttura trovata."
                        : "Caricamento..."}
                    </div>
                  ) : (
                    filteredHotels.map((h) => (
                      <button
                        type="button"
                        key={h.id}
                        onClick={() => {
                          setHotelId(h.id)
                          setListOpen(false)
                        }}
                        className={`flex w-full cursor-pointer items-center justify-between border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-gray-50 focus:bg-amber-100 focus:outline-none ${
                          hotelId === h.id ? "bg-amber-50 ring-2 ring-amber-300" : ""
                        }`}
                      >
                        <span className="truncate font-medium">{h.name}</span>
                        {h.total_rooms != null && (
                          <span className="ml-2 shrink-0 text-xs text-gray-400">
                            {h.total_rooms} camere
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>% commissione</Label>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.5"
                placeholder="es. 10"
                value={commissionPct}
                onChange={(e) => setCommissionPct(e.target.value)}
              />
            </div>
            <div>
              <Label>Tipo commissione</Label>
              <Select
                value={commissionBasis}
                onValueChange={(v: "mrr" | "one_time" | "mrr_first_only") =>
                  setCommissionBasis(v)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mrr">MRR ricorrente</SelectItem>
                  <SelectItem value="one_time">Una tantum</SelectItem>
                  <SelectItem value="mrr_first_only">Solo primo mese</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Permessi su questa struttura</Label>
            <div className="grid gap-2 md:grid-cols-2">
              <PermissionToggle
                label="Abbonamento"
                checked={perms.can_view_subscription}
                onChange={(v) =>
                  setPerms({ ...perms, can_view_subscription: v })
                }
              />
              <PermissionToggle
                label="Pagamenti"
                checked={perms.can_view_payments}
                onChange={(v) => setPerms({ ...perms, can_view_payments: v })}
              />
              <PermissionToggle
                label="Metriche"
                checked={perms.can_view_metrics}
                onChange={(v) => setPerms({ ...perms, can_view_metrics: v })}
              />
              <PermissionToggle
                label="Dashboard completa"
                checked={perms.can_view_full_dashboard}
                onChange={(v) =>
                  setPerms({ ...perms, can_view_full_dashboard: v })
                }
              />
            </div>
            <p className="mt-2 text-xs text-gray-500">
              I permessi globali del venditore valgono sempre in <strong>OR</strong>:
              quelli qui sotto si sommano a quelli impostati nell&apos;header.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Annulla
          </Button>
          <Button onClick={submit} disabled={busy || !hotelId}>
            {busy ? "Associo..." : "Associa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AssociationCard({
  a,
  agentId,
  onChange,
}: {
  a: AgentDetail["associations"][number]
  agentId: string
  onChange: () => void
}) {
  const [edit, setEdit] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [form, setForm] = useState({
    commission_percentage:
      a.commission_percentage != null ? String(a.commission_percentage) : "",
    commission_basis: a.commission_basis,
    lead_status: a.lead_status,
    can_view_subscription: a.can_view_subscription,
    can_view_payments: a.can_view_payments,
    can_view_metrics: a.can_view_metrics,
    can_view_full_dashboard: a.can_view_full_dashboard,
    notes: a.notes ?? "",
  })
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      const res = await fetch(`/api/superadmin/sales/agent-hotels/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commission_percentage: form.commission_percentage
            ? Number.parseFloat(form.commission_percentage)
            : null,
          commission_basis: form.commission_basis,
          lead_status: form.lead_status,
          can_view_subscription: form.can_view_subscription,
          can_view_payments: form.can_view_payments,
          can_view_metrics: form.can_view_metrics,
          can_view_full_dashboard: form.can_view_full_dashboard,
          notes: form.notes || null,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        alert(j.error || "Errore salvataggio")
        return
      }
      setEdit(false)
      onChange()
    } finally {
      setBusy(false)
    }
  }

  async function detach() {
    if (!confirm("Rimuovere l'associazione? La struttura non sara' piu' visibile al venditore."))
      return
    const res = await fetch(`/api/superadmin/sales/agent-hotels/${a.id}`, {
      method: "DELETE",
    })
    if (!res.ok) {
      alert("Errore rimozione")
      return
    }
    onChange()
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">
              {a.hotels?.name ?? "(struttura eliminata)"}
            </span>
            <Badge className={STATUS_COLOR[a.lead_status] ?? ""} variant="secondary">
              {STATUS_LABEL[a.lead_status] ?? a.lead_status}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {a.attached_via === "lead_token"
                ? "auto"
                : a.attached_via === "manual_admin"
                  ? "manuale"
                  : "lookup"}
            </Badge>
          </div>
          <div className="mt-1 text-xs text-gray-500">
            Commissione:{" "}
            {a.commission_percentage != null
              ? `${a.commission_percentage}% ${a.commission_basis === "mrr" ? "(MRR)" : a.commission_basis === "one_time" ? "(una tantum)" : "(solo primo mese)"}`
              : "non configurata"}
          </div>
        </div>
        <div className="flex gap-2">
          {!edit ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowHistory(true)}
                title="Storia commissioni nel tempo"
              >
                <History className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEdit(true)}>
                Modifica
              </Button>
              <Button size="sm" variant="ghost" onClick={detach} title="Rimuovi associazione">
                <Trash2 className="h-4 w-4 text-red-600" />
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => setEdit(false)} disabled={busy}>
                Annulla
              </Button>
              <Button size="sm" onClick={save} disabled={busy}>
                Salva
              </Button>
            </>
          )}
        </div>
      </div>

      {edit && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <Label>% commissione</Label>
            <Input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={form.commission_percentage}
              onChange={(e) => setForm({ ...form, commission_percentage: e.target.value })}
            />
          </div>
          <div>
            <Label>Tipo commissione</Label>
            <Select
              value={form.commission_basis}
              onValueChange={(v: any) => setForm({ ...form, commission_basis: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mrr">MRR ricorrente</SelectItem>
                <SelectItem value="one_time">Una tantum</SelectItem>
                <SelectItem value="mrr_first_only">Solo primo mese</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Stato struttura</Label>
            <Select
              value={form.lead_status}
              onValueChange={(v) => setForm({ ...form, lead_status: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_LABEL).map(([k, l]) => (
                  <SelectItem key={k} value={k}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label className="mb-2 block">Permessi per questa struttura (override globali)</Label>
            <div className="grid gap-2 md:grid-cols-2">
              <PermissionToggle
                label="Abbonamento"
                checked={form.can_view_subscription}
                onChange={(v) => setForm({ ...form, can_view_subscription: v })}
              />
              <PermissionToggle
                label="Pagamenti"
                checked={form.can_view_payments}
                onChange={(v) => setForm({ ...form, can_view_payments: v })}
              />
              <PermissionToggle
                label="Metriche"
                checked={form.can_view_metrics}
                onChange={(v) => setForm({ ...form, can_view_metrics: v })}
              />
              <PermissionToggle
                label="Dashboard completa"
                checked={form.can_view_full_dashboard}
                onChange={(v) => setForm({ ...form, can_view_full_dashboard: v })}
              />
            </div>
          </div>
          <div className="md:col-span-2">
            <Label>Note</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
            />
          </div>
        </div>
      )}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Storia commissioni — {a.hotels?.name ?? "(struttura)"}
            </DialogTitle>
            <DialogDescription>
              Periodi di commissione applicati nel tempo. Utilizzati dal cron di
              riconciliazione mensile per calcolare la commissione corretta in
              base alla data della fattura.
            </DialogDescription>
          </DialogHeader>
          <AgentCommissionPeriodsEditor agentId={agentId} hotelId={a.hotel_id} />
        </DialogContent>
      </Dialog>
    </Card>
  )
}
