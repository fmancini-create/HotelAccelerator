"use client"

import useSWR from "swr"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  TrendingUp,
  Users,
  Target,
  Activity,
  CheckCircle2,
  Clock,
  Coins,
  Award,
  AlertTriangle,
  ArrowRight,
} from "lucide-react"
import { useState } from "react"
import Link from "next/link"

/**
 * Fetcher robusto: lancia errore esplicito se la response non e' OK,
 * cosi' SWR popola `error` invece di passare `{ error: "..." }` come `data`.
 * Distinguiamo 404 agent_not_found (super_admin senza agent_id selezionato,
 * o sales_agent senza riga in sales_agents) per mostrare UI dedicata.
 */
class ApiError extends Error {
  status: number
  code?: string
  constructor(status: number, message: string, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}
const fetcher = async (url: string) => {
  const r = await fetch(url, { cache: "no-store" })
  const json = await r.json().catch(() => ({}))
  if (!r.ok) {
    throw new ApiError(r.status, json?.error ?? `HTTP ${r.status}`, json?.error)
  }
  return json
}

interface StatsData {
  period: { months: number; from: string; to: string }
  kpi: {
    prospect_total: number
    deals_open_count: number
    deals_open_value: number
    deals_won_count: number
    deals_won_value: number
    deals_lost_count: number
    win_rate: number
    conversion_rate: number
    activities_count: number
    tasks_pending: number
    tasks_completed_period: number
    mrr_current: number
  }
  prospect_by_status: Record<string, number>
  deals_by_stage: Record<string, { count: number; value: number }>
  activities_by_type: Record<string, number>
  activities_by_week: Array<{
    week: string
    label: string
    call: number
    email: number
    visit: number
    meeting: number
    note: number
  }>
  mrr_by_month: Array<{ month: string; label: string; mrr: number; new_count: number }>
  commissions_by_month: Array<{
    month: string
    label: string
    paid: number
    pending: number
  }>
  stale_prospects: Array<{
    id: string
    name: string
    city: string | null
    last_contact_at: string | null
    status: string
  }>
}

const STATUS_LABELS: Record<string, string> = {
  to_contact: "Da contattare",
  contacted: "Contattati",
  qualified: "Qualificati",
  proposal: "In proposta",
  negotiation: "In trattativa",
  won: "Convertiti",
  lost: "Persi",
  unknown: "Altro",
}
const STATUS_COLORS: Record<string, string> = {
  to_contact: "#94a3b8",
  contacted: "#0ea5e9",
  qualified: "#6366f1",
  proposal: "#8b5cf6",
  negotiation: "#f59e0b",
  won: "#10b981",
  lost: "#ef4444",
  unknown: "#cbd5e1",
}

const STAGE_LABELS: Record<string, string> = {
  new: "Nuovo",
  qualified: "Qualificato",
  proposal: "Proposta",
  negotiation: "Trattativa",
  won: "Vinto",
  lost: "Perso",
}
const STAGE_ORDER = ["new", "qualified", "proposal", "negotiation"]

function fmtEur(n: number) {
  return n.toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  })
}
function fmtPct(n: number) {
  return `${(n * 100).toFixed(1)}%`
}
function fmtDate(iso: string | null) {
  if (!iso) return "Mai"
  const d = new Date(iso)
  const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (days <= 1) return "Ieri"
  if (days < 30) return `${days} giorni fa`
  if (days < 60) return "1 mese fa"
  return `${Math.floor(days / 30)} mesi fa`
}

type AgentOpt = {
  id: string
  display_name?: string | null
  profiles?: { email?: string | null; first_name?: string | null; last_name?: string | null } | null
}

