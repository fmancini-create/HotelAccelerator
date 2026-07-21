"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  AlertCircle,
  Settings2,
  CalendarClock,
  Lightbulb,
  Check,
  Loader2,
} from "lucide-react"


// ---------- Types ----------

interface DateInfo {
  bc: number           // active bookings count
  cc: number           // cancellations count
  rn: number           // room nights (active)
  rev: number          // revenue (nightly portion)
  lbr: string | null   // last_booking_received (data ultima prenotazione ricevuta per questa data)
  lcd: string | null   // last_cancellation_date
  avail: number        // camere disponibili (-1 = dato non disponibile)
  inv: number          // inventario totale
  items: {
    g: string; n: number; t: number; ppn: number; ld: number
    ch: string; rt: string; cx: boolean; bd: string
  }[]
}

interface CalendarData {
  year: number
  hotelId: string
  totalRooms: number
  dates: Record<string, DateInfo>
  pickupThreshold: { green: number; orange: number; red: number }
}

interface Props {
  hotelId: string
}

// ---------- Stale logic (data ferma) ----------

/**
 * Soglie "data ferma": definiscono dopo quanti giorni senza nuove prenotazioni
 * una data futura viene segnalata come "ferma" (rossa).
 * Piu' la data e' vicina, piu' siamo esigenti (soglia bassa).
 */
interface StaleThreshold {
  label: string
  maxDistance: number // giorni max di distanza dalla data di soggiorno
  defaultDays: number // soglia default (giorni senza prenotazioni)
}

const STALE_THRESHOLD_BANDS: StaleThreshold[] = [
  { label: "Entro 7 giorni", maxDistance: 7, defaultDays: 1 },
  { label: "7 - 14 giorni", maxDistance: 14, defaultDays: 2 },
  { label: "14 - 30 giorni", maxDistance: 30, defaultDays: 4 },
  { label: "1 - 3 mesi", maxDistance: 90, defaultDays: 7 },
  { label: "3 - 6 mesi", maxDistance: 180, defaultDays: 14 },
  { label: "Oltre 6 mesi", maxDistance: Infinity, defaultDays: 30 },
]

const STORAGE_KEY = "santaddeo_stale_thresholds"

function loadCustomThresholds(): number[] | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length === STALE_THRESHOLD_BANDS.length) return parsed
  } catch { /* ignore */ }
  return null
}

function saveCustomThresholds(values: number[]) {
  if (typeof window === "undefined") return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(values))
}

function getStaleThresholdDays(distanceDays: number, customValues?: number[] | null): number {
  for (let i = 0; i < STALE_THRESHOLD_BANDS.length; i++) {
    if (distanceDays <= STALE_THRESHOLD_BANDS[i].maxDistance) {
      return customValues?.[i] ?? STALE_THRESHOLD_BANDS[i].defaultDays
    }
  }
  return customValues?.[STALE_THRESHOLD_BANDS.length - 1] ?? 30
}

// Lead time mediano "neutro" di riferimento: a questo valore le soglie
// suggerite coincidono con i default. Anticipi piu' brevi -> soglie piu'
// strette (allarme piu' sensibile); anticipi piu' lunghi -> soglie piu' larghe.
const REFERENCE_MEDIAN_LEAD = 25

/**
 * Deriva una soglia "data ferma" suggerita per ogni fascia, a partire
 * dall'anticipo mediano di prenotazione (lead time) reale dell'hotel.
 *
 * Principio: se gli ospiti prenotano all'ultimo (lead breve), per una data
 * ci si aspettano prenotazioni frequenti -> un breve silenzio e' gia'
 * sospetto -> soglia bassa. Se prenotano con largo anticipo (lead lungo)
 * le prenotazioni per una singola data sono diluite nel tempo -> silenzi
 * piu' lunghi sono normali -> soglia piu' alta. Relazione monotona e
 * spiegabile: factor = medianLead / 25 (riferimento), con clamp prudente.
 */
