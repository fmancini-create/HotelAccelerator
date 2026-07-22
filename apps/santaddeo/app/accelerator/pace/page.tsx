"use client"

import { useState, useEffect, useCallback } from "react"
import { format, addDays as addDaysFn } from "date-fns"
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  BedDouble,
  Euro,
  Gauge,
  ArrowUp,
  Lightbulb,
  Info,
  CalendarRange,
  LineChart,
  PieChart,
  HelpCircle,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { AddonLocked } from "@/components/accelerator/addon-locked"
import { BookingCurveChart, MonthlyPaceChart, type PaceMetric } from "@/components/accelerator/pace-charts"
import { CommissionSettingsDialog } from "@/components/accelerator/commission-settings-dialog"
import { PaceAnalyzerPanel } from "@/components/accelerator/pace-analyzer-panel"
import type { AnalyzedMonth, Anomaly } from "@/lib/pace/analyzer"
import { useVatView } from "@/lib/contexts/vat-view-context"

interface PaceTotals {
  rooms: number
  revenue: number
  adr: number
}
interface PaceData {
  range: { from: string; to: string; today: string; leadDays: number }
  forecast: {
    method: string
    rooms: number
    revenue: number
    otbRooms: number
    capacity: number | null
    occupancy: number | null
    otbOccupancy: number | null
    byDate: Array<{
      date: string
      capacity: number | null
      otbRooms: number
      otbOccupancy: number | null
      forecastRooms: number
      forecastOccupancy: number | null
      forecastRevenue: number
    }>
  }
  current: PaceTotals
  stly: PaceTotals
  variance: { roomsPct: number | null; revenuePct: number | null }
  pickup: {
    last1: { rooms: number; revenue: number }
    last3: { rooms: number; revenue: number }
    last7: { rooms: number; revenue: number }
    last14: { rooms: number; revenue: number }
    last30: { rooms: number; revenue: number }
  }
  pickupByDate: Array<{
    date: string
    roomsOtb: number
    revenueOtb: number
    pickup1Rooms: number
    pickup3Rooms: number
    pickup7Rooms: number
    pickup7Revenue: number
  }>
  byMonth: Array<{
    month: string
    rooms: number
    revenue: number
    adr: number
    stlyRooms: number
    stlyRevenue: number
    stlyAdr: number
    roomsVarPct: number | null
    revenueVarPct: number | null
  }>
  curve: Array<{ daysBefore: number; cyRooms: number; lyRooms: number; cyRevenue: number; lyRevenue: number }>
  analyzer?: {
    months: AnalyzedMonth[]
    anomalies: Anomaly[]
    trajectoryLookbackDays: number
  }
  channelMix: {
    totalRooms: number
    totalRevenue: number
    totalNetRevenue: number
    totalCommission: number
    directShare: number
    commissionIsEstimated: boolean
    channels: Array<{
      category: string
      bookings: number
      rooms: number
      revenue: number
      netRevenue: number
      commission: number
      adr: number
      revenueShare: number
      stlyRevenueShare: number | null
      shareDeltaPts: number | null
    }>
  }
}

const HORIZONS: Record<string, number> = {
  "30 giorni": 30,
  "90 giorni": 90,
  "180 giorni": 180,
  "365 giorni": 365,
}

const eur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n)
const num = (n: number) => new Intl.NumberFormat("it-IT").format(n)

/** Formatta una data ISO (YYYY-MM-DD) come "ven 12 giu" in italiano. */
const fmtDay = (iso: string) => {
  const d = new Date(iso + "T00:00:00")
  return d.toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "short" })
}

/** Colore barra/pallino per macro-canale: il diretto (margine pieno) in teal,
 *  le OTA in ambra (costano commissione), agenzie e altro in grigi. */
function channelBarColor(category: string): string {
  switch (category) {
    case "Diretto":
      return "bg-teal-600"
    case "OTA":
      return "bg-amber-500"
    case "Tour Operator / Agenzie":
      return "bg-slate-400"
    default:
      return "bg-slate-300"
  }
}

