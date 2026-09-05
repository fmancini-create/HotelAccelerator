"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Building2,
  CheckCircle2,
  CircleAlert,
  Crosshair,
  DatabaseZap,
  ExternalLink,
  HeartPulse,
  Pencil,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  Users,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  PLATFORM_PRODUCT_LABELS,
  type PlatformCustomerAccount,
  type PlatformProductKey,
  type PlatformSegment,
} from "@/lib/platform/customer-intelligence"

type Prospect = {
  id: string
  sales_stage: string
  lead_score: number
  next_action_at: string | null
  status: string
  organization_name: string | null
  full_name: string | null
  job_title: string | null
  country: string | null
  region: string | null
  city: string | null
  created_at: string
}

type CrossSellRow = {
  account_id: string
  account_number: number
  name: string
  product: PlatformProductKey
  score: number
  reasons: string[]
}

type CRMData = {
  accounts: PlatformCustomerAccount[]
  prospects: Prospect[]
  systemSegments: PlatformSegment[]
  crossSell: CrossSellRow[]
  stats: {
    customers: number
    prospects: number
    activeProducts: number
    multiProduct: number
    suiteComplete: number
    atRisk: number
    knownMrrCents: number
  }
}

type EditForm = {
  display_name: string
  legal_name: string
  lifecycle_stage: string
  account_type: string
  structures_count: string
  rooms_count: string
  city: string
  province: string
  region: string
  country: string
  website: string
  customer_tier: string
  health_status: string
  health_score: string
  adoption_score: string
  churn_risk_score: string
  potential_value_eur: string
  mrr_override_eur: string
  owner_label: string
  next_renewal_at: string
  tags: string
  notes: string
}

const LIFECYCLE_LABELS: Record<string, string> = {
  prospect: "Prospect",
  lead: "Lead",
  qualified: "Qualificato",
  demo_scheduled: "Demo fissata",
  demo_done: "Demo effettuata",
  proposal: "Offerta inviata",
  negotiation: "Trattativa",
  trial: "Trial",
  onboarding: "Onboarding",
  customer: "Cliente",
  at_risk: "A rischio",
  churned: "Disdetto",
  former_customer: "Ex cliente",
  partner: "Partner",
  internal: "Interno 4BID",
}

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  hotel_single: "Hotel singolo",
  hotel_group: "Gruppo alberghiero",
  chain: "Catena",
  resort: "Resort",
  agriturismo: "Agriturismo",
  bnb: "B&B",
  residence: "Residence",
  camping: "Camping",
  vacation_rental: "Case vacanza / appartamenti",
  consulting: "Consulenza",
  company: "Azienda",
  other: "Altro",
  unknown: "Da profilare",
}

const HEALTH_LABELS: Record<string, string> = {
  healthy: "Sano",
  watch: "Da osservare",
  risk: "A rischio",
  critical: "Critico",
  unknown: "Non misurato",
}

const SALES_STAGE_LABELS: Record<string, string> = {
  new: "Nuovo",
  linkedin_pending: "LinkedIn da contattare",
  linkedin_connected: "LinkedIn collegato",
  engaged: "Ingaggiato",
  email_followup: "Follow-up email",
  qualified: "Qualificato",
  won: "Vinto",
  lost: "Perso",
  paused: "In pausa",
}

const SEGMENT_CATEGORY_ORDER = ["Acquisizione", "Clienti", "Cross-sell", "Customer Health", "Rinnovi"]

