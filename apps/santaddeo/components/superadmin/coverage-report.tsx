"use client"

import { useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  BarChart3, Loader2, AlertCircle, CheckCircle2, AlertTriangle, ChevronDown, ChevronRight,
  Plane, Bell, Mail, Calendar, Clock, Send, Activity, MinusCircle,
} from "lucide-react"

interface CoverageReportProps {
  hotelMap: Record<string, string>
}

interface HotelReport {
  hotel: { id: string; name: string }
  autopilot: {
    mode: string
    last_full_sync_at: string | null
    last_push_at: string | null
    last_notification_at: string | null
    num_notify_emails: number
  }
  pricing_grid: {
    total_records: number
    future_records: number
    future_distinct_dates: number
    future_min_date: string | null
    future_max_date: string | null
  }
  push: {
    total_records: number
    distinct_dates: number
    distinct_future_dates: number
    min_pushed_date: string | null
    max_pushed_date: string | null
    sources_breakdown: Record<string, number>
  }
  missing: {
    count: number
    first_missing_date: string | null
    last_missing_date: string | null
    sample_dates: string[]
  }
  health: {
    coverage_pct: number
    status: "ok" | "warning" | "critical" | "not_applicable" | "unknown"
  }
}

function formatDate(iso: string | null) {
  if (!iso) return "-"
  return new Date(iso).toLocaleString("it-IT", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

function formatDateOnly(iso: string | null) {
  if (!iso) return "-"
  return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })
}

