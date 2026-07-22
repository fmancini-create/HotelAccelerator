"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { format } from "date-fns"
import { it } from "date-fns/locale"
import Link from "next/link"
import {
  ChevronLeft, ChevronRight, Calendar, Bed, BedDouble, TrendingUp,
  DollarSign, AlertTriangle, ArrowUp, ArrowDown, Users, XCircle,
  ArrowLeft, Hotel,
} from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { getSupabaseClient } from "@/lib/supabase/client"
import { accommodationReplace, getAccommodationLabel } from "@/lib/utils/accommodation-labels"

/* ---------- types ---------- */
interface HotelT { id: string; name: string; accommodation_type?: string; total_rooms?: number }
interface RoomType { id: string; name: string; pms_room_type_id: string; total_rooms: number; is_active: boolean; display_order: number }
interface PrevYear {
  date: string; occupancyRate: number; occupiedRooms: number; totalRooms: number; availableRooms: number
  totalProduction: number; todayProduction: number; roomProductionToday: number
  arrivalsCount: number; arrivalsRoomNights: number; departuresCount: number; stayoversCount: number
  cancellationsCount: number; cancelledRoomNights: number; cancelledRevenue: number; revpcr: number
  newBookingsCount: number; newBookingsRoomNights: number; newBookingsRevenue: number; revpor: number
}
interface DData {
  accommodationType: string
  totalRooms: number; availableRooms: number; occupiedRooms: number; occupancyRate: number
  totalProduction: number; todayProduction: number; roomProductionToday: number
  arrivalsCount: number; arrivalsRoomNights: number; departuresCount: number; stayoversCount: number
  cancellationsCount: number; cancelledRoomNights: number; cancelledRevenue: number; revpcr: number
  grossBookingsCount: number; newBookingsCount: number; grossBookingsRoomNights: number; newBookingsRoomNights: number; grossBookingsRevenue: number; newBookingsRevenue: number; revpor: number
  avgBookingPickup: number; avgCancellationPickup: number
  roomTypeOccupancy: { name: string; totalRooms: number; available: number; occupied: number }[]
  prevYear: PrevYear | null
  hasAvailabilityData: boolean
}