/** Delta camere colorato per il pickup (verde se aggiunte, rosso se disdette). */
function PickupDelta({ rooms }: { rooms: number }) {
  if (rooms === 0) return <span className="text-muted-foreground">—</span>
  const positive = rooms > 0
  return (
    <span className={`font-medium tabular-nums ${positive ? "text-green-600" : "text-red-600"}`}>
      {positive ? "+" : ""}
      {num(rooms)}
    </span>
  )
}

function VarBadge({ pct }: { pct: number | null }) {
  if (pct == null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" aria-hidden="true" /> n/d
      </span>
    )
  }
  const positive = pct >= 0
  const Icon = positive ? TrendingUp : TrendingDown
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${positive ? "text-green-600" : "text-red-600"}`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {positive ? "+" : ""}
      {pct.toFixed(1)}%
    </span>
  )
}

/**
 * Lettura automatica del pace: traduce camere/ricavo/ADR in una frase chiara,
 * cosi' un calo di CAMERE accompagnato da ADR piu' alto non viene letto come
 * "sto andando male" quando il RICAVO cresce.
 */
function buildInsight(data: PaceData): { tone: "positive" | "warning" | "neutral"; text: string } {
  const r = data.variance.roomsPct
  const rev = data.variance.revenuePct
  const adrPct =
    data.stly.adr > 0 ? ((data.current.adr - data.stly.adr) / data.stly.adr) * 100 : null
  const f = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`

  if (r == null || rev == null) {
    return {
      tone: "neutral",
      text: "Non c'è abbastanza storico dello stesso periodo dell'anno scorso per un confronto a parità di anticipo.",
    }
  }
  // caso tipico: meno notti ma prezzo più alto -> ricavo su
  if (rev >= 0 && r < 0) {
    return {
      tone: "positive",
      text: `Stai vendendo meno notti (${f(r)} camere) ma a un prezzo più alto${
        adrPct != null ? ` (ADR ${f(adrPct)})` : ""
      }: il ricavo già a libro è in crescita (${f(rev)}). Meno volume, più valore.`,
    }
  }
  if (rev >= 0 && r >= 0) {
    return {
      tone: "positive",
      text: `Ritmo in crescita su tutti i fronti: ${f(r)} camere e ${f(rev)} ricavo rispetto allo stesso anticipo dell'anno scorso.`,
    }
  }
  if (rev < 0 && r >= 0) {
    return {
      tone: "warning",
      text: `Più notti a libro (${f(r)} camere) ma a un prezzo più basso${
        adrPct != null ? ` (ADR ${f(adrPct)})` : ""
      }: il ricavo è sotto l'anno scorso (${f(rev)}). Attenzione alla tariffa.`,
    }
  }
  return {
    tone: "warning",
    text: `Ritmo sotto l'anno scorso: ${f(r)} camere e ${f(rev)} ricavo a parità di anticipo. Valuta azioni di spinta sulla domanda.`,
  }
}

function MetricToggle({ value, onChange }: { value: PaceMetric; onChange: (m: PaceMetric) => void }) {
  return (
    <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Metrica">
      <Button
        type="button"
        size="sm"
        variant={value === "rooms" ? "default" : "ghost"}
        className="h-7 px-3 text-xs"
        onClick={() => onChange("rooms")}
        aria-pressed={value === "rooms"}
      >
        Camere
      </Button>
      <Button
        type="button"
        size="sm"
        variant={value === "revenue" ? "default" : "ghost"}
        className="h-7 px-3 text-xs"
        onClick={() => onChange("revenue")}
        aria-pressed={value === "revenue"}
      >
        Ricavo
      </Button>
    </div>
  )
}

