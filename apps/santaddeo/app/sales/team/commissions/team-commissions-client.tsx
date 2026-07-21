"use client"

import useSWR from "swr"
import Link from "next/link"
import { useState, useMemo } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ArrowLeft, HandCoins, Clock, CheckCircle2, TrendingUp } from "lucide-react"

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json())

type Kpi = {
  total_pending_eur: number
  total_paid_eur: number
  month_current_eur: number
  last_12_months_eur: number
}
type LedgerRow = {
  id: string
  source_agent_id: string
  source_agent_name: string
  hotel_id: string
  hotel_name: string
  period_year: number
  period_month: number
  source_amount_eur: number
  override_percentage: number
  amount_eur: number
  currency: string
  status: "pending" | "paid" | "voided" | string
  paid_at: string | null
  voided_at: string | null
  voided_reason: string | null
  created_at: string
}
type ByMonth = {
  key: string
  year: number
  month: number
  pending: number
  paid: number
  total: number
}
type ApiData = {
  kpi: Kpi
  by_month: ByMonth[]
  ledger: LedgerRow[]
  error?: string
}

export function TeamCommissionsClient() {
  const [statusFilter, setStatusFilter] = useState("all")
  const [agentFilter, setAgentFilter] = useState("all")

  const qs = useMemo(() => {
    const p = new URLSearchParams()
    if (statusFilter !== "all") p.set("status", statusFilter)
    if (agentFilter !== "all") p.set("source_agent_id", agentFilter)
    return p.toString() ? `?${p.toString()}` : ""
  }, [statusFilter, agentFilter])

  const { data, isLoading, error } = useSWR<ApiData>(
    `/api/sales/area-manager/commissions${qs}`,
    fetcher,
    { revalidateOnFocus: false },
  )

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-7xl px-6 py-10">
        <p className="text-sm text-muted-foreground">Caricamento override…</p>
      </div>
    )
  }
  if (error || !data || data.error) {
    return (
      <div className="container mx-auto max-w-7xl px-6 py-10">
        <Card className="p-6">
          <p className="text-sm text-destructive">
            Errore caricamento. Verifica di essere un capo area attivo.
          </p>
        </Card>
      </div>
    )
  }

  const uniqueAgents = Array.from(
    new Map(data.ledger.map((r) => [r.source_agent_id, r.source_agent_name])).entries(),
  ).sort((a, b) => a[1].localeCompare(b[1], "it"))

  return (
    <div className="container mx-auto max-w-7xl px-6 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/sales/team">
            <Button variant="ghost" size="sm" className="mb-2 -ml-2">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Team
            </Button>
          </Link>
          <h1 className="text-2xl font-bold text-foreground">Override commissioni</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Storico delle commissioni generate per te dai tuoi agenti.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Kpi
          label="Mese corrente"
          value={formatEur(data.kpi.month_current_eur)}
          icon={<TrendingUp className="h-4 w-4" />}
          accent
        />
        <Kpi
          label="In attesa di pagamento"
          value={formatEur(data.kpi.total_pending_eur)}
          icon={<Clock className="h-4 w-4" />}
        />
        <Kpi
          label="Già liquidate"
          value={formatEur(data.kpi.total_paid_eur)}
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <Kpi
          label="Ultimi 12 mesi"
          value={formatEur(data.kpi.last_12_months_eur)}
          icon={<HandCoins className="h-4 w-4" />}
        />
      </div>

      <Card className="overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-lg font-semibold">Ledger override</h2>
          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli stati</SelectItem>
                <SelectItem value="pending">In attesa</SelectItem>
                <SelectItem value="paid">Liquidate</SelectItem>
                <SelectItem value="voided">Annullate</SelectItem>
              </SelectContent>
            </Select>
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Tutti gli agenti" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli agenti</SelectItem>
                {uniqueAgents.map(([id, name]) => (
                  <SelectItem key={id} value={id}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {data.ledger.length === 0 ? (
          <p className="px-6 py-12 text-sm text-muted-foreground text-center">
            Nessun override registrato per il filtro selezionato.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Periodo</TableHead>
                <TableHead>Agente</TableHead>
                <TableHead>Struttura</TableHead>
                <TableHead className="text-right">Commissione agente</TableHead>
                <TableHead className="text-right">%</TableHead>
                <TableHead className="text-right">Override</TableHead>
                <TableHead>Stato</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.ledger.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">
                    {String(r.period_month).padStart(2, "0")}/{r.period_year}
                  </TableCell>
                  <TableCell className="text-sm">{r.source_agent_name}</TableCell>
                  <TableCell className="text-sm">{r.hotel_name}</TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {formatEur(r.source_amount_eur)}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {r.override_percentage}%
                  </TableCell>
                  <TableCell className="text-right font-semibold text-amber-700">
                    {formatEur(r.amount_eur)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}

function Kpi({
  label,
  value,
  icon,
  accent,
}: {
  label: string
  value: string
  icon: React.ReactNode
  accent?: boolean
}) {
  return (
    <Card className={`p-5 ${accent ? "border-amber-300 bg-amber-50" : ""}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <span className={accent ? "text-amber-700" : "text-muted-foreground"}>
          {icon}
        </span>
      </div>
      <p
        className={`mt-2 text-2xl font-bold ${
          accent ? "text-amber-900" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </Card>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: "In attesa", className: "bg-gray-100 text-gray-700" },
    paid: { label: "Liquidata", className: "bg-green-100 text-green-800" },
    voided: { label: "Annullata", className: "bg-red-100 text-red-800" },
  }
  const v = map[status] ?? { label: status, className: "bg-gray-100" }
  return <Badge className={`${v.className} hover:${v.className}`}>{v.label}</Badge>
}

function formatEur(n: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n ?? 0)
}