export function StatsClient() {
  const [period, setPeriod] = useState<"1m" | "3m" | "6m" | "12m">("3m")
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)

  // Lista venditori: 200 solo per super_admin; per i sales_agent ritorna 403.
  // Usiamo il risultato come "sono super_admin?" senza un endpoint dedicato.
  const { data: agentsData } = useSWR<{ agents: AgentOpt[] }>(
    "/api/superadmin/sales/agents",
    async (url: string) => {
      const r = await fetch(url, { cache: "no-store" })
      if (!r.ok) return { agents: [] }
      return r.json()
    },
    { revalidateOnFocus: false },
  )
  const isSuperAdmin = (agentsData?.agents?.length ?? 0) > 0

  const statsUrl = `/api/sales/stats?period=${period}${
    selectedAgentId ? `&agent_id=${selectedAgentId}` : ""
  }`
  const { data, isLoading, error } = useSWR<StatsData>(statsUrl, fetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
    )
  }

  // Caso super_admin senza agent selezionato: l'API torna 404 agent_not_found
  // perche' non c'e' una riga sales_agents legata al super_admin.
  // Mostriamo un picker per scegliere il venditore di cui vedere le statistiche.
  if (error instanceof ApiError && error.code === "agent_not_found") {
    if (isSuperAdmin) {
      return (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Seleziona un venditore</CardTitle>
            <p className="text-xs text-muted-foreground">
              Sei loggato come super_admin: scegli il venditore di cui vuoi vedere le statistiche.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
              {(agentsData?.agents ?? []).map((a) => {
                const label =
                  a.display_name ||
                  [a.profiles?.first_name, a.profiles?.last_name].filter(Boolean).join(" ") ||
                  a.profiles?.email ||
                  a.id.slice(0, 8)
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setSelectedAgentId(a.id)}
                    className="rounded-md border border-border bg-card px-4 py-3 text-left hover:border-emerald-300 hover:bg-emerald-50 transition-colors"
                  >
                    <div className="font-medium text-sm">{label}</div>
                    {a.profiles?.email && (
                      <div className="text-xs text-muted-foreground">{a.profiles.email}</div>
                    )}
                  </button>
                )
              })}
              {(agentsData?.agents ?? []).length === 0 && (
                <div className="col-span-full text-sm text-muted-foreground">
                  Nessun venditore registrato.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )
    }
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-2">
          <div className="text-base font-medium">Profilo venditore non configurato</div>
          <p className="text-sm text-muted-foreground">
            Il tuo account non e&apos; ancora associato a un profilo venditore. Contatta un super_admin per
            completare la configurazione.
          </p>
        </CardContent>
      </Card>
    )
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Errore nel caricamento delle statistiche.
          {error instanceof ApiError && (
            <div className="mt-2 text-xs">
              ({error.status} {error.code ?? ""})
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  const periodLabel =
    period === "1m"
      ? "ultimo mese"
      : period === "3m"
        ? "ultimi 3 mesi"
        : period === "6m"
          ? "ultimi 6 mesi"
          : "ultimi 12 mesi"

  // Funnel dati: raggruppo prospects+deals_open in un funnel ipotetico
  const funnelData = STAGE_ORDER.map((stage) => ({
    stage: STAGE_LABELS[stage],
    count: data.deals_by_stage[stage]?.count ?? 0,
    value: data.deals_by_stage[stage]?.value ?? 0,
  }))

  // Status pie
  const statusPie = Object.entries(data.prospect_by_status)
    .map(([k, v]) => ({
      name: STATUS_LABELS[k] ?? k,
      value: v,
      color: STATUS_COLORS[k] ?? "#94a3b8",
    }))
    .filter((d) => d.value > 0)

  // Quando un super_admin ha selezionato un agente, mostro un piccolo header
  // di contesto con bottone per tornare al picker.
  const selectedAgent = (agentsData?.agents ?? []).find((a) => a.id === selectedAgentId)
  const selectedAgentLabel = selectedAgent
    ? selectedAgent.display_name ||
      [selectedAgent.profiles?.first_name, selectedAgent.profiles?.last_name].filter(Boolean).join(" ") ||
      selectedAgent.profiles?.email ||
      selectedAgent.id.slice(0, 8)
    : null

  return (
    <div className="space-y-8">
      {selectedAgentId && selectedAgentLabel && (
        <div className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm">
          <span className="text-amber-900">
            Stai vedendo le statistiche di <strong>{selectedAgentLabel}</strong>
          </span>
          <button
            type="button"
            onClick={() => setSelectedAgentId(null)}
            className="text-xs text-amber-700 hover:text-amber-900 underline underline-offset-2"
          >
            Cambia venditore
          </button>
        </div>
      )}
      {/* Selettore periodo */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Tabs value={period} onValueChange={(v) => setPeriod(v as any)}>
          <TabsList>
            <TabsTrigger value="1m">1 mese</TabsTrigger>
            <TabsTrigger value="3m">3 mesi</TabsTrigger>
            <TabsTrigger value="6m">6 mesi</TabsTrigger>
            <TabsTrigger value="12m">12 mesi</TabsTrigger>
          </TabsList>
        </Tabs>
        <p className="text-xs text-muted-foreground">
          Le metriche di periodo si riferiscono agli {periodLabel}; quelle
          di stato (prospect totali, deal aperti) sono live.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <KpiCard
          icon={<Users className="h-5 w-5" />}
          label="Prospect totali"
          value={String(data.kpi.prospect_total)}
          color="bg-slate-100 text-slate-700"
        />
        <KpiCard
          icon={<Target className="h-5 w-5" />}
          label="Deal aperti"
          value={String(data.kpi.deals_open_count)}
          sub={fmtEur(data.kpi.deals_open_value)}
          color="bg-blue-100 text-blue-700"
        />
        <KpiCard
          icon={<Award className="h-5 w-5" />}
          label="Deal vinti"
          value={String(data.kpi.deals_won_count)}
          sub={fmtEur(data.kpi.deals_won_value)}
          color="bg-emerald-100 text-emerald-700"
        />
        <KpiCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Win rate"
          value={fmtPct(data.kpi.win_rate)}
          sub={`${data.kpi.deals_lost_count} persi`}
          color="bg-violet-100 text-violet-700"
        />
        <KpiCard
          icon={<Coins className="h-5 w-5" />}
          label="MRR cumulato"
          value={fmtEur(data.kpi.mrr_current)}
          sub="Ricavi Mensili Ricorrenti"
          color="bg-amber-100 text-amber-700"
        />
        <KpiCard
          icon={<Target className="h-5 w-5" />}
          label="Tasso conversione"
          value={fmtPct(data.kpi.conversion_rate)}
          sub="su prospect totali"
          color="bg-pink-100 text-pink-700"
        />
        <KpiCard
          icon={<Activity className="h-5 w-5" />}
          label="Attività registrate"
          value={String(data.kpi.activities_count)}
          sub={periodLabel}
          color="bg-sky-100 text-sky-700"
        />
        <KpiCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          label="Task completati"
          value={String(data.kpi.tasks_completed_period)}
          sub={`${data.kpi.tasks_pending} ancora pending`}
          color="bg-teal-100 text-teal-700"
        />
      </div>

      {/* MRR cumulato + nuove strutture */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">MRR cumulato 12 mesi</CardTitle>
          <p className="text-xs text-muted-foreground">
            MRR (Monthly Recurring Revenue = Ricavi Mensili Ricorrenti) cumulato delle strutture attivate grazie al tuo profilo. Ogni
            mese mostra l&apos;importo totale ricorrente al termine del mese.
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.mrr_by_month}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v) =>
                    v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)
                  }
                />
                <Tooltip
                  formatter={(value: any, name: string) =>
                    name === "mrr" ? fmtEur(Number(value)) : value
                  }
                  labelFormatter={(label) => `Mese ${label}`}
                />
                <Line
                  type="monotone"
                  dataKey="mrr"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                  name="MRR €"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Pipeline / funnel deal per stage */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Deal aperti per fase pipeline
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Distribuzione attuale dei deal aperti.
            </p>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnelData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis
                    type="category"
                    dataKey="stage"
                    tick={{ fontSize: 12 }}
                    width={90}
                  />
                  <Tooltip
                    formatter={(value: any, name: string) =>
                      name === "value"
                        ? fmtEur(Number(value))
                        : Number(value).toLocaleString("it-IT")
                    }
                  />
                  <Bar dataKey="count" fill="#0ea5e9" name="Numero" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Distribuzione prospect per stato */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Prospect per stato</CardTitle>
            <p className="text-xs text-muted-foreground">
              Distribuzione attuale dei tuoi prospect per stato CRM.
            </p>
          </CardHeader>
          <CardContent>
            {statusPie.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
                Nessun prospect ancora assegnato.
              </div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusPie}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={48}
                      outerRadius={88}
                      paddingAngle={2}
                    >
                      {statusPie.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Attività per settimana stacked */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Attività per settimana</CardTitle>
          <p className="text-xs text-muted-foreground">
            Ultime 8 settimane: chiamate, email, visite e meeting registrati.
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.activities_by_week}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="call" stackId="a" fill="#0ea5e9" name="Chiamate" />
                <Bar dataKey="email" stackId="a" fill="#8b5cf6" name="Email" />
                <Bar dataKey="visit" stackId="a" fill="#f97316" name="Visite" />
                <Bar dataKey="meeting" stackId="a" fill="#f59e0b" name="Meeting" />
                <Bar dataKey="note" stackId="a" fill="#94a3b8" name="Note" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Commissioni per mese */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Commissioni per mese</CardTitle>
          <p className="text-xs text-muted-foreground">
            Pagate vs in attesa, ultimi 12 mesi.
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.commissions_by_month}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v) =>
                    v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)
                  }
                />
                <Tooltip formatter={(value: any) => fmtEur(Number(value))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="paid" stackId="b" fill="#10b981" name="Pagate" radius={[0, 0, 0, 0]} />
                <Bar dataKey="pending" stackId="b" fill="#fbbf24" name="In attesa" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Top prospect senza contatto */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Prospect senza contatto da 30+ giorni
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              {data.stale_prospects.length} in lista
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            I prospect a cui non parli da più di un mese — pianifica un
            follow-up per non perderli.
          </p>
        </CardHeader>
        <CardContent>
          {data.stale_prospects.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Ottimo: nessun prospect rimasto senza contatto.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {data.stale_prospects.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {p.city ? `${p.city} · ` : ""}
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        ultimo contatto {fmtDate(p.last_contact_at)}
                      </span>
                    </div>
                  </div>
                  <Link
                    href={`/sales/prospects/${p.id}`}
                    className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-800"
                  >
                    Apri
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  color: string
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`rounded-md p-2 ${color}`}>{icon}</div>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-xl font-semibold leading-tight">{value}</div>
            {sub && (
              <div className="text-xs text-muted-foreground mt-0.5 truncate">
                {sub}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