function suggestThresholds(medianLeadDays: number): number[] {
  const factor = Math.min(2.2, Math.max(0.4, medianLeadDays / REFERENCE_MEDIAN_LEAD))
  return STALE_THRESHOLD_BANDS.map((band) => {
    const cap = band.maxDistance === Infinity ? 60 : Math.min(band.maxDistance, 60)
    return Math.min(cap, Math.max(1, Math.round(band.defaultDays * factor)))
  })
}

interface LeadTimeStats {
  avgLeadTime: number
  medianLeadTime: number
  sampleSize: number
  buckets: { key: string; label: string; pct: number }[]
}

// ---------- Constants ----------

const MONTH_NAMES = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
]
const DAY_HEADERS = ["Lu", "Ma", "Me", "Gi", "Ve", "Sa", "Do"]

// ---------- Suggeritore soglie ----------

function ThresholdSuggestion({
  loading,
  error,
  stats,
  onApply,
}: {
  loading: boolean
  error: string | null
  stats: LeadTimeStats | null
  onApply: (values: number[]) => void
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Analizzo le tue prenotazioni...
      </div>
    )
  }

  if (error || !stats) {
    return (
      <div className="p-4 text-xs text-muted-foreground leading-relaxed">
        Non riesco a calcolare un suggerimento ora.{" "}
        <Link href="/dati/analytics" className="font-medium text-primary underline underline-offset-2">
          Apri Analytics
        </Link>{" "}
        per consultare la finestra di prenotazione.
      </div>
    )
  }

  if (stats.sampleSize === 0) {
    return (
      <div className="p-4 text-xs text-muted-foreground leading-relaxed">
        Non ci sono ancora abbastanza prenotazioni quest&apos;anno per generare un suggerimento affidabile.
        Imposta le soglie manualmente o riprova quando avrai piu' dati.
      </div>
    )
  }

  const median = Math.round(stats.medianLeadTime)
  const avg = Math.round(stats.avgLeadTime)
  const suggested = suggestThresholds(stats.medianLeadTime)
  const lowSample = stats.sampleSize < 20
  // Mostra le 2 fasce piu' frequenti per dare un'idea concreta della distribuzione
  const topBuckets = [...stats.buckets].sort((a, b) => b.pct - a.pct).slice(0, 2).filter((b) => b.pct > 0)

  return (
    <div className="text-xs">
      <div className="flex items-center gap-2 border-b px-3 py-2.5">
        <Lightbulb className="h-4 w-4 text-primary shrink-0" />
        <span className="font-semibold">Soglie consigliate dai tuoi dati</span>
      </div>

      <div className="px-3 py-2.5 space-y-2.5">
        <p className="text-muted-foreground leading-relaxed">
          I tuoi ospiti prenotano con un anticipo{" "}
          <strong className="text-foreground">mediano di {median} {median === 1 ? "giorno" : "giorni"}</strong>{" "}
          (media {avg}g), su {stats.sampleSize} prenotazioni di quest&apos;anno.
        </p>

        {topBuckets.length > 0 && (
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            La maggior parte prenota{" "}
            {topBuckets.map((b, i) => (
              <span key={b.key}>
                {i > 0 && " e "}
                <strong className="text-foreground">{Math.round(b.pct)}%</strong> a {b.label.toLowerCase()}
              </span>
            ))}
            .
          </p>
        )}

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          In base a questo anticipo, ecco dopo quanti giorni di silenzio segnalare una data come ferma per ogni fascia di distanza:
        </p>

        <div className="rounded-md border divide-y">
          {STALE_THRESHOLD_BANDS.map((band, i) => (
            <div key={i} className="flex items-center justify-between px-2.5 py-1.5">
              <span className="text-[11px] text-muted-foreground">{band.label}</span>
              <span className="font-mono font-semibold tabular-nums">
                {suggested[i]}g
                {suggested[i] !== band.defaultDays && (
                  <span className="ml-1 text-[9px] font-normal text-muted-foreground">(def {band.defaultDays}g)</span>
                )}
              </span>
            </div>
          ))}
        </div>

        {lowSample && (
          <p className="text-[10px] text-amber-700 leading-relaxed">
            Campione ridotto ({stats.sampleSize} prenotazioni): usa il suggerimento come punto di partenza e affinalo nel tempo.
          </p>
        )}

        <Button size="sm" className="h-7 w-full text-xs gap-1.5" onClick={() => onApply(suggested)}>
          <Check className="h-3.5 w-3.5" />
          Applica soglie suggerite
        </Button>
      </div>
    </div>
  )
}