export default function PacePage() {
  const { vatView } = useVatView()
  const [hotelId, setHotelId] = useState<string | null>(null)
  const [hotelName, setHotelName] = useState("")
  const [loading, setLoading] = useState(true)
  const [loadingData, setLoadingData] = useState(false)
  const [locked, setLocked] = useState(false)
  const [horizon, setHorizon] = useState("90 giorni")
  const [metric, setMetric] = useState<PaceMetric>("rooms")
  const [data, setData] = useState<PaceData | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/ui/selected-hotel", { cache: "no-store" })
        const d = await res.json()
        if (cancelled) return
        if (d.error || !d.hotel) {
          setLoading(false)
          return
        }
        setHotelId(d.hotel.id)
        setHotelName(d.hotel.name)
      } catch {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const loadPace = useCallback(async () => {
    if (!hotelId) return
    setLoadingData(true)
    setLocked(false)
    try {
      const today = new Date()
      const to = format(addDaysFn(today, HORIZONS[horizon]), "yyyy-MM-dd")
      const params = new URLSearchParams({
        hotelId,
        from: format(today, "yyyy-MM-dd"),
        to,
      })
      if (vatView) params.set("vatView", vatView)
      const res = await fetch(`/api/accelerator/pace?${params}`, { cache: "no-store" })
      if (res.status === 403) {
        const body = await res.json()
        if (body.code === "ADDON_REQUIRED") setLocked(true)
        setData(null)
        return
      }
      if (!res.ok) {
        setData(null)
        return
      }
      setData(await res.json())
    } catch (e) {
      console.error("[pace] load error", e)
      setData(null)
    } finally {
      setLoadingData(false)
      setLoading(false)
    }
  }, [hotelId, horizon, vatView])

  useEffect(() => {
    if (hotelId) loadPace()
  }, [hotelId, horizon, vatView, loadPace])

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    )
  }

  if (locked) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <AddonLocked
          title="Booking Pace"
          addonType="booking_pace"
          description="Scopri se stai vendendo più velocemente dell'anno scorso, con on-the-books, pickup e curva di prenotazione."
          features={[
            "On-the-books per ogni notte futura",
            "Confronto con lo stesso momento dell'anno scorso (STLY)",
            "Pickup a 7 / 14 / 30 giorni",
            "Curva di prenotazione anno corrente vs anno scorso",
          ]}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-balance">Booking Pace</h1>
          <p className="text-sm text-muted-foreground text-pretty">
            {hotelName ? `${hotelName} — ` : ""}ritmo di prenotazione vs stesso periodo dell&apos;anno scorso
          </p>
        </div>
        <Select value={horizon} onValueChange={setHorizon}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.keys(HORIZONS).map((h) => (
              <SelectItem key={h} value={h}>
                Prossimi {h}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </header>

      {loadingData ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      ) : !data ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nessun dato di prenotazione disponibile per questa struttura nel periodo selezionato.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Lettura automatica */}
          {(() => {
            const insight = buildInsight(data)
            const styles =
              insight.tone === "positive"
                ? "border-teal-200 bg-teal-50 text-teal-900"
                : insight.tone === "warning"
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-border bg-muted/40 text-foreground"
            return (
              <div className={`flex items-start gap-3 rounded-lg border p-4 ${styles}`} role="status">
                <Lightbulb className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <p className="text-sm leading-relaxed text-pretty">{insight.text}</p>
              </div>
            )
          })()}

          {/* Analizzatore & anomalie */}
          {data.analyzer && (
            <PaceAnalyzerPanel
              months={data.analyzer.months}
              anomalies={data.analyzer.anomalies}
              trajectoryLookbackDays={data.analyzer.trajectoryLookbackDays}
            />
          )}

          {/* KPI principali */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Camere on-the-books</CardTitle>
                <BedDouble className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{num(data.current.rooms)}</div>
                <div className="mt-1 flex items-center gap-2">
                  <VarBadge pct={data.variance.roomsPct} />
                  <span className="text-xs text-muted-foreground">vs {num(data.stly.rooms)} anno scorso</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Ricavo on-the-books</CardTitle>
                <Euro className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{eur(data.current.revenue)}</div>
                <div className="mt-1 flex items-center gap-2">
                  <VarBadge pct={data.variance.revenuePct} />
                  <span className="text-xs text-muted-foreground">vs {eur(data.stly.revenue)}</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">ADR on-the-books</CardTitle>
                <Gauge className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{eur(data.current.adr)}</div>
                <div className="mt-1 flex items-center gap-2">
                  <VarBadge
                    pct={data.stly.adr > 0 ? ((data.current.adr - data.stly.adr) / data.stly.adr) * 100 : null}
                  />
                  <span className="text-xs text-muted-foreground">vs {eur(data.stly.adr)}</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Pickup ultimi 7 gg</CardTitle>
                <ArrowUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">+{num(data.pickup.last7.rooms)}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  1gg +{num(data.pickup.last1.rooms)} · 3gg +{num(data.pickup.last3.rooms)} · 30gg +
                  {num(data.pickup.last30.rooms)} camere
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Previsione di domanda (Demand Forecast) */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <LineChart className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <CardTitle className="text-base">Previsione di domanda</CardTitle>
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs text-muted-foreground">
                      <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
                      Come funziona
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80 text-sm">
                    <div className="space-y-3">
                      <p className="font-medium text-foreground">Come calcoliamo la previsione</p>
                      <p className="text-muted-foreground text-pretty">
                        Usiamo il metodo della <strong>curva di prenotazione</strong> (booking pace): confrontiamo a
                        che punto eri l&apos;anno scorso con dove sei oggi, allo stesso anticipo dall&apos;arrivo.
                      </p>
                      <ol className="list-decimal space-y-2 pl-4 text-muted-foreground">
                        <li>
                          Per ogni notte futura calcoliamo i <strong>giorni di anticipo</strong> rispetto
                          all&apos;arrivo.
                        </li>
                        <li>
                          Dallo storico dell&apos;anno scorso ricaviamo quale <strong>quota dell&apos;occupazione
                          finale</strong> era gia&apos; prenotata a quello stesso anticipo (es. a 30 giorni avevi gia&apos;
                          il 60% delle camere poi vendute).
                        </li>
                        <li>
                          Dividiamo le <strong>camere che hai già a libro oggi</strong> per quella quota. Esempio: 12
                          camere ÷ 0,60 = <strong>20 camere previste</strong>.
                        </li>
                        <li>
                          Il <strong>ricavo previsto</strong> moltiplica le camere previste per l&apos;ADR attuale di
                          quella notte.
                        </li>
                      </ol>
                      <div className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
                        <p className="font-medium text-foreground">Limiti applicati</p>
                        <ul className="mt-1 list-disc space-y-0.5 pl-4">
                          <li>Mai oltre la capacità reale vendibile della notte.</li>
                          <li>Mai sotto le camere già prenotate.</li>
                          <li>
                            Se manca lo storico dell&apos;anno scorso, la previsione resta vicina all&apos;on-the-books
                            attuale.
                          </li>
                        </ul>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        È una stima statistica: assume che il ritmo di riempimento di quest&apos;anno somigli a quello
                        dell&apos;anno scorso. Eventi o strategie di prezzo diverse possono scostare il risultato.
                      </p>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <p className="mt-1 text-sm text-muted-foreground text-pretty">
                Occupazione e camere attese a fine periodo, stimate dall&apos;on-the-books attuale proiettato con la
                curva di prenotazione dell&apos;anno scorso (capacita&apos; reale come tetto). E&apos; una stima per
                anticipare dove riempirai e dove rischi di restare scoperto.
              </p>
            </CardHeader>
            <CardContent>
              {/* Riepilogo forecast */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <div className="text-xs text-muted-foreground">Camere previste</div>
                  <div className="text-2xl font-semibold tabular-nums">{num(data.forecast.rooms)}</div>
                  <div className="text-xs text-muted-foreground">ora a libro {num(data.forecast.otbRooms)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Ricavo previsto</div>
                  <div className="text-2xl font-semibold tabular-nums">{eur(data.forecast.revenue)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Occupazione prevista</div>
                  <div className="text-2xl font-semibold tabular-nums">
                    {data.forecast.occupancy != null ? `${data.forecast.occupancy}%` : "—"}
                  </div>
                  {data.forecast.otbOccupancy != null && (
                    <div className="text-xs text-muted-foreground">ora {data.forecast.otbOccupancy}%</div>
                  )}
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Pickup atteso</div>
                  <div className="text-2xl font-semibold tabular-nums text-green-600">
                    +{num(Math.max(0, data.forecast.rooms - data.forecast.otbRooms))}
                  </div>
                  <div className="text-xs text-muted-foreground">camere da acquisire</div>
                </div>
              </div>

              {/* Dettaglio per notte: solo notti con pickup residuo atteso */}
              {(() => {
                const rows = data.forecast.byDate.filter((r) => r.forecastRooms > r.otbRooms)
                if (rows.length === 0) {
                  return (
                    <p className="mt-4 text-sm text-muted-foreground">
                      Nessun pickup residuo atteso: le notti del periodo sono gia&apos; al livello previsto dalla
                      curva storica.
                    </p>
                  )
                }
                return (
                  <div className="mt-4 max-h-[420px] overflow-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-card">
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="px-3 py-2 font-medium">Notte</th>
                          <th className="px-3 py-2 font-medium text-right">Occ. ora</th>
                          <th className="px-3 py-2 font-medium text-right">Occ. prevista</th>
                          <th className="px-3 py-2 font-medium text-right">Camere ora</th>
                          <th className="px-3 py-2 font-medium text-right">Camere previste</th>
                          <th className="px-3 py-2 font-medium text-right">Pickup atteso</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => {
                          const exp = r.forecastRooms - r.otbRooms
                          const high = r.forecastOccupancy != null && r.forecastOccupancy >= 90
                          return (
                            <tr key={r.date} className="border-b last:border-0">
                              <td className="px-3 py-2 capitalize">{fmtDay(r.date)}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                                {r.otbOccupancy != null ? `${r.otbOccupancy}%` : "—"}
                              </td>
                              <td
                                className={`px-3 py-2 text-right tabular-nums font-medium ${
                                  high ? "text-green-600" : ""
                                }`}
                              >
                                {r.forecastOccupancy != null ? `${r.forecastOccupancy}%` : "—"}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                                {num(r.otbRooms)}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">{num(r.forecastRooms)}</td>
                              <td className="px-3 py-2 text-right tabular-nums font-medium text-green-600">
                                +{num(exp)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              })()}
            </CardContent>
          </Card>

          {/* Pickup per data di soggiorno */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CalendarRange className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <CardTitle className="text-base">Pickup per data di soggiorno</CardTitle>
              </div>
              <p className="mt-1 text-sm text-muted-foreground text-pretty">
                Le notti future che hanno avuto movimenti di recente: camere aggiunte (verde) o disdette (rosso)
                negli ultimi 1, 3 e 7 giorni. Ti dice <strong>dove</strong> si sta concentrando (o sgonfiando) la
                domanda, per intervenire sui prezzi delle date giuste.
              </p>
            </CardHeader>
            <CardContent>
              {data.pickupByDate.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nessun movimento di prenotazione negli ultimi 7 giorni per le notti del periodo selezionato.
                </p>
              ) : (
                <div className="max-h-[480px] overflow-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Notte</th>
                        <th className="px-3 py-2 font-medium text-right">+1 gg</th>
                        <th className="px-3 py-2 font-medium text-right">+3 gg</th>
                        <th className="px-3 py-2 font-medium text-right">+7 gg</th>
                        <th className="px-3 py-2 font-medium text-right">Ricavo +7gg</th>
                        <th className="px-3 py-2 font-medium text-right">Camere OTB</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.pickupByDate.map((row) => (
                        <tr key={row.date} className="border-b last:border-0">
                          <td className="px-3 py-2 capitalize">{fmtDay(row.date)}</td>
                          <td className="px-3 py-2 text-right">
                            <PickupDelta rooms={row.pickup1Rooms} />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <PickupDelta rooms={row.pickup3Rooms} />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <PickupDelta rooms={row.pickup7Rooms} />
                          </td>
                          <td
                            className={`px-3 py-2 text-right tabular-nums ${
                              row.pickup7Revenue > 0
                                ? "text-green-600"
                                : row.pickup7Revenue < 0
                                  ? "text-red-600"
                                  : "text-muted-foreground"
                            }`}
                          >
                            {row.pickup7Revenue === 0
                              ? "—"
                              : `${row.pickup7Revenue > 0 ? "+" : ""}${eur(row.pickup7Revenue)}`}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                            {num(row.roomsOtb)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Mix per canale (segmentazione) */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <PieChart className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <CardTitle className="text-base">Mix per canale</CardTitle>
                </div>
                {hotelId && <CommissionSettingsDialog hotelId={hotelId} onSaved={loadPace} />}
              </div>
              <p className="mt-1 text-sm text-muted-foreground text-pretty">
                Da dove arriva l&apos;on-the-books del periodo: diretto, OTA, agenzie. Il <strong>ricavo netto</strong>{" "}
                è al netto delle commissioni, e la variazione di quota è vs lo stesso anticipo dell&apos;anno scorso.
              </p>
            </CardHeader>
            <CardContent>
              {data.channelMix.channels.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nessuna prenotazione a libro nel periodo selezionato.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div>
                      <div className="text-xs text-muted-foreground">Quota diretto</div>
                      <div className="text-2xl font-semibold tabular-nums">
                        {Math.round(data.channelMix.directShare * 100)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Ricavo lordo</div>
                      <div className="text-2xl font-semibold tabular-nums">{eur(data.channelMix.totalRevenue)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Commissioni</div>
                      <div className="text-2xl font-semibold tabular-nums text-red-600">
                        −{eur(data.channelMix.totalCommission)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Ricavo netto</div>
                      <div className="text-2xl font-semibold tabular-nums">{eur(data.channelMix.totalNetRevenue)}</div>
                    </div>
                  </div>

                  <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full">
                    {data.channelMix.channels.map((c) => (
                      <div
                        key={c.category}
                        className={channelBarColor(c.category)}
                        style={{ width: `${Math.max(0, c.revenueShare * 100)}%` }}
                        title={`${c.category}: ${Math.round(c.revenueShare * 100)}%`}
                      />
                    ))}
                  </div>

                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="py-2 pr-4 font-medium">Canale</th>
                          <th className="py-2 pr-4 font-medium text-right">Quota</th>
                          <th className="py-2 pr-4 font-medium text-right">vs LY</th>
                          <th className="py-2 pr-4 font-medium text-right">Camere</th>
                          <th className="py-2 pr-4 font-medium text-right">ADR</th>
                          <th className="py-2 pr-4 font-medium text-right">Commissioni</th>
                          <th className="py-2 font-medium text-right">Ricavo netto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.channelMix.channels.map((c) => (
                          <tr key={c.category} className="border-b last:border-0">
                            <td className="py-2 pr-4">
                              <span className="inline-flex items-center gap-2">
                                <span className={`h-2.5 w-2.5 rounded-full ${channelBarColor(c.category)}`} />
                                {c.category}
                              </span>
                            </td>
                            <td className="py-2 pr-4 text-right tabular-nums">{Math.round(c.revenueShare * 100)}%</td>
                            <td className="py-2 pr-4 text-right">
                              {c.shareDeltaPts == null ? (
                                <span className="text-xs text-muted-foreground">n/d</span>
                              ) : (
                                <span
                                  className={`text-xs font-medium ${
                                    c.shareDeltaPts >= 0 ? "text-green-600" : "text-red-600"
                                  }`}
                                >
                                  {c.shareDeltaPts >= 0 ? "+" : ""}
                                  {c.shareDeltaPts.toFixed(1)} pt
                                </span>
                              )}
                            </td>
                            <td className="py-2 pr-4 text-right tabular-nums">{num(c.rooms)}</td>
                            <td className="py-2 pr-4 text-right tabular-nums">{eur(c.adr)}</td>
                            <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                              {c.commission > 0 ? `−${eur(c.commission)}` : "—"}
                            </td>
                            <td className="py-2 text-right tabular-nums font-medium">{eur(c.netRevenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {data.channelMix.commissionIsEstimated && (
                    <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>
                        Il PMS non fornisce le commissioni per alcune prenotazioni: per queste è applicata la stima di
                        default (OTA 15%, agenzie/TO 12%). Puoi impostare le percentuali per ogni canale con il pulsante{" "}
                        <strong>Commissioni</strong>.
                      </span>
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Curva di prenotazione */}
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-base">Curva di prenotazione</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground text-pretty">
                  Accumulo {metric === "revenue" ? "del ricavo" : "delle camere"} man mano che ci si avvicina al
                  periodo. La linea tratteggiata è l&apos;anno scorso <strong>allo stesso anticipo</strong> (non il
                  totale finale): se la linea piena le sta sopra, stai vendendo prima dell&apos;anno scorso.
                </p>
              </div>
              <MetricToggle value={metric} onChange={setMetric} />
            </CardHeader>
            <CardContent>
              <BookingCurveChart data={data.curve} metric={metric} />
            </CardContent>
          </Card>

          {/* Pace per mese */}
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-base">On-the-books per mese</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {metric === "revenue" ? "Ricavo già a libro" : "Camere già prenotate"} per ogni mese vs stesso
                  anticipo dell&apos;anno scorso (STLY)
                </p>
                <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Per il mese in corso conta solo le notti{" "}
                    <span className="font-medium text-foreground">da oggi in avanti</span> (on-the-books futuro),
                    quindi i valori sono più bassi di <span className="font-medium text-foreground">Obiettivi</span>,
                    che invece somma <span className="font-medium text-foreground">l&apos;intero mese</span> incluse le
                    notti già trascorse.
                  </span>
                </p>
              </div>
              <MetricToggle value={metric} onChange={setMetric} />
            </CardHeader>
            <CardContent>
              <MonthlyPaceChart data={data.byMonth} metric={metric} />
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Mese</th>
                      <th className="py-2 pr-4 font-medium text-right">Camere</th>
                      <th className="py-2 pr-4 font-medium text-right">vs LY</th>
                      <th className="py-2 pr-4 font-medium text-right">Ricavo</th>
                      <th className="py-2 pr-4 font-medium text-right">vs LY</th>
                      <th className="py-2 pr-4 font-medium text-right">ADR</th>
                      <th className="py-2 pr-4 font-medium text-right">ADR LY</th>
                      <th className="py-2 font-medium text-right">Δ RevPOR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byMonth.map((m) => (
                      <tr key={m.month} className="border-b last:border-0">
                        <td className="py-2 pr-4">{m.month}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{num(m.rooms)}</td>
                        <td className="py-2 pr-4 text-right">
                          <VarBadge pct={m.roomsVarPct} />
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">{eur(m.revenue)}</td>
                        <td className="py-2 pr-4 text-right">
                          <VarBadge pct={m.revenueVarPct} />
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">{eur(m.adr)}</td>
                        <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                          {m.stlyAdr > 0 ? eur(m.stlyAdr) : "—"}
                        </td>
                        <td className="py-2 text-right">
                          <VarBadge
                            pct={m.stlyAdr > 0 ? ((m.adr - m.stlyAdr) / m.stlyAdr) * 100 : null}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
