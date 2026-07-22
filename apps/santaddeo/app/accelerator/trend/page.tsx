"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import {
  format,
  startOfMonth,
  endOfMonth,
  addMonths,
  subMonths,
} from "date-fns"
import { it } from "date-fns/locale"
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  TrendingUp,
  Minus,
  BedDouble,
  CalendarDays,
  Tag,
  Users,
  ArrowUp,
  ArrowDown,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RateTrendChart, MiniSparkline, type TrendChartPoint } from "@/components/accelerator/rate-trend-chart"
import { DayDetailDialog, type DayDetail } from "@/components/accelerator/day-detail-dialog"
import { useVatView } from "@/lib/contexts/vat-view-context"

// Valore speciale del filtro tipologia = intera struttura (media tutte le camere)
const ALL_ROOM_TYPES = "__all__"

interface RoomType {
  id: string
  name: string
  min_occupancy?: number
  max_occupancy?: number
  capacity?: number
}

interface Rate {
  id: string
  name: string
  room_type_ids?: string[]
  applicable_room_type_ids?: string[] | null
}

interface DayTrend {
  date: string
  currentPrice: number | null
  startingPrice: number | null
  changeCount: number
  evolutionSeries: { timestamp: string; price: number }[]
  lastUpdated: string | null
  roomsSold: number | null
  roomTypeTotalRooms: number | null
  hotelRoomsOccupied: number | null
  hotelTotalRooms: number | null
  occupancyPct: number | null
  roomRevenue: number | null
  revpor: number | null
}

function formatDayLabel(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00")
  return format(d, "dd/MM", { locale: it })
}

function formatWeekday(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00")
  return format(d, "EEE", { locale: it })
}

