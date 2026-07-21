"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ArrowLeft,
  ArrowUpDown,
  Building2,
  CalendarClock,
  Circle,
  RefreshCw,
  Target,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type AgentKpi = {
  agent_id: string
  display_name: string | null
  email: string | null
  is_active: boolean
  registered_at: string | null
  last_login_at: string | null
  days_since_login: number | null
  default_commission_percentage: number | null
  prospects_total: number
  prospects_worked: number
  prospects_converted: number
  worked_ratio: number
  conversion_rate: number
  leads_total: number
  leads_converted: number
  hotels_activated: number
  hotels_total: number
  activities_30d: number
  activities_7d: number
  active_days_30d: number
  demos_total: number
  tasks_pending: number
  deals_open: number
  deals_won: number
  engagement_score: number
}

type Totals = {
  agents: number
  active_agents: number
  logged_last_7d: number
  prospects_total: number
  prospects_worked: number
  prospects_converted: number
  leads_total: number
  hotels_activated: number
}

type SortKey =
  | "display_name"
  | "registered_at"
  | "days_since_login"
  | "prospects_total"
  | "prospects_worked"
  | "prospects_converted"
  | "leads_total"
  | "hotels_activated"
  | "activities_30d"
  | "tasks_pending"
  | "engagement_score"

const dtf = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", year: "numeric" })

function fmtDate(iso: string | null) {
  if (!iso) return "—"
  return dtf.format(new Date(iso))
}

function loginLabel(days: number | null) {
  if (days == null) return { text: "Mai", tone: "muted" as const }
  if (days <= 0) return { text: "Oggi", tone: "good" as const }
  if (days === 1) return { text: "Ieri", tone: "good" as const }
  if (days <= 7) return { text: `${days}g fa`, tone: "good" as const }
  if (days <= 30) return { text: `${days}g fa`, tone: "warn" as const }
  return { text: `${days}g fa`, tone: "bad" as const }
}

