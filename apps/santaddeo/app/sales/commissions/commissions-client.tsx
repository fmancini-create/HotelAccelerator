"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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
import { Clock, HandCoins, CheckCircle2, TrendingUp } from "lucide-react"

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json())

type Kpi = {
  // Liquidate (Santaddeo ha gia' bonificato al venditore)
  total_paid_eur: number
  // Liquidabili (tenant ha pagato Santaddeo, in attesa del bonifico al venditore)
  total_earned_eur: number
  // Maturate (fattura tenant emessa, tenant non ha ancora pagato Santaddeo)
  total_accrued_eur: number
  // Compat retro: accrued + earned
  total_pending_eur: number
  // Performance totale: accrued + earned + paid (esclude voided)
  total_maturato_eur: number
  month_current_eur: number
  last_12_months_eur: number
}
type LedgerRow = {
  id: string
  hotel_id: string
  hotel_name: string
  invoice_id: string | null
  period_year: number
  period_month: number
  period_start: string
  base_amount_eur: number
  commission_percentage: number
  commission_basis: string
  amount_eur: number
  currency: string
  status: "accrued" | "earned" | "paid" | "voided" | string
  accrued_at: string | null
  earned_at: string | null
  paid_at: string | null
  voided_at: string | null
  voided_reason: string | null
  payment_method: string | null
  notes: string | null
}
type ByMonth = {
  key: string
  year: number
  month: number
  accrued: number
  earned: number
  paid: number
  pending: number
  total: number
}
type ApiData = {
  sales_agent: {
    id: string
    display_name: string | null
    default_commission_percentage: number | null
  } | null
  kpi: Kpi
  hotels: Array<{ id: string; name: string }>
  by_month: ByMonth[]
  ledger: LedgerRow[]
  message?: string
}

