"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Server,
  Database,
  Bot,
  Mail,
  RefreshCw,
  TrendingUp,
  Activity,
  HardDrive,
  Wifi,
  AlertTriangle,
  Building2,
  DollarSign,
  BarChart3,
  Clock,
  Loader2,
} from "lucide-react"

interface CostEstimate {
  server: number
  database: number
  ai: number
  email: number
  total: number
}

interface LiveMetrics {
  db_rows_bookings: number
  db_rows_availability: number
  db_rows_metrics: number
  sync_runs_today: number
  sync_runs_total: number
  sync_errors_recent: number
  sync_avg_ms: number
  ai_sessions: number
  ai_messages_total: number
  cost_estimated: CostEstimate
}

interface HotelSubscription {
  plan_type: string
  fixed_fee_per_room: number | null
  monthly_fee: number | null
  commission_percentage: number | null
  billing_cycle: string
  }

  interface HotelUsage {
  hotel_id: string
  hotel_name: string
  total_rooms: number
  is_active: boolean
  subscription: HotelSubscription | null
  live: LiveMetrics
  }

interface UsageSummary {
  total_hotels: number
  active_hotels: number
  total_cost_estimated: number
  total_db_rows: number
  total_sync_today: number
  total_ai_messages: number
}

interface UsageData {
  hotels: HotelUsage[]
  summary: UsageSummary
}

