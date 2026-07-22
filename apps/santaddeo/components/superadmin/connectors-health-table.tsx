"use client"

import { useState } from "react"
import useSWR from "swr"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { RefreshCw, AlertTriangle, CheckCircle, XCircle, Activity } from "lucide-react"
import { cn } from "@/lib/utils"

interface HealthResult {
  hotel_id: string
  hotel_name: string
  connector: string
  raw_total: number
  rms_total: number
  raw_cancelled: number
  rms_cancelled: number
  diff_total: number
  diff_cancelled: number
  alert_triggered: boolean
  checked_at: string
}

interface HealthResponse {
  success: boolean
  data: HealthResult[]
  timestamp: string
  error?: string
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())

function getStatusBadge(diffTotal: number, rawTotal: number, rmsTotal: number) {
  // 19/05/2026: hotel con 0 raw E 0 rms non sono "OK" — sono semplicemente
  // non sincronizzati (es. BRiG appena collegato senza credenziali valide,
  // pipeline mai partita). Mostriamo un badge dedicato cosi non sembra
  // tutto verde quando in realta' non c'e' nessun dato in flusso.
  if (rawTotal === 0 && rmsTotal === 0) {
    return (
      <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100 border-slate-300">
        <AlertTriangle className="h-3 w-3 mr-1" />
        Da configurare
      </Badge>
    )
  }
  if (Math.abs(diffTotal) <= 1) {
    return (
      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
        <CheckCircle className="h-3 w-3 mr-1" />
        OK
      </Badge>
    )
  }
  if (Math.abs(diffTotal) <= 5) {
    return (
      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
        <AlertTriangle className="h-3 w-3 mr-1" />
        Attenzione
      </Badge>
    )
  }
  return (
    <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
      <XCircle className="h-3 w-3 mr-1" />
      Critico
    </Badge>
  )
}

function getDiffClass(diff: number, threshold: number) {
  const absDiff = Math.abs(diff)
  if (absDiff <= 1) return "text-emerald-600 font-medium"
  if (absDiff <= threshold) return "text-amber-600 font-medium"
  return "text-red-600 font-bold"
}

export function ConnectorsHealthTable() {
  const [isRefreshing, setIsRefreshing] = useState(false)

  const { data, error, isLoading, mutate } = useSWR<HealthResponse>(
    "/api/superadmin/connectors-health",
    fetcher,
    {
      refreshInterval: 60000, // Refresh every minute
      revalidateOnFocus: true,
    }
  )

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      // Trigger manual health check
      await fetch("/api/superadmin/connectors-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      // Refetch data
      await mutate()
    } catch (err) {
      console.error("Error refreshing health data:", err)
    } finally {
      setIsRefreshing(false)
    }
  }

  const healthData = data?.data || []

  // Calculate summary stats
  // 19/05/2026: gli hotel con 0 raw E 0 rms NON sono "Sincronizzati" — sono
  // "Da configurare". Vanno in una colonna separata per non gonfiare il
  // counter verde con hotel che in realta' non hanno mai pingato il PMS.
  const totalHotels = healthData.length
  const unconfiguredCount = healthData.filter((h) => h.raw_total === 0 && h.rms_total === 0).length
  const okCount = healthData.filter(
    (h) => !(h.raw_total === 0 && h.rms_total === 0) && Math.abs(h.diff_total) <= 1,
  ).length
  const warningCount = healthData.filter(
    (h) => !(h.raw_total === 0 && h.rms_total === 0) && Math.abs(h.diff_total) > 1 && Math.abs(h.diff_total) <= 5,
  ).length
  const criticalCount = healthData.filter(
    (h) => !(h.raw_total === 0 && h.rms_total === 0) && Math.abs(h.diff_total) > 5,
  ).length

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Hotel Monitorati</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalHotels}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-emerald-600">Sincronizzati</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{okCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-amber-600">Attenzione</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{warningCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-600">Critici</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{criticalCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Da configurare</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-700">{unconfiguredCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Stato Connettori PMS
            </CardTitle>
            <CardDescription>
              Confronto tra prenotazioni RAW (PMS) e prenotazioni normalizzate (RMS)
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing || isLoading}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", (isRefreshing || isLoading) && "animate-spin")} />
            {isRefreshing ? "Aggiornamento..." : "Aggiorna"}
          </Button>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="text-center py-8 text-red-600">
              Errore nel caricamento dei dati: {error.message || "Errore sconosciuto"}
            </div>
          ) : isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
              Caricamento...
            </div>
          ) : healthData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Nessun dato disponibile.</p>
              <p className="text-sm mt-1">Esegui un controllo manuale per raccogliere i dati.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hotel</TableHead>
                    <TableHead>Connettore</TableHead>
                    <TableHead className="text-right">RAW Tot.</TableHead>
                    <TableHead className="text-right">RMS Tot.</TableHead>
                    <TableHead className="text-right">Diff Tot.</TableHead>
                    <TableHead className="text-right">RAW Ann.</TableHead>
                    <TableHead className="text-right">RMS Ann.</TableHead>
                    <TableHead className="text-right">Diff Ann.</TableHead>
                    <TableHead className="text-center">Stato</TableHead>
                    <TableHead>Ultimo Check</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {healthData.map((row) => (
                    <TableRow
                      key={row.hotel_id}
                      className={cn(
                        row.alert_triggered && "bg-red-50"
                      )}
                    >
                      <TableCell className="font-medium">{row.hotel_name}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "uppercase font-semibold tracking-wide",
                            row.connector === "brig"
                              ? "border-blue-200 bg-blue-50 text-blue-800"
                              : "border-emerald-200 bg-emerald-50 text-emerald-800",
                          )}
                        >
                          {row.connector}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.raw_total}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.rms_total}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", getDiffClass(row.diff_total, 5))}>
                        {row.diff_total > 0 ? `+${row.diff_total}` : row.diff_total}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.raw_cancelled}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.rms_cancelled}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", getDiffClass(row.diff_cancelled, 2))}>
                        {row.diff_cancelled > 0 ? `+${row.diff_cancelled}` : row.diff_cancelled}
                      </TableCell>
                      <TableCell className="text-center">{getStatusBadge(row.diff_total, row.raw_total, row.rms_total)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(row.checked_at).toLocaleString("it-IT", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {data?.timestamp && (
            <p className="text-xs text-muted-foreground mt-4 text-right">
              Ultimo aggiornamento: {new Date(data.timestamp).toLocaleString("it-IT")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Legenda Stati</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                <CheckCircle className="h-3 w-3 mr-1" />
                OK
              </Badge>
              <span className="text-muted-foreground">diff_total &le; 1</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Attenzione
              </Badge>
              <span className="text-muted-foreground">diff_total &le; 5</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
                <XCircle className="h-3 w-3 mr-1" />
                Critico
              </Badge>
              <span className="text-muted-foreground">diff_total &gt; 5</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100 border-slate-300">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Da configurare
              </Badge>
              <span className="text-muted-foreground">RAW = 0 e RMS = 0 (sync mai eseguito)</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Alert automatico via email se: diff_total &gt; 3 oppure diff_cancelled &gt; 2
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
