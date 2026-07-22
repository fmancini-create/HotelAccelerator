"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import {
  RefreshCw, ArrowUpDown, TrendingUp, TrendingDown, Send, Bell, AlertCircle,
  CheckCircle2, XCircle, ChevronDown, ChevronRight, Clock,
} from "lucide-react"
import { CoverageReport } from "./coverage-report"
import { PermanentFailuresPanel } from "./permanent-failures-panel"

interface LogEntry {
  id: string
  type: "price_change" | "autopilot_trigger" | "push_result"
  hotelId: string
  hotelName: string
  timestamp: string
  summary: string
  detail: any
}

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  price_change: { label: "Variazione Prezzo", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", icon: ArrowUpDown },
  autopilot_trigger: { label: "Trigger Autopilot", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400", icon: Bell },
  push_result: { label: "Invio PMS", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400", icon: Send },
}

const MODE_BADGES: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  disabled: { label: "Disabilitato", variant: "secondary" },
  notify: { label: "Notifica", variant: "outline" },
  autopilot: { label: "Autopilot", variant: "default" },
  manual: { label: "Manuale", variant: "destructive" },
}

function formatTimestamp(ts: string) {
  return new Date(ts).toLocaleString("it-IT", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  })
}

function formatPrice(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 0 }).format(n)
}

