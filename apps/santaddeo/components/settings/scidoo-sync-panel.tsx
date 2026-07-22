"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  Loader2,
  RefreshCw,
  Database,
  Calendar,
  Users,
  ChevronDown,
  ChevronUp,
  DollarSign,
  BookOpen,
  Clock,
  User,
  TrendingUp,
  AlertTriangle,
} from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import Link from "next/link"

interface ScidooSyncPanelProps {
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
  error_message: string | null
  metadata: Record<string, any> | null
  created_at: string
  trigger_type: string | null
  triggered_by: string | null
}

interface RoomType {
  id: string
  name: string
  code: string
  scidoo_room_type_id: string
}

interface ModuleConfig {
  startDate: string
  endDate: string
  selectedRoomTypes: string[]
  frequency: string
  autoSyncEnabled: boolean
  lastRunAt: string | null
  nextRunAt: string | null
  lastRunStatus: string | null
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

const frequencyOptions = [
  { value: "every_15_min", label: "Ogni 15 minuti" },
  { value: "every_30_min", label: "Ogni 30 minuti" },
  { value: "hourly", label: "Ogni ora" },
  { value: "every_6_hours", label: "Ogni 6 ore" },
  { value: "every_12_hours", label: "Ogni 12 ore" },
  { value: "daily", label: "Ogni giorno" },
  { value: "weekly", label: "Ogni settimana" },
]

export function ScidooSyncPanel({ hotelId, pmsIntegrationId, isSuperAdmin }: ScidooSyncPanelProps) {
  const [syncing, setSyncing] = useState(false)
  const [syncingModule, setSyncingModule] = useState<string | null>(null)
  const [fullResyncing, setFullResyncing] = useState(false)
  const [resyncStats, setResyncStats] = useState<any>(null)
  const [resyncProgress, setResyncProgress] = useState<string>("")
  const [logs, setLogs] = useState<SyncLog[]>([])
  const [loadingLogs, setLoadingLogs] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([])
  const [loadingRoomTypes, setLoadingRoomTypes] = useState(true)
  const [expandedModule, setExpandedModule] = useState<string | null>(null)
  const [savingAutoSync, setSavingAutoSync] = useState<string | null>(null)

  // NOTE 12/05/2026: separati i due concetti di "produzione" che venivano
  // confusi nella UI precedente:
  //   - "production"            = PRODUZIONE FISCALE (fatture, corrispettivi,
  //                                depositi, IVA). Richiede partita IVA
  //                                configurata su Scidoo. NON necessaria se
  //                                la struttura non emette documenti fiscali
  //                                tramite il PMS (es. case vacanze /
  //                                locazioni turistiche).
  //   - "production_management" = PRODUZIONE GESTIONALE (daily price per
  //                                camera/notte, ricavi camere giornalieri).
  //                                I dati arrivano nel payload delle
  //                                prenotazioni: il sync di questo modulo
  //                                internamente esegue un syncBookings,
  //                                ma traccia il proprio last_run separato
  //                                in pms_cron_settings cosi' il manager
  //                                ha visibilita' dedicata.
  const modules = [
    { id: "minstay", label: "Minimum Stay", icon: Calendar },
    { id: "availability", label: "Disponibilità", icon: Database },
    { id: "occupied", label: "Camere Occupate", icon: Users },
    { id: "production_management", label: "Produzione Gestionale", icon: TrendingUp },
    { id: "production", label: "Produzione Fiscale", icon: DollarSign },
    { id: "bookings", label: "Prenotazioni", icon: BookOpen, hasLink: true, linkHref: "/bookings" },
  ]

  const [moduleConfigs, setModuleConfigs] = useState<Record<string, ModuleConfig>>({
    minstay: {
      startDate: getDefaultStartDate(),
      endDate: getDefaultEndDate(),
      selectedRoomTypes: [],
      frequency: "hourly",
      autoSyncEnabled: false,
      lastRunAt: null,
      nextRunAt: null,
      lastRunStatus: null,
    },
    availability: {
      startDate: getDefaultStartDate(),
      endDate: getDefaultEndDate(),
      selectedRoomTypes: [],
      frequency: "hourly",
      autoSyncEnabled: false,
      lastRunAt: null,
      nextRunAt: null,
      lastRunStatus: null,
    },
    occupied: {
      startDate: getDefaultStartDate(),
      endDate: getDefaultEndDate(),
      selectedRoomTypes: [],
      frequency: "hourly",
      autoSyncEnabled: false,
      lastRunAt: null,
      nextRunAt: null,
      lastRunStatus: null,
    },
    production: {
      startDate: getFirstDayOfMonth(),
      endDate: getLastDayOfMonth(),
      selectedRoomTypes: [],
      frequency: "daily",
      autoSyncEnabled: false,
      lastRunAt: null,
      nextRunAt: null,
      lastRunStatus: null,
    },
    production_management: {
      startDate: getFirstDayOfYear(),
      endDate: getLastDayOfYear(),
      selectedRoomTypes: [],
      frequency: "hourly",
      autoSyncEnabled: false,
      lastRunAt: null,
      nextRunAt: null,
      lastRunStatus: null,
    },
    bookings: {
      startDate: getFirstDayOfYear(),
      endDate: getLastDayOfYear(),
      selectedRoomTypes: [],
      frequency: "hourly",
      autoSyncEnabled: false,
      lastRunAt: null,
      nextRunAt: null,
      lastRunStatus: null,
    },
  })

  function getDefaultStartDate() {
    const date = new Date()
    date.setFullYear(date.getFullYear() - 1)
    date.setMonth(0)
    date.setDate(1)
    return date.toISOString().split("T")[0]
  }

  function getDefaultEndDate() {
    const date = new Date()
    date.setDate(date.getDate() + 365)
    return date.toISOString().split("T")[0]
  }

  function getFirstDayOfMonth() {
    const date = new Date()
    date.setDate(1)
    return date.toISOString().split("T")[0]
  }

  function getLastDayOfMonth() {
    const date = new Date()
    date.setMonth(date.getMonth() + 1)
    date.setDate(0)
    return date.toISOString().split("T")[0]
  }

  function getFirstDayOfYear() {
    const date = new Date()
    date.setMonth(0)
    date.setDate(1)
    return date.toISOString().split("T")[0]
  }

  function getLastDayOfYear() {
    const date = new Date()
    date.setMonth(11)
    date.setDate(31)
    return date.toISOString().split("T")[0]
  }

  useEffect(() => {
    loadSyncLogs()
    loadRoomTypes()
    loadCronSettings()
  }, [hotelId])

  const loadCronSettings = async () => {
    console.log("[v0] loadCronSettings called for hotelId:", hotelId)
    try {
      const response = await fetch(`/api/pms/cron-settings?hotelId=${hotelId}`)
      console.log("[v0] loadCronSettings response status:", response.status)
      const data = await response.json()
      console.log("[v0] loadCronSettings data:", data)

      if (response.ok && data.settings) {
        const settings = data.settings as CronSetting[]
        console.log("[v0] loadCronSettings settings count:", settings.length)

        setModuleConfigs((prev) => {
          const updated = { ...prev }

          for (const setting of settings) {
            if (updated[setting.module]) {
              updated[setting.module] = {
                ...updated[setting.module],
                autoSyncEnabled: setting.enabled,
                frequency: setting.frequency || "daily",
                startDate: setting.date_from || updated[setting.module].startDate,
                endDate: setting.date_to || updated[setting.module].endDate,
                lastRunAt: setting.last_run,
                nextRunAt: setting.next_run,
                lastRunStatus: setting.last_status,
              }
            }
          }

          return updated
        })
      }
    } catch (error) {
      console.error("[v0] Error loading cron settings:", error)
    }
  }

  const loadRoomTypes = async () => {
    try {
      setLoadingRoomTypes(true)
      const response = await fetch(`/api/room-types?hotelId=${hotelId}`)
      const data = await response.json()

      if (response.ok) {
        setRoomTypes(data.roomTypes || [])
        const allRoomTypeIds = (data.roomTypes || []).map((rt: RoomType) => rt.id)
        setModuleConfigs((prev) => ({
          minstay: {
            ...prev.minstay,
            selectedRoomTypes:
              prev.minstay.selectedRoomTypes.length > 0 ? prev.minstay.selectedRoomTypes : allRoomTypeIds,
          },
          availability: {
            ...prev.availability,
            selectedRoomTypes:
              prev.availability.selectedRoomTypes.length > 0 ? prev.availability.selectedRoomTypes : allRoomTypeIds,
          },
          occupied: {
            ...prev.occupied,
            selectedRoomTypes:
              prev.occupied.selectedRoomTypes.length > 0 ? prev.occupied.selectedRoomTypes : allRoomTypeIds,
          },
          production: { ...prev.production, selectedRoomTypes: [] },
          production_management: { ...prev.production_management, selectedRoomTypes: [] },
          bookings: { ...prev.bookings, selectedRoomTypes: [] },
        }))
      }
    } catch (error) {
      console.error("[v0] Error loading room types:", error)
    } finally {
      setLoadingRoomTypes(false)
    }
  }

  const loadSyncLogs = async () => {
    try {
      setLoadingLogs(true)
      const response = await fetch(`/api/scidoo/sync-logs?hotelId=${hotelId}`)
      const data = await response.json()

      if (response.ok) {
        setLogs(data.logs || [])
      } else {
        console.error("[v0] Error loading sync logs:", data.error)
      }
    } catch (error) {
      console.error("[v0] Error loading sync logs:", error)
    } finally {
      setLoadingLogs(false)
    }
  }

  const handleAutoSyncToggle = async (moduleId: string, enabled: boolean) => {
    try {
      setSavingAutoSync(moduleId)
      setError(null)
      setSuccess(null)

      const config = moduleConfigs[moduleId]

      const response = await fetch("/api/pms/cron-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelId,
          module: moduleId,
          enabled: enabled,
          frequency: config.frequency,
          dateFrom: config.startDate,
          dateTo: config.endDate,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setModuleConfigs((prev) => ({
          ...prev,
          [moduleId]: {
            ...prev[moduleId],
            autoSyncEnabled: enabled,
            nextRunAt: data.setting?.next_run || null,
          },
        }))
        setSuccess(
          enabled
            ? `Sincronizzazione automatica attivata per ${modules.find((m) => m.id === moduleId)?.label}`
            : `Sincronizzazione automatica disattivata per ${modules.find((m) => m.id === moduleId)?.label}`,
        )
      } else {
        setError(data.error || "Errore nel salvare le impostazioni")
      }
    } catch (error: any) {
      setError(error.message || "Errore nel salvare le impostazioni")
    } finally {
      setSavingAutoSync(null)
    }
  }

  const saveModuleSettings = async (moduleId: string) => {
    if (!moduleConfigs[moduleId].autoSyncEnabled) return

    try {
      const config = moduleConfigs[moduleId]

      const response = await fetch("/api/pms/cron-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelId,
          module: moduleId,
          enabled: config.autoSyncEnabled,
          frequency: config.frequency,
          dateFrom: config.startDate,
          dateTo: config.endDate,
        }),
      })
      
