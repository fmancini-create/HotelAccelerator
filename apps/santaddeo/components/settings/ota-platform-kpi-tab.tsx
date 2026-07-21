"use client"

/**
 * Generic OTA Platform KPI Tab
 * ================================
 * Parametric component that handles KPI ingestion from any OTA platform:
 * - Upload reports (PDF + XLSX) → AI extraction → KPI snapshots
 * - Manual KPI entry form
 * - Reminder configuration (email/popup, frequency)
 * - History of all submissions
 *
 * Originally: BookingKpiTab (1100+ lines, hardcoded for Booking.com).
 * Refactored 12/05/2026 (FASE 2) to support multiple platforms:
 *   - Booking.com Extranet  (`platform="booking_com"`)
 *   - Expedia Partner Central (`platform="expedia"`)
 *
 * The tutorial/intro UI (which is platform-specific because the dashboards
 * differ massively) is injected via the `introContent` and `tutorialContent`
 * props. All data-layer + form UI is fully generic.
 *
 * All API endpoints accept the same `?platform=` query / `platform` body field
 * and have been updated to scope reads/writes correctly to avoid cross-contamination
 * between Booking and Expedia snapshots.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react"
import {
  Bell,
  CheckCircle2,
  CloudUpload,
  Loader2,
  Mail,
  Clock,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"

export type OtaPlatform = "booking_com" | "expedia"

type MonthlyBreakdownRow = {
  month: string
  nights: number | null
  adr: number | null
  revenue: number | null
}

type KpiSnapshot = {
  id: string
  period_start: string
  period_end: string
  // 13/05/2026: timestamp di importazione (primo upload) e ultima modifica
  // (eventuale re-upload sullo stesso periodo). Mostrati nello storico per
  // dare visibilita' precisa di quando i dati OTA sono stati caricati.
  created_at: string | null
  updated_at: string | null
  // Performance fields
  search_views: number | null
  property_views: number | null
  bookings_count: number | null
  prev_search_views: number | null
  prev_property_views: number | null
  prev_bookings_count: number | null
  ranking_score: number | null
  ranking_position: number | null
  total_competitors: number | null
  // Production fields
  total_room_nights: number | null
  total_revenue: number | null
  adr: number | null
  prev_total_room_nights: number | null
  prev_total_revenue: number | null
  prev_adr: number | null
  monthly_breakdown: MonthlyBreakdownRow[] | null
  report_type: "performance" | "production" | "mixed" | "manual" | null
  notes: string | null
}

type ReminderConfig = {
  frequency_days: number
  email_enabled: boolean
  popup_enabled: boolean
  is_active: boolean
  next_run_at: string
  last_triggered_at: string | null
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
  } catch {
    return iso
  }
}

/**
 * 13/05/2026: formatter data+ora per i timestamp di importazione file OTA.
 * Mostra gg/mm/aaaa hh:mm in fuso locale (Europe/Rome via locale it-IT).
 */