export function PricingLogViewer() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hotelFilter, setHotelFilter] = useState<string>("all")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [hotels, setHotels] = useState<Record<string, string>>({})
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (hotelFilter !== "all") params.set("hotelId", hotelFilter)
      if (typeFilter !== "all") params.set("type", typeFilter)
      params.set("limit", "200")

      const res = await fetch(`/api/superadmin/pricing-log?${params}`)
      if (!res.ok) {
        if (res.status === 401) { setError("Sessione scaduta. Effettua nuovamente il login."); return }
        if (res.status === 403) { setError("Non hai i permessi per visualizzare questa pagina."); return }
        setError(`Errore del server (${res.status})`)
        return
      }
      const data = await res.json()
      setLogs(data.logs || [])
      setHotels(data.hotelMap || {})
    } catch {
      setError("Errore di connessione al server.")
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [hotelFilter, typeFilter])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const uniqueHotels = Object.entries(hotels).sort((a, b) => a[1].localeCompare(b[1]))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Log Gestione Prezzi</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Storico variazioni prezzi, trigger autopilot e invii al PMS/GDocs
          </p>
        </div>
        <Button onClick={fetchLogs} variant="outline" size="sm" disabled={loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Aggiorna
        </Button>
      </div>

      {/*
        Recovery panel per fallimenti permanenti del push autopilot. Si
        auto-nasconde quando non c'e' nulla da recuperare, quindi non
        sporca la UI in stato sano. Posizionato sopra il CoverageReport
        perche' richiede azione operativa (reset) mentre coverage e' di
        sola lettura.
      */}
      <PermanentFailuresPanel />

      {/* Coverage analysis - superadmin tool to verify push completeness */}
      <CoverageReport hotelMap={hotels} />

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">Hotel:</span>
              <Select value={hotelFilter} onValueChange={setHotelFilter}>
                <SelectTrigger className="w-[220px] h-8 text-sm">
                  <SelectValue placeholder="Tutti gli hotel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti gli hotel</SelectItem>
                  {uniqueHotels.map(([id, name]) => (
                    <SelectItem key={id} value={id}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">Tipo:</span>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[180px] h-8 text-sm">
                  <SelectValue placeholder="Tutti i tipi" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti i tipi</SelectItem>
                  <SelectItem value="changes">Variazioni Prezzo</SelectItem>
                  <SelectItem value="triggers">Trigger Autopilot</SelectItem>
                  <SelectItem value="pushes">Invii PMS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="ml-auto text-xs text-muted-foreground">
              {logs.length} eventi trovati
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error message */}
      {error && (
        <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30">
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 dark:bg-blue-900/30 p-2">
              <ArrowUpDown className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{logs.filter(l => l.type === "price_change").length}</p>
              <p className="text-xs text-muted-foreground">Variazioni Prezzo</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="rounded-lg bg-amber-100 dark:bg-amber-900/30 p-2">
              <Bell className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{logs.filter(l => l.type === "autopilot_trigger").length}</p>
              <p className="text-xs text-muted-foreground">Trigger Autopilot</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="rounded-lg bg-emerald-100 dark:bg-emerald-900/30 p-2">
              <Send className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{logs.filter(l => l.type === "push_result").length}</p>
              <p className="text-xs text-muted-foreground">Invii PMS/GDocs</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Log entries */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Timeline Eventi</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm gap-2">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Caricamento log...
            </div>
          )}

          {!loading && logs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Clock className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">Nessun evento trovato per i filtri selezionati.</p>
            </div>
          )}

          {!loading && logs.length > 0 && (
            <div className="space-y-1">
              {logs.map(log => {
                const config = TYPE_CONFIG[log.type]
                const Icon = config.icon
                const isExpanded = expandedIds.has(log.id)

                return (
                  <div key={log.id} className="border border-border rounded-lg">
                    {/* Row header */}
                    <button
                      onClick={() => toggleExpand(log.id)}
                      className="w-full flex items-center gap-3 p-3 text-left hover:bg-accent/50 transition-colors rounded-lg"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 shrink-0 ${config.color}`}>
                        {config.label}
                      </Badge>
                      <span className="text-xs font-medium text-foreground truncate flex-1">
                        {log.summary}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0 font-mono">
                        {log.hotelName}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                        {formatTimestamp(log.timestamp)}
                      </span>
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="px-4 pb-3 border-t border-border bg-muted/20">
                        {log.type === "price_change" && (
                          <div className="pt-3 space-y-2">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                              <div>
                                <span className="text-muted-foreground">Data target:</span>
                                <p className="font-medium text-foreground">{log.detail.targetDate}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Prezzo precedente:</span>
                                <p className="font-medium text-foreground">{formatPrice(log.detail.oldPrice)}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Nuovo prezzo:</span>
                                <p className="font-bold text-foreground">{formatPrice(log.detail.newPrice)}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Differenza:</span>
                                <p className={`font-bold flex items-center gap-1 ${
                                  log.detail.newPrice > log.detail.oldPrice ? "text-green-600" : "text-red-600"
                                }`}>
                                  {log.detail.newPrice > log.detail.oldPrice ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                  {formatPrice(Math.abs(log.detail.newPrice - log.detail.oldPrice))}
                                </p>
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Sorgente: <span className="font-medium">{log.detail.source || "griglia"}</span>
                              {log.detail.occupancy && <> | Occupancy: <span className="font-medium">{log.detail.occupancy}</span></>}
                            </div>
                          </div>
                        )}

                        {log.type === "autopilot_trigger" && (
                          <div className="pt-3 space-y-3">
                            <div className="flex items-center gap-3 text-xs">
                              <span className="text-muted-foreground">Mode:</span>
                              <Badge variant={MODE_BADGES[log.detail.mode]?.variant || "secondary"} className="text-[10px]">
                                {MODE_BADGES[log.detail.mode]?.label || log.detail.mode}
                              </Badge>
                              <span className="text-muted-foreground">Variazioni:</span>
                              <span className="font-bold text-foreground">{log.detail.changesCount}</span>
                              <span className="text-muted-foreground">Tipologie:</span>
                              <span className="font-medium text-foreground">{log.detail.roomTypes?.join(", ")}</span>
                              {log.detail.notificationSent && (
                                <Badge variant="outline" className="text-[10px] gap-1">
                                  <Bell className="h-3 w-3" /> Email inviata
                                </Badge>
                              )}
                            </div>

                            {/* Changes preview table */}
                            {log.detail.changes && log.detail.changes.length > 0 && (
                              <div className="overflow-x-auto">
                                <table className="w-full text-[11px]">
                                  <thead>
                                    <tr className="border-b border-border text-muted-foreground">
                                      <th className="text-left py-1 pr-3 font-medium">Data</th>
                                      <th className="text-left py-1 pr-3 font-medium">Tipologia</th>
                                      <th className="text-right py-1 pr-3 font-medium">Attuale</th>
                                      <th className="text-right py-1 pr-3 font-medium">Suggerito</th>
                                      <th className="text-right py-1 font-medium">Diff</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {log.detail.changes.map((c: any, i: number) => {
                                      const hasCurrent = c.currentPrice != null && c.currentPrice > 0
                                      const diff = hasCurrent ? c.suggestedPrice - c.currentPrice : null
                                      return (
                                        <tr key={i} className="border-b border-border/50">
                                          <td className="py-1 pr-3 text-foreground">{c.date}</td>
                                          <td className="py-1 pr-3 text-foreground">{c.roomTypeName}</td>
                                          <td className="py-1 pr-3 text-right text-muted-foreground">
                                            {hasCurrent ? formatPrice(c.currentPrice) : <span className="text-xs italic">N/D</span>}
                                          </td>
                                          <td className="py-1 pr-3 text-right font-medium text-foreground">{formatPrice(c.suggestedPrice)}</td>
                                          <td className={`py-1 text-right font-bold ${diff !== null ? (diff > 0 ? "text-green-600" : "text-red-600") : "text-muted-foreground"}`}>
                                            {diff !== null ? `${diff > 0 ? "+" : ""}${formatPrice(diff)}` : "-"}
                                          </td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                                {log.detail.changesCount > 10 && (
                                  <p className="text-[10px] text-muted-foreground mt-1 italic">
                                    Mostrate 10 di {log.detail.changesCount} variazioni
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {log.type === "push_result" && (
                          <div className="pt-3 space-y-2">
                            <div className="flex items-center gap-3 text-xs">
                              {log.detail.pushResult?.success ? (
                                <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-[10px] gap-1">
                                  <CheckCircle2 className="h-3 w-3" /> Successo
                                </Badge>
                              ) : (
                                <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 text-[10px] gap-1">
                                  <XCircle className="h-3 w-3" /> Errore
                                </Badge>
                              )}
                              <span className="text-muted-foreground">Metodo:</span>
                              <span className="font-medium text-foreground">{log.detail.pushResult?.method || "N/A"}</span>
                              <span className="text-muted-foreground">Record:</span>
                              <span className="font-bold text-foreground">{log.detail.pushResult?.cellsOrRecords || 0}</span>
                              <span className="text-muted-foreground">Variazioni:</span>
                              <span className="font-medium text-foreground">{log.detail.changesCount}</span>
                            </div>
                            {log.detail.pushResult?.errors && log.detail.pushResult.errors.length > 0 && (
                              <div className="bg-red-50 dark:bg-red-900/10 rounded p-2 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
                                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                                <div className="space-y-1">
                                  {log.detail.pushResult.errors.map((err: string, i: number) => (
                                    <p key={i}>{err}</p>
                                  ))}
                                </div>
                              </div>
                            )}
                            {log.detail.pushResult?.scidooResponse && (
                              <pre className="bg-muted rounded p-2 text-[10px] overflow-x-auto max-h-40">
                                {JSON.stringify(log.detail.pushResult.scidooResponse, null, 2)}
                              </pre>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