function money(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return "—"
  return (cents / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—"
  return new Date(value).toLocaleDateString("it-IT")
}

function toDateInput(value: string | null | undefined) {
  return value ? new Date(value).toISOString().slice(0, 10) : ""
}

function productBadge(product: PlatformProductKey, status: string) {
  const active = ["active", "trial", "onboarding"].includes(status)
  return (
    <Badge key={product} variant={active ? "default" : "outline"} className="whitespace-nowrap">
      {PLATFORM_PRODUCT_LABELS[product]}
      {status === "trial" ? " · trial" : status === "onboarding" ? " · onboarding" : ""}
    </Badge>
  )
}

function buildEditForm(account: PlatformCustomerAccount): EditForm {
  const profile = account.profile
  return {
    display_name: profile.display_name ?? "",
    legal_name: profile.legal_name ?? "",
    lifecycle_stage: profile.lifecycle_stage,
    account_type: profile.account_type,
    structures_count: String(profile.structures_count ?? 1),
    rooms_count: profile.rooms_count === null ? "" : String(profile.rooms_count),
    city: profile.city ?? "",
    province: profile.province ?? "",
    region: profile.region ?? "",
    country: profile.country ?? "",
    website: profile.website ?? "",
    customer_tier: profile.customer_tier,
    health_status: profile.health_status,
    health_score: profile.health_score === null ? "" : String(profile.health_score),
    adoption_score: profile.adoption_score === null ? "" : String(profile.adoption_score),
    churn_risk_score: profile.churn_risk_score === null ? "" : String(profile.churn_risk_score),
    potential_value_eur: profile.potential_value_cents === null ? "" : String(profile.potential_value_cents / 100),
    mrr_override_eur: profile.mrr_override_cents === null ? "" : String(profile.mrr_override_cents / 100),
    owner_label: profile.owner_label ?? "",
    next_renewal_at: toDateInput(profile.next_renewal_at),
    tags: (profile.tags ?? []).join(", "),
    notes: profile.notes ?? "",
  }
}

export default function SuperAdminCRMPage() {
  const [data, setData] = useState<CRMData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState("overview")
  const [customerSearch, setCustomerSearch] = useState("")
  const [prospectSearch, setProspectSearch] = useState("")
  const [customerFilter, setCustomerFilter] = useState<string[]>([])
  const [editing, setEditing] = useState<PlatformCustomerAccount | null>(null)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/super-admin/crm", { cache: "no-store" })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || "Impossibile caricare il CRM Super Admin")
      setData(body)
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Impossibile caricare il CRM Super Admin")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const customers = useMemo(() => {
    if (!data) return []
    const q = customerSearch.trim().toLocaleLowerCase("it-IT")
    const allowed = customerFilter.length ? new Set(customerFilter) : null
    return data.accounts.filter((account) => {
      if (account.profile.lifecycle_stage === "internal") return false
      if (allowed && !allowed.has(account.id)) return false
      if (!q) return true
      const haystack = [
        account.profile.display_name,
        account.profile.legal_name,
        account.account_number,
        account.profile.city,
        account.profile.region,
        account.profile.owner_label,
        ACCOUNT_TYPE_LABELS[account.profile.account_type],
        LIFECYCLE_LABELS[account.profile.lifecycle_stage],
      ]
        .map((value) => String(value ?? "").toLocaleLowerCase("it-IT"))
        .join(" ")
      return haystack.includes(q)
    })
  }, [data, customerSearch, customerFilter])

  const prospects = useMemo(() => {
    if (!data) return []
    const q = prospectSearch.trim().toLocaleLowerCase("it-IT")
    if (!q) return data.prospects
    return data.prospects.filter((prospect) =>
      [prospect.organization_name, prospect.full_name, prospect.job_title, prospect.city, prospect.region, prospect.country]
        .some((value) => String(value ?? "").toLocaleLowerCase("it-IT").includes(q)),
    )
  }, [data, prospectSearch])

  const openEdit = (account: PlatformCustomerAccount) => {
    setEditing(account)
    setEditForm(buildEditForm(account))
  }

  const saveProfile = async () => {
    if (!editing || !editForm) return
    setSaving(true)
    try {
      const numberOrNull = (value: string) => (value.trim() === "" ? null : Number(value))
      const euroToCents = (value: string) => (value.trim() === "" ? null : Math.round(Number(value.replace(",", ".")) * 100))
      const updates = {
        display_name: editForm.display_name.trim() || null,
        legal_name: editForm.legal_name.trim() || null,
        lifecycle_stage: editForm.lifecycle_stage,
        account_type: editForm.account_type,
        structures_count: Math.max(0, Number(editForm.structures_count || 0)),
        rooms_count: numberOrNull(editForm.rooms_count),
        city: editForm.city.trim() || null,
        province: editForm.province.trim() || null,
        region: editForm.region.trim() || null,
        country: editForm.country.trim() || null,
        website: editForm.website.trim() || null,
        customer_tier: editForm.customer_tier,
        health_status: editForm.health_status,
        health_score: numberOrNull(editForm.health_score),
        adoption_score: numberOrNull(editForm.adoption_score),
        churn_risk_score: numberOrNull(editForm.churn_risk_score),
        potential_value_cents: euroToCents(editForm.potential_value_eur),
        mrr_override_cents: euroToCents(editForm.mrr_override_eur),
        owner_label: editForm.owner_label.trim() || null,
        next_renewal_at: editForm.next_renewal_at ? new Date(`${editForm.next_renewal_at}T12:00:00Z`).toISOString() : null,
        tags: editForm.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        notes: editForm.notes.trim() || null,
      }
      const response = await fetch("/api/super-admin/crm", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_account_id: editing.id, updates }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || "Salvataggio non riuscito")
      toast.success("Profilo cliente aggiornato")
      setEditing(null)
      setEditForm(null)
      await load()
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Salvataggio non riuscito")
    } finally {
      setSaving(false)
    }
  }

  const refreshRegistry = async () => {
    setRefreshing(true)
    try {
      const response = await fetch("/api/super-admin/crm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh_registry" }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || "Aggiornamento non riuscito")
      toast.success(`Registro suite aggiornato: ${body.refreshed ?? 0} prodotti`)
      await load()
    } catch (refreshError) {
      toast.error(refreshError instanceof Error ? refreshError.message : "Aggiornamento non riuscito")
    } finally {
      setRefreshing(false)
    }
  }

  const openSegment = (segment: PlatformSegment) => {
    if (segment.category === "Acquisizione") {
      setTab("prospects")
      return
    }
    setCustomerFilter(segment.accountIds)
    setCustomerSearch("")
    setTab("customers")
  }

  if (loading && !data) {
    return <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">Caricamento Customer Intelligence 4BID…</div>
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-3xl py-16 text-center">
        <CircleAlert className="mx-auto mb-3 h-8 w-8 text-destructive" />
        <h1 className="text-xl font-semibold">CRM Super Admin non disponibile</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        <Button className="mt-5" onClick={load}>Riprova</Button>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="mx-auto max-w-[1700px] space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-ha-brand" />
            <Badge variant="outline">4BID · Super Admin</Badge>
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Customer Intelligence</h1>
          <p className="mt-1 max-w-3xl text-muted-foreground">
            Un solo CRM commerciale per tutta la suite: aziende, prodotti posseduti, prospect, customer health e opportunità di cross-sell.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Ricarica
          </Button>
          <Button onClick={refreshRegistry} disabled={refreshing}>
            <DatabaseZap className={`mr-2 h-4 w-4 ${refreshing ? "animate-pulse" : ""}`} />
            Aggiorna registro suite
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
        {[
          ["Clienti suite", data.stats.customers, Building2],
          ["Prospect 4BID", data.stats.prospects, Target],
          ["Prodotti attivi", data.stats.activeProducts, CheckCircle2],
          ["Multi-prodotto", data.stats.multiProduct, Crosshair],
          ["Suite completa", data.stats.suiteComplete, Sparkles],
          ["A rischio", data.stats.atRisk, HeartPulse],
          ["MRR noto", money(data.stats.knownMrrCents), Users],
        ].map(([label, value, Icon]) => {
          const IconComponent = Icon as typeof Building2
          return (
            <Card key={String(label)}>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <IconComponent className="h-4 w-4" />
                  {String(label)}
                </div>
                <p className="mt-1 text-2xl font-bold">{typeof value === "number" ? value.toLocaleString("it-IT") : String(value)}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>}

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="overview">Panoramica</TabsTrigger>
          <TabsTrigger value="customers">Clienti</TabsTrigger>
          <TabsTrigger value="segments">Segmenti</TabsTrigger>
          <TabsTrigger value="cross-sell">Cross-sell</TabsTrigger>
          <TabsTrigger value="prospects">Prospect</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Priorità commerciali</CardTitle>
                <CardDescription>Le opportunità che il CRM ritiene più interessanti in questo momento.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.crossSell.slice(0, 8).map((row) => (
                  <button
                    key={`${row.account_id}-${row.product}`}
                    onClick={() => { setCustomerFilter([row.account_id]); setTab("customers") }}
                    className="flex w-full items-start justify-between gap-4 rounded-lg border p-3 text-left transition hover:bg-muted/40"
                  >
                    <div>
                      <p className="font-medium">{row.name}</p>
                      <p className="text-sm text-muted-foreground">Proponi {PLATFORM_PRODUCT_LABELS[row.product]}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{row.reasons.join(" · ") || "Opportunità da qualificare"}</p>
                    </div>
                    <Badge variant={row.score >= 75 ? "default" : "secondary"}>{row.score}%</Badge>
                  </button>
                ))}
                {data.crossSell.length === 0 && <p className="text-sm text-muted-foreground">Nessuna opportunità calcolata al momento.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Segmenti che richiedono attenzione</CardTitle>
                <CardDescription>Scorciatoie operative, aggiornate dai dati reali disponibili nel Core.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {data.systemSegments.filter((segment) => segment.count > 0).slice(0, 8).map((segment) => (
                  <button key={segment.id} onClick={() => openSegment(segment)} className="rounded-lg border p-3 text-left transition hover:bg-muted/40">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium">{segment.label}</span>
                      <span className="text-xl font-bold">{segment.count}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{segment.description}</p>
                  </button>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Copertura prodotti della suite</CardTitle>
              <CardDescription>Quanti account cliente risultano attivi per ciascun prodotto.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(Object.keys(PLATFORM_PRODUCT_LABELS) as PlatformProductKey[]).map((key) => {
                const count = data.accounts.filter((account) => account.profile.lifecycle_stage !== "internal" && account.products.some((p) => p.product_key === key && ["active", "trial", "onboarding"].includes(p.status))).length
                return (
                  <div key={key} className="rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground">{PLATFORM_PRODUCT_LABELS[key]}</p>
                    <p className="mt-1 text-3xl font-bold">{count}</p>
                    <p className="text-xs text-muted-foreground">account attivi</p>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="customers" className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative max-w-xl flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} placeholder="Cerca azienda, città, tipo, owner…" />
            </div>
            {customerFilter.length > 0 && (
              <Button variant="outline" onClick={() => setCustomerFilter([])}>Rimuovi filtro segmento ({customerFilter.length})</Button>
            )}
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1250px]">
                  <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="p-3 text-left">Cliente</th>
                      <th className="p-3 text-left">Profilo</th>
                      <th className="p-3 text-left">Dimensione</th>
                      <th className="p-3 text-left">Prodotti</th>
                      <th className="p-3 text-left">Health</th>
                      <th className="p-3 text-left">Owner</th>
                      <th className="p-3 text-left">Rinnovo</th>
                      <th className="p-3 text-right">Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((account) => (
                      <tr key={account.id} className="border-b align-top hover:bg-muted/20">
                        <td className="p-3">
                          <p className="font-medium">{account.profile.display_name || account.profile.legal_name || `Cliente 4BID #${account.account_number}`}</p>
                          <p className="text-xs text-muted-foreground">Account #{account.account_number}</p>
                          {account.profile.city && <p className="mt-1 text-xs text-muted-foreground">{[account.profile.city, account.profile.province, account.profile.region].filter(Boolean).join(" · ")}</p>}
                        </td>
                        <td className="p-3">
                          <Badge variant="outline">{LIFECYCLE_LABELS[account.profile.lifecycle_stage] || account.profile.lifecycle_stage}</Badge>
                          <p className="mt-2 text-sm">{ACCOUNT_TYPE_LABELS[account.profile.account_type] || account.profile.account_type}</p>
                          <p className="text-xs text-muted-foreground">Tier {account.profile.customer_tier}</p>
                        </td>
                        <td className="p-3 text-sm">
                          <div>{account.profile.structures_count} struttura/e</div>
                          <div className="text-muted-foreground">{account.profile.rooms_count === null ? "Camere da profilare" : `${account.profile.rooms_count} camere/unità`}</div>
                        </td>
                        <td className="p-3"><div className="flex max-w-md flex-wrap gap-1">{account.products.map((product) => productBadge(product.product_key, product.status))}</div></td>
                        <td className="p-3">
                          <Badge variant={["risk", "critical"].includes(account.profile.health_status) ? "destructive" : account.profile.health_status === "healthy" ? "default" : "secondary"}>
                            {HEALTH_LABELS[account.profile.health_status] || account.profile.health_status}
                          </Badge>
                          {account.profile.health_score !== null && <p className="mt-1 text-xs text-muted-foreground">Score {account.profile.health_score}/100</p>}
                        </td>
                        <td className="p-3 text-sm">{account.profile.owner_label || "—"}</td>
                        <td className="p-3 text-sm">{formatDate(account.profile.next_renewal_at)}</td>
                        <td className="p-3 text-right"><Button size="sm" variant="outline" onClick={() => openEdit(account)}><Pencil className="mr-2 h-3.5 w-3.5" />Profilo</Button></td>
                      </tr>
                    ))}
                    {customers.length === 0 && <tr><td colSpan={8} className="p-10 text-center text-sm text-muted-foreground">Nessun cliente nel filtro corrente.</td></tr>}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="segments" className="space-y-6">
          {SEGMENT_CATEGORY_ORDER.map((category) => {
            const rows = data.systemSegments.filter((segment) => segment.category === category)
            if (!rows.length) return null
            return (
              <section key={category}>
                <div className="mb-3"><h2 className="text-lg font-semibold">{category}</h2></div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {rows.map((segment) => (
                    <Card key={segment.id} className="transition hover:border-foreground/30">
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-4">
                          <CardTitle className="text-base">{segment.label}</CardTitle>
                          <span className="text-3xl font-bold">{segment.count}</span>
                        </div>
                        <CardDescription>{segment.description}</CardDescription>
                      </CardHeader>
                      <CardContent><Button size="sm" variant="outline" onClick={() => openSegment(segment)}>Apri segmento</Button></CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            )
          })}
        </TabsContent>

        <TabsContent value="cross-sell">
          <Card>
            <CardHeader>
              <CardTitle>Motore cross-sell 4BID</CardTitle>
              <CardDescription>Priorità calcolata da prodotti già attivi, tipologia e dimensione dell’azienda e customer health. È un ranking commerciale, non una decisione automatica.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[950px]">
                  <thead className="border-y bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="p-3 text-left">Cliente</th><th className="p-3 text-left">Prodotto suggerito</th><th className="p-3 text-left">Motivi</th><th className="p-3 text-left">Priorità</th><th className="p-3 text-right">Apri</th></tr></thead>
                  <tbody>
                    {data.crossSell.map((row) => (
                      <tr key={`${row.account_id}-${row.product}`} className="border-b">
                        <td className="p-3"><p className="font-medium">{row.name}</p><p className="text-xs text-muted-foreground">#{row.account_number}</p></td>
                        <td className="p-3 font-medium">{PLATFORM_PRODUCT_LABELS[row.product]}</td>
                        <td className="p-3 text-sm text-muted-foreground">{row.reasons.join(" · ") || "Da qualificare"}</td>
                        <td className="p-3"><Badge variant={row.score >= 75 ? "default" : "secondary"}>{row.score}%</Badge></td>
                        <td className="p-3 text-right"><Button size="sm" variant="ghost" onClick={() => { setCustomerFilter([row.account_id]); setTab("customers") }}><ExternalLink className="h-4 w-4" /></Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prospects" className="space-y-4">
          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" value={prospectSearch} onChange={(event) => setProspectSearch(event.target.value)} placeholder="Cerca prospect, azienda, ruolo o città…" />
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px]">
                  <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="p-3 text-left">Azienda / persona</th><th className="p-3 text-left">Ruolo</th><th className="p-3 text-left">Località</th><th className="p-3 text-left">Fase</th><th className="p-3 text-left">Lead score</th><th className="p-3 text-left">Prossima azione</th></tr></thead>
                  <tbody>
                    {prospects.map((prospect) => (
                      <tr key={prospect.id} className="border-b">
                        <td className="p-3"><p className="font-medium">{prospect.organization_name || "Azienda da qualificare"}</p><p className="text-xs text-muted-foreground">{prospect.full_name || "Referente non indicato"}</p></td>
                        <td className="p-3 text-sm">{prospect.job_title || "—"}</td>
                        <td className="p-3 text-sm">{[prospect.city, prospect.region, prospect.country].filter(Boolean).join(" · ") || "—"}</td>
                        <td className="p-3"><Badge variant="outline">{SALES_STAGE_LABELS[prospect.sales_stage] || prospect.sales_stage}</Badge></td>
                        <td className="p-3"><Badge variant={prospect.lead_score >= 60 ? "default" : prospect.lead_score >= 40 ? "secondary" : "outline"}>{prospect.lead_score}</Badge></td>
                        <td className="p-3 text-sm">{prospect.next_action_at ? new Date(prospect.next_action_at).toLocaleString("it-IT") : "—"}</td>
                      </tr>
                    ))}
                    {prospects.length === 0 && <tr><td colSpan={6} className="p-10 text-center text-sm text-muted-foreground">Nessun prospect trovato.</td></tr>}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open) { setEditing(null); setEditForm(null) } }}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Profilo cliente 4BID</DialogTitle>
            <DialogDescription>Profilazione commerciale condivisa a livello suite. Non modifica i dati operativi del tenant nei singoli prodotti.</DialogDescription>
          </DialogHeader>
          {editForm && (
            <div className="grid gap-4 py-2 md:grid-cols-2">
              <Field label="Nome commerciale"><Input value={editForm.display_name} onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })} /></Field>
              <Field label="Ragione sociale"><Input value={editForm.legal_name} onChange={(e) => setEditForm({ ...editForm, legal_name: e.target.value })} /></Field>
              <Field label="Lifecycle"><Select value={editForm.lifecycle_stage} onValueChange={(value) => setEditForm({ ...editForm, lifecycle_stage: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(LIFECYCLE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="Tipo azienda"><Select value={editForm.account_type} onValueChange={(value) => setEditForm({ ...editForm, account_type: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="N. strutture"><Input type="number" min="0" value={editForm.structures_count} onChange={(e) => setEditForm({ ...editForm, structures_count: e.target.value })} /></Field>
              <Field label="Camere / unità"><Input type="number" min="0" value={editForm.rooms_count} onChange={(e) => setEditForm({ ...editForm, rooms_count: e.target.value })} /></Field>
              <Field label="Città"><Input value={editForm.city} onChange={(e) => setEditForm({ ...editForm, city: e.target.value })} /></Field>
              <Field label="Provincia"><Input value={editForm.province} onChange={(e) => setEditForm({ ...editForm, province: e.target.value })} /></Field>
              <Field label="Regione"><Input value={editForm.region} onChange={(e) => setEditForm({ ...editForm, region: e.target.value })} /></Field>
              <Field label="Paese"><Input value={editForm.country} onChange={(e) => setEditForm({ ...editForm, country: e.target.value })} /></Field>
              <Field label="Sito"><Input value={editForm.website} onChange={(e) => setEditForm({ ...editForm, website: e.target.value })} placeholder="https://…" /></Field>
              <Field label="Account owner"><Input value={editForm.owner_label} onChange={(e) => setEditForm({ ...editForm, owner_label: e.target.value })} placeholder="Commerciale / referente 4BID" /></Field>
              <Field label="Tier"><Select value={editForm.customer_tier} onValueChange={(value) => setEditForm({ ...editForm, customer_tier: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="bronze">Bronze</SelectItem><SelectItem value="silver">Silver</SelectItem><SelectItem value="gold">Gold</SelectItem><SelectItem value="strategic">Strategic</SelectItem></SelectContent></Select></Field>
              <Field label="Customer health"><Select value={editForm.health_status} onValueChange={(value) => setEditForm({ ...editForm, health_status: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(HEALTH_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="Health score 0-100"><Input type="number" min="0" max="100" value={editForm.health_score} onChange={(e) => setEditForm({ ...editForm, health_score: e.target.value })} /></Field>
              <Field label="Adoption score 0-100"><Input type="number" min="0" max="100" value={editForm.adoption_score} onChange={(e) => setEditForm({ ...editForm, adoption_score: e.target.value })} /></Field>
              <Field label="Churn risk 0-100"><Input type="number" min="0" max="100" value={editForm.churn_risk_score} onChange={(e) => setEditForm({ ...editForm, churn_risk_score: e.target.value })} /></Field>
              <Field label="Potenziale €"><Input inputMode="decimal" value={editForm.potential_value_eur} onChange={(e) => setEditForm({ ...editForm, potential_value_eur: e.target.value })} /></Field>
              <Field label="MRR manuale €"><Input inputMode="decimal" value={editForm.mrr_override_eur} onChange={(e) => setEditForm({ ...editForm, mrr_override_eur: e.target.value })} /></Field>
              <Field label="Prossimo rinnovo"><Input type="date" value={editForm.next_renewal_at} onChange={(e) => setEditForm({ ...editForm, next_renewal_at: e.target.value })} /></Field>
              <Field label="Tag" className="md:col-span-2"><Input value={editForm.tags} onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })} placeholder="strategic, gruppo, testimonial…" /><p className="text-xs text-muted-foreground">Separati da virgola.</p></Field>
              <Field label="Note commerciali" className="md:col-span-2"><Textarea rows={4} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} /></Field>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => { setEditing(null); setEditForm(null) }}>Annulla</Button><Button onClick={saveProfile} disabled={saving}>{saving ? "Salvataggio…" : "Salva profilo"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={`space-y-2 ${className}`}><Label>{label}</Label>{children}</div>
}