function fmtDateTime(iso: string | null | undefined) {
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

function fmtMonth(ym: string | null | undefined) {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return ym ?? "—"
  const [y, m] = ym.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("it-IT", {
    month: "short",
    year: "numeric",
  })
}

const defaultPeriod = () => {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 30)
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

export interface OtaPlatformKpiTabProps {
  hotelId: string
  platform: OtaPlatform
  /** Display label, e.g. "Booking.com" or "Expedia" */
  platformLabel: string
  /** Intro card (above tutorial). Platform-specific guidance. */
  introContent?: ReactNode
  /** Tutorial card (step-by-step how to reach the report). Platform-specific. */
  tutorialContent?: ReactNode
  /** Title for the upload card, e.g. "Carica un report da Booking" */
  uploadCardTitle?: string
  /** Description for the upload card */
  uploadCardDescription?: string
  /** Accepted file types (default: PDF + XLSX) */
  acceptedFiles?: string
  /** Title for the manual form card */
  manualFormCardTitle?: string
  /** Description for the manual form card */
  manualFormCardDescription?: string
}

export function OtaPlatformKpiTab({
  hotelId,
  platform,
  platformLabel,
  introContent,
  tutorialContent,
  uploadCardTitle = `Carica un report da ${platformLabel}`,
  uploadCardDescription = "Accetta PDF, file Excel (.xlsx) e screenshot (PNG/JPG). Massimo 10 MB. L'AI riconosce automaticamente il formato e popola le sezioni corrispondenti.",
  acceptedFiles = "application/pdf,.pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx,application/vnd.ms-excel,.xls,image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp",
  manualFormCardTitle = "Inserimento manuale dei KPI",
  manualFormCardDescription = "Compila i campi per il periodo corrente e per lo stesso periodo dell'anno scorso.",
}: OtaPlatformKpiTabProps) {
  const { toast } = useToast()
  const [snapshots, setSnapshots] = useState<KpiSnapshot[]>([])
  const [reminder, setReminder] = useState<ReminderConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  // Feedback visivo mentre si trascina un file sopra la dropzone.
  const [dragActive, setDragActive] = useState(false)
  // Snapshot in attesa di conferma eliminazione + id in corso di eliminazione.
  const [confirmSnap, setConfirmSnap] = useState<KpiSnapshot | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [form, setForm] = useState(() => ({
    ...defaultPeriod(),
    search_views: "",
    property_views: "",
    bookings_count: "",
    prev_search_views: "",
    prev_property_views: "",
    prev_bookings_count: "",
    ranking_score: "",
    ranking_position: "",
    total_competitors: "",
  }))

  const [reminderForm, setReminderForm] = useState({
    frequency_days: 30,
    email_enabled: true,
    popup_enabled: true,
    is_active: true,
  })

  const loadAll = async () => {
    setLoading(true)
    try {
      // FASE 2 fix: always scope BOTH endpoints by platform. Without it the
      // Expedia tab would see Booking snapshots (and vice-versa).
      const [kpiRes, remRes] = await Promise.all([
        fetch(`/api/ota/kpi?hotelId=${hotelId}&platform=${platform}`),
        fetch(`/api/ota/reminder?hotelId=${hotelId}&platform=${platform}`),
      ])
      const kpiJson = await kpiRes.json()
      const remJson = await remRes.json()
      setSnapshots(kpiJson.snapshots ?? [])
      if (remJson.reminder) {
        setReminder(remJson.reminder)
        setReminderForm({
          frequency_days: remJson.reminder.frequency_days,
          email_enabled: remJson.reminder.email_enabled,
          popup_enabled: remJson.reminder.popup_enabled,
          is_active: remJson.reminder.is_active,
        })
      } else {
        // Fresh tab for this platform: reset to defaults so user sees the form
        // with our defaults instead of inheriting from the other platform.
        setReminder(null)
      }
    } catch (err) {
      console.error("[v0] Failed to load OTA data:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelId, platform])

  const latestPerformance = useMemo(
    () =>
      snapshots.find(
        (s) =>
          s.search_views != null ||
          s.property_views != null ||
          s.bookings_count != null,
      ) ?? null,
    [snapshots],
  )

  const latestProduction = useMemo(
    () =>
      snapshots.find(
        (s) =>
          s.total_revenue != null ||
          s.total_room_nights != null ||
          s.adr != null ||
          (Array.isArray(s.monthly_breakdown) && s.monthly_breakdown.length > 0),
      ) ?? null,
    [snapshots],
  )

  const deltaPct = (cur?: number | null, prev?: number | null) =>
    cur != null && prev != null && prev > 0
      ? Math.round(((cur - prev) / prev) * 1000) / 10
      : null

  const yoy = useMemo(() => {
    if (!latestPerformance) return null
    return {
      search: deltaPct(latestPerformance.search_views, latestPerformance.prev_search_views),
      property: deltaPct(latestPerformance.property_views, latestPerformance.prev_property_views),
      bookings: deltaPct(latestPerformance.bookings_count, latestPerformance.prev_bookings_count),
    }
  }, [latestPerformance])

  const yoyProduction = useMemo(() => {
    if (!latestProduction) return null
    return {
      nights: deltaPct(latestProduction.total_room_nights, latestProduction.prev_total_room_nights),
      revenue: deltaPct(latestProduction.total_revenue, latestProduction.prev_total_revenue),
      adr: deltaPct(latestProduction.adr, latestProduction.prev_adr),
    }
  }, [latestProduction])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/ota/kpi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelId,
          platform, // FASE 2: explicit platform so backend scopes the snapshot correctly
          periodStart: form.start,
          periodEnd: form.end,
          searchViews: form.search_views ? Number(form.search_views) : null,
          propertyViews: form.property_views ? Number(form.property_views) : null,
          bookingsCount: form.bookings_count ? Number(form.bookings_count) : null,
          prevSearchViews: form.prev_search_views ? Number(form.prev_search_views) : null,
          prevPropertyViews: form.prev_property_views ? Number(form.prev_property_views) : null,
          prevBookingsCount: form.prev_bookings_count ? Number(form.prev_bookings_count) : null,
          rankingScore: form.ranking_score ? Number(form.ranking_score) : null,
          rankingPosition: form.ranking_position ? Number(form.ranking_position) : null,
          totalCompetitors: form.total_competitors ? Number(form.total_competitors) : null,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || "Save failed")
      toast({ title: "KPI salvati", description: "I dati sono stati registrati." })
      await loadAll()
    } catch (err: any) {
      toast({
        title: "Errore",
        description: err?.message || "Impossibile salvare i KPI",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const handleUpload = async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("hotelId", hotelId)
      fd.append("platform", platform) // FASE 2: tell backend which platform this report is for

      const res = await fetch("/api/ota/reports/upload", {
        method: "POST",
        body: fd,
      })

      const raw = await res.text()
      let json: any = {}
      try {
        json = raw ? JSON.parse(raw) : {}
      } catch {
        throw new Error(`HTTP ${res.status}: ${raw.slice(0, 120)}`)
      }
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)

      const reportId = json.reportId as string | undefined
      if (!reportId) throw new Error("Server non ha restituito un reportId")

      toast({
        title: "Report caricato",
        description:
          "L'AI lo sta elaborando, ci vogliono circa 30 secondi. Lo storico si aggiorna da solo.",
      })

      await loadAll()
      const terminal = await pollReportStatus(reportId)
      if (terminal.status === "done") {
        toast({
          title: "KPI estratti",
          description: "I dati del report sono stati salvati nello storico.",
        })
      } else if (terminal.status === "error") {
        toast({
          title: "Estrazione non riuscita",
          description:
            terminal.error ||
            "Il file è stato caricato ma l'AI non ha trovato i KPI. Inseriscili manualmente qui sotto.",
          variant: "destructive",
        })
      } else {
        toast({
          title: "Elaborazione ancora in corso",
          description: "Ricarica la pagina fra qualche minuto per vedere i dati estratti.",
        })
      }
      await loadAll()
    } catch (err: any) {
      toast({
        title: "Errore caricamento",
        description: err?.message || "Upload non riuscito",
        variant: "destructive",
      })
    } finally {
      setUploading(false)
    }
  }

  const pollReportStatus = async (
    reportId: string,
  ): Promise<{ status: "done" | "error" | "processing"; error?: string }> => {
    const deadline = Date.now() + 120_000
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000))
      try {
        const r = await fetch(`/api/ota/reports/${reportId}/status`)
        if (!r.ok) continue
        const j = await r.json()
        if (j.status === "done" || j.status === "error") {
          return { status: j.status, error: j.error }
        }
      } catch {
        // Network blip, keep polling
      }
    }
    return { status: "processing" }
  }

  const handleSaveReminder = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/ota/reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelId,
          platform, // FASE 2: scope reminder by platform
          frequencyDays: reminderForm.frequency_days,
          emailEnabled: reminderForm.email_enabled,
          popupEnabled: reminderForm.popup_enabled,
          isActive: reminderForm.is_active,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || "Save failed")
      const json = await res.json()
      setReminder(json.reminder)
      toast({
        title: "Promemoria aggiornato",
        description: `Prossimo avviso: ${fmtDate(json.reminder.next_run_at)}`,
      })
    } catch (err: any) {
      toast({
        title: "Errore",
        description: err?.message || "Impossibile salvare il promemoria",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (snap: KpiSnapshot) => {
    setDeletingId(snap.id)
    try {
      const res = await fetch(
        `/api/ota/kpi?id=${encodeURIComponent(snap.id)}&hotelId=${encodeURIComponent(hotelId)}`,
        { method: "DELETE" },
      )
      if (!res.ok) throw new Error((await res.json()).error || "Delete failed")
      toast({
        title: "Importazione eliminata",
        description:
          "Lo snapshot e i dati derivati sono stati rimossi. Il prossimo ricalcolo prezzi ne terra' conto.",
      })
      setConfirmSnap(null)
      await loadAll()
    } catch (err: any) {
      toast({
        title: "Errore",
        description: err?.message || "Impossibile eliminare l'importazione",
        variant: "destructive",
      })
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* === PLATFORM-SPECIFIC INTRO === */}
      {introContent}

      {/* === PLATFORM-SPECIFIC TUTORIAL === */}
      {tutorialContent}

      {/* === PERFORMANCE REPORT — KPI traffico/ranking === */}
      {latestPerformance && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Performance &middot; {fmtDate(latestPerformance.period_start)} →{" "}
              {fmtDate(latestPerformance.period_end)}
            </CardTitle>
            <CardDescription className="text-xs">
              Dati di visite e prenotazioni dal report {platformLabel}.
              {latestPerformance.created_at && (
                <span className="ml-1 inline-flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-3 w-3" aria-hidden="true" />
                  Caricato il <b>{fmtDateTime(latestPerformance.created_at)}</b>
                  {latestPerformance.updated_at &&
                    latestPerformance.updated_at !== latestPerformance.created_at && (
                      <span>· aggiornato il {fmtDateTime(latestPerformance.updated_at)}</span>
                    )}
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <LatestTile
              label="Visualizzazioni ricerca"
              value={latestPerformance.search_views}
              delta={yoy?.search}
              prev={latestPerformance.prev_search_views}
            />
            <LatestTile
              label="Visualizzazioni struttura"
              value={latestPerformance.property_views}
              delta={yoy?.property}
              prev={latestPerformance.prev_property_views}
            />
            <LatestTile
              label="Prenotazioni"
              value={latestPerformance.bookings_count}
              delta={yoy?.bookings}
              prev={latestPerformance.prev_bookings_count}
            />
          </CardContent>
        </Card>
      )}

      {/* === PRODUCTION — KPI di produzione + breakdown mensile === */}
      {latestProduction && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Produzione &middot; {fmtDate(latestProduction.period_start)} →{" "}
              {fmtDate(latestProduction.period_end)}
            </CardTitle>
            <CardDescription className="text-xs">
              Notti, revenue, ADR e breakdown mensile dal report {platformLabel}.
              {latestProduction.created_at && (
                <span className="ml-1 inline-flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-3 w-3" aria-hidden="true" />
                  Caricato il <b>{fmtDateTime(latestProduction.created_at)}</b>
                  {latestProduction.updated_at &&
                    latestProduction.updated_at !== latestProduction.created_at && (
                      <span>· aggiornato il {fmtDateTime(latestProduction.updated_at)}</span>
                    )}
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <LatestTile
                label="Camere/notti"
                value={latestProduction.total_room_nights}
                delta={yoyProduction?.nights}
                prev={latestProduction.prev_total_room_nights}
              />
              <LatestTile
                label="Revenue"
                value={latestProduction.total_revenue}
                delta={yoyProduction?.revenue}
                prev={latestProduction.prev_total_revenue}
                format="currency"
              />
              <LatestTile
                label="ADR"
                value={latestProduction.adr}
                delta={yoyProduction?.adr}
                prev={latestProduction.prev_adr}
                format="currency"
              />
            </div>

            {Array.isArray(latestProduction.monthly_breakdown) &&
              latestProduction.monthly_breakdown.length > 0 && (
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="py-2 pl-3 pr-4">Mese</th>
                        <th className="py-2 pr-4">Notti</th>
                        <th className="py-2 pr-4">Revenue</th>
                        <th className="py-2 pr-3">ADR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {latestProduction.monthly_breakdown.map((row) => (
                        <tr key={row.month} className="border-b last:border-0">
                          <td className="py-2 pl-3 pr-4 font-medium">{fmtMonth(row.month)}</td>
                          <td className="py-2 pr-4">
                            {row.nights != null ? row.nights.toLocaleString("it-IT") : "—"}
                          </td>
                          <td className="py-2 pr-4">
                            {row.revenue != null
                              ? row.revenue.toLocaleString("it-IT", {
                                  style: "currency",
                                  currency: "EUR",
                                  maximumFractionDigits: 0,
                                })
                              : "—"}
                          </td>
                          <td className="py-2 pr-3">
                            {row.adr != null
                              ? row.adr.toLocaleString("it-IT", {
                                  style: "currency",
                                  currency: "EUR",
                                  maximumFractionDigits: 2,
                                })
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </CardContent>
        </Card>
      )}

      {/* === FILE UPLOAD === */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{uploadCardTitle}</CardTitle>
          <CardDescription>{uploadCardDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <label
            htmlFor={`ota-upload-${platform}`}
            onDragOver={(e) => {
              e.preventDefault()
              if (!uploading) setDragActive(true)
            }}
            onDragLeave={(e) => {
              e.preventDefault()
              setDragActive(false)
            }}
            onDrop={(e) => {
              e.preventDefault()
              setDragActive(false)
              if (uploading) return
              const f = e.dataTransfer.files?.[0]
              if (f) void handleUpload(f)
            }}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed py-8 text-center transition ${
              dragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary"
            }`}
          >
            {uploading ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="mt-2 text-sm text-muted-foreground">Estrazione in corso…</p>
              </>
            ) : (
              <>
                <CloudUpload className="h-8 w-8 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium">Clicca o trascina il file qui</p>
                <p className="text-xs text-muted-foreground">
                  PDF, Excel (.xlsx) o screenshot (PNG/JPG). L&apos;AI estrae notti, ADR,
                  entrate, traffico e KPI.
                </p>
              </>
            )}
            <input
              id={`ota-upload-${platform}`}
              type="file"
              accept={acceptedFiles}
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handleUpload(f)
                e.target.value = ""
              }}
            />
          </label>
        </CardContent>
      </Card>

      {/* === MANUAL FORM === */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{manualFormCardTitle}</CardTitle>
          <CardDescription>{manualFormCardDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor={`period_start_${platform}`}>Inizio periodo</Label>
              <Input
                id={`period_start_${platform}`}
                type="date"
                value={form.start}
                onChange={(e) => setForm({ ...form, start: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`period_end_${platform}`}>Fine periodo</Label>
              <Input
                id={`period_end_${platform}`}
                type="date"
                value={form.end}
                onChange={(e) => setForm({ ...form, end: e.target.value })}
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <p className="text-sm font-medium">Periodo corrente</p>
            <div className="grid gap-3 md:grid-cols-3">
              <FormInput
                label="Visualizzazioni ricerca"
                value={form.search_views}
                onChange={(v) => setForm({ ...form, search_views: v })}
              />
              <FormInput
                label="Visualizzazioni struttura"
                value={form.property_views}
                onChange={(v) => setForm({ ...form, property_views: v })}
              />
              <FormInput
                label="Prenotazioni"
                value={form.bookings_count}
                onChange={(v) => setForm({ ...form, bookings_count: v })}
              />
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">Stesso periodo anno scorso</p>
            <div className="grid gap-3 md:grid-cols-3">
              <FormInput
                label="Visualizzazioni ricerca"
                value={form.prev_search_views}
                onChange={(v) => setForm({ ...form, prev_search_views: v })}
              />
              <FormInput
                label="Visualizzazioni struttura"
                value={form.prev_property_views}
                onChange={(v) => setForm({ ...form, prev_property_views: v })}
              />
              <FormInput
                label="Prenotazioni"
                value={form.prev_bookings_count}
                onChange={(v) => setForm({ ...form, prev_bookings_count: v })}
              />
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">Ranking (opzionale)</p>
            <div className="grid gap-3 md:grid-cols-3">
              <FormInput
                label="Punteggio"
                value={form.ranking_score}
                onChange={(v) => setForm({ ...form, ranking_score: v })}
                placeholder="es. 8.7"
              />
              <FormInput
                label="Posizione"
                value={form.ranking_position}
                onChange={(v) => setForm({ ...form, ranking_position: v })}
                placeholder="es. 1"
              />
              <FormInput
                label="Totale competitor"
                value={form.total_competitors}
                onChange={(v) => setForm({ ...form, total_competitors: v })}
                placeholder="es. 10"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvataggio…
                </>
              ) : (
                "Salva KPI"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* === REMINDER === */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4" />
            Promemoria
          </CardTitle>
          <CardDescription>
            Promemoria di aggiornamento dei KPI {platformLabel} con la frequenza che preferisci.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`freq-${platform}`}>Ricordami ogni (giorni)</Label>
            <Input
              id={`freq-${platform}`}
              type="number"
              min={7}
              max={180}
              value={reminderForm.frequency_days}
              onChange={(e) =>
                setReminderForm({
                  ...reminderForm,
                  frequency_days: Number(e.target.value) || 30,
                })
              }
            />
            <p className="text-xs text-muted-foreground">Consigliato: 30 giorni (tra 7 e 180).</p>
          </div>

          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Email promemoria</span>
            </div>
            <Switch
              checked={reminderForm.email_enabled}
              onCheckedChange={(v) => setReminderForm({ ...reminderForm, email_enabled: v })}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Pop-up dentro la piattaforma</span>
            </div>
            <Switch
              checked={reminderForm.popup_enabled}
              onCheckedChange={(v) => setReminderForm({ ...reminderForm, popup_enabled: v })}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Attivo</span>
            </div>
            <Switch
              checked={reminderForm.is_active}
              onCheckedChange={(v) => setReminderForm({ ...reminderForm, is_active: v })}
            />
          </div>

          {reminder?.next_run_at && (
            <Alert>
              <Clock className="h-4 w-4" />
              <AlertDescription className="text-sm">
                Prossimo promemoria: <b>{fmtDate(reminder.next_run_at)}</b>
                {reminder.last_triggered_at && (
                  <span className="text-muted-foreground">
                    {" "}
                    · ultimo invio {fmtDate(reminder.last_triggered_at)}
                  </span>
                )}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end">
            <Button onClick={handleSaveReminder} disabled={saving} variant="outline">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salva promemoria
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* === HISTORY === */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Storico inserimenti ({snapshots.length})</CardTitle>
          <CardDescription>
            Dopo 2-3 periodi, la sezione{" "}
            <a href="/dati/performance-ota" className="underline">
              Performance OTA
            </a>{" "}
            mostra trend e suggerimenti sui pesi K.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : snapshots.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nessun inserimento registrato finora per {platformLabel}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4">Caricato il</th>
                    <th className="py-2 pr-4">Periodo</th>
                    <th className="py-2 pr-4">Tipo</th>
                    <th className="py-2 pr-4">V. ricerca</th>
                    <th className="py-2 pr-4">V. struttura</th>
                    <th className="py-2 pr-4">Prenotaz.</th>
                    <th className="py-2 pr-4">Notti</th>
                    <th className="py-2 pr-4">Revenue</th>
                    <th className="py-2 pr-4">ADR</th>
                    <th className="py-2 pr-4">Ranking</th>
                    <th className="py-2 pr-2 text-right">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((s) => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td
                        className="py-2 pr-4 text-xs text-muted-foreground whitespace-nowrap"
                        title={
                          s.updated_at && s.updated_at !== s.created_at
                            ? `Ultima modifica: ${fmtDateTime(s.updated_at)}`
                            : undefined
                        }
                      >
                        {fmtDateTime(s.created_at)}
                        {s.updated_at && s.updated_at !== s.created_at && (
                          <span className="ml-1 inline-flex items-center text-[10px] text-amber-600">
                            (mod.)
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4 font-medium whitespace-nowrap">
                        {fmtDate(s.period_start)} → {fmtDate(s.period_end)}
                      </td>
                      <td className="py-2 pr-4">
                        <ReportTypeBadge type={s.report_type} />
                      </td>
                      <td className="py-2 pr-4">
                        {s.search_views?.toLocaleString("it-IT") ?? "—"}
                      </td>
                      <td className="py-2 pr-4">
                        {s.property_views?.toLocaleString("it-IT") ?? "—"}
                      </td>
                      <td className="py-2 pr-4">{s.bookings_count ?? "—"}</td>
                      <td className="py-2 pr-4">
                        {s.total_room_nights?.toLocaleString("it-IT") ?? "—"}
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap">
                        {s.total_revenue != null
                          ? s.total_revenue.toLocaleString("it-IT", {
                              style: "currency",
                              currency: "EUR",
                              maximumFractionDigits: 0,
                            })
                          : "—"}
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap">
                        {s.adr != null
                          ? s.adr.toLocaleString("it-IT", {
                              style: "currency",
                              currency: "EUR",
                              maximumFractionDigits: 2,
                            })
                          : "—"}
                      </td>
                      <td className="py-2 pr-4">
                        {s.ranking_score != null
                          ? `${s.ranking_score} (${s.ranking_position ?? "?"}/${s.total_competitors ?? "?"})`
                          : "—"}
                      </td>
                      <td className="py-2 pr-2 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => setConfirmSnap(s)}
                          disabled={deletingId === s.id}
                          aria-label={`Elimina importazione ${fmtDate(s.period_start)} - ${fmtDate(s.period_end)}`}
                        >
                          {deletingId === s.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* === CONFERMA ELIMINAZIONE IMPORTAZIONE === */}
      <AlertDialog
        open={confirmSnap !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmSnap(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questa importazione?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmSnap && (
                <>
                  Stai per eliminare i dati {platformLabel} del periodo{" "}
                  <b>
                    {fmtDate(confirmSnap.period_start)} → {fmtDate(confirmSnap.period_end)}
                  </b>
                  . Verranno rimossi lo snapshot dallo storico, i file caricati e i
                  segnali derivati usati dal motore prezzi per quel periodo. L&apos;azione
                  non è reversibile.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingId !== null}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                if (confirmSnap) void handleDelete(confirmSnap)
              }}
              disabled={deletingId !== null}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingId !== null ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Elimino…
                </>
              ) : (
                "Elimina"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function FormInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        inputMode="numeric"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

function ReportTypeBadge({
  type,
}: {
  type: "performance" | "production" | "mixed" | "manual" | null
}) {
  if (!type) {
    return <span className="text-xs text-muted-foreground">—</span>
  }
  const config = {
    performance: { label: "Performance", className: "bg-blue-100 text-blue-800" },
    production: { label: "Andamento", className: "bg-emerald-100 text-emerald-800" },
    mixed: { label: "Completo", className: "bg-amber-100 text-amber-800" },
    manual: { label: "Manuale", className: "bg-muted text-muted-foreground" },
  }[type]
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${config.className}`}
    >
      {config.label}
    </span>
  )
}

function LatestTile({
  label,
  value,
  delta,
  prev,
  format,
}: {
  label: string
  value: number | null
  delta: number | null | undefined
  prev?: number | null
  format?: "number" | "currency"
}) {
  const deltaColor =
    delta == null
      ? "text-muted-foreground"
      : delta >= 0
        ? "text-green-600"
        : "text-red-600"
  const fmt = (n: number) =>
    format === "currency"
      ? n.toLocaleString("it-IT", {
          style: "currency",
          currency: "EUR",
          maximumFractionDigits: 2,
        })
      : n.toLocaleString("it-IT")
  const display = value == null ? "—" : fmt(value)
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{display}</div>
      {delta != null && (
        <div className={`mt-1 text-xs font-medium ${deltaColor}`}>
          {delta >= 0 ? "+" : ""}
          {delta}% vs anno scorso
        </div>
      )}
      {prev != null && (
        <div className="mt-0.5 text-xs text-muted-foreground">
          Anno prec.: {fmt(prev)}
        </div>
      )}
    </div>
  )
}
