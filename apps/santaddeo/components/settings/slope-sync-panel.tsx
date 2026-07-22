"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, RefreshCw, BookOpen, Clock, ShieldCheck, Info } from "lucide-react"
import { toast } from "sonner"

/**
 * SlopeSyncPanel — pannello di sincronizzazione per hotel su PMS Slope.
 *
 * Bug 17/07/2026: `app/settings/pms/page.tsx` mostrava un pannello di sync solo
 * per Scidoo e BRiG. Gli hotel Slope (es. Superlusso Test, Verdi) NON avevano
 * alcuna UI, quindi il modulo cron `reservations` non veniva mai creato in
 * `pms_cron_settings` -> l'auto-sync delle prenotazioni Slope non partiva MAI e
 * le prenotazioni si scaricavano solo col "Sync ora" manuale del superadmin.
 *
 * Slope espone SOLO le prenotazioni (delta su `lastUpdateDate`): niente moduli
 * room_types / rates / availability separati (la disponibilita' e' derivata
 * dalle prenotazioni). Percio' il pannello ha un singolo modulo `reservations`,
 * a differenza di BRiG (3 moduli) e Scidoo (molti).
 *
 * Cron settings condivisi via /api/pms/cron-settings, chiave (hotel_id, module).
 * Sync manuale -> /api/admin/slope/sync (delta sync + ETL, solo super_admin).
 */

interface SlopeSyncPanelProps {
  hotelId: string
  isSuperAdmin?: boolean
}

interface CronSetting {
  id: string
  hotel_id: string
  module: string
  enabled: boolean
  frequency: string
  last_run: string | null
  next_run: string | null
  last_status: string | null
  last_error: string | null
}

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

export function SlopeSyncPanel({ hotelId, isSuperAdmin }: SlopeSyncPanelProps) {
  const [cron, setCron] = useState<CronSetting | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    void loadCronSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelId])

  async function loadCronSettings() {
    setLoading(true)
    try {
      const res = await fetch(`/api/pms/cron-settings?hotelId=${hotelId}`)
      if (!res.ok) return
      const data = await res.json()
      const settings = (data.settings || []) as CronSetting[]
      setCron(settings.find((s) => s.module === "reservations") ?? null)
    } catch (err) {
      console.error("[SlopeSyncPanel] loadCronSettings error:", err)
    } finally {
      setLoading(false)
    }
  }

  async function saveCron(patch: Partial<CronSetting>) {
    setSaving(true)
    try {
      const body = {
        hotelId,
        module: "reservations",
        enabled: patch.enabled ?? cron?.enabled ?? false,
        frequency: patch.frequency ?? cron?.frequency ?? "hourly",
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
      setSaving(false)
    }
  }

  async function runSync() {
    if (syncing) return
    setSyncing(true)
    try {
      const res = await fetch("/api/admin/slope/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok || payload?.success === false) {
        const msg = payload?.error || (payload?.errors && payload.errors[0]) || `HTTP ${res.status}`
        throw new Error(msg)
      }
      const r = payload?.report || {}
      const changed = (r.inserted ?? 0) + (r.updated ?? 0)
      toast.success(
        `Sync completato — ${r.recordsExamined ?? 0} esaminate` +
          (changed > 0 ? ` (${changed} aggiornate)` : " (nessuna modifica)"),
      )
      await loadCronSettings()
    } catch (err: any) {
      toast.error(err?.message || "Errore durante la sincronizzazione")
    } finally {
      setSyncing(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          Sincronizzazione Slope
        </CardTitle>
        <CardDescription>
          Slope fornisce le prenotazioni tramite sincronizzazione incrementale. La disponibilità e le camere vendute
          sono derivate dalle prenotazioni scaricate.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Caricamento impostazioni…
          </div>
        ) : (
          <>
            <div className="rounded-lg border bg-card">
              <div className="flex items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-3 min-w-0">
                  <BookOpen className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <div className="font-medium">Prenotazioni</div>
                    <div className="text-xs text-muted-foreground truncate flex items-center gap-2">
                      <Clock className="h-3 w-3" />
                      Ultimo: {formatDateTime(cron?.last_run ?? null)}
                      {cron?.last_status && (
                        <Badge
                          variant={cron.last_status === "success" || cron.last_status === "completed" ? "secondary" : "destructive"}
                        >
                          {cron.last_status}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                {isSuperAdmin && (
                  <Button size="sm" onClick={runSync} disabled={syncing}>
                    {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    <span className="ml-2">Sincronizza ora</span>
                  </Button>
                )}
              </div>

              <div className="border-t p-4 flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-3">
                  <Switch
                    id="slope-autosync"
                    checked={cron?.enabled ?? false}
                    onCheckedChange={(checked) => saveCron({ enabled: checked })}
                    disabled={saving}
                  />
                  <Label htmlFor="slope-autosync" className="cursor-pointer">
                    Sincronizzazione automatica
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm text-muted-foreground">Frequenza</Label>
                  <Select
                    value={cron?.frequency ?? "hourly"}
                    onValueChange={(v) => saveCron({ frequency: v })}
                    disabled={saving || !(cron?.enabled ?? false)}
                  >
                    <SelectTrigger className="h-8 w-[160px] text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FREQUENCY_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {cron?.next_run && cron?.enabled && (
                  <div className="text-xs text-muted-foreground ml-auto">
                    Prossima esecuzione: {formatDateTime(cron.next_run)}
                  </div>
                )}
              </div>
            </div>

            {cron?.last_error && (
              <Alert variant="destructive">
                <AlertDescription className="text-xs">{cron.last_error}</AlertDescription>
              </Alert>
            )}

            {!cron?.enabled && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Con la sincronizzazione automatica disattivata, le nuove prenotazioni non vengono scaricate
                  automaticamente. Attiva l&apos;auto-sync per tenere i dati sempre aggiornati.
                </AlertDescription>
              </Alert>
            )}

            {!isSuperAdmin && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="h-3 w-3" />
                La sincronizzazione manuale immediata è riservata agli amministratori.
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
