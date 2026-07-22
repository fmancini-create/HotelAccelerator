"use client"

import { useEffect, useState, useCallback } from "react"
import {
  Activity,
  Database,
  Server,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  HardDrive,
  Zap,
  Building2,
} from "lucide-react"

// ── Types ──────────────────────────────────────────────────────
interface HotelHealth {
  hotelId: string
  hotelName: string
  pmsConnector: string
  lastSyncMinutesAgo: number | null
  circuitBreakerOpen: boolean
  syncStatus: "ok" | "warning" | "critical"
}

interface TableCount {
  table_name: string
  row_count: number
}

interface SystemHealthData {
  timestamp: string
  database: {
    connected: boolean
    latencyMs: number
    size: string
    tableCounts: TableCount[]
  }
  redis: {
    connected: boolean
    latencyMs: number
  }
  hotels: HotelHealth[]
  email: {
    last24h: number
    last7d: number
    provider: string
  }
  crons: {
    name: string
    lastRun: string | null
    status: string
  }[]
}

// ── Status helpers ─────────────────────────────────────────────
function StatusDot({ status }: { status: "ok" | "warning" | "critical" | "unknown" }) {
  const colors: Record<string, string> = {
    ok: "bg-emerald-500",
    warning: "bg-amber-500",
    critical: "bg-red-500",
    unknown: "bg-muted-foreground/40",
  }
  return (
    <span className={`inline-block h-2.5 w-2.5 rounded-full ${colors[status] || colors.unknown}`} />
  )
}

function StatusBadge({ status, label }: { status: "ok" | "warning" | "critical"; label: string }) {
  const styles: Record<string, string> = {
    ok: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
    warning: "bg-amber-500/10 text-amber-700 border-amber-500/20",
    critical: "bg-red-500/10 text-red-700 border-red-500/20",
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}>
      <StatusDot status={status} />
      {label}
    </span>
  )
}