export function CommissionsClient() {
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [hotelFilter, setHotelFilter] = useState<string>("all")

  const qs = useMemo(() => {
    const p = new URLSearchParams()
    if (statusFilter !== "all") p.set("status", statusFilter)
    if (hotelFilter !== "all") p.set("hotel_id", hotelFilter)
    const s = p.toString()
    return s ? `?${s}` : ""
  }, [statusFilter, hotelFilter])

  const { data, isLoading, error } = useSWR<ApiData>(
    `/api/sales/commissions${qs}`,
    fetcher,
    { revalidateOnFocus: false },
  )

  if (isLoading) {
    return <div className="text-muted-foreground">Caricamento commissioni...</div>
  }
  if (error || !data) {
    return <div className="text-destructive">Errore caricamento commissioni.</div>
  }
  if (!data.sales_agent) {
    return (
      <Card className="p-8">
        <h3 className="text-lg font-semibold mb-2">Profilo venditore non configurato</h3>
        <p className="text-muted-foreground text-sm">
          {data.message ??
            "Il tuo account venditore non e' ancora attivo. Contatta il team SANTADDEO."}
        </p>
      </Card>
    )
  }

  const { kpi, ledger, by_month, hotels } = data

  return (
    <div className="space-y-6">
      {/* KPI - 4 stati */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={Clock}
          label="Maturate"
          subtitle="Fattura emessa, tenant deve pagare"
          value={`€ ${formatEuro(kpi.total_accrued_eur)}`}
          tone="slate"
        />
        <KpiCard
          icon={HandCoins}
          label="Liquidabili"
          subtitle="Tenant ha pagato, in attesa di bonifico"
          value={`€ ${formatEuro(kpi.total_earned_eur)}`}
          tone="amber"
        />
        <KpiCard
          icon={CheckCircle2}
          label="Liquidate"
          subtitle="Bonifico ricevuto dal venditore"
          value={`€ ${formatEuro(kpi.total_paid_eur)}`}
          tone="emerald"
        />
        <KpiCard
          icon={TrendingUp}
          label="Ultimi 12 mesi"
          subtitle="Maturato totale (escl. annullate)"
          value={`€ ${formatEuro(kpi.last_12_months_eur)}`}
          tone="blue"
        />
      </div>

      {/* Breakdown mensile */}
      {by_month.length > 0 && (
        <Card className="overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="font-semibold">Storico mensile</h3>
            <p className="text-xs text-muted-foreground">
              Riepilogo per mese di competenza (ultimi 24 mesi).
            </p>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Periodo</TableHead>
                  <TableHead className="text-right">Maturate</TableHead>
                  <TableHead className="text-right">Liquidabili</TableHead>
                  <TableHead className="text-right">Liquidate</TableHead>
                  <TableHead className="text-right">Totale</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {by_month.map((m) => (
                  <TableRow key={m.key}>
                    <TableCell className="font-medium">{formatMonth(m.year, m.month)}</TableCell>
                    <TableCell className="text-right text-slate-700">
                      {m.accrued > 0 ? `€ ${formatEuro(m.accrued)}` : "—"}
                    </TableCell>
                    <TableCell className="text-right text-amber-700">
                      {m.earned > 0 ? `€ ${formatEuro(m.earned)}` : "—"}
                    </TableCell>
                    <TableCell className="text-right text-emerald-700">
                      {m.paid > 0 ? `€ ${formatEuro(m.paid)}` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      € {formatEuro(m.total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Filtri + Ledger dettaglio */}
      <Card className="overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-semibold">Dettaglio commissioni</h3>
            <p className="text-xs text-muted-foreground">
              Una riga per periodo di competenza per struttura.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Stato" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli stati</SelectItem>
                <SelectItem value="accrued">Maturate</SelectItem>
                <SelectItem value="earned">Liquidabili</SelectItem>
                <SelectItem value="paid">Liquidate</SelectItem>
                <SelectItem value="voided">Annullate</SelectItem>
              </SelectContent>
            </Select>
            <Select value={hotelFilter} onValueChange={setHotelFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Struttura" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte le strutture</SelectItem>
                {hotels.map((h) => (
                  <SelectItem key={h.id} value={h.id}>
                    {h.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {ledger.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <p className="font-medium">Nessuna commissione da mostrare.</p>
            <p className="text-sm mt-1">
              Le commissioni vengono generate automaticamente quando viene emessa una
              fattura a una struttura associata al tuo profilo.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Periodo</TableHead>
                  <TableHead>Struttura</TableHead>
                  <TableHead className="text-right">Base fattura</TableHead>
                  <TableHead className="text-right">%</TableHead>
                  <TableHead className="text-right">Commissione</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledger.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {formatMonth(r.period_year, r.period_month)}
                    </TableCell>
                    <TableCell>{r.hotel_name}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      € {formatEuro(r.base_amount_eur)}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {r.commission_percentage}%
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      € {formatEuro(r.amount_eur)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {ledgerDateLabel(r)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  )
}

function KpiCard({
  icon: Icon,
  label,
  subtitle,
  value,
  tone,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any
  label: string
  subtitle?: string
  value: string | number
  tone: "slate" | "emerald" | "blue" | "amber"
}) {
  const toneClasses: Record<string, string> = {
    slate: "bg-slate-50 text-slate-700",
    emerald: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
  }
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <div className={`inline-flex rounded-lg p-2 ${toneClasses[tone]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs font-medium mt-1">{label}</div>
      {subtitle && <div className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</div>}
    </Card>
  )
}

function StatusBadge({ status }: { status: string }) {
  // 4 stati + retrocompat
  const map: Record<string, { label: string; className: string }> = {
    accrued: { label: "Maturata", className: "bg-slate-100 text-slate-700 border-slate-200" },
    earned: { label: "Liquidabile", className: "bg-amber-100 text-amber-800 border-amber-200" },
    paid: { label: "Liquidata", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    voided: { label: "Annullata", className: "bg-rose-50 text-rose-700 border-rose-200" },
    // legacy
    pending: { label: "In attesa", className: "bg-slate-100 text-slate-700 border-slate-200" },
    cancelled: { label: "Annullata", className: "bg-rose-50 text-rose-700 border-rose-200" },
  }
  const cfg = map[status] ?? { label: status, className: "bg-muted text-foreground" }
  return (
    <Badge variant="outline" className={cfg.className}>
      {cfg.label}
    </Badge>
  )
}

function ledgerDateLabel(r: LedgerRow): string {
  if (r.status === "paid" && r.paid_at) return `Liquidata ${dt(r.paid_at)}`
  if (r.status === "earned" && r.earned_at) return `Disponibile dal ${dt(r.earned_at)}`
  if (r.status === "voided" && r.voided_at) return `Annullata ${dt(r.voided_at)}`
  if (r.accrued_at) return `Maturata ${dt(r.accrued_at)}`
  return "—"
}

function dt(iso: string) {
  return new Date(iso).toLocaleDateString("it-IT")
}

function formatEuro(n: number) {
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function formatMonth(year: number, month: number) {
  const d = new Date(Date.UTC(year, Math.max(0, month - 1), 1))
  return d.toLocaleDateString("it-IT", { month: "long", year: "numeric" })
}