// ---------- Component ----------

export function BookingActivityCalendar({ hotelId }: Props) {
  const [year, setYear] = useState(new Date().getFullYear())
  const [data, setData] = useState<CalendarData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openPopover, setOpenPopover] = useState<string | null>(null)
  const [customThresholds, setCustomThresholds] = useState<number[] | null>(null)
  const [showThresholdSettings, setShowThresholdSettings] = useState(false)
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [leadStats, setLeadStats] = useState<LeadTimeStats | null>(null)
  const [leadLoading, setLeadLoading] = useState(false)
  const [leadError, setLeadError] = useState<string | null>(null)
  // Cache per evitare di rifetchare lo stesso anno piu' volte
  const [leadStatsYear, setLeadStatsYear] = useState<number | null>(null)

  // Load custom thresholds on mount
  useEffect(() => {
    setCustomThresholds(loadCustomThresholds())
  }, [])

  // Recupera il lead time reale (riusa l'API analytics) quando si apre il
  // suggeritore. Lazy + cache per anno: nessuna chiamata finche' non serve.
  const fetchLeadStats = useCallback(async () => {
    if (leadStatsYear === year && leadStats) return
    setLeadLoading(true)
    setLeadError(null)
    try {
      const res = await fetch(`/api/dati/analytics?hotel_id=${hotelId}&year=${year}`)
      if (!res.ok) throw new Error("Dati non disponibili")
      const json = await res.json()
      const bw = json?.bookingWindow
      if (!bw || typeof bw.medianLeadTime !== "number") throw new Error("Dati non disponibili")
      setLeadStats({
        avgLeadTime: bw.avgLeadTime,
        medianLeadTime: bw.medianLeadTime,
        sampleSize: bw.sampleSize,
        buckets: Array.isArray(bw.buckets)
          ? bw.buckets.map((b: any) => ({ key: b.key, label: b.label, pct: b.pct }))
          : [],
      })
      setLeadStatsYear(year)
    } catch (e) {
      setLeadError(e instanceof Error ? e.message : "Errore")
    } finally {
      setLeadLoading(false)
    }
  }, [hotelId, year, leadStats, leadStatsYear])

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/dati/calendario?hotelId=${hotelId}&year=${year}`)
      
      // Check content-type before parsing JSON
      const contentType = res.headers.get("content-type") || ""
      if (!contentType.includes("application/json")) {
        console.error("[v0] calendario API returned non-JSON:", res.status, contentType)
        throw new Error("Errore server: risposta non valida")
      }
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || `Errore ${res.status}`)
      }
      
      const json = await res.json()
      if (json.error) {
        throw new Error(json.error)
      }
      setData(json)
    } catch (e: any) {
      console.error("[v0] loadData error:", e)
      setError(e.message || "Errore caricamento dati")
    } finally {
      setIsLoading(false)
    }
  }, [hotelId, year])

  useEffect(() => {
    loadData()
  }, [loadData])

  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const nowMs = useMemo(() => Date.now(), [])

  // Calcola lo status per ogni data:
  // "green" = ha prenotazioni attive che coprono questa data
  // "orange" = ha cancellazioni che coprivano questa data (ma magari anche prenotazioni)
  // "red" = DATA FERMA: disponibilita > 0 e nessuna prenotazione ricevuta da troppi giorni
  // "green+orange" = ha sia prenotazioni attive che cancellazioni
  // "none" = niente di rilevante
  // Determina le date che hanno prenotazioni ricevute oggi (booking_date = today)
  const todayReceivedDates = useMemo(() => {
    if (!data) return new Set<string>()
    const received = new Set<string>()
    for (const [ds, info] of Object.entries(data.dates)) {
      if (ds < today) continue // solo date future/odierne
      if (info.items?.some((item: any) => !item.cx && item.bd === today)) {
        received.add(ds)
      }
    }
    return received
  }, [data, today])

  const dateStatuses = useMemo(() => {
    if (!data) return {}
    const statuses: Record<string, "green" | "orange" | "red" | "green+orange" | "none"> = {}

    for (let m = 0; m < 12; m++) {
      const daysInMonth = new Date(year, m + 1, 0).getDate()
      for (let d = 1; d <= daysInMonth; d++) {
        const ds = `${year}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
        const info = data.dates[ds]

        // Date passate: non mostrare indicatori (gia' successo)
        if (ds < today) {
          statuses[ds] = "none"
          continue
        }

        const hasActive = info && info.bc > 0
        const hasCancelled = info && info.cc > 0

        // Determina lo status base (verde/arancione)
        let baseStatus: "green" | "orange" | "green+orange" | "none" = "none"
        if (hasActive && hasCancelled) {
          baseStatus = "green+orange"
        } else if (hasActive) {
          baseStatus = "green"
        } else if (hasCancelled) {
          baseStatus = "orange"
        }

        // Verifica se e' "data ferma" in base alla soglia KPI:
        // Condizione: 1) data futura 2) disponibilita > 0 3) soglia KPI superata
        // Questo check si applica ANCHE se ci sono prenotazioni attive (camere libere rimanenti)
        const stayDateMs = new Date(ds + "T12:00:00").getTime()
        const distanceDays = Math.max(0, Math.floor((stayDateMs - nowMs) / 86400000))
        const threshold = getStaleThresholdDays(distanceDays, customThresholds)

        // Disponibilita: se il dato esiste e > 0, oppure se non esiste ma abbiamo camere totali
        const hasAvailability = info
          ? (info.avail === -1 ? data.totalRooms > 0 : info.avail > 0)
          : data.totalRooms > 0

        let isStale = false
        if (hasAvailability) {
          // Se c'e' lbr (ultima prenotazione ricevuta), controlla se e' troppo vecchia
          const lastReceived = info?.lbr
          // Fallback: if lbr is null, try to derive from items
          const effectiveLastReceived = lastReceived
            || (info?.items?.filter((it: any) => !it.cx).sort((a: any, b: any) => (b.bd || "").localeCompare(a.bd || ""))?.[0]?.bd)
            || null

          if (effectiveLastReceived) {
            const lastReceivedMs = new Date(effectiveLastReceived + "T12:00:00").getTime()
            const daysSinceBooking = Math.floor((nowMs - lastReceivedMs) / 86400000)
            isStale = daysSinceBooking >= threshold
          } else {
            // Nessuna prenotazione trovata: rosso solo se la data e' abbastanza vicina
            isStale = distanceDays <= threshold * 3
          }
        }

        // La data ferma prevale sullo status base
        if (isStale) {
          statuses[ds] = "red"
        } else {
          statuses[ds] = baseStatus
        }
      }
    }
    return statuses
  }, [data, year, today, nowMs, customThresholds])

  // Stats
  const stats = useMemo(() => {
    const vals = Object.values(dateStatuses)
    return {
      green: vals.filter(v => v === "green" || v === "green+orange").length,
      orange: vals.filter(v => v === "orange" || v === "green+orange").length,
      red: vals.filter(v => v === "red").length,
      blue: todayReceivedDates.size,
      total: vals.length,
    }
  }, [dateStatuses, todayReceivedDates])

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2"><Skeleton className="h-5 w-24" /></CardHeader>
            <CardContent><Skeleton className="h-40 w-full" /></CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={loadData}>Riprova</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setYear(y => y - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-lg font-bold tabular-nums">{year}</span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setYear(y => y + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => setYear(new Date().getFullYear())}>
            Oggi
          </Button>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          {stats.blue > 0 && (
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-500 animate-pulse" />
              <span className="font-medium text-blue-700">Ricevute oggi ({stats.blue})</span>
            </span>
          )}
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            Prenotazione ({stats.green})
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            Cancellazione ({stats.orange})
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
            Data ferma ({stats.red})
          </span>
        </div>
      </div>

      {/* Spiegazione e soglie */}
      <div className="rounded-lg border border-dashed bg-muted/30 overflow-hidden">
        <div className="p-3">
          <p className="text-xs font-semibold mb-1.5">Come leggere il calendario</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-[11px] text-muted-foreground leading-relaxed">
            <div className="flex items-start gap-2">
              <span className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0" />
              <span><strong className="text-emerald-700">Verde</strong> - Almeno una prenotazione attiva copre questa data di soggiorno.</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-1 h-2.5 w-2.5 rounded-full bg-amber-500 shrink-0" />
              <span><strong className="text-amber-700">Arancione</strong> - Una cancellazione copriva questa data (potrebbe esserci anche una prenotazione attiva).</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-1 h-2.5 w-2.5 rounded-full bg-red-500 shrink-0" />
              <span><strong className="text-red-700">Rosso (Data ferma)</strong> - Ci sono camere disponibili ma nessuna nuova prenotazione ricevuta entro la soglia prevista. La soglia si adatta alla distanza: piu' la data e' vicina, piu' e' esigente.</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-1 h-2.5 w-2.5 rounded-full bg-blue-500 shrink-0" />
              <span><strong className="text-blue-700">Blu (pulsante)</strong> - Una nuova prenotazione e' stata ricevuta oggi per questa data.</span>
            </div>
          </div>
        </div>

        {/* Toggle soglie */}
        <div className="border-t px-3 py-2 flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            Le date lontane oltre 6 mesi non vengono segnalate come ferme (e' troppo presto per preoccuparsi).
          </p>
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Suggeritore soglie basato sui dati reali (lead time) */}
            <Popover
              open={suggestOpen}
              onOpenChange={(open) => {
                setSuggestOpen(open)
                if (open) fetchLeadStats()
              }}
            >
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5">
                  <Lightbulb className="h-3.5 w-3.5" />
                  Suggerisci soglie
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0">
                <ThresholdSuggestion
                  loading={leadLoading}
                  error={leadError}
                  stats={leadStats}
                  onApply={(values) => {
                    setCustomThresholds(values)
                    saveCustomThresholds(values)
                    setShowThresholdSettings(true)
                    setSuggestOpen(false)
                  }}
                />
              </PopoverContent>
            </Popover>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={() => setShowThresholdSettings(!showThresholdSettings)}
            >
              <Settings2 className="h-3.5 w-3.5" />
              {showThresholdSettings ? "Chiudi soglie" : "Personalizza soglie"}
            </Button>
          </div>
        </div>

        {/* Soglie personalizzabili */}
        {showThresholdSettings && (
          <div className="border-t px-3 py-3 bg-background/50">
            <p className="text-xs font-semibold mb-1">Soglie &quot;Data Ferma&quot;</p>
            <p className="text-[11px] text-muted-foreground mb-2 leading-relaxed">
              Per ogni fascia di distanza, imposta dopo quanti giorni senza nuove prenotazioni una data viene segnalata come &quot;ferma&quot; (rossa).
              Valori piu' bassi = allarme piu' sensibile.
            </p>
            {/* Rimando alle Analytics per calibrare le soglie sui propri KPI reali */}
            <div className="mb-3 flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-2">
              <CalendarClock className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Non sai quali valori impostare? Guarda la{" "}
                <Link
                  href="/dati/analytics"
                  className="font-medium text-primary underline underline-offset-2 hover:no-underline"
                >
                  Finestra di prenotazione in Analytics
                </Link>{" "}
                per scoprire con quanto anticipo prenotano i tuoi ospiti e calibrare queste soglie sui tuoi KPI reali.
              </p>
            </div>
            <div className="space-y-2">
              {STALE_THRESHOLD_BANDS.map((band, i) => {
                const currentValue = customThresholds?.[i] ?? band.defaultDays
                const isCustom = customThresholds?.[i] !== undefined && customThresholds[i] !== band.defaultDays
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-[11px] text-muted-foreground w-32 shrink-0">{band.label}</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={1}
                        max={band.maxDistance === Infinity ? 60 : Math.min(band.maxDistance, 60)}
                        value={currentValue}
                        onChange={(e) => {
                          const newValues = STALE_THRESHOLD_BANDS.map((b, j) =>
                            j === i ? Number(e.target.value) : (customThresholds?.[j] ?? b.defaultDays)
                          )
                          setCustomThresholds(newValues)
                          saveCustomThresholds(newValues)
                        }}
                        className="w-24 h-1.5 accent-red-500"
                      />
                      <span className="text-xs font-mono font-semibold w-8 text-center tabular-nums">
                        {currentValue}g
                      </span>
                    </div>
                    {isCustom && (
                      <span className="text-[9px] text-muted-foreground">(default: {band.defaultDays}g)</span>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="flex items-center gap-2 mt-3">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  setCustomThresholds(null)
                  localStorage.removeItem(STORAGE_KEY)
                }}
              >
                Ripristina default
              </Button>
              {customThresholds && (
                <span className="text-[10px] text-muted-foreground">Soglie personalizzate attive</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 12 months */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 12 }).map((_, monthIdx) => (
          <MonthCalendar
            key={monthIdx}
            year={year}
            month={monthIdx}
            dateStatuses={dateStatuses}
            todayReceivedDates={todayReceivedDates}
            data={data}
            today={today}
            totalRooms={data?.totalRooms || 0}
            openPopover={openPopover}
            setOpenPopover={setOpenPopover}
            customThresholds={customThresholds}
          />
        ))}
      </div>
    </div>
  )
}

// ---------- Month Component ----------

function MonthCalendar({
  year, month, dateStatuses, todayReceivedDates, data, today, totalRooms, openPopover, setOpenPopover, customThresholds,
}: {
  year: number; month: number; dateStatuses: Record<string, string>
  todayReceivedDates: Set<string>
  data: CalendarData | null; today: string; totalRooms: number
  openPopover: string | null; setOpenPopover: (d: string | null) => void
  customThresholds: number[] | null
}) {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  let greenCount = 0, orangeCount = 0, redCount = 0
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    const st = dateStatuses[ds]
    if (st === "green" || st === "green+orange") greenCount++
    if (st === "orange" || st === "green+orange") orangeCount++
    if (st === "red") redCount++
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-1 pt-3 px-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">{MONTH_NAMES[month]}</CardTitle>
          <div className="flex items-center gap-1.5">
            {greenCount > 0 && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 text-emerald-700 border-emerald-300 bg-emerald-50">{greenCount}</Badge>
            )}
            {orangeCount > 0 && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-700 border-amber-300 bg-amber-50">{orangeCount}</Badge>
            )}
            {redCount > 0 && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 text-red-700 border-red-300 bg-red-50">{redCount}</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-2 pb-2 pt-1">
        <div className="grid grid-cols-7 gap-0 mb-0.5">
          {DAY_HEADERS.map((dh) => (
            <div key={dh} className="text-center text-[9px] font-medium text-muted-foreground py-0.5">{dh}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0">
          {cells.map((day, idx) => {
            if (day === null) return <div key={`empty-${idx}`} className="h-8" />
            const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
            const status = dateStatuses[ds] || "none"
            const isToday = ds === today
            const info = data?.dates[ds]
            const isReceivedToday = todayReceivedDates.has(ds)

            return (
              <Popover key={ds} open={openPopover === ds} onOpenChange={(open) => setOpenPopover(open ? ds : null)}>
                <PopoverTrigger asChild>
                  <button className={`relative h-8 w-full flex flex-col items-center justify-center rounded transition-colors ${isToday ? "ring-1 ring-foreground font-bold" : ""} ${ds < today ? "opacity-60" : ""} ${isReceivedToday ? "bg-blue-50" : ""} hover:bg-muted/60`}>
                    {isReceivedToday && (
                      <span className="absolute top-0.5 right-0.5 h-[6px] w-[6px] rounded-full bg-blue-500 animate-pulse" />
                    )}
                    <span className="text-[10px] leading-none">{day}</span>
                    <div className="flex items-center gap-px mt-0.5 h-[5px]">
                      {isReceivedToday && (
                        <span className="h-[5px] w-[5px] rounded-full bg-blue-500 animate-pulse" />
                      )}
                      {(status === "green" || status === "green+orange") && (
                        <span className="h-[5px] w-[5px] rounded-full bg-emerald-500" />
                      )}
                      {(status === "orange" || status === "green+orange") && (
                        <span className="h-[5px] w-[5px] rounded-full bg-amber-500" />
                      )}
                      {status === "red" && (
                        <span className="h-[5px] w-[5px] rounded-full bg-red-500" />
                      )}
                    </div>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="center" side="top">
                  <DateTooltip dateStr={ds} info={info || null} totalRooms={totalRooms} status={status} isReceivedToday={isReceivedToday} customThresholds={customThresholds} />
                </PopoverContent>
              </Popover>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------- Date Tooltip ----------

function DateTooltip({
  dateStr, info, totalRooms, status, isReceivedToday = false, customThresholds = null,
}: {
  dateStr: string; info: DateInfo | null; totalRooms: number; status: string; isReceivedToday?: boolean; customThresholds?: number[] | null
}) {
  const d = new Date(dateStr + "T12:00:00")
  const formatted = d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
  const revpor = info && info.rn > 0 ? Math.round(info.rev / info.rn) : 0

  return (
    <div className="divide-y">
      {/* Header */}
      <div className="p-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold capitalize">{formatted}</p>
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
        </div>

        {/* Badges */}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {isReceivedToday && (
            <Badge className="bg-blue-100 text-blue-800 border-blue-300 text-[10px] animate-pulse">
              Ricevuta oggi
            </Badge>
          )}
          {info && info.bc > 0 && (
            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px]">
              {info.bc} prenotaz. attive
            </Badge>
          )}
          {info && info.cc > 0 && (
            <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px]">
              {info.cc} cancellaz.
            </Badge>
          )}
          {status === "red" && (
            <Badge className="bg-red-100 text-red-800 border-red-300 text-[10px]">
              Data ferma
            </Badge>
          )}
          {(!info || (info.bc === 0 && info.cc === 0)) && status !== "red" && (
            <span className="text-[10px] text-muted-foreground">Nessuna attivita</span>
          )}
        </div>

        {/* Disponibilita */}
        {info && info.avail >= 0 && (
          <p className="text-[10px] text-muted-foreground mt-1">
            Disponibilita: {info.avail} / {info.inv} camere
          </p>
        )}

        {/* Messaggio data ferma: soglia KPI superata + ultima prenotazione */}
        {status === "red" && (
          <div className="mt-2 rounded bg-red-50 border border-red-200 px-2 py-1.5 space-y-1.5">
            {(() => {
              const stayDateMs = new Date(dateStr + "T12:00:00").getTime()
              const distanceDays = Math.max(0, Math.floor((stayDateMs - Date.now()) / 86400000))
              const threshold = getStaleThresholdDays(distanceDays, customThresholds)
              // Fallback: derive last received from items if lbr is null
              const lastReceived = info?.lbr
                || info?.items?.filter((item: any) => !item.cx)?.sort((a: any, b: any) => (b.bd || "").localeCompare(a.bd || ""))?.[0]?.bd
                || null

              // Trova l'ultima prenotazione ricevuta (item con bd piu' recente)
              const lastBookingItem = info?.items
                ?.filter((item: any) => !item.cx)
                ?.sort((a: any, b: any) => (b.bd || "").localeCompare(a.bd || ""))
                ?.[0]
                || info?.items?.sort((a: any, b: any) => (b.bd || "").localeCompare(a.bd || ""))?.[0]

              const diffDays = lastReceived
                ? Math.floor((Date.now() - new Date(lastReceived + "T12:00:00").getTime()) / 86400000)
                : null

              return (
                <>
                  <p className="text-[11px] text-red-800 leading-relaxed font-medium">
                    Soglia KPI superata: per una data a {distanceDays} giorni, la soglia e' di {threshold} giorni senza nuove prenotazioni.
                    {diffDays !== null && lastReceived && (
                      <> Ultima prenotazione ricevuta {diffDays} giorni fa ({new Date(lastReceived + "T12:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}).</>
                    )}
                    {diffDays === null && (
                      <> Nessuna prenotazione ricevuta per questa data in questo periodo.</>
                    )}
                  </p>
                  {lastBookingItem && (
                    <div className="text-[10px] text-red-700/80 leading-relaxed">
                      <p className="font-medium">Ultima prenotazione:</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="font-medium">{lastBookingItem.g !== "-" ? lastBookingItem.g : "Ospite"}</span>
                        {lastBookingItem.ch !== "-" && (
                          <span className="bg-red-100 px-1 py-px rounded text-[9px]">{lastBookingItem.ch}</span>
                        )}
                        {lastBookingItem.n > 0 && (
                          <span>{lastBookingItem.n} notti</span>
                        )}
                        {lastBookingItem.t > 0 && (
                          <span>{Math.round(lastBookingItem.t).toLocaleString("it-IT")} EUR</span>
                        )}
                        {lastBookingItem.cx && (
                          <span className="text-amber-700 font-medium">(cancellata)</span>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        )}
      </div>

      {/* KPI summary */}
      {info && (info.bc > 0 || info.cc > 0) && (
        <div className="p-3 grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-[10px] text-muted-foreground">R/N</p>
            <p className="text-sm font-bold">{info.rn}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">RevPOR</p>
            <p className="text-sm font-bold">{revpor > 0 ? `${revpor}` : "-"}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Revenue</p>
            <p className="text-sm font-bold">{info.rev > 0 ? `${Math.round(info.rev)}` : "-"}</p>
          </div>
        </div>
      )}

      {/* Items list */}
      {info && info.items.length > 0 && (
        <div className="max-h-52 overflow-auto">
          <table className="w-full text-[10px]">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="text-left p-1.5 font-medium text-muted-foreground">Ospite</th>
                <th className="text-center p-1.5 font-medium text-muted-foreground">R/N</th>
                <th className="text-center p-1.5 font-medium text-muted-foreground">RevPOR</th>
                <th className="text-center p-1.5 font-medium text-muted-foreground">Anticipo</th>
                <th className="text-left p-1.5 font-medium text-muted-foreground">Ricevuta</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {info.items.map((item, i) => (
                <tr key={i} className={item.cx ? "bg-red-50/50" : ""}>
                  <td className="p-1.5">
                    <div className="flex items-center gap-1">
                      {item.cx && <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />}
                      {!item.cx && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />}
                      <span className="truncate max-w-[90px]">{item.g}</span>
                    </div>
                    <div className="text-muted-foreground ml-3">
                      {item.rt !== "-" && <span>{item.rt}</span>}
                      {item.ch !== "-" && <span className="ml-1">({item.ch})</span>}
                    </div>
                  </td>
                  <td className="p-1.5 text-center">{item.n}</td>
                  <td className="p-1.5 text-center">{item.ppn > 0 ? `${Math.round(item.ppn)}` : "-"}</td>
                  <td className="p-1.5 text-center">{item.ld > 0 ? `${item.ld}gg` : "-"}</td>
                  <td className="p-1.5">{item.bd !== "-" ? new Date(item.bd + "T12:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
