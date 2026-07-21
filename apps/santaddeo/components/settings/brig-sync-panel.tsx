"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  Loader2,
  RefreshCw,
  Database,
  Calendar,
  BookOpen,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  ShieldCheck,
} from "lucide-react"
import { toast } from "sonner"

/**
 * BrigSyncPanel — pannello di sincronizzazione minimo per hotel su PMS BRiG.
 *
 * Bug 20/05/2026: in `app/settings/pms/page.tsx` il render del pannello
 * sync era hardcoded a `pmsName === "scidoo"`, quindi gli hotel BRiG (es.
 * Cavallino) non avevano alcuna UI di sincronizzazione. Stesso pattern dei
 * bug del 19-20/05 (`connector-health-service.ts`, `/api/scidoo/...`
 * hardcoded).
 *
 * Copre i 3 moduli realmente esposti da BRiG (`BrigClient` in
 * lib/connectors/brig/client.ts):
 *   - reservations  -> /api/admin/brig/sync
 *   - room_types    -> /api/pms/room-types/sync (dispatcher provider-aware)
 *   - rates         -> /api/pms/rates/sync (dispatcher provider-aware)
 *
 * Niente daily-occupancy (BRiG non lo espone), niente production fiscale
 * o gestionale (concetti Scidoo-specifici), niente full-resync SSE
 * stream (rinviato a una v2 se servira').
 *
 * Logs letti dalla tabella `sync_logs` filtrata per i 3 sync_type sopra.
 * Cron settings condivisi con Scidoo via /api/pms/cron-settings, chiave
 * (hotel_id, module).
 */

interface BrigSyncPanelProps {
  hotelId: string
  pmsIntegrationId: string
  isSuperAdmin?: boolean
}

interface SyncLog {
  id: string
  sync_type: string
  status: string
  started_at: string | null
  completed_at: string | null
  records_processed: number | null
  records_failed: number | null
  records_inserted?: number | null
  records_updated?: number | null
  records_fetched?: number | null
  error_message: string | null
  created_at: string
  trigger_type: string | null
  // sync_logs.metadata: il cron BRiG ci salva i contatori reali del sync
  // (esaminati / inseriti / aggiornati / invariati). select("*") li espone gia'.
  metadata?: {
    totalFetched?: number
    totalInserted?: number
    totalUpdated?: number
    totalUnchanged?: number
    fullSweep?: boolean
  } | null
}

// Colonna "Record": mostra i record ESAMINATI dal sync (fetch + confronto),
// non solo quelli scritti. Gli incrementali BRiG rileggono ~300 prenotazioni
// recenti e spesso le trovano tutte invariate: prima la colonna mostrava "—"
// (0 scritture = inserted+updated), facendo sembrare il sync inattivo mentre
// in realta' aveva verificato 300 record. Ora mostriamo "esaminati (N agg.)".
function formatRecordsCell(l: SyncLog): string {
  const m = l.metadata ?? {}
  const examined = l.records_fetched ?? m.totalFetched ?? null
  const changed =
    (m.totalInserted ?? l.records_inserted ?? 0) +
    (m.totalUpdated ?? l.records_updated ?? 0)

  if (examined != null && examined > 0) {
    const base = examined.toLocaleString("it-IT")
    return changed > 0 ? `${base} (${changed.toLocaleString("it-IT")} agg.)` : base
  }
  // Fallback: nessun conteggio "esaminati" disponibile (vecchi log / altri PMS).
  const written = l.records_processed ?? (changed > 0 ? changed : null)
  return written != null && written !== 0 ? written.toLocaleString("it-IT") : "—"
}

interface CronSetting {
  id: string
  hotel_id: string
  module: string
  enabled: boolean
  frequency: string
  date_from: string | null
  date_to: string | null
  last_run: string | null
  next_run: string | null
  last_status: string | null
  last_error: string | null
}

type ModuleKey = "reservations" | "room_types" | "rates"

interface BrigModule {
  key: ModuleKey
  label: string
  description: string
  icon: typeof Database
  hasDateRange: boolean
}