      const data = await response.json()
      
      // Update nextRunAt in state when frequency changes
      if (response.ok && data.setting?.next_run) {
        setModuleConfigs((prev) => ({
          ...prev,
          [moduleId]: {
            ...prev[moduleId],
            nextRunAt: data.setting.next_run,
          },
        }))
      }
    } catch (error) {
      console.error("[v0] Error saving module settings:", error)
    }
  }

  const handleFullSync = async () => {
    try {
      setSyncing(true)
      setError(null)
      setSuccess(null)

      const startDate = getDefaultStartDate()
      const endDate = getDefaultEndDate()

      const response = await fetch("/api/scidoo/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId, startDate, endDate }),
      })

      const data = await response.json()

      if (response.ok) {
        await loadSyncLogs()
        setSuccess("Sincronizzazione completa avviata con successo")
      } else {
        setError(data.error || "Errore durante la sincronizzazione")
      }
    } catch (error: any) {
      setError(error.message || "Errore durante la sincronizzazione")
    } finally {
      setSyncing(false)
    }
  }

  const handleFullResync = async () => {
    if (!confirm("ATTENZIONE: Questa operazione cancellera TUTTI i dati delle prenotazioni e li reimportera da zero da Scidoo.\n\nL'operazione puo richiedere diversi minuti.\n\nContinuare?")) {
      return
    }
    try {
      setFullResyncing(true)
      setError(null)
      setSuccess(null)
      setResyncStats(null)
      setResyncProgress("Avvio resync completo...")

      const response = await fetch("/api/superadmin/full-resync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId }),
      })

      if (!response.ok && response.headers.get("content-type")?.includes("application/json")) {
        const data = await response.json()
        setError(data.error || "Errore durante il resync completo")
        return
      }

      // Read SSE stream
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        setError("Impossibile leggere la risposta del server")
        return
      }

      let buffer = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          const dataLine = line.replace(/^data: /, "").trim()
          if (!dataLine) continue

          try {
            const event = JSON.parse(dataLine)
            if (event.type === "progress") {
              setResyncProgress(`[${event.step}/${event.total}] ${event.message}`)
            } else if (event.type === "complete") {
              setResyncStats(event.stats)
              setSuccess(event.message)
              setResyncProgress("")
              await loadSyncLogs()
            } else if (event.type === "error") {
              setError(event.message)
              setResyncProgress("")
            }
          } catch (_) { /* ignore parse errors */ }
        }
      }
    } catch (error: any) {
      setError(error.message || "Errore durante il resync completo")
      setResyncProgress("")
    } finally {
      setFullResyncing(false)
    }
  }

  const handleModuleSync = async (moduleId: string) => {
    try {
      setSyncingModule(moduleId)
      setError(null)
      setSuccess(null)

      const config = moduleConfigs[moduleId]

      // Use all room types as fallback if none are selected
      const effectiveRoomTypeIds =
        config.selectedRoomTypes.length > 0
          ? config.selectedRoomTypes
          : roomTypes.map((rt) => rt.id)

      const response = await fetch("/api/scidoo/sync-module", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelId,
          module: moduleId,
          startDate: config.startDate,
          endDate: config.endDate,
          roomTypeIds: effectiveRoomTypeIds,
          frequency: Number.parseInt(config.frequency),
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setSuccess(`Sincronizzazione ${modules.find((m) => m.id === moduleId)?.label} completata!`)
        await loadSyncLogs()
      } else {
        setError(data.error || `Errore durante la sincronizzazione di ${moduleId}`)
      }
    } catch (error: any) {
      setError(error.message || `Errore durante la sincronizzazione di ${moduleId}`)
    } finally {
      setSyncingModule(null)
    }
  }

  const toggleRoomType = (moduleId: string, roomTypeId: string) => {
    setModuleConfigs((prev) => {
      const config = prev[moduleId]
      const isSelected = config.selectedRoomTypes.includes(roomTypeId)

      return {
        ...prev,
        [moduleId]: {
          ...config,
          selectedRoomTypes: isSelected
            ? config.selectedRoomTypes.filter((id) => id !== roomTypeId)
            : [...config.selectedRoomTypes, roomTypeId],
        },
      }
    })
  }

  const updateModuleConfig = (moduleId: string, field: keyof ModuleConfig, value: any) => {
    setModuleConfigs((prev) => ({
      ...prev,
      [moduleId]: {
        ...prev[moduleId],
        [field]: value,
      },
    }))

    // Save settings if auto-sync is enabled and frequency/dates changed
    if (field === "frequency" || field === "startDate" || field === "endDate") {
      setTimeout(() => saveModuleSettings(moduleId), 500)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const formatRelativeTime = (dateString: string | null) => {
    if (!dateString) return null

    const date = new Date(dateString)
    const now = new Date()
    const diffMs = date.getTime() - now.getTime()
    const diffMins = Math.round(diffMs / 60000)

    if (diffMins < 0) {
      const absMins = Math.abs(diffMins)
      if (absMins < 60) return `${absMins} min fa`
      if (absMins < 1440) return `${Math.round(absMins / 60)} ore fa`
      return `${Math.round(absMins / 1440)} giorni fa`
    } else {
      if (diffMins < 60) return `tra ${diffMins} min`
      if (diffMins < 1440) return `tra ${Math.round(diffMins / 60)} ore`
      return `tra ${Math.round(diffMins / 1440)} giorni`
    }
  }

  const getModuleName = (syncType: string) => {
    const moduleNames: Record<string, string> = {
      room_types: "Tipologie Camere",
      bookings: "Prenotazioni",
      availability: "Disponibilità",
      rates: "Tariffe",
      minstay: "Minimum Stay",
      occupied: "Camere Occupate",
      fiscal_production: "Produzione Fiscale",
      production: "Produzione",
      full_sync: "Sincronizzazione Completa",
      etl: "ETL",
    }
    return moduleNames[syncType] || syncType
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
      case "completed":
        return (
          <Badge variant="default" className="bg-green-500">
            Completato
          </Badge>
        )
      case "error":
      case "failed":
        return <Badge variant="destructive">Fallito</Badge>
      case "partial":
        return <Badge variant="secondary">Parziale</Badge>
      case "running":
        return (
          <Badge variant="outline" className="bg-blue-100">
            In corso
          </Badge>
        )
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Sincronizzazione PMS</CardTitle>
          <CardDescription>
            Configura e avvia la sincronizzazione dei dati dal tuo PMS. Puoi attivare la sincronizzazione
            automatica per ogni modulo con la frequenza desiderata.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="bg-green-50 border-green-200">
              <AlertDescription className="text-green-800">{success}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-3">
            <Button onClick={handleFullSync} disabled={syncing || syncingModule !== null || fullResyncing} size="lg" className="w-full">
              {syncing ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Sincronizzazione in corso...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-5 w-5" />
                  Avvia Sincronizzazione Completa
                </>
              )}
            </Button>

            {isSuperAdmin && (
              <>
                <Button
                  onClick={handleFullResync}
                  disabled={syncing || syncingModule !== null || fullResyncing}
                  size="lg"
                  variant="destructive"
                  className="w-full"
                >
                  {fullResyncing ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Resync completo in corso...
                    </>
                  ) : (
                    <>
                      <Database className="mr-2 h-5 w-5" />
                      Resync Completo (Cancella e Reimporta Tutto)
                    </>
                  )}
                </Button>
                {fullResyncing && resyncProgress && (
                  <p className="text-sm text-muted-foreground animate-pulse">{resyncProgress}</p>
                )}
              </>
            )}

            {resyncStats && (
              <Alert className="bg-blue-50 border-blue-200">
                <AlertDescription className="text-blue-800 text-sm">
                  <p className="font-semibold mb-1">Risultato Resync Completo:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    <li>Prenotazioni raw cancellate: {resyncStats.deletedRawBookings}</li>
                    <li>Bookings cancellati: {resyncStats.deletedBookings}</li>
                    <li>Room types corretti: {resyncStats.backfilledRoomTypes}</li>
                    <li>Raw bookings finali: {resyncStats.finalCounts?.rawBookings}</li>
                    <li>Bookings finali: {resyncStats.finalCounts?.bookings}</li>
                    <li>Senza room type: {resyncStats.finalCounts?.missingRoomTypeName}</li>
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </div>

          <div className="space-y-3">
            {modules.map((module) => {
              const Icon = module.icon
              const isLoading = syncingModule === module.id
              const isExpanded = expandedModule === module.id
              const config = moduleConfigs[module.id]
              const isSavingAutoSync = savingAutoSync === module.id

              return (
                <Card key={module.id} className="border-2">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Icon className="h-5 w-5 text-primary" />
                        <CardTitle className="text-base">{module.label}</CardTitle>
                        {module.hasLink && (
                          <Link href={module.linkHref || "#"} className="text-sm text-primary hover:underline ml-2">
                            Vedi lista →
                          </Link>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Quick sync button in header */}
                        <Button
                          variant="outline"
                          size="sm"
                          className="bg-transparent"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleModuleSync(module.id)
                          }}
                          disabled={
                            syncing ||
                            syncingModule !== null ||
                            (module.id !== "production" &&
                              module.id !== "production_management" &&
                              module.id !== "bookings" &&
                              config.selectedRoomTypes.length === 0 &&
                              roomTypes.length === 0)
                          }
                        >
                          {isLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                          <span className="ml-1.5 hidden sm:inline">
                            {isLoading ? "Sync..." : "Sincronizza"}
                          </span>
                        </Button>
                        <div className="flex items-center gap-2">
                          {isSavingAutoSync && <Loader2 className="h-4 w-4 animate-spin" />}
                          <Label htmlFor={`${module.id}-auto`} className="text-sm text-muted-foreground">
                            Auto
                          </Label>
                          <Switch
                            id={`${module.id}-auto`}
                            checked={config.autoSyncEnabled}
                            onCheckedChange={(checked) => handleAutoSyncToggle(module.id, checked)}
                            disabled={isSavingAutoSync}
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpandedModule(isExpanded ? null : module.id)}
                          disabled={isLoading}
                        >
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                    {config.autoSyncEnabled && (
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>
                            {frequencyOptions.find((f) => f.value === config.frequency)?.label ||
                              config.frequency.replace(/_/g, " ").replace("every", "").trim() + " min"}
                          </span>
                        </div>
                        {config.lastRunAt && <span>Ultima: {formatRelativeTime(config.lastRunAt)}</span>}
                        {config.nextRunAt && (
                          <span className="text-primary">Prossima: {formatRelativeTime(config.nextRunAt)}</span>
                        )}
                        {config.lastRunStatus && getStatusBadge(config.lastRunStatus)}
                      </div>
                    )}
                  </CardHeader>

                  {isExpanded && (
                    <CardContent className="space-y-4 pt-0">
                      {/* Date Range - NOT shown for bookings/production_management (uses last_modified incremental sync) */}
                      {module.id !== "bookings" && module.id !== "production_management" && (
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor={`${module.id}-start`}>Data Inizio</Label>
                            <Input
                              id={`${module.id}-start`}
                              type="date"
                              value={config.startDate}
                              onChange={(e) => updateModuleConfig(module.id, "startDate", e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`${module.id}-end`}>Data Fine</Label>
                            <Input
                              id={`${module.id}-end`}
                              type="date"
                              value={config.endDate}
                              onChange={(e) => updateModuleConfig(module.id, "endDate", e.target.value)}
                            />
                          </div>
                        </div>
                      )}

                      {/* Room Types Selection */}
                      {module.id !== "production" && module.id !== "production_management" && module.id !== "bookings" && (
                        <div className="space-y-2">
                          <Label>Tipologie di Camere</Label>
                          {loadingRoomTypes ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Caricamento...
                            </div>
                          ) : roomTypes.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Nessuna tipologia di camera trovata</p>
                          ) : (
                            <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto border rounded-md p-3">
                              {roomTypes.map((roomType) => (
                                <div key={roomType.id} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`${module.id}-${roomType.id}`}
                                    checked={config.selectedRoomTypes.includes(roomType.id)}
                                    onCheckedChange={() => toggleRoomType(module.id, roomType.id)}
                                  />
                                  <label
                                    htmlFor={`${module.id}-${roomType.id}`}
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                  >
                                    {roomType.name}
                                  </label>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {module.id === "production" && (
                        <div className="space-y-2">
                          <div className="text-sm bg-blue-50 border border-blue-200 text-blue-900 p-3 rounded-md">
                            <p className="font-semibold mb-1">Produzione Fiscale</p>
                            <p className="text-xs leading-relaxed">
                              Scarica dal PMS i <strong>documenti fiscali emessi</strong>: fatture, ricevute,
                              corrispettivi, depositi, pagamenti e IVA per il periodo selezionato. Serve solo per la
                              contabilità.
                            </p>
                          </div>
                          <div className="text-xs bg-amber-50 border border-amber-200 text-amber-900 p-3 rounded-md flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                            <div className="leading-relaxed">
                              <p className="font-semibold mb-0.5">Richiede partita IVA configurata su Scidoo.</p>
                              <p>
                                Se la tua struttura <strong>non emette documenti fiscali tramite Scidoo</strong> (es.
                                case vacanze, locazioni turistiche con cedolare secca, strutture che fatturano tramite
                                portale esterno tipo Airbnb), questo modulo fallirà sempre: <strong>disattiva il toggle Auto</strong>.
                                Non blocca nessun&apos;altra funzionalità della piattaforma.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {module.id === "production_management" && (
                        <div className="text-sm bg-emerald-50 border border-emerald-200 text-emerald-900 p-3 rounded-md">
                          <p className="font-semibold mb-1">Produzione Gestionale</p>
                          <p className="text-xs leading-relaxed">
                            Sincronizza i <strong>ricavi camera giornalieri</strong> (daily price per camera/notte) che
                            alimentano la pagina <Link href="/dati/production" className="underline font-medium">Produzione</Link>,
                            il calcolo di ADR, RevPAR, occupancy e revenue. I daily price arrivano insieme alle
                            prenotazioni: cliccando &quot;Sincronizza&quot; viene eseguito uno sync delle prenotazioni con
                            ricalcolo dei prezzi storici per ogni notte.
                          </p>
                          <p className="text-xs leading-relaxed mt-2 text-emerald-800">
                            <strong>Non richiede partita IVA.</strong> Funziona per tutte le strutture, incluse case
                            vacanze e locazioni turistiche.
                          </p>
                        </div>
                      )}

                      {module.id === "bookings" && (
                        <div className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                          <p className="font-medium mb-1">Sincronizzazione intelligente:</p>
                          <ul className="list-disc list-inside space-y-1 text-xs">
                            <li><strong>Prima sync:</strong> scarica tutte le prenotazioni (2 anni indietro + 1 anno avanti)</li>
                            <li><strong>Sync successive:</strong> scarica solo le prenotazioni create o modificate dall&apos;ultima sync</li>
                          </ul>
                        </div>
                      )}

                      {/* Frequency Selection */}
                      <div className="space-y-2">
                        <Label htmlFor={`${module.id}-frequency`}>Frequenza Sincronizzazione Automatica</Label>
                        <Select
                          value={config.frequency}
                          onValueChange={(value) => updateModuleConfig(module.id, "frequency", value)}
                        >
                          <SelectTrigger id={`${module.id}-frequency`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {frequencyOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Sync Button */}
                      <Button
                        onClick={() => handleModuleSync(module.id)}
                        disabled={
                          syncing ||
                          syncingModule !== null ||
                          (module.id !== "production" &&
                            module.id !== "production_management" &&
                            module.id !== "bookings" &&
                            config.selectedRoomTypes.length === 0 &&
                            roomTypes.length === 0)
                        }
                        className="w-full"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Sincronizzazione in corso...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Avvia Sincronizzazione Manuale
                          </>
                        )}
                      </Button>
                    </CardContent>
                  )}
                </Card>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Log Sincronizzazioni */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Log Sincronizzazioni</CardTitle>
            <Button onClick={loadSyncLogs} disabled={loadingLogs} variant="ghost" size="sm">
              <RefreshCw className={`h-4 w-4 ${loadingLogs ? "animate-spin" : ""}`} />
            </Button>
          </div>
          <CardDescription>Ultime 10 sincronizzazioni eseguite</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingLogs ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : logs.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nessuna sincronizzazione eseguita</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Funzione</TableHead>
                    <TableHead>Data/Ora</TableHead>
                    <TableHead>Record</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Eseguito da</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium">{getModuleName(log.sync_type)}</TableCell>
                      <TableCell>{formatDate(log.started_at || log.created_at)}</TableCell>
                      <TableCell className="text-sm">
                        {log.records_processed !== null ? (
                          <span>
                            {log.records_processed}
                            {log.records_failed && log.records_failed > 0 && (
                              <span className="text-red-500 ml-1">({log.records_failed} err)</span>
                            )}
                          </span>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(log.status)}</TableCell>
                      <TableCell>
                        {log.trigger_type === "automatic" ? (
                          <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Auto
                          </Badge>
                        ) : (
                          <Badge variant="outline">
                            <User className="h-3 w-3 mr-1" />
                            Manuale
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {log.triggered_by === "cron" ? "Sistema" : log.triggered_by || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