/* ---------- helpers ---------- */
const eur = (n: number) => `\u20AC${n.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
function yoyPct(curr: number, prev: number | null | undefined): { pct: number; up: boolean } | null {
  if (prev == null || (prev === 0 && curr === 0)) return null
  const pct = prev > 0 ? ((curr - prev) / prev) * 100 : curr > 0 ? 100 : 0
  return { pct, up: pct >= 0 }
}

/* ---------- sub-components (V1 light style) ---------- */
function YoYBadge({ current, previous, previousValue, label, format: fmt = "number" }: { current: number; previous: number | null | undefined; previousValue?: number | null; label?: string; format?: "number" | "currency" }) {
  const y = yoyPct(current, previous)
  if (!y) return null
  const prevDisplay = previousValue != null ? previousValue : previous
  const prevStr = prevDisplay != null
    ? fmt === "currency" ? eur(prevDisplay) : prevDisplay.toLocaleString("it-IT", { maximumFractionDigits: 0 })
    : null
  return (
    <div className={`inline-flex items-center gap-1.5 text-sm font-semibold mt-2 ${y.up ? "text-emerald-600" : "text-red-600"}`}>
      {y.up ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
      <span>{Math.abs(y.pct).toFixed(0)}%</span>
      {prevStr && <span className="text-muted-foreground/70 font-normal">({prevStr})</span>}
      {label && <span className="text-muted-foreground/50 font-normal ml-0.5">vs {label}</span>}
    </div>
  )
}

function OccupancyRing({ pct, size = 170, stroke = 14 }: { pct: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (Math.min(pct, 100) / 100) * circ
  const color = pct >= 80 ? "#059669" : pct >= 50 ? "#d97706" : "#dc2626"
  return (
    <svg width={size} height={size} className="drop-shadow-md">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="transition-all duration-1000 ease-out"
      />
      <text x="50%" y="46%" textAnchor="middle" className="fill-gray-900 font-bold" style={{ fontSize: "2.4rem" }}>
        {pct.toFixed(0)}%
      </text>
      <text x="50%" y="66%" textAnchor="middle" className="fill-gray-500" style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Occupazione
      </text>
    </svg>
  )
}

function RoomTypeBars({ data }: { data: { name: string; totalRooms: number; occupied: number }[] }) {
  if (data.length === 0) return <p className="text-gray-400 text-sm">Nessun dato</p>
  return (
    <div className="space-y-2.5">
      {data.map((rt) => {
        const pct = rt.totalRooms > 0 ? (rt.occupied / rt.totalRooms) * 100 : 0
        return (
          <div key={rt.name}>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-700 truncate max-w-[200px]">{rt.name}</span>
              <span className="text-gray-500 tabular-nums text-xs">{rt.occupied}/{rt.totalRooms}</span>
            </div>
            <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${pct}%`,
                  background: pct >= 80 ? "#059669" : pct >= 50 ? "#d97706" : "#6366f1",
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ---------- main component ---------- */
export function DashboardV3Client({ hotels, initialHotelId, initialRoomTypes, userEmail }: {
  hotels: HotelT[]; initialHotelId: string; initialRoomTypes: RoomType[]; userEmail: string
}) {
  const [hotelId, setHotelId] = useState(initialHotelId)
  const [roomTypes, setRoomTypes] = useState(initialRoomTypes)
  const [data, setData] = useState<DData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const supabaseRef = useRef<ReturnType<typeof getSupabaseClient> | null>(null)
  const selectedDateStr = selectedDate.toLocaleDateString("sv-SE")
  const today = new Date().toLocaleDateString("sv-SE")
  const isToday = selectedDateStr === today
  const currentHotel = hotels.find(h => h.id === hotelId)
  const hotelName = currentHotel?.name || ""
  const accType = currentHotel?.accommodation_type || "camere"

  const getClient = useCallback(() => {
    if (!supabaseRef.current) supabaseRef.current = getSupabaseClient()
    return supabaseRef.current
  }, [])

  useEffect(() => {
    if (hotelId === initialHotelId) { setRoomTypes(initialRoomTypes); return }
    async function loadRt() {
      const sb = getClient()
      const { data: rt } = await sb.from("room_types")
        .select("id, name, pms_room_type_id, total_rooms, is_active, display_order")
        .eq("hotel_id", hotelId).eq("is_active", true).order("display_order", { ascending: true })
      setRoomTypes(rt || [])
    }
    loadRt()
  }, [hotelId, initialHotelId, initialRoomTypes, getClient])

  useEffect(() => {
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller

    async function load() {
      setLoading(true)
      try {
        const activeRt = roomTypes.filter(r => r.is_active)
        const activeIds = activeRt.map(r => r.id)

        console.log("[v0] Dashboard V3 - Fetching data for hotel:", hotelId, "date:", selectedDateStr)
        
        const [availRes, prodRes] = await Promise.all([
          activeIds.length > 0
            ? fetch(`/api/dashboard/availability?hotel_id=${hotelId}&date=${selectedDateStr}`, { signal: controller.signal }).then(r => r.json()).catch(() => ({ data: [] }))
            : { data: [] },
          fetch(`/api/dashboard/production?hotel_id=${hotelId}&date=${selectedDateStr}`, { signal: controller.signal })
            .then(r => {
              console.log("[v0] Production API response status:", r.status)
              return r.json()
            })
            .then(data => {
              console.log("[v0] Production API response data:", { totalProduction: data.totalProduction, todayProduction: data.todayProduction })
              return data
            })
            .catch(err => {
              console.log("[v0] Production API ERROR:", err)
              return {}
            }),
        ])

        let totalRooms = 0, availableRooms = 0, occupiedRooms = 0
        let hasAvail = false
        const todayAvail: { rooms_available: number; room_type_id: string; total_rooms: number }[] = []
        if (availRes.data?.length > 0) {
          hasAvail = true
          for (const r of availRes.data) {
            todayAvail.push({ rooms_available: r.rooms_available || 0, room_type_id: r.room_type_id, total_rooms: r.total_rooms || 0 })
            totalRooms += r.total_rooms || 0
            availableRooms += r.rooms_available || 0
          }
          occupiedRooms = totalRooms - availableRooms
        }
        if (totalRooms === 0) totalRooms = activeRt.reduce((s, rt) => s + (rt.total_rooms || 0), 0)

        // Fallback: when daily_availability is empty, calculate occupancy from bookings
        // arrivalsCount + stayoversCount = guests currently in house today
        if (!hasAvail && totalRooms > 0) {
          occupiedRooms = (prodRes.arrivalsCount || 0) + (prodRes.stayoversCount || 0)
          availableRooms = Math.max(0, totalRooms - occupiedRooms)
        }

        const roomTypeOcc = activeRt.map(rt => {
          const a = todayAvail.find(x => x.room_type_id === rt.id)
          const tot = a?.total_rooms || rt.total_rooms || 0
          const avail = a?.rooms_available || 0
          return { name: rt.name, totalRooms: tot, available: avail, occupied: Math.max(tot - avail, 0) }
        }).filter(r => r.totalRooms > 0)

        setData({
          totalRooms, availableRooms, occupiedRooms,
          // clamp a 100%: l'occupazione non puo' superare il 100% (vedi nota Obiettivi 27/06/2026).
          occupancyRate: totalRooms > 0 ? Math.min(100, (occupiedRooms / totalRooms) * 100) : 0,
          totalProduction: prodRes.totalProduction || 0,
          todayProduction: prodRes.todayProduction || 0,
          roomProductionToday: prodRes.roomProductionToday || 0,
          arrivalsCount: prodRes.arrivalsCount || 0,
          arrivalsRoomNights: prodRes.arrivalsRoomNights || 0,
          departuresCount: prodRes.departuresCount || 0,
          stayoversCount: prodRes.stayoversCount || 0,
          cancellationsCount: prodRes.cancellationsCount || 0,
          cancelledRoomNights: prodRes.cancelledRoomNights || 0,
          cancelledRevenue: prodRes.cancelledRevenue || 0,
          revpcr: prodRes.revpcr || 0,
  grossBookingsCount: prodRes.grossBookingsCount || 0,
  newBookingsCount: prodRes.newBookingsCount || 0,
  grossBookingsRoomNights: prodRes.grossBookingsRoomNights || 0,
  newBookingsRoomNights: prodRes.newBookingsRoomNights || 0,
  grossBookingsRevenue: prodRes.grossBookingsRevenue || 0,
  newBookingsRevenue: prodRes.newBookingsRevenue || 0,
          revpor: prodRes.revpor || 0,
          avgBookingPickup: prodRes.avgBookingPickup || 0,
          avgCancellationPickup: prodRes.avgCancellationPickup || 0,
          roomTypeOccupancy: roomTypeOcc,
          prevYear: prodRes.prevYear || null,
          hasAvailabilityData: hasAvail || occupiedRooms > 0 || totalRooms > 0,
        })
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === "AbortError") return
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    load()
    return () => controller.abort()
  }, [hotelId, roomTypes, selectedDateStr, getClient])

  const d = data
  const py = d?.prevYear
  const pyYear = py?.date ? new Date(py.date).getFullYear().toString() : ""
  const balance = (d?.grossBookingsRevenue || 0) - (d?.cancelledRevenue || 0)
  const netRN = (d?.grossBookingsRoomNights || 0) - (d?.cancelledRoomNights || 0)

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Top Bar -- V1 light style */}
      <header className="border-b bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-gray-400 hover:text-gray-700 transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-lg font-semibold tracking-tight text-gray-900">Dashboard <span className="text-gray-400">V3</span></h1>
          </div>
          <div className="flex items-center gap-3">
            <Select value={hotelId} onValueChange={setHotelId}>
              <SelectTrigger className="w-[200px] bg-white border-gray-200 text-sm">
                <Hotel className="h-4 w-4 mr-2 text-gray-400" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {hotels.map(h => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-xs text-gray-400 hidden md:inline">{userEmail}</span>
          </div>
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto px-4 md:px-8 py-6 space-y-6">
        {/* Date selector + Occupancy hero -- V2 layout, V1 colors */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left: Date + Occupancy ring */}
          <Card className="flex-1 border-gray-200 bg-white shadow-sm">
            <CardContent className="p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                {/* Date nav */}
                <div className="flex items-center gap-3">
                  <Button variant="outline" size="icon" className="h-9 w-9"
                    onClick={() => { const nd = new Date(selectedDate); nd.setDate(nd.getDate() - 1); setSelectedDate(nd) }}>
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <button className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-gray-200 bg-white hover:border-gray-300 transition-colors cursor-pointer shadow-sm">
                        <Calendar className="h-5 w-5 text-blue-500" />
                        <div className="text-left">
                          <span className="text-xl font-bold block text-gray-900">{format(selectedDate, "dd MMMM yyyy", { locale: it })}</span>
                          <span className="text-sm text-gray-500">{isToday ? "Oggi" : format(selectedDate, "EEEE", { locale: it })}</span>
                        </div>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent mode="single" selected={selectedDate} onSelect={(nd) => { if (nd) { setSelectedDate(nd); setDatePickerOpen(false) } }} initialFocus />
                    </PopoverContent>
                  </Popover>
                  <Button variant="outline" size="icon" className="h-9 w-9"
                    onClick={() => { const nd = new Date(selectedDate); nd.setDate(nd.getDate() + 1); setSelectedDate(nd) }}>
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                  {!isToday && (
                    <Button variant="ghost" size="sm" className="text-xs text-blue-600 hover:text-blue-700"
                      onClick={() => setSelectedDate(new Date())}>Oggi</Button>
                  )}
                </div>

                {/* Occupancy ring */}
                {loading ? (
                  <div className="h-[170px] w-[170px] rounded-full bg-gray-100 animate-pulse" />
                ) : d ? (
                  <div className="flex items-center gap-6">
                    <OccupancyRing pct={d.occupancyRate} />
                    <div className="space-y-1">
                      <div className="text-4xl font-bold text-gray-900">{d.occupiedRooms}<span className="text-gray-400 text-xl">/{d.totalRooms}</span></div>
                      <p className="text-base text-gray-500">{accommodationReplace("camere occupate", accType)}</p>
                      {py && <YoYBadge current={d.occupancyRate} previous={py.occupancyRate} label={pyYear} />}
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Room type bars */}
              {d && d.roomTypeOccupancy.length > 0 && (
                <div className="mt-6 pt-5 border-t">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Occupazione per tipologia</p>
                  <RoomTypeBars data={d.roomTypeOccupancy} />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right: Key metrics stack -- V1 card style */}
          <div className="w-full lg:w-[400px] space-y-4">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-[130px] rounded-xl bg-gray-100 animate-pulse" />)
            ) : d ? (
              <>
                <HoverCard>
                  <HoverCardTrigger asChild>
                    <Card className="cursor-pointer hover:border-emerald-300 transition-colors border-emerald-200 bg-emerald-50/50">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-base font-semibold text-emerald-700">Produzione Fiscale Mese</p>
                          <DollarSign className="h-7 w-7 text-emerald-500" />
                        </div>
                        <div className="text-4xl md:text-5xl font-bold text-emerald-800">{eur(d.totalProduction)}</div>
                        <p className="text-base text-emerald-600 mt-1">IVA esclusa</p>
                        <YoYBadge current={d.totalProduction} previous={py?.totalProduction} label={pyYear} format="currency" />
                      </CardContent>
                    </Card>
                  </HoverCardTrigger>
                  <HoverCardContent className="w-72">
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold">Produzione Fiscale Mese</h4>
                      <p className="text-xs text-muted-foreground">
                        Totale documenti fiscali emessi nel mese corrente (IVA esclusa). Dati dalla cassa fiscale / Scidoo.
                      </p>
                    </div>
                  </HoverCardContent>
                </HoverCard>

                <HoverCard>
                  <HoverCardTrigger asChild>
                    <Card className="cursor-pointer hover:border-indigo-300 transition-colors border-indigo-200 bg-indigo-50/50">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-base font-semibold text-indigo-700">Produzione Camere Oggi</p>
                          <Bed className="h-7 w-7 text-indigo-500" />
                        </div>
                        <div className="text-4xl md:text-5xl font-bold text-indigo-800">{eur(d.roomProductionToday)}</div>
                        <p className="text-base text-indigo-600 mt-1">{accommodationReplace("camere in casa nella data", accType)}</p>
                        <YoYBadge current={d.roomProductionToday} previous={py?.roomProductionToday} label={pyYear} format="currency" />
                      </CardContent>
                    </Card>
                  </HoverCardTrigger>
                  <HoverCardContent className="w-72">
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold">Produzione Camere</h4>
                      <p className="text-xs text-muted-foreground">
                        Somma dei prezzi giornalieri di tutte le prenotazioni attive per la data selezionata.
                      </p>
                    </div>
                  </HoverCardContent>
                </HoverCard>

                <HoverCard>
                  <HoverCardTrigger asChild>
                    <Card className="cursor-pointer hover:border-emerald-300 transition-colors border-emerald-200">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-base font-semibold text-muted-foreground">Produzione Fiscale Oggi</p>
                          <TrendingUp className="h-7 w-7 text-emerald-500" />
                        </div>
                        <div className="text-4xl md:text-5xl font-bold">{eur(d.todayProduction)}</div>
                        <p className="text-base text-muted-foreground mt-1">IVA esclusa</p>
                        <YoYBadge current={d.todayProduction} previous={py?.todayProduction} label={pyYear} format="currency" />
                      </CardContent>
                    </Card>
                  </HoverCardTrigger>
                  <HoverCardContent className="w-72">
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold">Produzione Fiscale Oggi</h4>
                      <p className="text-xs text-muted-foreground">
                        Documenti fiscali emessi nella data selezionata (IVA esclusa). Include ricavi, fatture e scontrini.
                      </p>
                    </div>
                  </HoverCardContent>
                </HoverCard>
              </>
            ) : null}
          </div>
        </div>

        {/* Rooms grid: Available / Occupied / Movements -- V1 card colors */}
        {d && !loading && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <HoverCard>
              <HoverCardTrigger asChild>
                <Card className="cursor-pointer hover:border-green-300 transition-colors border-green-200 bg-green-50/50">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-lg font-semibold text-green-700 mb-2">{accommodationReplace("Camere Disponibili", accType)}</p>
                        <div className="text-5xl font-bold text-green-700">{d.hasAvailabilityData ? d.availableRooms : 0}</div>
                        <p className="text-base text-green-600 mt-1">{d.hasAvailabilityData ? "vendibili oggi" : "dati non sincronizzati"}</p>
                        <YoYBadge current={d.availableRooms} previous={py?.availableRooms} label={pyYear} />
                      </div>
                      <Bed className="h-10 w-10 text-green-500" />
                    </div>
                  </CardContent>
                </Card>
              </HoverCardTrigger>
              <HoverCardContent className="w-72">
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Dettaglio per Tipologia</h4>
                  {d.roomTypeOccupancy.length > 0 ? d.roomTypeOccupancy.map((rt, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-muted-foreground truncate max-w-[180px]">{rt.name}</span>
                      <span className="font-medium">{rt.available} / {rt.totalRooms}</span>
                    </div>
                  )) : <p className="text-sm text-muted-foreground">Nessun dato</p>}
                </div>
              </HoverCardContent>
            </HoverCard>

            <HoverCard>
              <HoverCardTrigger asChild>
                <Card className="cursor-pointer hover:border-blue-300 transition-colors border-blue-200 bg-blue-50/50">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-lg font-semibold text-blue-700 mb-2">{accommodationReplace("Camere Occupate", accType)}</p>
                        <div className="text-5xl font-bold text-blue-700">{d.hasAvailabilityData ? d.occupiedRooms : 0}</div>
                        <p className="text-base text-blue-600 mt-1">{d.hasAvailabilityData ? `${d.occupancyRate.toFixed(0)}% occupazione` : "dati non sincronizzati"}</p>
                        <YoYBadge current={d.occupiedRooms} previous={py?.occupiedRooms} label={pyYear} />
                      </div>
                      <BedDouble className="h-10 w-10 text-blue-500" />
                    </div>
                  </CardContent>
                </Card>
              </HoverCardTrigger>
              <HoverCardContent className="w-72">
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Dettaglio per Tipologia</h4>
                  {d.roomTypeOccupancy.length > 0 ? d.roomTypeOccupancy.map((rt, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-muted-foreground truncate max-w-[180px]">{rt.name}</span>
                      <span className="font-medium">{rt.occupied} / {rt.totalRooms}</span>
                    </div>
                  )) : <p className="text-sm text-muted-foreground">Nessun dato</p>}
                </div>
              </HoverCardContent>
            </HoverCard>

            <Card className="border-gray-200 bg-white">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-lg font-semibold text-gray-700 mb-2">Movimenti Oggi</p>
                    <div className="text-5xl font-bold text-gray-900">{d.arrivalsCount + d.departuresCount + d.stayoversCount}</div>
                    <div className="flex gap-3 mt-2 text-sm font-medium">
                      <span className="text-emerald-600">{d.arrivalsCount} arrivi</span>
                      <span className="text-amber-600">{d.departuresCount} partenze</span>
                      <span className="text-blue-600">{d.stayoversCount} fermate</span>
                    </div>
                  </div>
                  <Users className="h-10 w-10 text-gray-400" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Bookings vs Cancellations -- V1 light cards */}
        {d && !loading && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card className="border-emerald-200 bg-emerald-50/30">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-lg font-semibold text-emerald-700 mb-1">Prenotazioni Ricevute</p>
                    <p className="text-sm text-gray-500">{format(selectedDate, "EEEE d MMMM", { locale: it })}</p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-emerald-300" />
                </div>
                <div className="flex items-baseline gap-4 mb-3">
                  <span className="text-5xl font-bold text-emerald-800">{d.grossBookingsCount}</span>
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-base text-gray-600">
                  <span>{eur(d.grossBookingsRevenue)} revenue</span>
                  <span>RevPOR {eur(d.grossBookingsRoomNights > 0 ? d.grossBookingsRevenue / d.grossBookingsRoomNights : 0)}</span>
                  <span>{d.grossBookingsRoomNights} r/n</span>
                </div>
                <div className="flex gap-3 mt-2">
                  <YoYBadge current={d.grossBookingsCount} previous={py?.grossBookingsCount} previousValue={py?.grossBookingsCount} label={pyYear} />
                  <YoYBadge current={d.grossBookingsRevenue} previous={py?.grossBookingsRevenue} previousValue={py?.grossBookingsRevenue} label={pyYear} format="currency" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-red-200 bg-red-50/30">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-lg font-semibold text-red-700 mb-1">Cancellazioni Ricevute</p>
                    <p className="text-sm text-gray-500">{format(selectedDate, "EEEE d MMMM", { locale: it })}</p>
                  </div>
                  <XCircle className="h-8 w-8 text-red-300" />
                </div>
                <div className="flex items-baseline gap-4 mb-3">
                  <span className="text-5xl font-bold text-red-800">{d.cancellationsCount}</span>
                  <span className="text-lg text-red-600">
                    {d.grossBookingsCount > 0 ? Math.round((d.cancellationsCount / (d.grossBookingsCount + d.cancellationsCount)) * 100) : 0}% del totale
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-base text-gray-600">
                  <span>{eur(d.cancelledRevenue)} persi</span>
                  <span>RevPCR {eur(d.revpcr)}</span>
                  <span>{d.cancelledRoomNights} r/n</span>
                </div>
                <div className="flex gap-3 mt-2">
                  <YoYBadge current={d.cancellationsCount} previous={py?.cancellationsCount} previousValue={py?.cancellationsCount} label={pyYear} />
                  <YoYBadge current={d.cancelledRevenue} previous={py?.cancelledRevenue} previousValue={py?.cancelledRevenue} label={pyYear} format="currency" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Daily Balance hero -- V1 colors */}
        {d && !loading && (
          <Card className={`${balance >= 0 ? "border-emerald-200 bg-emerald-50/40" : "border-red-200 bg-red-50/40"}`}
            title="Bilancio commerciale: revenue prenotazioni ricevute meno revenue cancellazioni.">
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <p className="text-base font-medium text-gray-500 mb-2">Bilancio Commerciale della Giornata</p>
                  <div className={`text-5xl md:text-6xl font-bold ${balance >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {balance >= 0 ? "+" : ""}{eur(balance)}
                  </div>
                </div>
                <div className="flex gap-8">
                  <div className="text-center md:text-right">
                    <div className={`text-3xl font-bold ${netRN >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                      {netRN >= 0 ? "+" : ""}{netRN}
                    </div>
                    <p className="text-base text-gray-500">r/n nette</p>
                  </div>
                  <div className="text-center md:text-right">
                    <div className="text-3xl font-bold text-gray-900">
                      {eur(netRN > 0 ? balance / netRN : 0)}
                    </div>
                    <p className="text-base text-gray-500">RevPOR netto</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pick-up times */}
        {d && !loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Card className="border-emerald-200">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-base font-semibold text-gray-700">Pick Up Time Prenotazioni</p>
                  <Calendar className="h-6 w-6 text-emerald-500" />
                </div>
                <div className="text-3xl font-bold text-emerald-700">{d.avgBookingPickup.toFixed(0)} gg</div>
                <p className="text-sm text-gray-500 mt-1">anticipo medio</p>
              </CardContent>
            </Card>
            <Card className="border-red-200">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-base font-semibold text-gray-700">Pick Up Time Cancellazioni</p>
                  <Calendar className="h-6 w-6 text-red-500" />
                </div>
                <div className="text-3xl font-bold text-red-700">{d.avgCancellationPickup.toFixed(0)} gg</div>
                <p className="text-sm text-gray-500 mt-1">anticipo medio</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-[130px] rounded-xl bg-gray-100 animate-pulse" />)}
          </div>
        )}
      </main>

      <footer className="border-t mt-12">
        <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-4 flex items-center justify-between text-xs text-gray-400">
          <span>SANTADDEO Dashboard V3</span>
          <span>Solo SuperAdmin</span>
        </div>
      </footer>
    </div>
  )
}
