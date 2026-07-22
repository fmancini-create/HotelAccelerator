"use client"

import { useState } from "react"
import useSWR from "swr"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { Calendar, Clock, Save, RefreshCw, CheckCircle2, XCircle, AlertCircle } from "lucide-react"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const SYNC_INTERVALS = [
  { value: 30, label: "30 minuti" },
  { value: 60, label: "1 ora" },
  { value: 120, label: "2 ore" },
  { value: 180, label: "3 ore" },
  { value: 360, label: "6 ore (consigliato)" },
  { value: 720, label: "12 ore" },
  { value: 1440, label: "24 ore" },
]

interface SyncConfigRow {
  id: string
  hotel_id: string
  auto_sync_enabled: boolean
  sync_interval_minutes: number
  sync_start_date: string | null
  sync_end_date: string | null
  last_sync_at: string | null
  last_sync_status: string | null
  last_sync_error: string | null
  hotels: {
    id: string
    name: string
    total_rooms: number
    star_rating: number
    pms_integrations: Array<{
      pms_name: string
      integration_mode: string
      is_active: boolean
    }>
  }
}

export function SyncConfigurationManager() {
  const { data, error, mutate } = useSWR<{ configs: SyncConfigRow[] }>("/api/superadmin/sync-config", fetcher)
  const [editState, setEditState] = useState<Record<string, Partial<SyncConfigRow>>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [syncing, setSyncing] = useState<Record<string, boolean>>({})
  const { toast } = useToast()

  if (error) return <div className="text-sm text-destructive">Errore caricamento configurazioni sync</div>
  if (!data) return <div className="text-sm text-muted-foreground">Caricamento configurazioni...</div>

  const configs = data.configs || []

  function getEdit(hotelId: string, field: keyof SyncConfigRow, original: any) {
    return editState[hotelId]?.[field] ?? original
  }

  function setEdit(hotelId: string, field: keyof SyncConfigRow, value: any) {
    setEditState((prev) => ({
      ...prev,
      [hotelId]: { ...prev[hotelId], [field]: value },
    }))
  }

  async function handleSave(config: SyncConfigRow) {
    const hid = config.hotel_id
    setSaving((prev) => ({ ...prev, [hid]: true }))
    try {
      const res = await fetch("/api/superadmin/sync-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotel_id: hid,
          auto_sync_enabled: getEdit(hid, "auto_sync_enabled", config.auto_sync_enabled),
          sync_interval_minutes: getEdit(hid, "sync_interval_minutes", config.sync_interval_minutes),
          sync_start_date: getEdit(hid, "sync_start_date", config.sync_start_date),
          sync_end_date: getEdit(hid, "sync_end_date", config.sync_end_date),
        }),
      })
      if (!res.ok) throw new Error("Salvataggio fallito")
      toast({ title: "Configurazione salvata", description: `Sync config aggiornata per ${config.hotels.name}` })
      mutate()
      // Pulisci edit state per questo hotel
      setEditState((prev) => {
        const next = { ...prev }
        delete next[hid]
        return next
      })
    } catch {
      toast({ title: "Errore", description: "Impossibile salvare la configurazione", variant: "destructive" })
    } finally {
      setSaving((prev) => ({ ...prev, [hid]: false }))
    }
  }

  async function handleTriggerSync(config: SyncConfigRow) {
    const hid = config.hotel_id
    setSyncing((prev) => ({ ...prev, [hid]: true }))
    try {
      const res = await fetch("/api/superadmin/sync-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotel_id: hid }),
      })
      const json = await res.json()
      if (res.ok && json.success) {
        toast({
          title: "Sync completato",
          description: `${config.hotels.name}: ${json.bookings_imported || 0} prenotazioni, ${json.availability_imported || 0} disponibilita`,
        })
        mutate()
      } else {
        toast({ title: "Sync fallito", description: json.error || "Errore durante la sincronizzazione", variant: "destructive" })
      }
    } catch {
      toast({ title: "Errore", description: "Errore di rete durante il sync", variant: "destructive" })
    } finally {
      setSyncing((prev) => ({ ...prev, [hid]: false }))
    }
  }

  function statusBadge(status: string | null) {
    if (!status) return <Badge variant="secondary">Mai sincronizzato</Badge>
    if (status === "success") return <Badge className="bg-green-100 text-green-800 border-green-200"><CheckCircle2 className="h-3 w-3 mr-1" />Successo</Badge>
    if (status === "error") return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Errore</Badge>
    return <Badge variant="secondary"><AlertCircle className="h-3 w-3 mr-1" />{status}</Badge>
  }

  function pmsLabel(pms: SyncConfigRow["hotels"]["pms_integrations"]) {
    if (!pms || pms.length === 0) return "Nessun PMS"
    const p = pms[0]
    return `${p.pms_name} (${p.integration_mode})`
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Configurazione Sincronizzazione</h3>
          <p className="text-sm text-muted-foreground">
            Imposta la frequenza e le opzioni di sync automatico per ogni struttura.
            Il cron job esegue ogni 30 minuti e sincronizza solo gli hotel il cui intervallo e' scaduto.
          </p>
        </div>
      </div>

      {configs.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nessun hotel configurato. Completa l'onboarding di almeno un hotel.
          </CardContent>
        </Card>
      )}

      {configs.map((config) => {
        const hid = config.hotel_id
        const autoSync = getEdit(hid, "auto_sync_enabled", config.auto_sync_enabled) as boolean
        const interval = getEdit(hid, "sync_interval_minutes", config.sync_interval_minutes) as number
        const startDate = getEdit(hid, "sync_start_date", config.sync_start_date) as string | null
        const endDate = getEdit(hid, "sync_end_date", config.sync_end_date) as string | null
        const isSaving = saving[hid]
        const isSyncing = syncing[hid]

        return (
          <Card key={hid}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">{config.hotels.name}</CardTitle>
                  <CardDescription className="flex items-center gap-2 mt-1">
                    <span>{config.hotels.total_rooms} camere</span>
                    <span className="text-muted-foreground/40">|</span>
                    <span>{pmsLabel(config.hotels.pms_integrations)}</span>
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {statusBadge(config.last_sync_status)}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTriggerSync(config)}
                    disabled={isSyncing}
                    className="gap-1.5"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                    {isSyncing ? "Sync..." : "Sync ora"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Auto-sync toggle */}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label className="font-medium">Sincronizzazione Automatica</Label>
                  <p className="text-xs text-muted-foreground">
                    {autoSync ? "I dati vengono aggiornati automaticamente" : "Solo sync manuale"}
                  </p>
                </div>
                <Switch
                  checked={autoSync}
                  onCheckedChange={(checked) => setEdit(hid, "auto_sync_enabled", checked)}
                />
              </div>

              {/* Interval selector - shown only when auto-sync is on */}
              {autoSync && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />
                    Frequenza di aggiornamento
                  </Label>
                  <Select
                    value={String(interval)}
                    onValueChange={(v) => setEdit(hid, "sync_interval_minutes", parseInt(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SYNC_INTERVALS.map((si) => (
                        <SelectItem key={si.value} value={String(si.value)}>
                          {si.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Date range */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-sm">
                    <Calendar className="h-3.5 w-3.5" />
                    Data inizio sync
                  </Label>
                  <Input
                    type="date"
                    value={startDate || ""}
                    onChange={(e) => setEdit(hid, "sync_start_date", e.target.value || null)}
                  />
                  <p className="text-xs text-muted-foreground">Vuoto = 1 gen anno precedente</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-sm">
                    <Calendar className="h-3.5 w-3.5" />
                    Data fine sync
                  </Label>
                  <Input
                    type="date"
                    value={endDate || ""}
                    onChange={(e) => setEdit(hid, "sync_end_date", e.target.value || null)}
                  />
                  <p className="text-xs text-muted-foreground">Vuoto = oggi + 365 giorni</p>
                </div>
              </div>

              {/* Last sync info */}
              {config.last_sync_at && (
                <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Ultimo sync:</span>{" "}
                  {new Date(config.last_sync_at).toLocaleString("it-IT")}
                  {config.last_sync_error && (
                    <p className="text-xs text-destructive mt-1">{config.last_sync_error}</p>
                  )}
                </div>
              )}

              {/* Save */}
              <Button onClick={() => handleSave(config)} disabled={isSaving} className="w-full">
                <Save className="mr-2 h-4 w-4" />
                {isSaving ? "Salvataggio..." : "Salva Configurazione"}
              </Button>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