const STATUS_CONFIG = {
  ok: { color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400", icon: CheckCircle2, label: "OK" },
  warning: { color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400", icon: AlertTriangle, label: "Attenzione" },
  critical: { color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: AlertCircle, label: "Critico" },
  not_applicable: { color: "bg-slate-100 text-slate-700 dark:bg-slate-800/40 dark:text-slate-300", icon: MinusCircle, label: "Non applicabile" },
  // FIX 29/05/2026: config non leggibile / dato non affidabile. Stato neutro,
  // non allertante (vedi cron pricing-health).
  unknown: { color: "bg-slate-100 text-slate-700 dark:bg-slate-800/40 dark:text-slate-300", icon: MinusCircle, label: "Sconosciuto" },
}

const MODE_CONFIG: Record<string, { icon: any; label: string; color: string }> = {
  disabled: { icon: null as any, label: "Disabilitato", color: "text-muted-foreground" },
  notify: { icon: Bell, label: "Solo notifiche", color: "text-amber-600" },
  autopilot: { icon: Plane, label: "Autopilot", color: "text-emerald-600" },
  unknown: { icon: null as any, label: "Sconosciuto", color: "text-muted-foreground" },
}

export function CoverageReport({ hotelMap }: CoverageReportProps) {
  const [reports, setReports] = useState<HotelReport[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hotelFilter, setHotelFilter] = useState<string>("all")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [hasRun, setHasRun] = useState(false)

  const runAnalysis = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (hotelFilter !== "all") params.set("hotelId", hotelFilter)
      const res = await fetch(`/api/superadmin/pricing-log/coverage?${params}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body?.error || `Errore del server (${res.status})`)
        setReports([])
        return
      }
      const data = await res.json()
      setReports(data.reports || [])
      setHasRun(true)
    } catch (e) {
      setError("Errore di connessione al server.")
      setReports([])
    } finally {
      setLoading(false)
    }
  }, [hotelFilter])

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const uniqueHotels = Object.entries(hotelMap).sort((a, b) => a[1].localeCompare(b[1]))

  // Aggregate stats
  const totalHotels = reports.length
  const okCount = reports.filter((r) => r.health.status === "ok").length
  const warningCount = reports.filter((r) => r.health.status === "warning").length
  const criticalCount = reports.filter((r) => r.health.status === "critical").length
  const notApplicableCount = reports.filter((r) => r.health.status === "not_applicable").length

  return (
    <Card className="border-blue-200 bg-blue-50/30 dark:border-blue-800 dark:bg-blue-950/10">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-blue-100 dark:bg-blue-900/30 p-2">
              <BarChart3 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-base">Analisi Copertura Push PMS</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Verifica se i prezzi della pricing_grid sono stati effettivamente inviati al PMS per tutte le date future.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={hotelFilter} onValueChange={setHotelFilter}>
              <SelectTrigger className="w-[200px] h-8 text-sm">
                <SelectValue placeholder="Tutti gli hotel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli hotel attivi</SelectItem>
                {uniqueHotels.map(([id, name]) => (
                  <SelectItem key={id} value={id}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={runAnalysis} size="sm" disabled={loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
              {loading ? "Analisi in corso..." : "Esegui analisi"}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {error && (
          <div className="flex items-center gap-2 p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm dark:bg-red-950/30 dark:border-red-800 dark:text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {!hasRun && !loading && !error && (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <BarChart3 className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">Clicca &quot;Esegui analisi&quot; per generare il report</p>
            <p className="text-xs mt-1">Mostra le date pricing_grid coperte dai push, le date scoperte e lo stato Autopilot</p>
          </div>
        )}

        {hasRun && reports.length > 0 && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <div className="bg-card rounded-lg border p-3 flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-600" />
                <div>
                  <p className="text-xl font-bold">{totalHotels}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Hotel analizzati</p>
                </div>
              </div>
              <div className="bg-card rounded-lg border p-3 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <div>
                  <p className="text-xl font-bold text-emerald-600">{okCount}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">OK ({"\u2265"}95%)</p>
                </div>
              </div>
              <div className="bg-card rounded-lg border p-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <div>
                  <p className="text-xl font-bold text-amber-600">{warningCount}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Attenzione (70-94%)</p>
                </div>
              </div>
              <div className="bg-card rounded-lg border p-3 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <div>
                  <p className="text-xl font-bold text-red-600">{criticalCount}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Critico (&lt;70%)</p>
                </div>
              </div>
              <div className="bg-card rounded-lg border p-3 flex items-center gap-2">
                <MinusCircle className="h-4 w-4 text-slate-500" />
                <div>
                  <p className="text-xl font-bold text-slate-600">{notApplicableCount}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">N/A (notify)</p>
                </div>
              </div>
            </div>

            {/* Per-hotel reports */}
            <div className="space-y-2 mt-4">
              {reports.map((r) => {
                const statusCfg = STATUS_CONFIG[r.health.status]
                const StatusIcon = statusCfg.icon
                const modeCfg = MODE_CONFIG[r.autopilot.mode] || MODE_CONFIG.disabled
                const ModeIcon = modeCfg.icon
                const isOpen = expanded.has(r.hotel.id)

                return (
                  <div key={r.hotel.id} className="bg-card rounded-lg border">
                    <button
                      onClick={() => toggleExpand(r.hotel.id)}
                      className="w-full flex items-center gap-3 p-3 text-left hover:bg-accent/30 rounded-lg transition-colors"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <Badge variant="secondary" className={`${statusCfg.color} text-[10px] px-1.5 py-0 shrink-0 gap-1`}>
                        <StatusIcon className="h-3 w-3" />
                        {statusCfg.label}
                      </Badge>
                      <span className="font-semibold text-sm text-foreground flex-1 truncate">{r.hotel.name}</span>
                      {ModeIcon && (
                        <span className={`flex items-center gap-1 text-[11px] ${modeCfg.color}`}>
                          <ModeIcon className="h-3 w-3" />
                          {modeCfg.label}
                        </span>
                      )}
                      {r.autopilot.num_notify_emails > 0 && (
                        <Mail className="h-3 w-3 text-blue-500" />
                      )}
                      <div className="text-right shrink-0 min-w-[80px]">
                        <p className={`text-lg font-bold tabular-nums ${
                          r.health.status === "ok" ? "text-emerald-600" :
                          r.health.status === "warning" ? "text-amber-600" :
                          r.health.status === "critical" ? "text-red-600" :
                          "text-slate-500"
                        }`}>
                          {r.health.coverage_pct}%
                        </p>
                        <p className="text-[9px] text-muted-foreground uppercase">copertura</p>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="border-t px-4 py-3 space-y-3 bg-muted/20">
                        {/* Riepilogo metriche tipo report Massabò */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <tbody className="divide-y">
                              <Row label="Modalità Autopilot" value={
                                <span className="flex items-center gap-1.5 flex-wrap">
                                  {ModeIcon && <ModeIcon className={`h-3 w-3 ${modeCfg.color}`} />}
                                  <span className="font-medium">{modeCfg.label}</span>
                                  {r.autopilot.num_notify_emails > 0 && (
                                    <Badge variant="outline" className="text-[9px] gap-1">
                                      <Mail className="h-2.5 w-2.5" />
                                      {r.autopilot.num_notify_emails} email
                                    </Badge>
                                  )}
                                  {/*
                                    FIX 30/04/2026: se autopilot e' "disabled" ma c'e' un last_push_at recente
                                    (ultimi 30 giorni), molto probabilmente l'utente sta facendo push manuali
                                    da /accelerator. Mostriamo un badge informativo cosi' la "Disabilitato" non
                                    sembri un errore (caso classico Massabò: utente percepisce autopilot attivo
                                    perche' fa push manuali).
                                  */}
                                  {r.autopilot.mode === "disabled" && r.autopilot.last_push_at &&
                                    (Date.now() - new Date(r.autopilot.last_push_at).getTime()) < 30 * 24 * 60 * 60 * 1000 && (
                                      <Badge variant="outline" className="text-[9px] gap-1 border-amber-300 bg-amber-50 text-amber-700">
                                        push manuali attivi
                                      </Badge>
                                    )}
                                </span>
                              } />
                              <Row label="Primo full sync" value={formatDate(r.autopilot.last_full_sync_at)} />
                              <Row label="Ultimo push" value={formatDate(r.autopilot.last_push_at)} />
                              <Row label="Ultima notifica email" value={formatDate(r.autopilot.last_notification_at)} />
                              <Row label="Pricing grid totale" value={
                                <span><strong>{r.pricing_grid.total_records.toLocaleString("it-IT")}</strong> record</span>
                              } />
                              <Row label="Pricing grid futura" value={
                                <span>
                                  <strong>{r.pricing_grid.future_records.toLocaleString("it-IT")}</strong> record
                                  {" "}({r.pricing_grid.future_distinct_dates} date distinte)
                                </span>
                              } />
                              <Row label="Range pricing_grid futura" value={
                                <span className="font-mono text-[11px]">
                                  {formatDateOnly(r.pricing_grid.future_min_date)} → {formatDateOnly(r.pricing_grid.future_max_date)}
                                </span>
                              } />
                              <Row label="Record pushati al PMS" value={
                                <span><strong>{r.push.total_records.toLocaleString("it-IT")}</strong> record di push</span>
                              } />
                              <Row label="Date distinte coperte (future)" value={
                                <span>
                                  <strong className={
                                    r.health.status === "ok" ? "text-emerald-600" :
                                    r.health.status === "warning" ? "text-amber-600" :
                                    r.health.status === "critical" ? "text-red-600" :
                                    "text-slate-500"
                                  }>
                                    {r.push.distinct_future_dates}
                                  </strong>
                                  {" "}su {r.pricing_grid.future_distinct_dates} date totali
                                </span>
                              } />
                              <Row label="Range coperto sul PMS" value={
                                <span className="font-mono text-[11px]">
                                  {formatDateOnly(r.push.min_pushed_date)} → {formatDateOnly(r.push.max_pushed_date)}
                                </span>
                              } />
                              {r.missing.count > 0 && (
                                <Row label="Date scoperte" value={
                                  <span className="text-red-600 font-medium">
                                    {r.missing.count} date — {formatDateOnly(r.missing.first_missing_date)} → {formatDateOnly(r.missing.last_missing_date)}
                                  </span>
                                } />
                              )}
                            </tbody>
                          </table>
                        </div>

                        {/* Sources breakdown */}
                        {Object.keys(r.push.sources_breakdown).length > 0 && (
                          <div>
                            <p className="text-[10px] uppercase font-medium text-muted-foreground mb-1">Sources push</p>
                            <div className="flex flex-wrap gap-1.5">
                              {Object.entries(r.push.sources_breakdown).map(([src, n]) => (
                                <Badge key={src} variant="outline" className="text-[10px] gap-1">
                                  <Send className="h-2.5 w-2.5" />
                                  {src}: <strong>{n.toLocaleString("it-IT")}</strong>
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Sample missing dates */}
                        {r.missing.sample_dates.length > 0 && (
                          <div>
                            <p className="text-[10px] uppercase font-medium text-muted-foreground mb-1">
                              Esempi date scoperte (prime 10 di {r.missing.count})
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {r.missing.sample_dates.map((d) => (
                                <Badge key={d} variant="outline" className="text-[10px] font-mono border-red-300 text-red-700 dark:border-red-800 dark:text-red-400 gap-1">
                                  <Calendar className="h-2.5 w-2.5" />
                                  {formatDateOnly(d)}
                                </Badge>
                              ))}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-2">
                              <AlertCircle className="h-3 w-3 inline mr-1" />
                              Per coprire queste date, usa il pulsante &quot;Push tutto&quot; nella pagina <strong>/accelerator/pricing</strong> dell&apos;hotel
                              oppure <a href="/superadmin/push-prices" className="underline">/superadmin/push-prices</a>.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}

        {hasRun && reports.length === 0 && !loading && !error && (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Clock className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">Nessun hotel da analizzare</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <tr>
      <td className="py-1.5 pr-3 text-muted-foreground whitespace-nowrap w-[40%]">{label}</td>
      <td className="py-1.5 text-foreground">{value}</td>
    </tr>
  )
}
