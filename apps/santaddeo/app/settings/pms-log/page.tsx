"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  RefreshCw, ArrowUpDown, Send, CheckCircle2, XCircle,
  ChevronDown, ChevronRight, Clock, TrendingUp, TrendingDown,
  AlertCircle, ArrowLeft
} from "lucide-react"
import Link from "next/link"

interface LogEntry {
  id: string
  type: "price_change" | "push"
  timestamp: string
  summary: string
  detail: any
}

const TYPE_CONFIG: Record<string, { label: string; badgeClass: string; icon: any }> = {
  price_change: {
    label: "Variazione Prezzo",
    badgeClass: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    icon: ArrowUpDown,
  },
  push: {
    label: "Invio PMS",
    badgeClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    icon: Send,
  },
}

const MODE_LABELS: Record<string, string> = {
  manual: "Manuale",
  autopilot: "Autopilot",
  notify: "Notifica",
  disabled: "Disabilitato",
}

function formatTimestamp(ts: string) {
  return new Date(ts).toLocaleString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatPrice(n: number | null) {
  if (n == null) return "--"
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
  }).format(n)
}

export default function PmsLogPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (typeFilter !== "all") params.set("type", typeFilter)
      params.set("limit", "200")
      const res = await fetch(`/api/ui/pms-log?${params}`)
      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs || [])
      }
    } catch {
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [typeFilter])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const pushLogs = logs.filter((l) => l.type === "push")
  const changeLogs = logs.filter((l) => l.type === "price_change")
  const successPushes = pushLogs.filter((l) => l.detail.pushResult?.success === true)
  const errorPushes = pushLogs.filter((l) => l.detail.pushResult?.success === false)

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/settings/hotel">
              <Button variant="ghost" size="icon" className="shrink-0">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
                Log PMS
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Storico variazioni prezzi e invii al PMS
              </p>
            </div>
          </div>
          <Button
            onClick={fetchLogs}
            variant="outline"
            size="sm"
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Aggiorna
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 dark:bg-blue-900/30 p-2">
                <ArrowUpDown className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{changeLogs.length}</p>
                <p className="text-xs text-muted-foreground">Variazioni</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <div className="rounded-lg bg-emerald-100 dark:bg-emerald-900/30 p-2">
                <Send className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{pushLogs.length}</p>
                <p className="text-xs text-muted-foreground">Invii PMS</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <div className="rounded-lg bg-green-100 dark:bg-green-900/30 p-2">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{successPushes.length}</p>
                <p className="text-xs text-muted-foreground">Riusciti</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <div className="rounded-lg bg-red-100 dark:bg-red-900/30 p-2">
                <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{errorPushes.length}</p>
                <p className="text-xs text-muted-foreground">Errori</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filter */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-muted-foreground">
                Filtra per:
              </span>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[200px] h-8 text-sm">
                  <SelectValue placeholder="Tutti gli eventi" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti gli eventi</SelectItem>
                  <SelectItem value="changes">Variazioni Prezzo</SelectItem>
                  <SelectItem value="pushes">Invii PMS</SelectItem>
                </SelectContent>
              </Select>
              <span className="ml-auto text-xs text-muted-foreground">
                {logs.length} eventi
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Timeline */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Timeline</CardTitle>
            <CardDescription>Clicca su una riga per espandere i dettagli</CardDescription>
          </CardHeader>
          <CardContent>
            {loading && (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-sm gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Caricamento...
              </div>
            )}

            {!loading && logs.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Clock className="h-10 w-10 mb-3 opacity-40" />
                <p className="text-sm font-medium">Nessun evento registrato</p>
                <p className="text-xs mt-1">
                  Gli eventi appariranno quando modifichi i prezzi o invii al PMS.
                </p>
              </div>
            )}

            {!loading && logs.length > 0 && (
              <div className="space-y-1">
                {logs.map((log) => {
                  const config = TYPE_CONFIG[log.type]
                  const Icon = config.icon
                  const isExpanded = expandedIds.has(log.id)
                  const isPushSuccess = log.type === "push" && log.detail.pushResult?.success === true
                  const isPushError = log.type === "push" && log.detail.pushResult?.success === false

                  return (
                    <div key={log.id} className="border border-border rounded-lg">
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
                        <Badge
                          variant="secondary"
                          className={`text-[10px] px-1.5 py-0 shrink-0 ${config.badgeClass}`}
                        >
                          {config.label}
                        </Badge>
                        {isPushSuccess && (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                        )}
                        {isPushError && (
                          <XCircle className="h-3.5 w-3.5 text-red-600 shrink-0" />
                        )}
                        <span className="text-xs font-medium text-foreground truncate flex-1">
                          {log.summary}
                        </span>
                        <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                          {formatTimestamp(log.timestamp)}
                        </span>
                      </button>

                      {isExpanded && (
                        <div className="px-4 pb-3 border-t border-border bg-muted/20">
                          {log.type === "price_change" && (
                            <div className="pt-3 space-y-2">
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                <div>
                                  <span className="text-muted-foreground">Data:</span>
                                  <p className="font-medium text-foreground">
                                    {log.detail.targetDate}
                                  </p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Tipologia:</span>
                                  <p className="font-medium text-foreground">
                                    {log.detail.roomTypeName}
                                    {log.detail.rateName && (
                                      <span className="text-muted-foreground">
                                        {" "}
                                        ({log.detail.rateName})
                                      </span>
                                    )}
                                  </p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Prezzo precedente:</span>
                                  <p className="font-medium text-foreground">
                                    {formatPrice(log.detail.oldPrice)}
                                  </p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Nuovo prezzo:</span>
                                  <p className="font-bold text-foreground">
                                    {formatPrice(log.detail.newPrice)}
                                  </p>
                                </div>
                              </div>
                              {log.detail.oldPrice != null && (
                                <div className="text-xs">
                                  <span className="text-muted-foreground">Differenza: </span>
                                  <span
                                    className={`font-bold inline-flex items-center gap-1 ${
                                      log.detail.newPrice > log.detail.oldPrice
                                        ? "text-green-600"
                                        : "text-red-600"
                                    }`}
                                  >
                                    {log.detail.newPrice > log.detail.oldPrice ? (
                                      <TrendingUp className="h-3 w-3" />
                                    ) : (
                                      <TrendingDown className="h-3 w-3" />
                                    )}
                                    {formatPrice(
                                      Math.abs(log.detail.newPrice - log.detail.oldPrice)
                                    )}
                                  </span>
                                </div>
                              )}
                              <div className="text-xs text-muted-foreground">
                                Sorgente:{" "}
                                <span className="font-medium">
                                  {log.detail.source === "manual_push"
                                    ? "Invio manuale"
                                    : log.detail.source === "autopilot"
                                      ? "Autopilot"
                                      : log.detail.source === "pricing_grid"
                                        ? "Griglia prezzi"
                                        : log.detail.source || "Griglia"}
                                </span>
                              </div>
                            </div>
                          )}

                          {log.type === "push" && (
                            <div className="pt-3 space-y-3">
                              <div className="flex flex-wrap items-center gap-3 text-xs">
                                {log.detail.pushResult?.success ? (
                                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-[10px] gap-1">
                                    <CheckCircle2 className="h-3 w-3" /> Completato
                                  </Badge>
                                ) : (
                                  <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 text-[10px] gap-1">
                                    <XCircle className="h-3 w-3" /> Errore
                                  </Badge>
                                )}
                                <span className="text-muted-foreground">
                                  Modalita':{" "}
                                  <span className="font-medium text-foreground">
                                    {MODE_LABELS[log.detail.mode] || log.detail.mode}
                                  </span>
                                </span>
                                <span className="text-muted-foreground">
                                  Metodo:{" "}
                                  <span className="font-medium text-foreground">
                                    {log.detail.pushResult?.method === "scidoo_api"
                                      ? "Scidoo API"
                                      : log.detail.pushResult?.method === "gsheets"
                                        ? "Google Sheets"
                                        : log.detail.pushResult?.method || "N/A"}
                                  </span>
                                </span>
                                <span className="text-muted-foreground">
                                  Record:{" "}
                                  <span className="font-bold text-foreground">
                                    {log.detail.pushResult?.cellsOrRecords || 0}
                                  </span>
                                </span>
                              </div>

                              {/* Errors */}
                              {log.detail.pushResult?.errors?.length > 0 && (
                                <div className="bg-red-50 dark:bg-red-900/10 rounded-lg p-3 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
                                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                                  <div className="space-y-1">
                                    {log.detail.pushResult.errors.map(
                                      (err: string, i: number) => (
                                        <p key={i}>{err}</p>
                                      )
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Changes table */}
                              {log.detail.changes && log.detail.changes.length > 0 && (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-[11px]">
                                    <thead>
                                      <tr className="border-b border-border text-muted-foreground">
                                        <th className="text-left py-1.5 pr-3 font-medium">
                                          Data
                                        </th>
                                        <th className="text-left py-1.5 pr-3 font-medium">
                                          Tipologia
                                        </th>
                                        <th className="text-right py-1.5 pr-3 font-medium">
                                          Attuale
                                        </th>
                                        <th className="text-right py-1.5 pr-3 font-medium">
                                          Nuovo
                                        </th>
                                        <th className="text-right py-1.5 font-medium">Diff</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {log.detail.changes.map((c: any, i: number) => {
                                        const diff = c.suggestedPrice - c.currentPrice
                                        return (
                                          <tr
                                            key={i}
                                            className="border-b border-border/50"
                                          >
                                            <td className="py-1.5 pr-3 text-foreground">
                                              {c.date}
                                            </td>
                                            <td className="py-1.5 pr-3 text-foreground">
                                              {c.roomTypeName}
                                            </td>
                                            <td className="py-1.5 pr-3 text-right text-muted-foreground">
                                              {formatPrice(c.currentPrice)}
                                            </td>
                                            <td className="py-1.5 pr-3 text-right font-medium text-foreground">
                                              {formatPrice(c.suggestedPrice)}
                                            </td>
                                            <td
                                              className={`py-1.5 text-right font-bold ${
                                                diff > 0
                                                  ? "text-green-600"
                                                  : "text-red-600"
                                              }`}
                                            >
                                              {diff > 0 ? "+" : ""}
                                              {formatPrice(diff)}
                                            </td>
                                          </tr>
                                        )
                                      })}
                                    </tbody>
                                  </table>
                                  {log.detail.changesCount > 20 && (
                                    <p className="text-[10px] text-muted-foreground mt-1 italic">
                                      Mostrati 20 di {log.detail.changesCount} prezzi
                                    </p>
                                  )}
                                </div>
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
    </div>
  )
}