function formatLatency(ms: number): string {
  if (ms < 1) return "<1ms"
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatSyncAge(minutes: number | null): string {
  if (minutes === null) return "Mai sincronizzato"
  if (minutes < 1) return "Adesso"
  if (minutes < 60) return `${Math.round(minutes)}m fa`
  if (minutes < 1440) return `${Math.round(minutes / 60)}h fa`
  return `${Math.round(minutes / 1440)}g fa`
}

function syncAgeStatus(minutes: number | null): "ok" | "warning" | "critical" {
  if (minutes === null) return "critical"
  if (minutes <= 30) return "ok"
  if (minutes <= 120) return "warning"
  return "critical"
}

// ── Main Component ─────────────────────────────────────────────
export function SystemHealthDashboard() {
  const [data, setData] = useState<SystemHealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const fetchHealth = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/superadmin/system-health", { cache: "no-store" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const json = await res.json()
      setData(json)
      setLastRefresh(new Date())
    } catch (err: any) {
      setError(err.message || "Errore sconosciuto")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHealth()
    const interval = setInterval(fetchHealth, 60_000)
    return () => clearInterval(interval)
  }, [fetchHealth])

  // ── Loading state ──
  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-3 text-muted-foreground">Caricamento stato sistema...</span>
      </div>
    )
  }

  // ── Error state ──
  if (error && !data) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
        <XCircle className="h-8 w-8 text-destructive mx-auto mb-3" />
        <p className="text-destructive font-medium">{error}</p>
        <button
          onClick={fetchHealth}
          className="mt-4 rounded-md bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/20 transition-colors"
        >
          Riprova
        </button>
      </div>
    )
  }

  if (!data) return null

  // Compute overall status
  const dbOk = data.database.connected
  const redisOk = data.redis.connected
  const hotelsWithIssues = data.hotels.filter(h => h.syncStatus !== "ok")
  const overallStatus: "ok" | "warning" | "critical" =
    !dbOk || !redisOk ? "critical" :
    hotelsWithIssues.length > 0 ? "warning" : "ok"

  const overallLabels = { ok: "Tutti i sistemi operativi", warning: "Attenzione richiesta", critical: "Problemi critici" }

  return (
    <div className="space-y-6">
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <StatusBadge status={overallStatus} label={overallLabels[overallStatus]} />
          {lastRefresh && (
            <span className="text-xs text-muted-foreground">
              Aggiornato: {lastRefresh.toLocaleTimeString("it-IT")}
            </span>
          )}
        </div>
        <button
          onClick={fetchHealth}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Aggiorna
        </button>
      </div>

      {/* Infrastructure cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Database card */}
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold">Database</h3>
            </div>
            {dbOk ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            ) : (
              <XCircle className="h-5 w-5 text-red-500" />
            )}
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Stato</span>
              <span className={dbOk ? "text-emerald-600 font-medium" : "text-red-600 font-medium"}>
                {dbOk ? "Connesso" : "Errore"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Latenza</span>
              <span className="font-mono">{formatLatency(data.database.latencyMs)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Dimensione</span>
              <span className="font-mono">{data.database.size}</span>
            </div>
          </div>
        </div>

        {/* Redis card */}
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold">Redis</h3>
            </div>
            {redisOk ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            ) : (
              <XCircle className="h-5 w-5 text-red-500" />
            )}
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Stato</span>
              <span className={redisOk ? "text-emerald-600 font-medium" : "text-red-600 font-medium"}>
                {redisOk ? "Connesso" : "Non disponibile"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Latenza</span>
              <span className="font-mono">{formatLatency(data.redis.latencyMs)}</span>
            </div>
          </div>
        </div>

        {/* Email card */}
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold">Email</h3>
            </div>
            <span className="text-xs text-muted-foreground">{data.email.provider}</span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ultime 24h</span>
              <span className="font-mono">{data.email.last24h}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ultimi 7g</span>
              <span className="font-mono">{data.email.last7d}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Hotels table */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <Building2 className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">Stato Hotel ({data.hotels.length})</h3>
          {hotelsWithIssues.length > 0 && (
            <span className="ml-auto text-xs text-amber-600 font-medium">
              {hotelsWithIssues.length} con problemi
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-5 py-3 font-medium">Hotel</th>
                <th className="px-5 py-3 font-medium">PMS</th>
                <th className="px-5 py-3 font-medium">Ultima Sync</th>
                <th className="px-5 py-3 font-medium">Circuit Breaker</th>
                <th className="px-5 py-3 font-medium">Stato</th>
              </tr>
            </thead>
            <tbody>
              {data.hotels.map((hotel) => (
                <tr key={hotel.hotelId} className="border-b border-border/50 last:border-0">
                  <td className="px-5 py-3 font-medium">{hotel.hotelName}</td>
                  <td className="px-5 py-3 text-muted-foreground">{hotel.pmsConnector}</td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      {formatSyncAge(hotel.lastSyncMinutesAgo)}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {hotel.circuitBreakerOpen ? (
                      <span className="inline-flex items-center gap-1.5 text-red-600 font-medium">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Aperto
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Chiuso</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge
                      status={hotel.syncStatus}
                      label={hotel.syncStatus === "ok" ? "OK" : hotel.syncStatus === "warning" ? "Attenzione" : "Critico"}
                    />
                  </td>
                </tr>
              ))}
              {data.hotels.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                    Nessun hotel configurato
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Table counts and Crons side by side */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Table row counts */}
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-5 py-4">
            <HardDrive className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-semibold">Tabelle Database</h3>
          </div>
          <div className="divide-y divide-border/50">
            {data.database.tableCounts.map((t) => (
              <div key={t.table_name} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <span className="font-mono text-muted-foreground">{t.table_name}</span>
                <span className="font-mono font-medium">{t.row_count.toLocaleString("it-IT")}</span>
              </div>
            ))}
            {data.database.tableCounts.length === 0 && (
              <div className="px-5 py-6 text-center text-sm text-muted-foreground">
                Nessun dato disponibile
              </div>
            )}
          </div>
        </div>

        {/* Crons status */}
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-5 py-4">
            <Server className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-semibold">Cron Jobs</h3>
          </div>
          <div className="divide-y divide-border/50">
            {data.crons.map((cron) => (
              <div key={cron.name} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <span className="font-mono text-muted-foreground">{cron.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {cron.lastRun
                      ? new Date(cron.lastRun).toLocaleString("it-IT", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })
                      : "Mai"}
                  </span>
                  <StatusDot status={cron.status === "ok" ? "ok" : cron.status === "warning" ? "warning" : "unknown"} />
                </div>
              </div>
            ))}
            {data.crons.length === 0 && (
              <div className="px-5 py-6 text-center text-sm text-muted-foreground">
                Nessun cron configurato
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
