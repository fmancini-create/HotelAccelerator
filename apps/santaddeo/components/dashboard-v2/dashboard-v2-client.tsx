"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { format } from "date-fns"
import { it } from "date-fns/locale"
import Link from "next/link"
import {
  ChevronLeft, ChevronRight, Calendar, Bed, BedDouble, TrendingUp, TrendingDown,
  DollarSign, AlertTriangle, ArrowUp, ArrowDown, Users, XCircle, BarChart3,
  ArrowLeft, Hotel,
} from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getSupabaseClient } from "@/lib/supabase/client"

/* ---------- types ---------- */
interface Hotel { id: string; name: string }
interface RoomType { id: string; name: string; pms_room_type_id: string; total_rooms: number; is_active: boolean; display_order: number }
interface PrevYear {
  date: string; occupancyRate: number; occupiedRooms: number; totalRooms: number; availableRooms: number
  totalProduction: number; todayProduction: number; roomProductionToday: number
  arrivalsCount: number; arrivalsRoomNights: number; departuresCount: number; stayoversCount: number
  cancellationsCount: number; cancelledRoomNights: number; cancelledRevenue: number; revpcr: number
  newBookingsCount: number; newBookingsRoomNights: number; newBookingsRevenue: number; revpor: number
}
interface DData {
  totalRooms: number; availableRooms: number; occupiedRooms: number; occupancyRate: number
  totalProduction: number; todayProduction: number; roomProductionToday: number
  arrivalsCount: number; arrivalsRoomNights: number; departuresCount: number; stayoversCount: number
  cancellationsCount: number; cancelledRoomNights: number; cancelledRevenue: number; revpcr: number
  newBookingsCount: number; newBookingsRoomNights: number; newBookingsRevenue: number; revpor: number
  avgBookingPickup: number; avgCancellationPickup: number
  roomTypeOccupancy: { name: string; totalRooms: number; available: number; occupied: number }[]
  prevYear: PrevYear | null
  hasAvailabilityData: boolean
}

/* ---------- helpers ---------- */
const eur = (n: number) => `€${n.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
function yoyPct(curr: number, prev: number | null | undefined): { pct: number; up: boolean } | null {
  if (prev == null || (prev === 0 && curr === 0)) return null
  const pct = prev > 0 ? ((curr - prev) / prev) * 100 : curr > 0 ? 100 : 0
  return { pct, up: pct >= 0 }
}

/* ---------- sub-components ---------- */
function YoYChip({ current, previous, suffix = "" }: { current: number; previous: number | null | undefined; suffix?: string }) {
  const y = yoyPct(current, previous)
  if (!y) return null
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${y.up ? "text-emerald-400" : "text-red-400"}`}>
      {y.up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(y.pct).toFixed(0)}%{suffix}
    </span>
  )
}

