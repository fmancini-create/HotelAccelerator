"use client"

import { useState, useTransition } from "react"
import useSWR, { mutate } from "swr"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Moon,
  Play,
  RefreshCw,
  Sun,
} from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Tabella super-admin per la gestione della cadenza adattiva degli scrape
 * Apify. Mostra 1 riga per (hotel, platform). Permette di:
 *  - Forzare sync immediata di un canale
 *  - Override manuale della cadenza (1..30 giorni)
 *  - Risvegliare/addormentare un canale
 *  - Vedere ultimi 5 run e le motivazioni di un'eventuale dormienza
 *
 * Fetching via SWR con refresh ogni 30s mentre la pagina e' visibile.
 */

const PLATFORM_LABEL: Record<string, string> = {
  google: "Google",
  booking: "Booking.com",
  tripadvisor: "TripAdvisor",
  expedia: "Expedia",
  vrbo: "VRBO",
  airbnb: "Airbnb",
}

const PLATFORM_DOT: Record<string, string> = {
  google: "bg-amber-500",
  booking: "bg-blue-600",
  tripadvisor: "bg-emerald-600",
  expedia: "bg-yellow-500",
  vrbo: "bg-sky-500",
  airbnb: "bg-rose-500",
}

interface Schedule {
  id: string
  hotel_id: string
  hotel_name: string
  hotel_active: boolean
  platform: string
  avg_days_between_reviews: number | string
  manual_override_days: number | null
  next_sync_at: string
  last_sync_at: string | null
  last_review_found_at: string | null
  consecutive_empty_runs: number
  is_dormant: boolean
  dormant_since: string | null
  dormant_reason: string | null
  total_syncs: number
  total_reviews_found: number
  recent_runs: Array<{
    id: string
    started_at: string
    finished_at: string | null
    status: string
    new_reviews_count: number
    total_reviews_seen: number
    error_message: string | null
    trigger_source: string | null
  }>
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function fmtRelative(iso: string | null) {
  if (!iso) return "mai"
  const ms = new Date(iso).getTime() - Date.now()
  const absH = Math.abs(ms) / 3600000
  const sign = ms < 0 ? "fa" : "tra"
  if (absH < 1) {
    const m = Math.max(1, Math.round(Math.abs(ms) / 60000))
    return `${sign} ${m} min`
  }
  if (absH < 24) return `${sign} ${Math.round(absH)} ore`
  const d = Math.round(absH / 24)
  return `${sign} ${d} ${d === 1 ? "giorno" : "giorni"}`
}

function fmtDateTime(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function ReviewSchedulesTable() {
  const { data, error, isLoading } = useSWR<{ schedules: Schedule[] }>(
    "/api/superadmin/review-schedules",
    fetcher,
    { refreshInterval: 30000 }
  )
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [overrideInputs, setOverrideInputs] = useState<Record<string, string>>({})
  const [actionInFlight, setActionInFlight] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Caricamento schedule...
        </CardContent>
      </Card>
    )
  }
  if (error) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-destructive">
          Errore caricamento: {String(error)}
        </CardContent>
      </Card>
    )
  }

  const schedules = data?.schedules ?? []

  // Aggregati di vertice
  const total = schedules.length
  const active = schedules.filter((s) => !s.is_dormant).length
  const dormant = schedules.filter((s) => s.is_dormant).length
  const dueSoon = schedules.filter(
    (s) => !s.is_dormant && new Date(s.next_sync_at).getTime() <= Date.now() + 3600 * 1000
  ).length

  async function refresh() {
    await mutate("/api/superadmin/review-schedules")
  }

  async function syncNow(scheduleId: string) {
    setActionInFlight(scheduleId)
    try {
      const res = await fetch(`/api/superadmin/review-schedules/${scheduleId}/sync-now`, {
        method: "POST",
      })
      const json = await res.json()
      if (!res.ok) alert(`Errore: ${json.error || res.statusText}`)
      else
        alert(
          `Sync completata. ${json.newReviews ?? 0} nuove recensioni, ${json.totalSeen ?? 0} totali viste.`
        )
      startTransition(() => {
        refresh()
      })
    } finally {
      setActionInFlight(null)
    }
  }

  async function saveOverride(scheduleId: string) {
    const raw = overrideInputs[scheduleId]
    const val = raw === "" || raw == null ? null : Number(raw)
    if (val !== null && (!Number.isFinite(val) || val < 1 || val > 30)) {
      alert("Override deve essere 1..30 giorni, oppure vuoto per rimuoverlo.")
      return
    }
    setActionInFlight(scheduleId)
    try {
      const res = await fetch("/api/superadmin/review-schedules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: scheduleId, manual_override_days: val }),
      })
      if (!res.ok) {
        const json = await res.json()
        alert(`Errore: ${json.error || res.statusText}`)
      }
      startTransition(() => {
        refresh()
      })
    } finally {
      setActionInFlight(null)
    }
  }

  async function toggleDormant(scheduleId: string, action: "wake" | "sleep") {
    setActionInFlight(scheduleId)
    try {
      const res = await fetch("/api/superadmin/review-schedules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: scheduleId, action }),
      })
      if (!res.ok) {
        const json = await res.json()
        alert(`Errore: ${json.error || res.statusText}`)
      }
      startTransition(() => {
        refresh()
      })
    } finally {
      setActionInFlight(null)
    }
  }

  // Raggruppa per hotel
  const grouped = new Map<string, Schedule[]>()
  for (const s of schedules) {
    if (!grouped.has(s.hotel_id)) grouped.set(s.hotel_id, [])
    grouped.get(s.hotel_id)!.push(s)
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex flex-col gap-6">
        {/* KPI di vertice */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Totale canali</CardDescription>
              <CardTitle className="text-3xl">{total}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Attivi</CardDescription>
              <CardTitle className="text-3xl text-emerald-600">{active}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Dormienti</CardDescription>
              <CardTitle className="text-3xl text-muted-foreground">{dormant}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Dovuti entro 1 ora</CardDescription>
              <CardTitle className="text-3xl text-blue-600">{dueSoon}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Cadenza adattiva per canale</CardTitle>
              <CardDescription>
                Ogni canale viene sincronizzato in base alla media di nuove recensioni ricevute.
                Dopo 3 sync consecutive senza nuove recensioni il canale viene marcato dormiente.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={refresh}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Aggiorna
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2 w-8"></th>
                    <th className="text-left px-3 py-2">Hotel / Canale</th>
                    <th className="text-left px-3 py-2">Cadenza</th>
                    <th className="text-left px-3 py-2">Prossimo sync</th>
                    <th className="text-left px-3 py-2">Ultima review</th>
                    <th className="text-left px-3 py-2">Empty / Stato</th>
                    <th className="text-left px-3 py-2">Stats</th>
                    <th className="text-right px-3 py-2">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {[...grouped.entries()].map(([hotelId, rows], hotelIdx) => (
                    <RowsForHotel
                      key={hotelId}
                      hotelIdx={hotelIdx}
                      rows={rows}
                      expandedId={expandedId}
                      setExpandedId={setExpandedId}
                      overrideInputs={overrideInputs}
                      setOverrideInputs={setOverrideInputs}
                      actionInFlight={actionInFlight}
                      onSyncNow={syncNow}
                      onSaveOverride={saveOverride}
                      onToggleDormant={toggleDormant}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  )
}

function RowsForHotel(props: {
  hotelIdx: number
  rows: Schedule[]
  expandedId: string | null
  setExpandedId: (v: string | null) => void
  overrideInputs: Record<string, string>
  setOverrideInputs: (v: Record<string, string>) => void
  actionInFlight: string | null
  onSyncNow: (id: string) => void
  onSaveOverride: (id: string) => void
  onToggleDormant: (id: string, action: "wake" | "sleep") => void
}) {
  const {
    hotelIdx,
    rows,
    expandedId,
    setExpandedId,
    overrideInputs,
    setOverrideInputs,
    actionInFlight,
    onSyncNow,
    onSaveOverride,
    onToggleDormant,
  } = props
  const hotelName = rows[0]?.hotel_name ?? "?"

  return (
    <>
      <tr>
        <td colSpan={8} className={cn("px-3 py-2 font-medium text-foreground bg-muted/30", hotelIdx > 0 && "border-t-4 border-background")}>
          {hotelName}
          {!rows[0]?.hotel_active && (
            <Badge variant="outline" className="ml-2 text-xs">
              Hotel inattivo
            </Badge>
          )}
        </td>
      </tr>
      {rows.map((s) => {
        const isExpanded = expandedId === s.id
        const isBusy = actionInFlight === s.id
        const effectiveCadence = s.manual_override_days ?? Number(s.avg_days_between_reviews)
        const dueNow = new Date(s.next_sync_at).getTime() <= Date.now()
        const empty = s.consecutive_empty_runs
        const overrideValue = overrideInputs[s.id] ?? (s.manual_override_days?.toString() ?? "")

        return (
          <>
            <tr key={s.id} className={cn("border-t border-border", s.is_dormant && "opacity-60")}>
              <td className="px-3 py-3 align-top">
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : s.id)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={isExpanded ? "Comprimi" : "Espandi storia"}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
              </td>
              <td className="px-3 py-3 align-top">
                <div className="flex items-center gap-2">
                  <span className={cn("inline-block h-2 w-2 rounded-full", PLATFORM_DOT[s.platform] || "bg-muted")} />
                  <span className="font-medium">{PLATFORM_LABEL[s.platform] ?? s.platform}</span>
                </div>
              </td>
              <td className="px-3 py-3 align-top">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm">{effectiveCadence}gg</span>
                      {s.manual_override_days != null && (
                        <Badge variant="secondary" className="text-[10px]">override</Badge>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    Calcolato: {Number(s.avg_days_between_reviews).toFixed(2)}gg
                    {s.manual_override_days != null && (
                      <>
                        <br />Override: {s.manual_override_days}gg
                      </>
                    )}
                  </TooltipContent>
                </Tooltip>
              </td>
              <td className="px-3 py-3 align-top">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5">
                      <Clock className={cn("h-3.5 w-3.5", dueNow ? "text-blue-600" : "text-muted-foreground")} />
                      <span className={cn(dueNow ? "text-blue-600 font-medium" : "")}>{fmtRelative(s.next_sync_at)}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs font-mono">
                    {fmtDateTime(s.next_sync_at)}
                  </TooltipContent>
                </Tooltip>
              </td>
              <td className="px-3 py-3 align-top">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>{fmtRelative(s.last_review_found_at)}</span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs font-mono">
                    {fmtDateTime(s.last_review_found_at)}
                  </TooltipContent>
                </Tooltip>
              </td>
              <td className="px-3 py-3 align-top">
                {s.is_dormant ? (
                  <Badge variant="outline" className="gap-1">
                    <Moon className="h-3 w-3" />
                    Dormiente
                  </Badge>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <div className="flex gap-0.5">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className={cn(
                            "block h-2 w-4 rounded-sm",
                            empty > i
                              ? empty >= 2
                                ? "bg-amber-500"
                                : "bg-yellow-400"
                              : "bg-muted"
                          )}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground">{empty}/3</span>
                  </div>
                )}
              </td>
              <td className="px-3 py-3 align-top">
                <div className="text-xs text-muted-foreground">
                  <div>{s.total_syncs} sync</div>
                  <div>{s.total_reviews_found} review</div>
                </div>
              </td>
              <td className="px-3 py-3 align-top">
                <div className="flex items-center justify-end gap-2 flex-wrap">
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={1}
                      max={30}
                      placeholder="auto"
                      className="h-8 w-16 text-xs"
                      value={overrideValue}
                      onChange={(e) =>
                        setOverrideInputs({ ...overrideInputs, [s.id]: e.target.value })
                      }
                      disabled={isBusy}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-xs"
                      onClick={() => onSaveOverride(s.id)}
                      disabled={isBusy}
                      title="Salva override cadenza"
                    >
                      Salva
                    </Button>
                  </div>
                  {s.is_dormant ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-8 gap-1"
                      onClick={() => onToggleDormant(s.id, "wake")}
                      disabled={isBusy}
                    >
                      <Sun className="h-3.5 w-3.5" />
                      Risveglia
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-1"
                      onClick={() => onToggleDormant(s.id, "sleep")}
                      disabled={isBusy}
                    >
                      <Moon className="h-3.5 w-3.5" />
                      Dormi
                    </Button>
                  )}
                  <Button
                    size="sm"
                    className="h-8 gap-1"
                    onClick={() => onSyncNow(s.id)}
                    disabled={isBusy}
                  >
                    <Play className="h-3.5 w-3.5" />
                    Sync ora
                  </Button>
                </div>
              </td>
            </tr>
            {isExpanded && (
              <tr className="border-t border-border bg-muted/20">
                <td colSpan={8} className="px-3 py-3">
                  <div className="flex flex-col gap-3">
                    {s.dormant_reason && (
                      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                        <AlertCircle className="h-4 w-4 mt-0.5" />
                        <div>
                          <span className="font-medium">Dormiente: </span>
                          {s.dormant_reason === "no_new_reviews"
                            ? `3 sync consecutive senza nuove recensioni. Verificare URL configurato per ${PLATFORM_LABEL[s.platform] ?? s.platform}.`
                            : s.dormant_reason === "manual_disable"
                            ? "Disattivato manualmente dal super-admin."
                            : s.dormant_reason}
                        </div>
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">Ultime sync</div>
                    {s.recent_runs.length === 0 && (
                      <div className="text-xs text-muted-foreground italic">Nessun run registrato.</div>
                    )}
                    {s.recent_runs.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="text-muted-foreground">
                            <tr>
                              <th className="text-left px-2 py-1">Inizio</th>
                              <th className="text-left px-2 py-1">Stato</th>
                              <th className="text-left px-2 py-1">Nuove</th>
                              <th className="text-left px-2 py-1">Viste</th>
                              <th className="text-left px-2 py-1">Trigger</th>
                              <th className="text-left px-2 py-1">Errore (raw)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {s.recent_runs.map((r) => (
                              <tr key={r.id} className="border-t border-border/50">
                                <td className="px-2 py-1 font-mono">{fmtDateTime(r.started_at)}</td>
                                <td className="px-2 py-1">
                                  <RunStatusBadge status={r.status} />
                                </td>
                                <td className="px-2 py-1">{r.new_reviews_count}</td>
                                <td className="px-2 py-1">{r.total_reviews_seen}</td>
                                <td className="px-2 py-1">{r.trigger_source ?? "—"}</td>
                                <td className="px-2 py-1 text-destructive break-all max-w-xl">
                                  {r.error_message ?? "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            )}
          </>
        )
      })}
    </>
  )
}

function RunStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    success: { label: "OK", cls: "bg-emerald-100 text-emerald-800" },
    success_empty: { label: "0 nuove", cls: "bg-yellow-100 text-yellow-800" },
    error: { label: "Errore", cls: "bg-rose-100 text-rose-800" },
    dormant: { label: "Dormiente", cls: "bg-muted text-muted-foreground" },
    running: { label: "In corso", cls: "bg-blue-100 text-blue-800" },
  }
  const meta = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground" }
  return (
    <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium", meta.cls)}>
      {meta.label}
    </span>
  )
}