const BRIG_MODULES: BrigModule[] = [
  {
    key: "reservations",
    label: "Prenotazioni",
    description: "Scarica le prenotazioni dal PMS BRiG (lista completa con paginazione).",
    icon: BookOpen,
    hasDateRange: true,
  },
  {
    key: "room_types",
    label: "Tipologie Camere",
    description: "Sincronizza l'elenco delle tipologie di camera dal PMS BRiG.",
    icon: Database,
    hasDateRange: false,
  },
  {
    key: "rates",
    label: "Tariffe",
    description: "Sincronizza l'elenco dei piani tariffari dal PMS BRiG.",
    icon: Calendar,
    hasDateRange: false,
  },
]

const FREQUENCY_OPTIONS = [
  { value: "every_30_min", label: "Ogni 30 minuti" },
  { value: "hourly", label: "Ogni ora" },
  { value: "every_3_hours", label: "Ogni 3 ore" },
  { value: "every_6_hours", label: "Ogni 6 ore" },
  { value: "every_12_hours", label: "Ogni 12 ore" },
  { value: "daily", label: "Ogni giorno" },
]

function formatDateTime(iso: string | null): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}

export function BrigSyncPanel({ hotelId, pmsIntegrationId: _pmsIntegrationId, isSuperAdmin }: BrigSyncPanelProps) {
  const [syncingModule, setSyncingModule] = useState<ModuleKey | null>(null)
  const [isFullSyncing, setIsFullSyncing] = useState(false)
  const [etlRunning, setEtlRunning] = useState(false)
  const [isRecovering, setIsRecovering] = useState(false)
  const [logs, setLogs] = useState<SyncLog[]>([])
  const [loadingLogs, setLoadingLogs] = useState(true)
  const [cronSettings, setCronSettings] = useState<Record<ModuleKey, CronSetting | null>>({
    reservations: null,
    room_types: null,
    rates: null,
  })
  const [expandedModule, setExpandedModule] = useState<ModuleKey | null>(null)
  const [savingAutoSync, setSavingAutoSync] = useState<ModuleKey | null>(null)

  // Range date locali per il modulo "reservations" (BRiG accetta filtri)
  const [reservationsRange, setReservationsRange] = useState<{ from: string; to: string }>({
    from: "",
    to: "",
  })

  useEffect(() => {
    void Promise.all([loadLogs(), loadCronSettings()])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelId])

  async function loadLogs() {
    setLoadingLogs(true)
    try {
      const res = await fetch(
        `/api/admin/brig/sync-logs?hotelId=${hotelId}&limit=20`,
      )
      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs || [])
      } else {
        // Fallback: la route potrebbe non esistere ancora, leggi direttamente
        // sync_logs via endpoint generico se disponibile.
        setLogs([])
      }
    } catch {
      setLogs([])
    } finally {
      setLoadingLogs(false)
    }
  }

  async function loadCronSettings() {
    try {
      const res = await fetch(`/api/pms/cron-settings?hotelId=${hotelId}`)
      if (!res.ok) return
      const data = await res.json()
      const settings = (data.settings || []) as CronSetting[]
      const next: Record<ModuleKey, CronSetting | null> = {
        reservations: null,
        room_types: null,
        rates: null,
      }
      for (const s of settings) {
        if (s.module === "reservations" || s.module === "room_types" || s.module === "rates") {
          next[s.module as ModuleKey] = s
        }
      }
      setCronSettings(next)
    } catch (err) {
      console.error("[BrigSyncPanel] loadCronSettings error:", err)
    }
  }

  async function runEtl() {
    // Lancia BrigBookingsProcessor sui raw processed=false. Indipendente dal
    // sync: utile quando il sync e' fallito a meta' (es. rate limit BRiG)
    // ma ha lasciato raw da normalizzare in `connectors.brig_raw_bookings`.
    if (etlRunning) return
    setEtlRunning(true)
    try {
      const res = await fetch("/api/admin/brig/etl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok || payload?.ok === false) {
        const msg = payload?.error || payload?.result?.error || `HTTP ${res.status}`
        throw new Error(msg)
      }
      const r = payload?.result || {}
      toast.success(
        `ETL completato — ${r.processed ?? 0} processati (${r.inserted ?? 0} inseriti, ${r.updated ?? 0} aggiornati${
          r.failed ? `, ${r.failed} falliti` : ""
        })`,
      )
      await loadLogs()
    } catch (err: any) {
      toast.error(err?.message || "Errore durante l'ETL")
    } finally {
      setEtlRunning(false)
    }
  }

  async function runRecoverySweep() {
    // RECUPERO RESUMABILE (FIX 01/06/2026 round 3 — quota BRiG 100 req/giorno).
    // La disponibilita' BRiG e' derivata dalle prenotazioni: se ne mancano in
    // DB (deriva di paginazione su dataset vivo), restano camere falsamente
    // libere. Il vecchio "full sweep multi-passata" provava ~117 chiamate in un
    // colpo solo -> 429 immediato e zero progresso. Ora il recupero e'
    // BUDGETTATO (12 pagine/run) e RIPRENDE dal cursore salvato: ogni click
    // avanza un segmento, il DB accumula tra i run e il cron continua da solo
    // (ritento ogni 1h finche' complete=true) senza mai sforare la quota.
    if (isRecovering || syncingModule || isFullSyncing) return
    if (
      !window.confirm(
        "Avvio un recupero RESUMABILE delle prenotazioni.\n\n" +
          "Scarica un segmento (12 pagine) e riprende automaticamente al " +
          "prossimo ciclo, senza sforare la quota BRiG. Puoi cliccare piu' " +
          "volte per accelerare. Procedere?",
      )
    ) {
      return
    }
    setIsRecovering(true)
    try {
      const res = await fetch("/api/admin/brig/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelId,
          resumable: true,
          maxPagesPerRun: 12,
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok && res.status !== 207) {
        const msg = payload?.error || payload?.message || `HTTP ${res.status}`
        throw new Error(msg)
      }
      const dbRows = payload?.dbRowCount ?? null
      const reported = payload?.reportedTotal ?? null
      const complete = payload?.complete === true
      const quota = payload?.dailyQuotaExceeded === true
      const progress =
        dbRows != null
          ? ` — ${dbRows}${reported ? `/${reported}` : ""} prenotazioni in DB`
          : ""
      if (complete) {
        toast.success(`Recupero completato${progress}.`)
      } else if (quota) {
        toast.warning(
          `Quota BRiG giornaliera esaurita${progress}. ` +
            "Il recupero riprendera' automaticamente dal punto raggiunto.",
        )
      } else {
        toast.info(
          `Segmento recuperato${progress}. ` +
            (payload?.sweepNextPage
              ? `Riprende da pagina ${payload.sweepNextPage}. `
              : "") +
            "Riclicca per continuare o lascia fare al sync automatico.",
        )
      }
      await Promise.all([loadLogs(), loadCronSettings()])
    } catch (err: any) {
      toast.error(err?.message || "Errore durante il recupero")
    } finally {
      setIsRecovering(false)
    }
  }

  async function runSync(moduleKey: ModuleKey) {
    setSyncingModule(moduleKey)
    try {
      let res: Response
      if (moduleKey === "reservations") {
        const extraFilters: Record<string, unknown> = {}
        if (reservationsRange.from) extraFilters.dateFrom = reservationsRange.from
        if (reservationsRange.to) extraFilters.dateTo = reservationsRange.to
        res = await fetch("/api/admin/brig/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            hotelId,
            extraFilters: Object.keys(extraFilters).length > 0 ? extraFilters : undefined,
          }),
        })
      } else if (moduleKey === "room_types") {
        res = await fetch("/api/pms/room-types/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hotelId }),
        })
      } else {
        res = await fetch("/api/pms/rates/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hotelId }),
        })
      }

      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = payload?.error || payload?.message || `HTTP ${res.status}`
        throw new Error(msg)
      }

      const count =
        payload?.totalFetched ??
        payload?.totalSaved ??
        payload?.count ??
        payload?.records_processed ??
        null
      toast.success(
        `${BRIG_MODULES.find((m) => m.key === moduleKey)?.label} sincronizzato${
          count !== null ? ` — ${count} record` : ""
        }`,
      )
      await Promise.all([loadLogs(), loadCronSettings()])
    } catch (err: any) {
      toast.error(err?.message || "Errore durante il sync")
    } finally {
      setSyncingModule(null)
    }
  }

  async function runFullSync() {
    // Lancia i 3 moduli in sequenza riusando runSync (cosi' UI, log refresh,
    // toast e gestione errori sono identici al sync per modulo). Sequenziale e
    // non in parallelo perche' BRiG ha rate limit non documentati e per non
    // saturare la connessione del PMS dell'hotel.
    if (syncingModule || isFullSyncing) return
    setIsFullSyncing(true)
    const order: ModuleKey[] = ["room_types", "rates", "reservations"]
    let errored = 0
    try {
      for (const m of order) {
        try {
          await runSync(m)
        } catch {
          // runSync gestisce gia' il toast errore; qui contiamo solo per il
          // riepilogo finale.
          errored++
        }
      }
      if (errored === 0) {
        toast.success("Sincronizzazione completa eseguita su tutti i moduli")
      } else {
        toast.error(`Sincronizzazione completata con ${errored} modulo/i in errore`)
      }
    } finally {
      setIsFullSyncing(false)
    }
  }

  async function saveCron(moduleKey: ModuleKey, patch: Partial<CronSetting>) {
    setSavingAutoSync(moduleKey)
    try {
      const current = cronSettings[moduleKey]
      const body = {
        hotelId,
        module: moduleKey,
        enabled: patch.enabled ?? current?.enabled ?? false,
        frequency: patch.frequency ?? current?.frequency ?? "hourly",
        dateFrom: patch.date_from ?? current?.date_from ?? null,
        dateTo: patch.date_to ?? current?.date_to ?? null,
      }
      const res = await fetch("/api/pms/cron-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || `HTTP ${res.status}`)
      }
      toast.success("Auto-sync aggiornato")
      await loadCronSettings()
    } catch (err: any) {
      toast.error(err?.message || "Errore aggiornamento auto-sync")
    } finally {
      setSavingAutoSync(null)
    }
  }

  const moduleLogs = (key: ModuleKey) => logs.filter((l) => l.sync_type === key).slice(0, 5)

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Sincronizzazione PMS BRiG
              </CardTitle>
              <CardDescription className="mt-1.5">
                Lancia un sync manuale dei dati dal PMS BRiG o configura un auto-sync periodico per modulo. I tre
                moduli disponibili sono Prenotazioni, Tipologie Camere e Tariffe (gli unici esposti dalle API BRiG).
              </CardDescription>
            </div>
            <Button
              onClick={runFullSync}
              disabled={!!syncingModule || isFullSyncing}
              className="shrink-0"
            >
              {isFullSyncing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sincronizzazione...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Sincronizza tutto
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {BRIG_MODULES.map((mod) => {
            const Icon = mod.icon
            const cron = cronSettings[mod.key]
            const isExpanded = expandedModule === mod.key
            const isSyncing = syncingModule === mod.key
            const isSavingCron = savingAutoSync === mod.key
            const lastLogs = moduleLogs(mod.key)
            const lastLog = lastLogs[0]
            return (
              <div key={mod.key} className="rounded-lg border bg-card">
                <div className="flex items-center justify-between gap-3 p-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium">{mod.label}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        Ultimo: {formatDateTime(cron?.last_run ?? lastLog?.created_at ?? null)}
                        {cron?.last_status && (
                          <Badge
                            variant={
                              cron.last_status === "success" || cron.last_status === "completed"
                                ? "secondary"
                                : "destructive"
                            }
                            className="ml-2"
                          >
                            {cron.last_status}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {mod.key === "reservations" && isSuperAdmin && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={runRecoverySweep}
                        disabled={isRecovering || isSyncing || isFullSyncing}
                        title="Recupero resumabile: scarica un segmento (12 pagine) e riprende dal cursore al ciclo successivo, recuperando le prenotazioni perse per deriva di paginazione (disponibilita' che non torna) senza sforare la quota BRiG. Solo super_admin."
                      >
                        {isRecovering ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <ShieldCheck className="h-4 w-4 mr-2" />
                        )}
                        Recupero resumabile
                      </Button>
                    )}
                    {mod.key === "reservations" && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={runEtl}
                        disabled={etlRunning || isSyncing}
                        title="Normalizza i raw scaricati in public.bookings"
                      >
                        {etlRunning ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <RefreshCw className="h-4 w-4 mr-2" />
                        )}
                        Esegui ETL
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => runSync(mod.key)}
                      disabled={isSyncing}
                    >
                      {isSyncing ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-2" />
                      )}
                      Sincronizza ora
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setExpandedModule(isExpanded ? null : mod.key)}
                      aria-label={isExpanded ? "Comprimi modulo" : "Espandi modulo"}
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t p-4 space-y-4 bg-muted/30">
                    {/* Auto-sync toggle */}
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <Label className="text-sm font-medium">Auto-sync</Label>
                        <p className="text-xs text-muted-foreground">{mod.description}</p>
                      </div>
                      <Switch
                        checked={cron?.enabled ?? false}
                        disabled={isSavingCron}
                        onCheckedChange={(checked) => saveCron(mod.key, { enabled: checked })}
                      />
                    </div>

                    {/* Frequency */}
                    {cron?.enabled && (
                      <div className="grid gap-2">
                        <Label className="text-xs">Frequenza</Label>
                        <Select
                          value={cron?.frequency ?? "hourly"}
                          disabled={isSavingCron}
                          onValueChange={(v) => saveCron(mod.key, { frequency: v })}
                        >
                          <SelectTrigger className="max-w-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {FREQUENCY_OPTIONS.map((f) => (
                              <SelectItem key={f.value} value={f.value}>
                                {f.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {cron?.next_run && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Prossimo run: {formatDateTime(cron.next_run)}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Date range solo per reservations */}
                    {mod.hasDateRange && (
                      <div className="grid gap-2">
                        <Label className="text-xs">Range date manuale (solo per "Sincronizza ora")</Label>
                        <div className="grid grid-cols-2 gap-2 max-w-md">
                          <Input
                            type="date"
                            value={reservationsRange.from}
                            onChange={(e) =>
                              setReservationsRange((r) => ({ ...r, from: e.target.value }))
                            }
                            placeholder="Da"
                          />
                          <Input
                            type="date"
                            value={reservationsRange.to}
                            onChange={(e) =>
                              setReservationsRange((r) => ({ ...r, to: e.target.value }))
                            }
                            placeholder="A"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Lasciali vuoti per usare i default del connettore (tutte le prenotazioni recenti).
                        </p>
                      </div>
                    )}

                    {/* Ultimi log del modulo */}
                    {lastLogs.length > 0 && (
                      <div>
                        <Label className="text-xs">Ultime esecuzioni</Label>
                        <div className="mt-1 rounded border bg-background">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="h-8 text-xs">Data</TableHead>
                                <TableHead className="h-8 text-xs">Stato</TableHead>
                                <TableHead className="h-8 text-xs">Record</TableHead>
                                <TableHead className="h-8 text-xs">Errore</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {lastLogs.map((l) => (
                                <TableRow key={l.id}>
                                  <TableCell className="text-xs">{formatDateTime(l.created_at)}</TableCell>
                                  <TableCell>
                                    <Badge
                                      variant={
                                        l.status === "success" || l.status === "completed"
                                          ? "secondary"
                                          : "destructive"
                                      }
                                      className="text-xs"
                                    >
                                      {l.status}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-xs tabular-nums">{formatRecordsCell(l)}</TableCell>
                                  <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]">
                                    {l.error_message || "—"}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Storico log compatto */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Storico log sincronizzazioni</CardTitle>
              <CardDescription>Ultime esecuzioni di tutti i moduli BRiG.</CardDescription>
            </div>
            <Button size="sm" variant="ghost" onClick={() => loadLogs()} disabled={loadingLogs}>
              <RefreshCw className={`h-4 w-4 ${loadingLogs ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingLogs ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Caricamento...
            </div>
          ) : logs.length === 0 ? (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Nessun log trovato. Lancia un sync manuale per vederne l'esito qui.
              </AlertDescription>
            </Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Modulo</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead>Record</TableHead>
                  <TableHead>Trigger</TableHead>
                  {isSuperAdmin && <TableHead>Errore</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-sm">{formatDateTime(l.created_at)}</TableCell>
                    <TableCell className="text-sm">
                      {BRIG_MODULES.find((m) => m.key === l.sync_type)?.label || l.sync_type}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          l.status === "success" || l.status === "completed"
                            ? "secondary"
                            : "destructive"
                        }
                      >
                        {l.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">{formatRecordsCell(l)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{l.trigger_type ?? "—"}</TableCell>
                    {isSuperAdmin && (
                      <TableCell className="text-xs text-muted-foreground truncate max-w-[280px]">
                        {l.error_message || "—"}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