function OccupancyRing({ pct, size = 140, stroke = 10 }: { pct: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (Math.min(pct, 100) / 100) * circ
  const color = pct >= 80 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#ef4444"
  return (
    <svg width={size} height={size} className="drop-shadow-lg">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="transition-all duration-1000 ease-out"
      />
      <text x="50%" y="46%" textAnchor="middle" className="fill-white text-3xl font-bold" style={{ fontSize: "2rem" }}>
        {pct.toFixed(0)}%
      </text>
      <text x="50%" y="62%" textAnchor="middle" className="fill-zinc-400 text-xs" style={{ fontSize: "0.7rem" }}>
        OCCUPAZIONE
      </text>
    </svg>
  )
}

function MetricCard({ label, value, icon: Icon, color = "zinc", yoyCurrent, yoyPrevious, subtitle, large, children, description }: {
  label: string; value: string; icon: any; color?: string; yoyCurrent?: number; yoyPrevious?: number | null
  subtitle?: string; large?: boolean; children?: React.ReactNode; description?: string
}) {
  const colors: Record<string, { bg: string; border: string; icon: string; text: string }> = {
    emerald: { bg: "bg-emerald-950/40", border: "border-emerald-800/30", icon: "text-emerald-400", text: "text-emerald-300" },
    blue: { bg: "bg-blue-950/40", border: "border-blue-800/30", icon: "text-blue-400", text: "text-blue-300" },
    amber: { bg: "bg-amber-950/40", border: "border-amber-800/30", icon: "text-amber-400", text: "text-amber-300" },
    red: { bg: "bg-red-950/40", border: "border-red-800/30", icon: "text-red-400", text: "text-red-300" },
    indigo: { bg: "bg-indigo-950/40", border: "border-indigo-800/30", icon: "text-indigo-400", text: "text-indigo-300" },
    teal: { bg: "bg-teal-950/40", border: "border-teal-800/30", icon: "text-teal-400", text: "text-teal-300" },
    zinc: { bg: "bg-zinc-900/60", border: "border-zinc-800/40", icon: "text-zinc-400", text: "text-zinc-300" },
  }
  const c = colors[color] || colors.zinc
  const card = (
    <div className={`rounded-xl border ${c.border} ${c.bg} p-5 backdrop-blur-sm transition-all hover:border-opacity-60 cursor-default`}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm font-medium text-zinc-400 leading-tight">{label}</p>
        <Icon className={`h-5 w-5 ${c.icon} shrink-0`} />
      </div>
      <div className={`${large ? "text-4xl" : "text-3xl"} font-bold text-white tracking-tight`}>{value}</div>
      {subtitle && <p className={`text-sm ${c.text} mt-1`}>{subtitle}</p>}
      {yoyCurrent !== undefined && yoyPrevious !== undefined && (
        <div className="mt-2"><YoYChip current={yoyCurrent} previous={yoyPrevious} /></div>
      )}
      {children}
    </div>
  )
  if (!description) return card
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{card}</TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs bg-zinc-900 border-zinc-700 text-zinc-200 text-xs leading-relaxed p-3">
          {description}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function RoomTypeBars({ data }: { data: { name: string; totalRooms: number; occupied: number }[] }) {
  if (data.length === 0) return <p className="text-zinc-500 text-sm">Nessun dato</p>
  return (
    <div className="space-y-3">
      {data.map((rt) => {
        const pct = rt.totalRooms > 0 ? (rt.occupied / rt.totalRooms) * 100 : 0
        return (
          <div key={rt.name}>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-zinc-300 truncate max-w-[180px]">{rt.name}</span>
              <span className="text-zinc-400 tabular-nums">{rt.occupied}/{rt.totalRooms}</span>
            </div>
            <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${pct}%`,
                  background: pct >= 80 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#6366f1",
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
export function DashboardV2Client({ hotels, initialHotelId, initialRoomTypes, userEmail }: {
  hotels: Hotel[]; initialHotelId: string; initialRoomTypes: RoomType[]; userEmail: string
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
  const hotelName = hotels.find(h => h.id === hotelId)?.name || ""

  const getClient = useCallback(() => {
    if (!supabaseRef.current) supabaseRef.current = getSupabaseClient()
    return supabaseRef.current
  }, [])

  // Load room types when hotel changes
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

  // Fetch dashboard data
  useEffect(() => {
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller

    async function load() {
      setLoading(true)
      try {
        const activeRt = roomTypes.filter(r => r.is_active)
        const activeIds = activeRt.map(r => r.id)

        const [availRes, prodRes] = await Promise.all([
          activeIds.length > 0
            ? fetch(`/api/dashboard/availability?hotel_id=${hotelId}&date=${selectedDateStr}`, { signal: controller.signal }).then(r => r.json()).catch(() => ({ data: [] }))
            : { data: [] },
          fetch(`/api/dashboard/production?hotel_id=${hotelId}&date=${selectedDateStr}`, { signal: controller.signal }).then(r => r.json()).catch(() => ({})),
        ])

        let totalRooms = 0, availableRooms = 0, occupiedRooms = 0
        const todayAvail: { rooms_available: number; room_type_id: string; total_rooms: number }[] = []
        if (availRes.data?.length > 0) {
          for (const r of availRes.data) {
            todayAvail.push({ rooms_available: r.rooms_available || 0, room_type_id: r.room_type_id, total_rooms: r.total_rooms || 0 })
            totalRooms += r.total_rooms || 0
            availableRooms += r.rooms_available || 0
          }
          occupiedRooms = totalRooms - availableRooms
        }
        if (totalRooms === 0) totalRooms = activeRt.reduce((s, rt) => s + (rt.total_rooms || 0), 0)

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
          newBookingsCount: prodRes.newBookingsCount || 0,
          newBookingsRoomNights: prodRes.newBookingsRoomNights || 0,
          newBookingsRevenue: prodRes.newBookingsRevenue || 0,
          revpor: prodRes.revpor || 0,
          avgBookingPickup: prodRes.avgBookingPickup || 0,
          avgCancellationPickup: prodRes.avgCancellationPickup || 0,
          roomTypeOccupancy: roomTypeOcc,
          prevYear: prodRes.prevYear || null,
          hasAvailabilityData: todayAvail.length > 0,
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
  const balance = (d?.newBookingsRevenue || 0) - (d?.cancelledRevenue || 0)
  const netRN = (d?.newBookingsRoomNights || 0) - (d?.cancelledRoomNights || 0)

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Top Bar */}
      <header className="border-b border-zinc-800/60 bg-[#0e0e16]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-zinc-400 hover:text-white transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-lg font-semibold tracking-tight">Dashboard <span className="text-zinc-500">V2</span></h1>
          </div>
          <div className="flex items-center gap-3">
            <Select value={hotelId} onValueChange={setHotelId}>
              <SelectTrigger className="w-[200px] bg-zinc-900 border-zinc-800 text-sm">
                <Hotel className="h-4 w-4 mr-2 text-zinc-500" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                {hotels.map(h => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-xs text-zinc-600 hidden md:inline">{userEmail}</span>
          </div>
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto px-4 md:px-8 py-6 space-y-6">
        {/* Date selector + Occupancy hero */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left: Date + Occupancy ring */}
          <div className="flex-1 rounded-xl border border-zinc-800/40 bg-zinc-900/40 backdrop-blur-sm p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              {/* Date */}
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" className="h-9 w-9 text-zinc-400 hover:text-white hover:bg-zinc-800"
                  onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() - 1); setSelectedDate(d) }}>
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <button className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900/80 hover:border-zinc-700 transition-colors cursor-pointer">
                      <Calendar className="h-5 w-5 text-indigo-400" />
                      <div className="text-left">
                        <span className="text-xl font-bold block">{format(selectedDate, "dd MMMM yyyy", { locale: it })}</span>
                        <span className="text-sm text-zinc-500">{isToday ? "Oggi" : format(selectedDate, "EEEE", { locale: it })}</span>
                      </div>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-zinc-900 border-zinc-800" align="start">
                    <CalendarComponent mode="single" selected={selectedDate} onSelect={(d) => { if (d) { setSelectedDate(d); setDatePickerOpen(false) } }} initialFocus />
                  </PopoverContent>
                </Popover>
                <Button variant="ghost" size="icon" className="h-9 w-9 text-zinc-400 hover:text-white hover:bg-zinc-800"
                  onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() + 1); setSelectedDate(d) }}>
                  <ChevronRight className="h-5 w-5" />
                </Button>
                {!isToday && (
                  <Button variant="ghost" size="sm" className="text-xs text-indigo-400 hover:text-indigo-300 hover:bg-zinc-800"
                    onClick={() => setSelectedDate(new Date())}>Oggi</Button>
                )}
              </div>

              {/* Occupancy ring */}
              {loading ? (
                <div className="h-[140px] w-[140px] rounded-full bg-zinc-800/50 animate-pulse" />
              ) : d ? (
                <div className="flex items-center gap-6">
                  <OccupancyRing pct={d.occupancyRate} />
                  <div className="space-y-1">
                    <div className="text-3xl font-bold">{d.occupiedRooms}<span className="text-zinc-500 text-lg">/{d.totalRooms}</span></div>
                    <p className="text-sm text-zinc-400">camere occupate</p>
                    {py && <YoYChip current={d.occupancyRate} previous={py.occupancyRate} />}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Room type bars */}
            {d && d.roomTypeOccupancy.length > 0 && (
              <div className="mt-6 pt-5 border-t border-zinc-800/40">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">Occupazione per tipologia</p>
                <RoomTypeBars data={d.roomTypeOccupancy} />
              </div>
            )}
          </div>

          {/* Right: Key metrics stack */}
          <div className="w-full lg:w-[380px] space-y-4">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-[120px] rounded-xl bg-zinc-900/40 border border-zinc-800/30 animate-pulse" />)
            ) : d ? (
              <>
                <MetricCard label="Produzione Fiscale Mese" value={eur(d.totalProduction)} icon={DollarSign} color="emerald"
                  subtitle="IVA esclusa" yoyCurrent={d.totalProduction} yoyPrevious={py?.totalProduction} large
                  description="Totale documenti fiscali emessi nel mese corrente (IVA esclusa). Dati dalla cassa fiscale / Scidoo." />
                <MetricCard label="Produzione Camere Oggi" value={eur(d.roomProductionToday)} icon={Bed} color="indigo"
                  subtitle="camere in casa" yoyCurrent={d.roomProductionToday} yoyPrevious={py?.roomProductionToday}
                  description="Valore delle camere occupate oggi: somma dei prezzi giornalieri di tutte le prenotazioni attive per la data selezionata." />
                <MetricCard label="Produzione Fiscale Oggi" value={eur(d.todayProduction)} icon={TrendingUp} color="teal"
                  subtitle="IVA esclusa" yoyCurrent={d.todayProduction} yoyPrevious={py?.todayProduction}
                  description="Documenti fiscali emessi nella data selezionata (IVA esclusa). Include ricavi, fatture e scontrini." />
              </>
            ) : null}
          </div>
        </div>

        {/* Rooms grid: Available / Occupied / Movements */}
        {d && !loading && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MetricCard label="Camere Disponibili" value={d.hasAvailabilityData ? String(d.availableRooms) : "N/D"} icon={Bed} color="emerald" subtitle="vendibili oggi"
              description="Camere ancora vendibili per la data corrente, al netto delle prenotazioni in essere e delle camere fuori servizio." />
            <MetricCard label="Camere Occupate" value={d.hasAvailabilityData ? String(d.occupiedRooms) : "N/D"} icon={BedDouble} color="blue"
              subtitle={`${d.occupancyRate.toFixed(0)}% occupazione`}
              description={`Camere occupate oggi. Tasso di occupazione = camere vendute / camere totali (${d.totalRooms}).`} />
            <MetricCard label="Movimenti Oggi" value={String(d.arrivalsCount + d.departuresCount + d.stayoversCount)} icon={Users} color="teal"
              description="Totale movimenti della giornata: arrivi (check-in), partenze (check-out) e fermate (ospiti che restano).">
              <div className="flex gap-4 mt-2 text-xs">
                <span className="text-emerald-400">{d.arrivalsCount} arrivi</span>
                <span className="text-amber-400">{d.departuresCount} partenze</span>
                <span className="text-blue-400">{d.stayoversCount} fermate</span>
              </div>
            </MetricCard>
          </div>
        )}

        {/* Bookings vs Cancellations */}
        {d && !loading && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Bookings */}
            <div className="rounded-xl border border-emerald-800/20 bg-emerald-950/20 p-6" title="Prenotazioni ricevute nella data selezionata: numero, revenue totale, room/nights e RevPOR (revenue per occupied room-night).">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-sm font-medium text-emerald-400 mb-1">Prenotazioni Ricevute</p>
                  <p className="text-xs text-zinc-500">{format(selectedDate, "EEEE d MMMM", { locale: it })}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-emerald-500/30" />
              </div>
              <div className="flex items-baseline gap-4 mb-3">
                <span className="text-5xl font-bold text-white">{d.newBookingsCount}</span>
                <span className="text-lg text-emerald-400">
                  {(d.newBookingsCount + d.cancellationsCount) > 0 ? Math.round((d.newBookingsCount / (d.newBookingsCount + d.cancellationsCount)) * 100) : 0}%
                </span>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-zinc-400">
                <span>{eur(d.newBookingsRevenue)} revenue</span>
                <span>RevPOR {eur(d.revpor)}</span>
                <span>{d.newBookingsRoomNights} r/n</span>
              </div>
              <div className="flex gap-3 mt-2">
                <YoYChip current={d.newBookingsCount} previous={py?.newBookingsCount} />
                <YoYChip current={d.newBookingsRevenue} previous={py?.newBookingsRevenue} />
              </div>
            </div>

            {/* Cancellations */}
            <div className="rounded-xl border border-red-800/20 bg-red-950/20 p-6" title="Cancellazioni ricevute nella data selezionata: numero, revenue persa, room/nights cancellate e RevPCR.">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-sm font-medium text-red-400 mb-1">Cancellazioni Ricevute</p>
                  <p className="text-xs text-zinc-500">{format(selectedDate, "EEEE d MMMM", { locale: it })}</p>
                </div>
                <XCircle className="h-8 w-8 text-red-500/30" />
              </div>
              <div className="flex items-baseline gap-4 mb-3">
                <span className="text-5xl font-bold text-white">{d.cancellationsCount}</span>
                <span className="text-lg text-red-400">
                  {(d.newBookingsCount + d.cancellationsCount) > 0 ? Math.round((d.cancellationsCount / (d.newBookingsCount + d.cancellationsCount)) * 100) : 0}%
                </span>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-zinc-400">
                <span>{eur(d.cancelledRevenue)} persi</span>
                <span>RevPCR {eur(d.revpcr)}</span>
                <span>{d.cancelledRoomNights} r/n</span>
              </div>
              <div className="flex gap-3 mt-2">
                <YoYChip current={d.cancellationsCount} previous={py?.cancellationsCount} />
                <YoYChip current={d.cancelledRevenue} previous={py?.cancelledRevenue} />
              </div>
            </div>
          </div>
        )}

        {/* Daily Balance hero */}
        {d && !loading && (
          <div className={`rounded-xl border p-6 ${balance >= 0 ? "border-emerald-800/30 bg-gradient-to-r from-emerald-950/40 to-teal-950/30" : "border-red-800/30 bg-gradient-to-r from-red-950/40 to-orange-950/30"}`}
            title="Bilancio commerciale: revenue prenotazioni ricevute meno revenue cancellazioni. Positivo = guadagno netto di business nella giornata.">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-zinc-400 mb-2">Bilancio Commerciale della Giornata</p>
                <div className={`text-4xl md:text-5xl font-bold ${balance >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {balance >= 0 ? "+" : ""}{eur(balance)}
                </div>
              </div>
              <div className="flex gap-8">
                <div className="text-center md:text-right">
                  <div className={`text-2xl font-bold ${netRN >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {netRN >= 0 ? "+" : ""}{netRN}
                  </div>
                  <p className="text-sm text-zinc-500">r/n nette</p>
                </div>
                <div className="text-center md:text-right">
                  <div className="text-2xl font-bold text-white">
                    {eur(netRN > 0 ? balance / netRN : 0)}
                  </div>
                  <p className="text-sm text-zinc-500">RevPOR netto</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Pick-up times */}
        {d && !loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <MetricCard label="Pick Up Time Prenotazioni" value={`${d.avgBookingPickup.toFixed(0)} gg`} icon={Calendar} color="emerald" subtitle="anticipo medio"
              description="Media dei giorni di anticipo con cui le prenotazioni sono state effettuate rispetto alla data di check-in." />
            <MetricCard label="Pick Up Time Cancellazioni" value={`${d.avgCancellationPickup.toFixed(0)} gg`} icon={Calendar} color="red" subtitle="anticipo medio"
              description="Media dei giorni di anticipo con cui le cancellazioni sono state effettuate rispetto alla data di check-in originale." />
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-[120px] rounded-xl bg-zinc-900/40 border border-zinc-800/30 animate-pulse" />)}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800/40 mt-12">
        <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-4 flex items-center justify-between text-xs text-zinc-600">
          <span>SANTADDEO Dashboard V2</span>
          <span>Solo SuperAdmin</span>
        </div>
      </footer>
    </div>
  )
}