export default function TrendTariffePage() {
  const { vatView } = useVatView()
  const [hotelId, setHotelId] = useState<string | null>(null)
  const [hotelName, setHotelName] = useState("")
  const [loading, setLoading] = useState(true)
  const [loadingTrend, setLoadingTrend] = useState(false)

  const [roomTypes, setRoomTypes] = useState<RoomType[]>([])
  const [rates, setRates] = useState<Rate[]>([])
  const [selectedRoomType, setSelectedRoomType] = useState<string>("")
  const [selectedRate, setSelectedRate] = useState<string>("")
  const [occupancy, setOccupancy] = useState<number>(2)
  const [currentMonth, setCurrentMonth] = useState(new Date())

  const [days, setDays] = useState<DayTrend[]>([])
  const [selectedDay, setSelectedDay] = useState<DayDetail | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  // 1. Hotel + selettori (tipi camera / tariffe) dalla stessa fonte della
  // griglia pricing, cosi' i dati sono coerenti con il tooltip esistente.
  useEffect(() => {
    let cancelled = false
    async function init() {
      try {
        const hotelRes = await fetch("/api/ui/selected-hotel", { cache: "no-store" })
        const hotelData = await hotelRes.json()
        if (cancelled) return
        if (hotelData.error || !hotelData.hotel) {
          setLoading(false)
          return
        }
        setHotelId(hotelData.hotel.id)
        setHotelName(hotelData.hotel.name)

        const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd")
        const monthEnd = format(endOfMonth(new Date()), "yyyy-MM-dd")
        const params = new URLSearchParams({
          hotel_id: hotelData.hotel.id,
          month_start: monthStart,
          month_end: monthEnd,
        })
        const gridRes = await fetch(`/api/accelerator/pricing-grid?${params}`, { cache: "no-store" })
        if (gridRes.ok) {
          const grid = await gridRes.json()
          if (cancelled) return
          const rts: RoomType[] = grid.roomTypes || []
          const rs: Rate[] = grid.rates || []
          setRoomTypes(rts)
          setRates(rs)
          if (rts.length > 0) setSelectedRoomType(rts[0].id)
          if (rs.length > 0) setSelectedRate(rs[0].id)
        }
      } catch (e) {
        console.error("[v0] TrendTariffe init error:", e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    init()
    return () => {
      cancelled = true
    }
  }, [])

  // Tariffe disponibili per la tipologia selezionata (se la tariffa specifica
  // una restrizione di camere). Default: tutte.
  const availableRates = useMemo(() => {
    if (!selectedRoomType || selectedRoomType === ALL_ROOM_TYPES) return rates
    return rates.filter((r) => {
      const restriction = r.applicable_room_type_ids || r.room_type_ids
      if (!restriction || restriction.length === 0) return true
      return restriction.includes(selectedRoomType)
    })
  }, [rates, selectedRoomType])

  // Se la tariffa selezionata non e' valida per la nuova camera, ripiega
  // sulla prima disponibile.
  useEffect(() => {
    if (availableRates.length === 0) return
    if (!availableRates.some((r) => r.id === selectedRate)) {
      setSelectedRate(availableRates[0].id)
    }
  }, [availableRates, selectedRate])

  // Opzioni occupanza in base alla tipologia.
  const occupancyOptions = useMemo(() => {
    // Intera struttura: unione delle occupanze di tutte le tipologie.
    if (selectedRoomType === ALL_ROOM_TYPES) {
      let min = Infinity
      let max = 0
      for (const rt of roomTypes) {
        min = Math.min(min, rt.min_occupancy ?? 1)
        max = Math.max(max, rt.max_occupancy ?? rt.capacity ?? 4)
      }
      if (!isFinite(min)) min = 1
      if (max < min) max = min
      const opts: number[] = []
      for (let i = min; i <= max; i++) opts.push(i)
      return opts.length > 0 ? opts : [1, 2, 3, 4]
    }
    const rt = roomTypes.find((r) => r.id === selectedRoomType)
    const min = rt?.min_occupancy ?? 1
    const max = rt?.max_occupancy ?? rt?.capacity ?? 4
    const opts: number[] = []
    for (let i = min; i <= Math.max(min, max); i++) opts.push(i)
    return opts.length > 0 ? opts : [1, 2, 3, 4]
  }, [roomTypes, selectedRoomType])

  useEffect(() => {
    if (occupancyOptions.length > 0 && !occupancyOptions.includes(occupancy)) {
      setOccupancy(occupancyOptions.includes(2) ? 2 : occupancyOptions[0])
    }
  }, [occupancyOptions, occupancy])

  // 2. Carica il trend per il range/selezione corrente.
  const loadTrend = useCallback(async () => {
    if (!hotelId || !selectedRoomType || !selectedRate) return
    setLoadingTrend(true)
    try {
      const params = new URLSearchParams({
        hotel_id: hotelId,
        room_type_id: selectedRoomType,
        rate_id: selectedRate,
        occupancy: String(occupancy),
        from: format(startOfMonth(currentMonth), "yyyy-MM-dd"),
        to: format(endOfMonth(currentMonth), "yyyy-MM-dd"),
      })
      if (vatView) params.set("vatView", vatView)
      const res = await fetch(`/api/accelerator/rate-trend?${params}`, { cache: "no-store" })
      if (res.ok) {
        const json = await res.json()
        setDays(json.days || [])
      } else {
        setDays([])
      }
    } catch (e) {
      console.error("[v0] TrendTariffe loadTrend error:", e)
      setDays([])
    } finally {
      setLoadingTrend(false)
    }
  }, [hotelId, selectedRoomType, selectedRate, occupancy, currentMonth, vatView])

  useEffect(() => {
    loadTrend()
  }, [loadTrend])

  // Dati per il grafico combinato.
  const chartData: TrendChartPoint[] = useMemo(
    () =>
      days.map((d) => ({
        date: d.date,
        label: formatDayLabel(d.date),
        price: d.currentPrice,
        occupancy: d.occupancyPct,
      })),
    [days],
  )

  // KPI riepilogo.
  const summary = useMemo(() => {
    const prices = days.map((d) => d.currentPrice).filter((p): p is number => p != null)
    const occs = days.map((d) => d.occupancyPct).filter((o): o is number => o != null)
    const totalChanges = days.reduce((acc, d) => acc + d.changeCount, 0)
    const avg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null
    const min = prices.length ? Math.min(...prices) : null
    const max = prices.length ? Math.max(...prices) : null
    const avgOcc = occs.length ? occs.reduce((a, b) => a + b, 0) / occs.length : null
    return { avg, min, max, avgOcc, totalChanges }
  }, [days])

  const selectedRoomTypeName =
    selectedRoomType === ALL_ROOM_TYPES
      ? "Intera struttura"
      : roomTypes.find((r) => r.id === selectedRoomType)?.name || ""
  const selectedRateName = rates.find((r) => r.id === selectedRate)?.name || ""

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!hotelId) {
    return (
      <div className="container py-10">
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nessuna struttura selezionata. Seleziona un hotel per vedere il trend tariffe.
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold text-balance">Trend Tariffe &amp; Occupazione</h1>
        </div>
        <p className="text-sm text-muted-foreground text-pretty">
          Storico evolutivo della tariffa e occupazione, giorno per giorno, per tipologia camera e
          piano tariffario. {hotelName && <span className="font-medium text-foreground">{hotelName}</span>}
        </p>
      </div>

      {/* Controlli */}
      <Card>
        <CardContent className="flex flex-col gap-4 py-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:flex lg:items-end lg:gap-4">
            <div className="flex flex-col gap-1">
              <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <BedDouble className="h-3.5 w-3.5" /> Tipologia camera
              </label>
              <Select value={selectedRoomType} onValueChange={setSelectedRoomType}>
                <SelectTrigger className="w-full lg:w-52">
                  <SelectValue placeholder="Seleziona camera" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_ROOM_TYPES}>Intera struttura</SelectItem>
                  {roomTypes.map((rt) => (
                    <SelectItem key={rt.id} value={rt.id}>
                      {rt.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Tag className="h-3.5 w-3.5" /> Tariffa
              </label>
              <Select value={selectedRate} onValueChange={setSelectedRate}>
                <SelectTrigger className="w-full lg:w-52">
                  <SelectValue placeholder="Seleziona tariffa" />
                </SelectTrigger>
                <SelectContent>
                  {availableRates.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Users className="h-3.5 w-3.5" /> Occupanti
              </label>
              <Select value={String(occupancy)} onValueChange={(v) => setOccupancy(Number(v))}>
                <SelectTrigger className="w-full lg:w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {occupancyOptions.map((o) => (
                    <SelectItem key={o} value={String(o)}>
                      {o} {o === 1 ? "ospite" : "ospiti"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Navigazione mese */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setCurrentMonth((m) => subMonths(m, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex min-w-36 items-center justify-center gap-2 text-sm font-medium capitalize">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              {format(currentMonth, "MMMM yyyy", { locale: it })}
            </div>
            <Button variant="outline" size="icon" onClick={() => setCurrentMonth((m) => addMonths(m, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="py-4">
            <div className="text-xs text-muted-foreground">Tariffa media</div>
            <div className="text-2xl font-bold">{summary.avg != null ? `€ ${summary.avg.toFixed(0)}` : "--"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-xs text-muted-foreground">Min / Max</div>
            <div className="text-2xl font-bold">
              {summary.min != null ? summary.min.toFixed(0) : "--"}
              <span className="text-muted-foreground"> / </span>
              {summary.max != null ? summary.max.toFixed(0) : "--"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-xs text-muted-foreground">Occupazione media</div>
            <div className="text-2xl font-bold">{summary.avgOcc != null ? `${summary.avgOcc.toFixed(0)}%` : "--"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-xs text-muted-foreground">Variazioni totali</div>
            <div className="text-2xl font-bold">{summary.totalChanges}</div>
          </CardContent>
        </Card>
      </div>

      {/* Grafico */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Andamento {selectedRoomTypeName && <span className="text-muted-foreground font-normal">· {selectedRoomTypeName}</span>}
            {selectedRateName && <span className="text-muted-foreground font-normal"> · {selectedRateName}</span>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingTrend ? (
            <div className="flex h-[320px] items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">
              Nessun dato per il periodo selezionato.
            </div>
          ) : (
            <RateTrendChart data={chartData} />
          )}
        </CardContent>
      </Card>

      {/* Tabella dettaglio */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Dettaglio giornaliero</CardTitle>
          <p className="text-xs text-muted-foreground">
            Clicca una riga per vedere l&apos;evoluzione di tariffa e occupazione di quel giorno nel tempo.
          </p>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-4 py-2 text-left font-medium">Data</th>
                  <th className="px-4 py-2 text-right font-medium">Occupazione</th>
                  <th className="px-4 py-2 text-right font-medium">Camere vendute</th>
                  <th className="px-4 py-2 text-right font-medium">RevPor</th>
                  <th className="px-4 py-2 text-right font-medium">Partenza</th>
                  <th className="px-4 py-2 text-right font-medium">Attuale</th>
                  <th className="px-4 py-2 text-right font-medium">Variazione</th>
                  <th className="px-4 py-2 text-center font-medium">Modifiche</th>
                  <th className="px-4 py-2 text-center font-medium">Evoluzione</th>
                </tr>
              </thead>
              <tbody>
                {loadingTrend && days.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                    </td>
                  </tr>
                ) : days.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                      Nessun dato per il periodo selezionato.
                    </td>
                  </tr>
                ) : (
                  days.map((d) => {
                    const diff =
                      d.startingPrice != null && d.currentPrice != null
                        ? d.currentPrice - d.startingPrice
                        : null
                    const pct =
                      diff != null && d.startingPrice && d.startingPrice > 0
                        ? (diff / d.startingPrice) * 100
                        : null
                    const isWeekend = [0, 6].includes(new Date(d.date + "T00:00:00").getDay())
                    return (
                      <tr
                        key={d.date}
                        onClick={() => {
                          setSelectedDay({
                            date: d.date,
                            currentPrice: d.currentPrice,
                            startingPrice: d.startingPrice,
                            changeCount: d.changeCount,
                            evolutionSeries: d.evolutionSeries,
                            occupancyPct: d.occupancyPct,
                            hotelRoomsOccupied: d.hotelRoomsOccupied,
                            hotelTotalRooms: d.hotelTotalRooms,
                          })
                          setDetailOpen(true)
                        }}
                        className={`cursor-pointer border-b border-border/50 hover:bg-accent/40 ${isWeekend ? "bg-muted/30" : ""}`}
                      >
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{formatDayLabel(d.date)}</span>
                            <span className="text-xs capitalize text-muted-foreground">{formatWeekday(d.date)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right">
                          {d.occupancyPct != null ? (
                            <Badge
                              variant="secondary"
                              className={
                                d.occupancyPct >= 80
                                  ? "bg-green-100 text-green-700 hover:bg-green-100"
                                  : d.occupancyPct >= 50
                                    ? "bg-amber-100 text-amber-700 hover:bg-amber-100"
                                    : "bg-muted text-muted-foreground"
                              }
                            >
                              {d.occupancyPct.toFixed(0)}%
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">--</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right text-muted-foreground">
                          {d.hotelRoomsOccupied != null && d.hotelTotalRooms != null
                            ? `${d.hotelRoomsOccupied}/${d.hotelTotalRooms}`
                            : d.roomsSold != null && d.roomTypeTotalRooms != null
                              ? `${d.roomsSold}/${d.roomTypeTotalRooms}`
                              : "--"}
                        </td>
                        <td className="px-4 py-2 text-right font-medium">
                          {d.revpor != null ? `€ ${d.revpor.toFixed(0)}` : "--"}
                        </td>
                        <td className="px-4 py-2 text-right text-muted-foreground">
                          {d.startingPrice != null ? `€ ${d.startingPrice.toFixed(0)}` : "--"}
                        </td>
                        <td className="px-4 py-2 text-right font-semibold">
                          {d.currentPrice != null ? `€ ${d.currentPrice.toFixed(0)}` : "--"}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {diff == null ? (
                            <span className="text-muted-foreground">--</span>
                          ) : Math.abs(diff) < 1 ? (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <Minus className="h-3 w-3" /> 0
                            </span>
                          ) : (
                            <span
                              className={`inline-flex items-center gap-1 font-medium ${diff > 0 ? "text-green-600" : "text-red-600"}`}
                            >
                              {diff > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                              {Math.abs(diff).toFixed(0)}
                              {pct != null && (
                                <span className="text-xs">
                                  ({diff > 0 ? "+" : ""}
                                  {pct.toFixed(1)}%)
                                </span>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-center">
                          {d.changeCount > 0 ? (
                            <Badge variant="outline">{d.changeCount}</Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex justify-center">
                            <MiniSparkline values={d.evolutionSeries.map((p) => p.price)} />
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <DayDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        hotelId={hotelId}
        day={selectedDay}
        roomTypeName={selectedRoomTypeName}
        rateName={selectedRateName}
      />
    </div>
  )
}