function formatEur(value: number): string {
  return value.toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatNumber(value: number): string {
  return value.toLocaleString("it-IT")
}

function CostBreakdownBar({ cost }: { cost: CostEstimate }) {
  const total = cost.total || 1
  const segments = [
    { key: "server", label: "Server", value: cost.server, color: "bg-blue-500" },
    { key: "database", label: "Database", value: cost.database, color: "bg-emerald-500" },
    { key: "ai", label: "AI", value: cost.ai, color: "bg-amber-500" },
    { key: "email", label: "Email", value: cost.email, color: "bg-rose-400" },
  ]

  return (
    <div className="space-y-2">
      <div className="flex h-3 rounded-full overflow-hidden bg-muted">
        {segments.map((seg) => {
          const pct = (seg.value / total) * 100
          if (pct < 0.5) return null
          return (
            <div
              key={seg.key}
              className={`${seg.color} transition-all duration-500`}
              style={{ width: `${pct}%` }}
              title={`${seg.label}: ${formatEur(seg.value)} (${pct.toFixed(0)}%)`}
            />
          )
        })}
      </div>
      <div className="flex flex-wrap gap-4">
        {segments.map((seg) => (
          <div key={seg.key} className="flex items-center gap-2 text-sm">
            <div className={`h-2.5 w-2.5 rounded-full ${seg.color}`} />
            <span className="text-muted-foreground">{seg.label}</span>
            <span className="font-medium">{formatEur(seg.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  subtext,
  iconColor,
}: {
  icon: React.ElementType
  label: string
  value: string
  subtext: string
  iconColor: string
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-base font-medium text-muted-foreground">{label}</span>
          <Icon className={`h-6 w-6 ${iconColor}`} />
        </div>
        <div className="text-3xl font-bold">{value}</div>
        <p className="text-sm text-muted-foreground mt-2">{subtext}</p>
      </CardContent>
    </Card>
  )
}

function HotelDetailCard({ hotel }: { hotel: HotelUsage }) {
  const [expanded, setExpanded] = useState(false)
  const live = hotel.live

  return (
    <Card className={`transition-all ${!hotel.is_active ? "opacity-60" : ""}`}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">{hotel.hotel_name}</h3>
              <p className="text-sm text-muted-foreground">
                {hotel.total_rooms} camere
                {!hotel.is_active && (
                  <Badge variant="secondary" className="ml-2">
                    Inattivo
                  </Badge>
                )}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-primary">
              {formatEur(live.cost_estimated.total)}
            </div>
            <p className="text-sm text-muted-foreground">costo stimato/mese</p>
          </div>
        </div>

        {/* Cost breakdown bar */}
        <CostBreakdownBar cost={live.cost_estimated} />

        {/* Quick stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <Database className="h-5 w-5 text-emerald-600 shrink-0" />
            <div>
              <div className="text-lg font-semibold">{formatNumber(live.db_rows_bookings)}</div>
              <div className="text-xs text-muted-foreground">Prenotazioni DB</div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <Wifi className="h-5 w-5 text-blue-600 shrink-0" />
            <div>
              <div className="text-lg font-semibold">{live.sync_runs_today}</div>
              <div className="text-xs text-muted-foreground">Sync oggi</div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <Bot className="h-5 w-5 text-amber-600 shrink-0" />
            <div>
              <div className="text-lg font-semibold">{formatNumber(live.ai_messages_total)}</div>
              <div className="text-xs text-muted-foreground">Messaggi AI</div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <Clock className="h-5 w-5 text-violet-600 shrink-0" />
            <div>
              <div className="text-lg font-semibold">{live.sync_avg_ms}ms</div>
              <div className="text-xs text-muted-foreground">Sync avg</div>
            </div>
          </div>
        </div>

        {/* Expandable details */}
        <Button
          variant="ghost"
          size="sm"
          className="mt-4 w-full"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Nascondi dettagli" : "Mostra dettagli completi"}
        </Button>

        {expanded && (
          <div className="mt-4 border-t pt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Database details */}
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                  <HardDrive className="h-4 w-4" />
                  Database
                </h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Righe prenotazioni</span>
                    <span className="font-medium">{formatNumber(live.db_rows_bookings)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Righe disponibilita</span>
                    <span className="font-medium">{formatNumber(live.db_rows_availability)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Righe metriche</span>
                    <span className="font-medium">{formatNumber(live.db_rows_metrics)}</span>
                  </div>
                  <div className="flex justify-between text-sm border-t pt-2">
                    <span className="text-muted-foreground font-medium">Totale righe</span>
                    <span className="font-bold">
                      {formatNumber(live.db_rows_bookings + live.db_rows_availability + live.db_rows_metrics)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Sync details */}
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Sincronizzazione
                </h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Sync oggi</span>
                    <span className="font-medium">{live.sync_runs_today}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Sync recenti (50)</span>
                    <span className="font-medium">{live.sync_runs_total}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Errori recenti</span>
                    <span className={`font-medium ${live.sync_errors_recent > 0 ? "text-destructive" : "text-emerald-600"}`}>
                      {live.sync_errors_recent}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Durata media</span>
                    <span className="font-medium">{live.sync_avg_ms}ms</span>
                  </div>
                </div>
              </div>
            </div>

            {/* AI details */}
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                <Bot className="h-4 w-4" />
                Intelligenza Artificiale
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Sessioni chat</span>
                  <span className="font-medium">{formatNumber(live.ai_sessions)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Messaggi totali</span>
                  <span className="font-medium">{formatNumber(live.ai_messages_total)}</span>
                </div>
              </div>
            </div>

            {/* Detailed cost table */}
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-1 flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Stima Costi Dettagliata (mensile)
              </h4>
              <p className="text-xs text-muted-foreground mb-3">
                Costi reali della piattaforma ripartiti per uso misurato: Supabase (Pro + compute
                Medium, $85/mese) in proporzione alle righe DB, Vercel (Pro, $20/mese) in proporzione
                ai run di sync; AI variabile per messaggio. In EUR, normalizzato a 30 giorni
                sull&apos;attività del periodo selezionato. Non include i ricavi da abbonamenti/addon.
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Servizio</TableHead>
                    <TableHead>Dettaglio</TableHead>
                    <TableHead className="text-right">Costo/mese</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                        Server (Vercel)
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      Quota Vercel Pro in base ai run di sync
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatEur(live.cost_estimated.server)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                        Database (Supabase)
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      Quota Supabase Pro + Medium su {formatNumber(live.db_rows_bookings + live.db_rows_availability + live.db_rows_metrics)} righe
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatEur(live.cost_estimated.database)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                        AI (GPT-4o-mini)
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatNumber(live.ai_messages_total)} messaggi, ~{formatNumber(live.ai_messages_total * 3)}K tokens
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatEur(live.cost_estimated.ai)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                        Email (SMTP)
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      Notifiche, alert, welcome email
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatEur(live.cost_estimated.email)}
                    </TableCell>
                  </TableRow>
                  <TableRow className="border-t-2 font-bold">
                    <TableCell>TOTALE</TableCell>
                    <TableCell />
                    <TableCell className="text-right text-primary text-lg">
                      {formatEur(live.cost_estimated.total)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function TenantCostDashboard() {
  const [data, setData] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState("30")
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/superadmin/tenant-usage?period=${period}`)
      if (!res.ok) throw new Error("Errore nel caricamento dei dati")
      const json = await res.json()
      setData(json)
      setLastRefresh(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore sconosciuto")
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(fetchData, 60000)
    return () => clearInterval(interval)
  }, [fetchData])

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Caricamento dati di consumo...</p>
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center space-y-4">
            <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
            <p className="text-lg font-semibold">Errore</p>
            <p className="text-muted-foreground">{error}</p>
            <Button onClick={fetchData}>Riprova</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!data) return null

  const { hotels, summary } = data

  // Sort hotels by cost descending
  const sortedHotels = [...hotels].sort(
    (a, b) => b.live.cost_estimated.total - a.live.cost_estimated.total
  )

  // Global cost breakdown
  const globalCost: CostEstimate = {
    server: hotels.reduce((s, h) => s + h.live.cost_estimated.server, 0),
    database: hotels.reduce((s, h) => s + h.live.cost_estimated.database, 0),
    ai: hotels.reduce((s, h) => s + h.live.cost_estimated.ai, 0),
    email: hotels.reduce((s, h) => s + h.live.cost_estimated.email, 0),
    total: summary.total_cost_estimated,
  }

  return (
    <div className="container mx-auto px-4 md:px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Costi e Consumo Tenant</h1>
          <p className="text-muted-foreground mt-1">
            Monitoraggio in tempo reale dei costi per struttura affiliata
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Ultimi 7 giorni</SelectItem>
              <SelectItem value="30">Ultimi 30 giorni</SelectItem>
              <SelectItem value="90">Ultimi 90 giorni</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={fetchData}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          {lastRefresh && (
            <span className="text-xs text-muted-foreground hidden md:inline">
              Aggiornato: {lastRefresh.toLocaleTimeString("it-IT")}
            </span>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={DollarSign}
          label="Costo Totale Stimato"
          value={formatEur(summary.total_cost_estimated)}
          subtext={`${summary.active_hotels} strutture attive`}
          iconColor="text-primary"
        />
        <SummaryCard
          icon={Database}
          label="Righe Database"
          value={formatNumber(summary.total_db_rows)}
          subtext="Totale tutte le strutture"
          iconColor="text-emerald-600"
        />
        <SummaryCard
          icon={Activity}
          label="Sync Oggi"
          value={String(summary.total_sync_today)}
          subtext="Sincronizzazioni PMS"
          iconColor="text-blue-600"
        />
        <SummaryCard
          icon={Bot}
          label="Messaggi AI"
          value={formatNumber(summary.total_ai_messages)}
          subtext="Totale tutti i tenant"
          iconColor="text-amber-600"
        />
      </div>

      {/* Global cost breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BarChart3 className="h-5 w-5" />
            Ripartizione Costi Globale (stima mensile)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CostBreakdownBar cost={globalCost} />
          <div className="mt-4 p-4 rounded-lg bg-muted/50">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
              <div>
                <span className="text-sm text-muted-foreground">
                  Costo medio per struttura:
                </span>
                <span className="text-lg font-bold ml-2">
                  {formatEur(summary.active_hotels > 0 ? summary.total_cost_estimated / summary.active_hotels : 0)}
                </span>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">
                  Costo medio per camera:
                </span>
                <span className="text-lg font-bold ml-2">
                  {formatEur(
                    hotels.reduce((s, h) => s + h.total_rooms, 0) > 0
                      ? summary.total_cost_estimated / hotels.reduce((s, h) => s + h.total_rooms, 0)
                      : 0
                  )}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per-hotel cards */}
      <div>
        <h2 className="text-xl font-bold mb-4">Dettaglio per Struttura</h2>
        <div className="space-y-4">
          {sortedHotels.map((hotel) => (
            <HotelDetailCard key={hotel.hotel_id} hotel={hotel} />
          ))}
        </div>
      </div>

      {/* Cost comparison table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="h-5 w-5" />
            Comparazione Costi vs Revenue
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Struttura</TableHead>
                <TableHead className="text-center">Camere</TableHead>
                <TableHead className="text-right">Costo/mese</TableHead>
                <TableHead className="text-right">Revenue stimato</TableHead>
                <TableHead className="text-right">Margine</TableHead>
                <TableHead className="text-right">Margine %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedHotels.map((hotel) => {
                // Priority: monthly_fee (total) > fixed_fee_per_room * rooms > 0
                const revenue = hotel.subscription?.monthly_fee 
                  ?? (hotel.subscription?.fixed_fee_per_room ? hotel.total_rooms * hotel.subscription.fixed_fee_per_room : 0)
                const margin = revenue - hotel.live.cost_estimated.total
                const marginPct =
                  revenue > 0
                    ? ((margin / revenue) * 100).toFixed(0)
                    : "0"
                return (
                  <TableRow key={hotel.hotel_id}>
                    <TableCell className="font-medium">
                      <div>{hotel.hotel_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {hotel.subscription 
                          ? hotel.subscription.monthly_fee 
                            ? `${hotel.subscription.plan_type === "fixed_fee" ? "Fisso" : hotel.subscription.plan_type} - €${hotel.subscription.monthly_fee.toLocaleString("it-IT")}/${hotel.subscription.billing_cycle === "monthly" ? "mese" : hotel.subscription.billing_cycle}`
                            : hotel.subscription.fixed_fee_per_room
                              ? `${hotel.subscription.plan_type === "fixed_fee" ? "Fisso" : hotel.subscription.plan_type} - €${hotel.subscription.fixed_fee_per_room.toFixed(2)}/camera/${hotel.subscription.billing_cycle === "monthly" ? "mese" : hotel.subscription.billing_cycle}`
                              : "Piano non configurato"
                          : "Nessun abbonamento"}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">{hotel.total_rooms}</TableCell>
                    <TableCell className="text-right">
                      {formatEur(hotel.live.cost_estimated.total)}
                    </TableCell>
                    <TableCell className="text-right">
                      {revenue > 0 ? formatEur(revenue) : <span className="text-muted-foreground text-sm">Non configurato</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={margin >= 0 ? "text-emerald-600" : "text-destructive"}>
                        {revenue > 0 ? formatEur(margin) : "-"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {revenue > 0 ? (
                        <Badge
                          variant={Number(marginPct) >= 70 ? "default" : Number(marginPct) >= 40 ? "secondary" : "destructive"}
                        >
                          {marginPct}%
                        </Badge>
                      ) : <span className="text-muted-foreground">-</span>}
                    </TableCell>
                  </TableRow>
                )
              })}
              {/* Totals row */}
              {(() => {
                const totalRevenue = hotels.reduce((s, h) => {
                  const rev = h.subscription?.monthly_fee ?? (h.subscription?.fixed_fee_per_room ? h.total_rooms * h.subscription.fixed_fee_per_room : 0)
                  return s + rev
                }, 0)
                const totalMargin = totalRevenue - summary.total_cost_estimated
                const totalMarginPct = totalRevenue > 0 ? ((totalMargin / totalRevenue) * 100).toFixed(0) : "0"
                return (
                  <TableRow className="border-t-2 font-bold">
                    <TableCell>TOTALE</TableCell>
                    <TableCell className="text-center">
                      {hotels.reduce((s, h) => s + h.total_rooms, 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatEur(summary.total_cost_estimated)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatEur(totalRevenue)}
                    </TableCell>
                    <TableCell className="text-right text-emerald-600">
                      {formatEur(totalMargin)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge>
                        {totalMarginPct}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                )
              })()}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