export function SalesPerformanceClient() {
  const { data, isLoading, mutate, isValidating } = useSWR<{ totals: Totals; agents: AgentKpi[] }>(
    "/api/superadmin/sales/performance",
    fetcher,
  )
  const [sortKey, setSortKey] = useState<SortKey>("engagement_score")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

  const agents = data?.agents ?? []
  const totals = data?.totals

  const sorted = useMemo(() => {
    const copy = [...agents]
    copy.sort((a, b) => {
      let av: number | string = (a as any)[sortKey]
      let bv: number | string = (b as any)[sortKey]
      if (sortKey === "display_name") {
        av = (a.display_name ?? a.email ?? "").toLowerCase()
        bv = (b.display_name ?? b.email ?? "").toLowerCase()
      } else if (sortKey === "registered_at") {
        av = a.registered_at ? new Date(a.registered_at).getTime() : 0
        bv = b.registered_at ? new Date(b.registered_at).getTime() : 0
      } else if (sortKey === "days_since_login") {
        // null (mai loggato) sempre in fondo
        av = a.days_since_login == null ? Number.MAX_SAFE_INTEGER : a.days_since_login
        bv = b.days_since_login == null ? Number.MAX_SAFE_INTEGER : b.days_since_login
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1
      if (av > bv) return sortDir === "asc" ? 1 : -1
      return 0
    })
    return copy
  }, [agents, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      // date e nome ascendente di default, metriche discendente
      setSortDir(key === "display_name" ? "asc" : "desc")
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/superadmin/sales"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Torna ai venditori"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-3xl font-bold text-foreground">Performance venditori</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            KPI sintetici per ogni venditore: registrazione, login, utilizzo, prospect, lead e
            conversioni. Clicca sulle intestazioni per ordinare.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => mutate()}
          disabled={isValidating}
          className="gap-1.5"
        >
          <RefreshCw className={`h-4 w-4 ${isValidating ? "animate-spin" : ""}`} />
          Aggiorna
        </Button>
      </div>

      {/* Card riepilogo */}
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <SummaryCard
          icon={<Users className="h-4 w-4" />}
          label="Venditori"
          value={totals ? `${totals.active_agents}/${totals.agents}` : "—"}
          hint="attivi / totali"
        />
        <SummaryCard
          icon={<UserCheck className="h-4 w-4" />}
          label="Login 7gg"
          value={totals ? String(totals.logged_last_7d) : "—"}
          hint="loggati di recente"
        />
        <SummaryCard
          icon={<Target className="h-4 w-4" />}
          label="Prospect"
          value={totals ? String(totals.prospects_total) : "—"}
          hint="assegnati totali"
        />
        <SummaryCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Lavorati"
          value={totals ? String(totals.prospects_worked) : "—"}
          hint={
            totals && totals.prospects_total > 0
              ? `${Math.round((totals.prospects_worked / totals.prospects_total) * 100)}% del totale`
              : "—"
          }
        />
        <SummaryCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Conversioni"
          value={totals ? String(totals.prospects_converted) : "—"}
          hint="prospect convertiti"
        />
        <SummaryCard
          icon={<Building2 className="h-4 w-4" />}
          label="Strutture"
          value={totals ? String(totals.hotels_activated) : "—"}
          hint="attivate"
        />
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Caricamento KPI...</div>
      ) : agents.length === 0 ? (
        <Card className="p-12 text-center">
          <Users className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <h3 className="mt-4 text-lg font-medium text-foreground">Nessun venditore</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Crea il primo venditore dalla pagina Venditori.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <Th onClick={() => toggleSort("display_name")} active={sortKey === "display_name"} className="sticky left-0 bg-muted/40">
                    Venditore
                  </Th>
                  <Th onClick={() => toggleSort("engagement_score")} active={sortKey === "engagement_score"}>
                    Engagement
                  </Th>
                  <Th onClick={() => toggleSort("registered_at")} active={sortKey === "registered_at"}>
                    Registrato
                  </Th>
                  <Th onClick={() => toggleSort("days_since_login")} active={sortKey === "days_since_login"}>
                    Ultimo login
                  </Th>
                  <Th onClick={() => toggleSort("activities_30d")} active={sortKey === "activities_30d"} numeric>
                    Utilizzo 30g
                  </Th>
                  <Th onClick={() => toggleSort("prospects_total")} active={sortKey === "prospects_total"} numeric>
                    Prospect
                  </Th>
                  <Th onClick={() => toggleSort("prospects_worked")} active={sortKey === "prospects_worked"} numeric>
                    Lavorati
                  </Th>
                  <Th onClick={() => toggleSort("prospects_converted")} active={sortKey === "prospects_converted"} numeric>
                    Conv.
                  </Th>
                  <Th onClick={() => toggleSort("leads_total")} active={sortKey === "leads_total"} numeric>
                    Lead
                  </Th>
                  <Th onClick={() => toggleSort("hotels_activated")} active={sortKey === "hotels_activated"} numeric>
                    Strutture
                  </Th>
                  <Th onClick={() => toggleSort("tasks_pending")} active={sortKey === "tasks_pending"} numeric>
                    Task
                  </Th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((a) => {
                  const lg = loginLabel(a.days_since_login)
                  return (
                    <tr key={a.agent_id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="sticky left-0 bg-card px-4 py-3">
                        <Link
                          href={`/superadmin/sales/${a.agent_id}`}
                          className="flex items-center gap-2 font-medium text-foreground hover:underline"
                        >
                          <Circle
                            className={`h-2 w-2 shrink-0 fill-current ${a.is_active ? "text-emerald-500" : "text-muted-foreground/40"}`}
                          />
                          <span className="max-w-[180px] truncate">
                            {a.display_name ?? a.email ?? "—"}
                          </span>
                        </Link>
                        <div className="ml-4 truncate text-xs text-muted-foreground max-w-[180px]">
                          {a.email ?? "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <EngagementBar score={a.engagement_score} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock className="h-3.5 w-3.5 opacity-60" />
                          {fmtDate(a.registered_at)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={
                            lg.tone === "good"
                              ? "text-emerald-600"
                              : lg.tone === "warn"
                                ? "text-amber-600"
                                : lg.tone === "bad"
                                  ? "text-red-600"
                                  : "text-muted-foreground"
                          }
                        >
                          {lg.text}
                        </span>
                        {a.last_login_at && (
                          <div className="text-xs text-muted-foreground">{fmtDate(a.last_login_at)}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <div className="font-medium text-foreground">{a.active_days_30d} gg</div>
                        <div className="text-xs text-muted-foreground">{a.activities_30d} azioni</div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground">
                        {a.prospects_total}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <div className="font-medium text-foreground">{a.prospects_worked}</div>
                        <div className="text-xs text-muted-foreground">
                          {Math.round(a.worked_ratio * 100)}%
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <Badge variant={a.prospects_converted > 0 ? "default" : "secondary"}>
                          {a.prospects_converted}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-foreground">{a.leads_total}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-foreground">
                        {a.hotels_activated}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {a.tasks_pending > 0 ? (
                          <span className="text-amber-600 font-medium">{a.tasks_pending}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        <strong>Engagement</strong> (0-100) combina recency del login, giorni attivi negli ultimi
        30 giorni e quota di prospect lavorati. <strong>Lavorati</strong> = prospect usciti dallo
        stato iniziale &quot;assegnato&quot; o con almeno un contatto registrato.
      </p>
    </div>
  )
}

function SummaryCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold text-foreground tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </Card>
  )
}

function EngagementBar({ score }: { score: number }) {
  const tone =
    score >= 60 ? "bg-emerald-500" : score >= 30 ? "bg-amber-500" : "bg-red-500"
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${score}%` }} />
      </div>
      <span className="w-7 text-right text-xs font-medium tabular-nums text-foreground">{score}</span>
    </div>
  )
}

function Th({
  children,
  onClick,
  active,
  numeric,
  className = "",
}: {
  children: React.ReactNode
  onClick: () => void
  active: boolean
  numeric?: boolean
  className?: string
}) {
  return (
    <th className={`px-4 py-3 font-medium ${className}`}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 hover:text-foreground ${numeric ? "justify-end w-full" : ""} ${active ? "text-foreground" : ""}`}
      >
        {children}
        <ArrowUpDown className={`h-3 w-3 ${active ? "opacity-100" : "opacity-30"}`} />
      </button>
    </th>
  )
}
