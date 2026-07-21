"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertTriangle, ArrowDown, ArrowUp, Bed, BedDouble, Calendar, CheckCircle2, DollarSign, TrendingUp, ChevronLeft, ChevronRight } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { Button } from "@/components/ui/button"
import { format } from "date-fns"
import { it } from "date-fns/locale"

import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { DashboardOverviewSkeleton } from "./dashboard-shell"
import { isKpiEnabled } from "@/lib/utils/kpi-visibility"
import { FiscalBreakdownHover } from "./fiscal-breakdown-hover"
import { accommodationReplace, getAccommodationLabel } from "@/lib/utils/accommodation-labels"
import { dedupFetchJson } from "@/lib/dedup-fetch"
import { useVatView, vatViewQuery } from "@/lib/contexts/vat-view-context"

interface DashboardOverviewClientProps {
  hotelId: string
  hotelName: string
  accommodationType?: string
  initialRoomTypes?: {
    id: string
    name: string
    pms_room_type_id: string
    total_rooms: number
    is_active: boolean
    display_order: number
  }[]
}

interface OverviewData {
  totalRooms: number
  availableRooms: number
  occupiedRooms: number
  outOfServiceRooms: number
  occupancyRate: number
  roomTypeOccupancy: { name: string; totalRooms: number; available: number; occupied: number }[]
  roomTypeAvailability: { name: string; totalRooms: number; available: number }[]
  roomTypeOutOfService: { name: string; totalRooms: number; oos: number }[]
  totalProduction: number
  todayProduction: number
  directRevenue: number
  intermediatedRevenue: number
  vatMode?: "included" | "excluded"
  accommodationVatRate?: number
  departmentBreakdown: Record<string, number>
  todayDepartmentBreakdown: Record<string, number>
  todayDocumentTypes: Record<string, { count: number; total: number }>
  monthDocumentTypes: Record<string, { count: number; total: number; taxable: number }>
  roomProductionToday: number
  invoicesTotal: number
  feesTotal: number
  depositsTotal: number
  // Arrivi oggi
  arrivalsCount: number
  arrivalsRoomNights: number
  // Partenze oggi
  departuresCount: number
  // Fermate oggi
  stayoversCount: number
  // Cancellazioni oggi
  cancellationsCount: number
  cancelledRoomNights: number
  cancelledRevenue: number
  revpcr: number
  cancelledByChannel: Record<string, number>
  // Prenotazioni ricevute oggi
  newBookingsCount: number
  newBookingsRoomNights: number
  newBookingsRevenue: number
  revpor: number
  newBookingsByChannel: Record<string, number>
  avgBookingPickup: number
  avgCancellationPickup: number
  // Produzione giornaliera
  dailyProduction: number
  // Movimenti ultime 24 ore (legacy)
  last24hBookings: number
  last24hRoomNights: number
  last24hRevpor: number
  last24hAvgPickup: number
  last24hCancellations: number
  last24hCancelledRoomNights: number
  last24hLostRevenue: number
  last24hCancelRevpor: number
  last24hCancelAvgPickup: number
  // Alert status
  alertStatus: "green" | "orange" | "red"
  alertMessage: string
  hasAvailabilityData: boolean
  // PMS info
  hasDepartmentData: boolean
  pmsName: string | null
  // YoY: dati anno precedente per la stessa data
  prevYear: {
    date: string
    occupancyRate: number
    occupiedRooms: number
    totalRooms: number
    availableRooms: number
    totalProduction: number
    todayProduction: number
    roomProductionToday: number
    arrivalsCount: number
    arrivalsRoomNights: number
    departuresCount: number
    stayoversCount: number
    cancellationsCount: number
    cancelledRoomNights: number
    cancelledRevenue: number
    revpcr: number
    newBookingsCount: number
    newBookingsRoomNights: number
    newBookingsRevenue: number
    revpor: number
  } | null
}

// YoY comparison badge: mostra il valore dell'anno precedente e la variazione
function YoYBadge({ current, previous, label, format: fmt = "number", colorClass, invertColor = false }: {
  current: number
  previous: number | undefined | null
  label: string
  format?: "number" | "currency" | "percent"
  colorClass?: string
  invertColor?: boolean // When true, more = worse (e.g. unsold rooms: 0→5 = peggioramento)
}) {
  if (previous == null || (previous === 0 && current === 0)) return null
  const diff = current - previous
  // Calculate percentage change; when previous is 0, show absolute diff as indicator
  const changePct = previous > 0 ? (diff / previous) * 100 : diff !== 0 ? diff * 100 : 0

  // For normal metrics: increase = good (green arrow up), decrease = bad (red arrow down)
  // For inverted metrics (unsold rooms): increase = bad (red arrow down), decrease = good (green arrow up)
  // "isImproving" means the situation is getting BETTER for the business
  const isImproving = invertColor ? diff < 0 : diff > 0
  const isWorsening = invertColor ? diff > 0 : diff < 0

  let prevFormatted: string
  if (fmt === "currency") prevFormatted = `€${previous.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  else if (fmt === "percent") prevFormatted = `${previous.toFixed(0)}%`
  else prevFormatted = previous.toLocaleString("it-IT")

  return (
    <div className={`inline-flex items-center gap-1 text-xs ${colorClass || "text-muted-foreground"} mt-1`}>
      <span className="whitespace-nowrap">{label}: {prevFormatted}</span>
      {diff !== 0 && (
        <span className={`inline-flex items-center gap-0.5 font-medium whitespace-nowrap ${isImproving ? "text-green-600" : isWorsening ? "text-red-600" : ""}`}>
          {isImproving ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
          {previous > 0 ? `${Math.abs(changePct).toFixed(0)}%` : `+${Math.abs(diff)}`}
        </span>
      )}
    </div>
  )
}

// Dev badge: mostra numero progressivo box in basso a destra (solo dev/preview)
function DevBadge({ n }: { n: number }) {
  const isDev = typeof window !== "undefined" && (
    window.location.hostname.includes("vusercontent.net") ||
    window.location.hostname === "localhost"
  )
  if (!isDev) return null
  return (
    <span className="absolute bottom-1 right-2 text-[10px] font-mono text-muted-foreground/40">#{n}</span>
  )
}

export function DashboardOverviewClient({ hotelId, hotelName, accommodationType, initialRoomTypes = [] }: DashboardOverviewClientProps) {
  const accLabel = getAccommodationLabel(accommodationType)
  const accReplace = (text: string) => accommodationReplace(text, accommodationType)
  const { vatView } = useVatView()
  const [data, setData] = useState<OverviewData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [kpiConfigs, setKpiConfigs] = useState<Record<string, boolean> | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const today = new Date().toLocaleDateString("sv-SE")
  // Stabilise selectedDate as a string to avoid re-triggering useEffect
  const selectedDateStr = selectedDate.toLocaleDateString("sv-SE")
  
  const isToday = selectedDateStr === today

  // Stable room type IDs string for dependency comparison
  const roomTypeIdsKey = initialRoomTypes.filter((rt) => rt.is_active).map((rt) => rt.id).join(",")

  // Fetch KPI visibility configs once on mount
  useEffect(() => {
    async function loadKpiConfigs() {
      try {
        const res = await fetch(`/api/dashboard/kpi-configs?hotel_id=${hotelId}`)
        if (res.ok) {
          const json = await res.json()
          setKpiConfigs(json.kpiConfigs)
        }
      } catch {
        // If KPI configs fail to load, all KPIs stay visible (default)
      }
    }
    loadKpiConfigs()
  }, [hotelId])

  // Helper: check if a KPI card is visible
  const kpi = (key: string) => isKpiEnabled(kpiConfigs, key)

  // Fetch data when selectedDate changes
  useEffect(() => {
    // Abort any in-flight request before starting a new one
    if (abortRef.current) {
      abortRef.current.abort()
    }
    const controller = new AbortController()
    abortRef.current = controller

    const fetchData = async () => {
      setIsLoading(true)
      const dateStr = selectedDateStr

      try {
        const activeRoomTypes = initialRoomTypes.filter((rt) => rt.is_active)
        const activeRoomTypeIds = activeRoomTypes.map((rt) => rt.id)

        // Use server-side API to fetch availability (bypasses RLS issues)
        // This gives us the accurate total_rooms from rms_availability_daily
        let todayAvailability: { rooms_available: number; room_type_id: string; total_rooms?: number }[] = []
        let totalRooms = 0
        let availableRooms = 0
        let occupiedRooms = 0
        
        // Fetch availability FIRST, then production SEQUENTIALLY
        // to avoid overwhelming Supabase rate limiter (429 "Too Many Requests")
        // Se non ci sono room types configurati, facciamo comunque la chiamata per GDocs hotels
        const availData = await dedupFetchJson(`/api/dashboard/availability?hotel_id=${hotelId}&date=${dateStr}`)
              .catch(() => ({ data: [] }))

        const prodData = await dedupFetchJson(`/api/dashboard/production?hotel_id=${hotelId}&date=${dateStr}${vatViewQuery(vatView)}`)
          .catch(() => ({}))

        if (availData.data && availData.data.length > 0) {
          // First try to filter by activeRoomTypeIds
          let activeAvailData = activeRoomTypeIds.length > 0 
            ? availData.data.filter((r: any) => activeRoomTypeIds.includes(r.room_type_id))
            : availData.data
          
          // FALLBACK: If filtering results in empty array but we have raw data,
          // use ALL availability data (common for GDocs/Bedzzle where room_type_id may not match)
          if (activeAvailData.length === 0 && availData.data.length > 0) {
            console.log("[v0] [dashboard-overview] room_type_id filter excluded all data, using raw data instead")
            activeAvailData = availData.data
          }
          
          todayAvailability = activeAvailData.map((r: any) => ({
            rooms_available: r.rooms_available || 0,
            room_type_id: r.room_type_id,
            total_rooms: r.total_rooms || 0,
            rooms_out_of_service: r.rooms_out_of_service || 0,
          }))
          totalRooms = activeAvailData.reduce((sum: number, r: any) => sum + (r.total_rooms || 0), 0)
          availableRooms = activeAvailData.reduce((sum: number, r: any) => sum + (r.rooms_available || 0), 0)
          // 23/05/2026 BUG FIX: prima `occupiedRooms = totalRooms - availableRooms`
          // contava le OOS come occupate. Esempio Tenuta Moriano 23/11/2026:
          // 12 trilocali totali, 0 vendibili, 10 occupate + 2 fuori servizio
          // -> il KPI dashboard mostrava "12 occupate" invece di 10. Le righe
          // OOS hanno `rooms_available=0`, quindi vanno scorporate
          // esplicitamente.
          const oosRoomsOnAvail = activeAvailData.reduce(
            (sum: number, r: any) => sum + (r.rooms_out_of_service || 0),
            0,
          )
          occupiedRooms = Math.max(0, totalRooms - availableRooms - oosRoomsOnAvail)
        }

        // For GSheets/GDocs hotels: daily_availability may not reflect real-time bookings.
        // Use arrivals + stayovers from production route as fallback for occupied rooms.
        const bookingBasedOccupied = (prodData.arrivalsCount || 0) + (prodData.stayoversCount || 0)
        
        // Fallback to room_types if no availability data
        if (totalRooms === 0) {
          totalRooms = activeRoomTypes.reduce((sum, rt) => sum + (rt.total_rooms || 0), 0)
        }
        
        // GDocs/Bedzzle fallback: if we have availability data but total_rooms is null,
        // use a reasonable estimate based on occupied rooms (arrivals + stayovers)
        // or the availData inventory_count if available
        if (totalRooms === 0 && activeAvailData && activeAvailData.length > 0) {
          // Try to get inventory_count from the availability data
          const inventoryCount = activeAvailData.reduce((sum: number, r: any) => sum + (r.inventory_count || 0), 0)
          if (inventoryCount > 0) {
            totalRooms = inventoryCount
            availableRooms = activeAvailData.reduce((sum: number, r: any) => sum + (r.rooms_available || 0), 0)
            occupiedRooms = totalRooms - availableRooms
          } else if (bookingBasedOccupied > 0) {
            // Last resort: estimate total rooms based on occupied + some buffer
            // This is a rough estimate for display purposes
            occupiedRooms = bookingBasedOccupied
            availableRooms = activeAvailData.reduce((sum: number, r: any) => sum + (r.rooms_available || 0), 0)
            totalRooms = occupiedRooms + availableRooms
          }
        }
        
        if (occupiedRooms === 0 && bookingBasedOccupied > 0) {
          occupiedRooms = bookingBasedOccupied
        }

        // clamp a 100%: l'occupazione non puo' superare il 100% (vedi nota Obiettivi 27/06/2026).
        const occupancyRate = totalRooms > 0 ? Math.min(100, (occupiedRooms / totalRooms) * 100) : 0

        const roomTypeOccupancy = activeRoomTypes
          .map((rt) => {
            const availability = todayAvailability.find((a) => a.room_type_id === rt.id)
            const rtTotalRooms = availability?.total_rooms || rt.total_rooms || 0
            const available = availability?.rooms_available || 0
            // 23/05/2026 BUG FIX: stessa logica del KPI globale — escludi le
            // camere OOS dal conteggio "occupate" per tipologia, altrimenti
            // un trilocale 12-totali / 0-vendibili / 2-OOS appariva con 12
            // occupate nel breakdown della dashboard.
            const oos = availability?.rooms_out_of_service || 0
            const occupied = rtTotalRooms - available - oos
            return {
              name: rt.name,
              totalRooms: rtTotalRooms,
              available,
              occupied: occupied > 0 ? occupied : 0,
            }
          })
          .filter((rt) => rt.occupied > 0)

        const roomTypeAvailability = activeRoomTypes
          .map((rt) => {
            const availability = todayAvailability.find((a) => a.room_type_id === rt.id)
            const rtTotalRooms = availability?.total_rooms || rt.total_rooms || 0
            return { name: rt.name, totalRooms: rtTotalRooms, available: availability?.rooms_available || 0 }
          })
          .filter((rt) => rt.available > 0)

        const roomTypeOutOfService = activeRoomTypes
          .map((rt) => {
            const availability = todayAvailability.find((a) => a.room_type_id === rt.id)
            const rtTotalRooms = availability?.total_rooms || rt.total_rooms || 0
            const available = availability?.rooms_available || 0
            const oos = availability?.rooms_out_of_service || Math.max(0, rtTotalRooms - available - (roomTypeOccupancy.find(o => o.name === rt.name)?.occupied || 0))
            return { name: rt.name, totalRooms: rtTotalRooms, oos }
          })
          .filter((rt) => rt.oos > 0)

        const {
          totalProduction = 0,
          todayProduction = 0,
          directRevenue = 0,
          intermediatedRevenue = 0,
          departmentBreakdown = {} as Record<string, number>,
          todayDepartmentBreakdown = {} as Record<string, number>,
          todayDocumentTypes = {} as Record<string, { count: number; total: number }>,
          monthDocumentTypes = {} as Record<string, { count: number; total: number; taxable: number }>,
          roomProductionToday = 0,
          invoicesTotal = 0,
          feesTotal = 0,
          depositsTotal = 0,
          arrivalsCount = 0,
          arrivalsRoomNights = 0,
          departuresCount = 0,
          stayoversCount = 0,
          cancellationsCount = 0,
          cancelledRoomNights = 0,
          cancelledRevenue = 0,
          revpcr = 0,
          cancelledByChannel = {},
          newBookingsCount = 0,
          newBookingsRoomNights = 0,
          newBookingsRevenue = 0,
          revpor = 0,
          newBookingsByChannel = {},
          avgBookingPickup = 0,
          avgCancellationPickup = 0,
          dailyProduction = 0,
          last24hBookings = 0,
          last24hRoomNights = 0,
          last24hRevpor = 0,
          last24hAvgPickup = 0,
          last24hCancellations = 0,
          last24hCancelledRoomNights = 0,
          last24hLostRevenue = 0,
          last24hCancelRevpor = 0,
          last24hCancelAvgPickup = 0,
          prevYear: prevYearData = null,
          hasDepartmentData: hasDeptData = false,
          pmsName: pmsNameVal = null,
        } = prodData

        // hasAvailabilityData indica se abbiamo dati reali di disponibilita'
        const hasAvailabilityData = todayAvailability.length > 0

        let alertStatus: "green" | "orange" | "red" = "green"
        let alertMessage = "I principali indicatori sono in linea con gli obiettivi"
        if (!hasAvailabilityData) {
          // Nessun dato di disponibilita' - non mostrare allarme
          alertStatus = "green"
          alertMessage = "Dati di disponibilita' non ancora sincronizzati. Configura l'integrazione PMS nelle impostazioni."
        } else if (occupancyRate < 50) {
          alertStatus = "red"
          alertMessage = "Diversi indicatori sono sotto gli obiettivi, si consiglia un intervento"
        } else if (occupancyRate < 70) {
          alertStatus = "orange"
          alertMessage = "Alcuni indicatori richiedono monitoraggio"
        }

        const outOfServiceRooms = todayAvailability.reduce((sum, a) => sum + (a.rooms_out_of_service || 0), 0)

        setData({
          totalRooms,
          availableRooms,
          occupiedRooms,
          outOfServiceRooms,
          occupancyRate,
          roomTypeOccupancy,
          roomTypeAvailability,
          roomTypeOutOfService,
          totalProduction,
          todayProduction,
          directRevenue,
          intermediatedRevenue,
          departmentBreakdown,
          todayDepartmentBreakdown,
          todayDocumentTypes,
          monthDocumentTypes,
          roomProductionToday,
          invoicesTotal,
          feesTotal,
          depositsTotal,
          arrivalsCount,
          arrivalsRoomNights,
          departuresCount,
          stayoversCount,
          cancellationsCount,
          cancelledRoomNights,
          cancelledRevenue,
          revpcr,
          cancelledByChannel,
          newBookingsCount,
          newBookingsRoomNights,
          newBookingsRevenue,
          revpor,
          newBookingsByChannel,
          avgBookingPickup,
          avgCancellationPickup,
          dailyProduction,
          last24hBookings,
          last24hRoomNights,
          last24hRevpor,
          last24hAvgPickup,
          last24hCancellations,
          last24hCancelledRoomNights,
          last24hLostRevenue,
          last24hCancelRevpor,
          last24hCancelAvgPickup,
          alertStatus,
          alertMessage,
          hasAvailabilityData,
          hasDepartmentData: hasDeptData,
          pmsName: pmsNameVal,
          prevYear: prevYearData,
          vatMode: prodData.vatMode,
        })
      } catch (error: unknown) {
        // Ignore abort errors (caused by component re-render or date change)
        if (error instanceof DOMException && error.name === "AbortError") return
        console.error("[v0] Dashboard Overview - error fetching data:", error)
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    fetchData()

    return () => {
      controller.abort()
    }
  }, [hotelId, roomTypeIdsKey, selectedDateStr, vatView])

  if (isLoading || !data) {
    return <DashboardOverviewSkeleton />
  }

  return (
    <div className="space-y-8">
      {/* SEZIONE 1: Data e Occupazione - Full Width su Mobile */}
      <Card className="w-full">
        <CardContent className="p-5 md:p-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            {/* Selettore Data */}
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 bg-transparent"
                onClick={() => {
                  const prev = new Date(selectedDate)
                  prev.setDate(prev.getDate() - 1)
                  setSelectedDate(prev)
                }}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-3 hover:text-primary transition-colors cursor-pointer px-5 py-3 rounded-lg border bg-background">
                    <Calendar className="h-6 w-6 text-primary" />
                    <div className="text-left">
                      <span className="text-xl md:text-2xl font-bold block">
                        {format(selectedDate, "dd MMMM yyyy", { locale: it })}
                      </span>
                      <span className="text-base text-muted-foreground">
                        {isToday ? `Oggi, ${format(selectedDate, "EEEE", { locale: it })}` : format(selectedDate, "EEEE", { locale: it })}
                      </span>
                    </div>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => {
                      if (date) {
                        setSelectedDate(date)
                        setDatePickerOpen(false)
                      }
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 bg-transparent"
                onClick={() => {
                  const next = new Date(selectedDate)
                  next.setDate(next.getDate() + 1)
                  setSelectedDate(next)
                }}
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
            
            {/* Riepilogo Occupazione Rapido */}
            <div className="flex items-center gap-8 md:gap-10">
              {/* Radial gauge per occupazione */}
              <div className="relative flex items-center justify-center">
                <svg width="120" height="120" viewBox="0 0 120 120" className="transform -rotate-90">
                  {/* Track di sfondo */}
                  <circle
                    cx="60" cy="60" r="50"
                    fill="none"
                    stroke="#e5e7eb"
                    strokeWidth="10"
                    strokeLinecap="round"
                  />
                  {/* Arco di progresso */}
                  <circle
                    cx="60" cy="60" r="50"
                    fill="none"
                    stroke={data.occupancyRate >= 80 ? "#22c55e" : data.occupancyRate >= 50 ? "#3b82f6" : "#ef4444"}
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={`${(data.occupancyRate / 100) * 314.16} 314.16`}
                    style={{ transition: "stroke-dasharray 0.7s ease-out, stroke 0.3s ease" }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl md:text-4xl font-bold text-foreground">{data.occupancyRate.toFixed(0)}%</span>
                  <span className="text-xs text-muted-foreground">Occupazione</span>
                </div>
              </div>
              <div className="h-14 w-px bg-border hidden md:block" />
              <div className="text-center">
                <div className="text-3xl md:text-4xl font-bold">{data.occupiedRooms}<span className="text-muted-foreground text-xl">/{data.totalRooms}</span></div>
                <div className="text-base text-muted-foreground mt-1">{accReplace("Camere Occupate")}</div>
              </div>
            </div>
          </div>
          {/* YoY comparison sotto occupazione */}
          {data.prevYear && (data.prevYear.occupancyRate > 0 || data.prevYear.totalRooms > 0) && (
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/50">
              <span className="text-xs text-muted-foreground font-medium">Stesso giorno {format(new Date(data.prevYear.date + "T00:00:00"), "EEEE d MMM yyyy", { locale: it })}:</span>
              <YoYBadge current={data.occupancyRate} previous={data.prevYear.occupancyRate} label="Occ." format="percent" />
              <YoYBadge current={data.occupiedRooms} previous={data.prevYear.occupiedRooms} label={accLabel} format="number" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legenda Performance - sopra il primo box, allineata a destra */}
      <div className="flex items-center justify-end">
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
          data.alertStatus === "green"
            ? "bg-green-100 text-green-800"
            : data.alertStatus === "orange"
              ? "bg-orange-100 text-orange-800"
              : "bg-red-100 text-red-800"
        }`}>
          {data.alertStatus === "green" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertTriangle className="h-4 w-4" />
          )}
          <span>{data.alertMessage}</span>
        </div>
      </div>

      {/* SEZIONE 2: Disponibilita Sistemazioni - Griglia 3 colonne */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {kpi("rooms_available") && <HoverCard>
          <HoverCardTrigger asChild>
            <Card className="cursor-pointer hover:border-green-300 transition-colors border-green-200 bg-green-50/50 relative">
              <CardContent className="p-6 md:p-7">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-base font-semibold text-green-700 mb-2">{accReplace("Camere Disponibili")}</p>
                    <div className="text-4xl md:text-5xl font-bold text-green-700">{data.hasAvailabilityData ? data.availableRooms : "N/D"}</div>
                    <p className="text-base text-green-600 mt-2">{data.hasAvailabilityData ? "vendibili oggi" : "dati non sincronizzati"}</p>
                    <YoYBadge current={data.availableRooms} previous={data.prevYear?.availableRooms} label={data.prevYear?.date ? format(new Date(data.prevYear.date + "T00:00:00"), "EEE d/MM/yy", { locale: it }) : ""} format="number" colorClass="text-green-600/70" invertColor={true} />
                  </div>
                  <Bed className="h-10 w-10 text-green-500" />
                </div>
                <DevBadge n={1} />
              </CardContent>
            </Card>
          </HoverCardTrigger>
          <HoverCardContent className="w-72 md:w-80">
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Dettaglio per Tipologia</h4>
              <div className="space-y-1.5">
                {data.roomTypeAvailability.length > 0 ? (
                  data.roomTypeAvailability.map((rt, index) => (
                    <div key={index} className="flex justify-between text-sm">
                      <span className="text-muted-foreground truncate max-w-[180px]">{rt.name}</span>
                      <span className="font-medium">
                        {rt.available} / {rt.totalRooms}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Nessuna camera disponibile</p>
                )}
              </div>
            </div>
          </HoverCardContent>
        </HoverCard>}

        {kpi("rooms_occupied") && <HoverCard>
          <HoverCardTrigger asChild>
            <Card className="cursor-pointer hover:border-blue-300 transition-colors border-blue-200 bg-blue-50/50 relative">
              <CardContent className="p-6 md:p-7">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-base font-semibold text-blue-700 mb-2">{accReplace("Camere Occupate")}</p>
                    <div className="text-4xl md:text-5xl font-bold text-blue-700">{data.hasAvailabilityData ? data.occupiedRooms : "N/D"}</div>
                    <p className="text-base text-blue-600 mt-2">{data.hasAvailabilityData ? `${data.occupancyRate.toFixed(0)}% occupazione` : "dati non sincronizzati"}</p>
                    <YoYBadge current={data.occupiedRooms} previous={data.prevYear?.occupiedRooms} label={data.prevYear?.date ? format(new Date(data.prevYear.date + "T00:00:00"), "EEE d/MM/yy", { locale: it }) : ""} format="number" colorClass="text-blue-600/70" />
                  </div>
                  <BedDouble className="h-10 w-10 text-blue-500" />
                </div>
                <DevBadge n={2} />
              </CardContent>
            </Card>
          </HoverCardTrigger>
          <HoverCardContent className="w-72 md:w-80">
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Dettaglio per Tipologia</h4>
              <div className="space-y-1.5">
                {data.roomTypeOccupancy.length > 0 ? (
                  data.roomTypeOccupancy.map((rt, index) => (
                    <div key={index} className="flex justify-between text-sm">
                      <span className="text-muted-foreground truncate max-w-[180px]">{rt.name}</span>
                      <span className="font-medium">
                        {rt.occupied} / {rt.totalRooms}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Nessuna camera occupata</p>
                )}
              </div>
            </div>
          </HoverCardContent>
        </HoverCard>}

        {kpi("out_of_service") && <HoverCard>
          <HoverCardTrigger asChild>
            <Card className="cursor-pointer hover:border-gray-300 transition-colors border-gray-200 bg-gray-50/50 relative">
              <CardContent className="p-6 md:p-7">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-base font-semibold text-gray-600 mb-2">Fuori Servizio</p>
                    <div className="text-4xl md:text-5xl font-bold text-gray-600">{data?.outOfServiceRooms ?? 0}</div>
                    <p className="text-base text-gray-500 mt-2">non vendibili</p>
                  </div>
                  <AlertTriangle className="h-10 w-10 text-gray-400" />
                </div>
                <DevBadge n={3} />
              </CardContent>
            </Card>
          </HoverCardTrigger>
          <HoverCardContent className="w-72 md:w-80">
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Dettaglio Fuori Servizio</h4>
              <div className="space-y-1.5">
                {data.roomTypeOutOfService && data.roomTypeOutOfService.length > 0 ? (
                  data.roomTypeOutOfService.map((rt, index) => (
                    <div key={index} className="flex justify-between text-sm">
                      <span className="text-muted-foreground truncate max-w-[180px]">{rt.name}</span>
                      <span className="font-medium">
                        {rt.oos} / {rt.totalRooms}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Nessuna camera fuori servizio</p>
                )}
              </div>
            </div>
          </HoverCardContent>
        </HoverCard>}
      </div>

      {/* SEZIONE 3: Produzione - Griglia 3 colonne per numeri grandi */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">

        {/* BOX: Produzione Mese */}
        {kpi("fiscal_production_month") && <HoverCard>
          <HoverCardTrigger asChild>
            <Card className="cursor-pointer hover:border-emerald-300 transition-colors border-emerald-200 bg-emerald-50/50 relative">
              <CardContent className="p-6 md:p-7">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-base font-semibold text-emerald-700">Produzione Fiscale Mese</p>
                  <DollarSign className="h-7 w-7 text-emerald-500" />
                </div>
                <div className="text-2xl md:text-3xl lg:text-4xl font-bold text-emerald-800 tabular-nums">
                  €{data.totalProduction.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
                <p className="text-base text-emerald-600 mt-2">
                  {new Date().toLocaleString("it-IT", { month: "long", year: "numeric" })} -{" "}
                  {data.vatMode === "excluded" ? "IVA esclusa" : "IVA inclusa"}
                </p>
                <YoYBadge current={data.totalProduction} previous={data.prevYear?.totalProduction} label={data.prevYear?.date ? format(new Date(data.prevYear.date + "T00:00:00"), "EEE d/MM/yy", { locale: it }) : ""} format="currency" colorClass="text-emerald-600/70" />
                <DevBadge n={4} />
              </CardContent>
            </Card>
          </HoverCardTrigger>
          <HoverCardContent className="w-80 md:w-[28rem] p-0">
            <FiscalBreakdownHover
              title="Produzione Fiscale Mese"
              subtitle={`${new Date().toLocaleString("it-IT", { month: "long", year: "numeric" })} - ${data.vatMode === "excluded" ? "IVA esclusa" : "IVA inclusa"}`}
                          departments={data.departmentBreakdown}
                          documentTypes={data.monthDocumentTypes}
                          total={data.totalProduction}
                          pmsName={data.pmsName}
                          hasDepartmentData={data.hasDepartmentData}
                          netMode={data.vatMode === "excluded"}
                        />
          </HoverCardContent>
        </HoverCard>}

        {/* BOX: Produzione Fiscale Oggi */}
        {kpi("fiscal_production_today") && <HoverCard>
          <HoverCardTrigger asChild>
            <Card className="cursor-pointer hover:border-emerald-300 transition-colors border-emerald-200 relative">
              <CardContent className="p-6 md:p-7">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-base font-semibold text-muted-foreground">Produzione Fiscale Oggi</p>
                  <TrendingUp className="h-7 w-7 text-emerald-500" />
                </div>
                <div className="text-2xl md:text-3xl lg:text-4xl font-bold tabular-nums">
                  €{data.todayProduction.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
                <p className="text-base text-muted-foreground mt-2">{data.vatMode === "excluded" ? "IVA esclusa" : "IVA inclusa"}</p>
                <YoYBadge current={data.todayProduction} previous={data.prevYear?.todayProduction} label={data.prevYear?.date ? format(new Date(data.prevYear.date + "T00:00:00"), "EEE d/MM/yy", { locale: it }) : ""} format="currency" />
                <DevBadge n={5} />
              </CardContent>
            </Card>
          </HoverCardTrigger>
          <HoverCardContent className="w-80 md:w-[26rem]">
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Produzione Fiscale Oggi</h4>
              <p className="text-xs text-muted-foreground">
                Documenti fiscali emessi nella data selezionata, suddivisi per tipologia.
              </p>

              {/* Breakdown per tipologia documento */}
              {Object.keys(data.todayDocumentTypes || {}).length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Per Tipologia</p>
                  {Object.entries(data.todayDocumentTypes || {})
                    .sort(([, a], [, b]) => b.total - a.total)
                    .map(([typeName, info]) => (
                      <div key={typeName} className="flex items-center justify-between text-xs md:text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{typeName}</span>
                          <span className="text-[10px] text-muted-foreground/70 bg-muted px-1.5 py-0.5 rounded">
                            {info.count} doc.
                          </span>
                        </div>
                        <span className={`font-medium tabular-nums ${info.total < 0 ? "text-red-600" : ""}`}>
                          {info.total < 0 ? "-" : ""}{'€'}{Math.abs(info.total).toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    ))}
                </div>
              )}

              {/* Breakdown per reparto */}
              {Object.keys(data.todayDepartmentBreakdown || {}).length > 0 && (
                <div className="space-y-2 border-t pt-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Per Reparto</p>
                  {Object.entries(data.todayDepartmentBreakdown || {})
                    .sort(([, a], [, b]) => b - a)
                    .map(([dept, value]) => (
                      <div key={dept} className="flex justify-between text-xs md:text-sm">
                        <span className="text-muted-foreground truncate mr-2">{dept}</span>
                        <span className={`font-medium tabular-nums ${value < 0 ? "text-red-600" : ""}`}>
                          {value < 0 ? "-" : ""}{'€'}{Math.abs(value).toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    ))}
                </div>
              )}

              {Object.keys(data.todayDocumentTypes || {}).length === 0 && Object.keys(data.todayDepartmentBreakdown || {}).length === 0 && (
                <div className="space-y-2 py-2">
                  {data.todayProduction === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Nessun documento fiscale emesso oggi</p>
                  ) : data.hasDepartmentData === false ? (
                    <>
                      <p className="text-xs text-muted-foreground italic">
                        {data.pmsName
                          ? `Dettaglio per reparto/tipologia non fornito dal PMS (${data.pmsName})`
                          : "Dettaglio per reparto/tipologia non disponibile"}
                      </p>
                      {data.pmsName && (
                        <p className="text-[10px] text-muted-foreground/70">
                          Il gestionale {data.pmsName} non fornisce il dettaglio per reparto.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">Nessun documento fiscale emesso oggi</p>
                  )}
                </div>
              )}

              <div className="flex justify-between text-xs md:text-sm border-t pt-2 mt-2">
                <span className="font-semibold">Totale Produzione Fiscale</span>
                <span className="font-bold tabular-nums">
                  {'€'}{data.todayProduction.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </HoverCardContent>
        </HoverCard>}

          {/* BOX: Produzione Sistemazioni Oggi (somma daily_price di tutte le unita' in casa) */}
        {kpi("room_production_today") && <HoverCard>
          <HoverCardTrigger asChild>
            <Card className="cursor-pointer hover:border-indigo-300 transition-colors border-indigo-200 bg-indigo-50/50 relative">
              <CardContent className="p-6 md:p-7">
                <div className="flex items-center justify-between mb-3">
                    <p className="text-base font-semibold text-indigo-700">{accReplace("Produzione Camere Oggi")}</p>
                  <Bed className="h-7 w-7 text-indigo-500" />
                </div>
                <div className="text-2xl md:text-3xl lg:text-4xl font-bold text-indigo-700 tabular-nums">
                  {'€'}{data.roomProductionToday.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
                <p className="text-base text-indigo-600 mt-2">camere in casa nella data</p>
                <YoYBadge current={data.roomProductionToday} previous={data.prevYear?.roomProductionToday} label={data.prevYear?.date ? format(new Date(data.prevYear.date + "T00:00:00"), "EEE d/MM/yy", { locale: it }) : ""} format="currency" colorClass="text-indigo-600/70" />
                <DevBadge n={6} />
              </CardContent>
            </Card>
          </HoverCardTrigger>
          <HoverCardContent className="w-64 md:w-80">
            <div className="space-y-2">
                <h4 className="text-sm font-semibold text-indigo-700">{accReplace("Produzione Camere Oggi")}</h4>
              <p className="text-xs text-muted-foreground">
                Somma dei prezzi giornalieri (daily_price) di tutte le camere occupate nella data selezionata, indipendentemente dal pagamento.
              </p>
              <p className="text-xs text-muted-foreground">
                Include arrivi, fermate e partenze. Corrisponde alla voce RETTE del gestionale per la singola giornata.
              </p>
            </div>
          </HoverCardContent>
        </HoverCard>}

        {/* BOX: Arrivi Oggi - Camere in arrivo + partenza + fermata */}
        {kpi("arrivals_departures") && <HoverCard>
          <HoverCardTrigger asChild>
            <Card className="cursor-pointer hover:border-teal-300 transition-colors relative">
              <CardContent className="p-6 md:p-7">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-base font-semibold text-muted-foreground">Movimenti Oggi</p>
                  <CheckCircle2 className="h-7 w-7 text-teal-500" />
                </div>
                <div className="text-3xl md:text-4xl font-bold">{data.arrivalsCount + data.departuresCount + data.stayoversCount}</div>
                <p className="text-base text-muted-foreground mt-2">camere in movimento</p>
                <YoYBadge current={data.arrivalsCount + data.departuresCount + data.stayoversCount} previous={(data.prevYear?.arrivalsCount ?? 0) + (data.prevYear?.departuresCount ?? 0) + (data.prevYear?.stayoversCount ?? 0)} label={data.prevYear?.date ? format(new Date(data.prevYear.date + "T00:00:00"), "EEE d/MM/yy", { locale: it }) : ""} format="number" />
                <DevBadge n={7} />
              </CardContent>
            </Card>
          </HoverCardTrigger>
          <HoverCardContent className="w-64 md:w-80">
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Dettaglio Movimenti</h4>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs md:text-sm">
                  <span className="text-green-600">Arrivi (check-in oggi)</span>
                  <span className="font-medium">{data.arrivalsCount} camere</span>
                </div>
                <div className="flex justify-between text-xs md:text-sm">
                  <span className="text-orange-600">Partenze (check-out oggi)</span>
                  <span className="font-medium">{data.departuresCount} camere</span>
                </div>
                <div className="flex justify-between text-xs md:text-sm">
                  <span className="text-blue-600">Fermate (in casa)</span>
                  <span className="font-medium">{data.stayoversCount} camere</span>
                </div>
              </div>
            </div>
          </HoverCardContent>
        </HoverCard>}

      </div>

      {/* SEZIONE 4: Prenotazioni e Cancellazioni - Full Width Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* BOX: Prenotazioni Ricevute Oggi */}
        {kpi("bookings_received") && <HoverCard>
          <HoverCardTrigger asChild>
            <Card className="cursor-pointer hover:border-green-400 transition-colors border-green-300 bg-gradient-to-br from-green-50 to-green-100/50 relative">
              <CardContent className="p-6 md:p-8">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-lg font-semibold text-green-800 mb-4">Prenotazioni Ricevute Oggi, {format(selectedDate, "EEEE d MMMM", { locale: it })}</p>
                    <div className="flex items-baseline gap-4 mb-3">
                      <span className="text-5xl md:text-6xl font-bold text-green-700">{data.newBookingsCount}</span>
                      <span className="text-xl text-green-600 font-medium">
                        {(data.newBookingsCount + data.cancellationsCount) > 0 
                          ? Math.round((data.newBookingsCount / (data.newBookingsCount + data.cancellationsCount)) * 100) 
                          : 0}%)
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-green-700">
                      <span>€{data.newBookingsRevenue.toLocaleString("it-IT", { minimumFractionDigits: 0 })} revenue</span>
                      <span>RevPOR €{data.revpor.toLocaleString("it-IT", { minimumFractionDigits: 0 })}</span>
                      <span>{data.newBookingsRoomNights} room/nights</span>
                    </div>
                  </div>
                  <TrendingUp className="h-12 w-12 text-green-400" />
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                  <YoYBadge current={data.newBookingsCount} previous={data.prevYear?.newBookingsCount} label={data.prevYear?.date ? `Pren ${format(new Date(data.prevYear.date + "T00:00:00"), "EEE d/MM/yy", { locale: it })}` : ""} format="number" colorClass="text-green-600/70" />
                  <YoYBadge current={data.newBookingsRevenue} previous={data.prevYear?.newBookingsRevenue} label="Rev" format="currency" colorClass="text-green-600/70" />
                </div>
                <DevBadge n={8} />
              </CardContent>
            </Card>
          </HoverCardTrigger>
          <HoverCardContent className="w-64 md:w-80">
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-green-700">Dettaglio Prenotazioni Ricevute</h4>
              <p className="text-xs text-muted-foreground">Prenotazioni entrate nella data odierna, indipendentemente dalla data di check-in.</p>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs md:text-sm">
                  <span className="text-muted-foreground">Prenotazioni</span>
                  <span className="font-medium">{data.newBookingsCount}</span>
                </div>
                <div className="flex justify-between text-xs md:text-sm">
                  <span className="text-muted-foreground">% su totale ricevute</span>
                  <span className="font-medium text-green-600">
                    {(data.newBookingsCount + data.cancellationsCount) > 0 
                      ? Math.round((data.newBookingsCount / (data.newBookingsCount + data.cancellationsCount)) * 100) 
                      : 0}%
                  </span>
                </div>
                <div className="flex justify-between text-xs md:text-sm">
                  <span className="text-muted-foreground">Room/Nights</span>
                  <span className="font-medium">{data.newBookingsRoomNights}</span>
                </div>
                <div className="flex justify-between text-xs md:text-sm">
                  <span className="text-muted-foreground">Revenue totale</span>
                  <span className="font-medium text-green-600">
                    €{data.newBookingsRevenue.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between text-xs md:text-sm border-t pt-1 mt-1">
                  <span className="text-muted-foreground font-medium">RevPOR</span>
                  <span className="font-bold">
                    €{data.revpor.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                  </span>
                </div>
                {Object.keys(data.newBookingsByChannel || {}).length > 0 && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-1">Per canale:</p>
                    {Object.entries(data.newBookingsByChannel || {})
                      .sort(([, a], [, b]) => b - a)
                      .map(([channel, count]) => (
                        <div key={channel} className="flex justify-between text-xs">
                          <span className="text-muted-foreground truncate max-w-[150px]">{channel}</span>
                          <span className="font-medium">
                            {count} ({data.newBookingsCount > 0 ? Math.round((count / data.newBookingsCount) * 100) : 0}%)
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </HoverCardContent>
        </HoverCard>}

        {/* BOX: Cancellazioni Ricevute Oggi */}
        {kpi("cancellations_received") && <HoverCard>
          <HoverCardTrigger asChild>
            <Card className="cursor-pointer hover:border-red-400 transition-colors border-red-300 bg-gradient-to-br from-red-50 to-red-100/50 relative">
              <CardContent className="p-5 md:p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-base font-semibold text-red-800 mb-3">Cancellazioni Ricevute Oggi, {format(selectedDate, "EEEE d MMMM", { locale: it })}</p>
                    <div className="flex items-baseline gap-3 mb-2">
                      <span className="text-4xl md:text-5xl font-bold text-red-700">{data.cancellationsCount}</span>
                      <span className="text-lg text-red-600 font-medium">
                        {(data.newBookingsCount + data.cancellationsCount) > 0 
                          ? Math.round((data.cancellationsCount / (data.newBookingsCount + data.cancellationsCount)) * 100) 
                          : 0}%)
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-red-700">
                      <span>€{data.cancelledRevenue.toLocaleString("it-IT", { minimumFractionDigits: 0 })} persi</span>
                      <span>RevPCR €{data.revpcr.toLocaleString("it-IT", { minimumFractionDigits: 0 })}</span>
                      <span>{data.cancelledRoomNights} room/nights</span>
                    </div>
                  </div>
                  <AlertTriangle className="h-12 w-12 text-red-400" />
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                  <YoYBadge current={data.cancellationsCount} previous={data.prevYear?.cancellationsCount} label={data.prevYear?.date ? `Canc ${format(new Date(data.prevYear.date + "T00:00:00"), "EEE d/MM/yy", { locale: it })}` : ""} format="number" colorClass="text-red-600/70" invertColor={true} />
                  <YoYBadge current={data.cancelledRevenue} previous={data.prevYear?.cancelledRevenue} label="Rev perso" format="currency" colorClass="text-red-600/70" invertColor={true} />
                </div>
                <DevBadge n={9} />
              </CardContent>
            </Card>
          </HoverCardTrigger>
          <HoverCardContent className="w-64 md:w-80">
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-red-700">Dettaglio Cancellazioni Ricevute</h4>
              <p className="text-xs text-muted-foreground">Cancellazioni entrate nella data odierna, indipendentemente dalla data di check-in della prenotazione originale.</p>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs md:text-sm">
                  <span className="text-muted-foreground">Cancellazioni</span>
                  <span className="font-medium">{data.cancellationsCount}</span>
                </div>
                <div className="flex justify-between text-xs md:text-sm">
                  <span className="text-muted-foreground">% su totale ricevute</span>
                  <span className="font-medium text-red-600">
                    {(data.newBookingsCount + data.cancellationsCount) > 0 
                      ? Math.round((data.cancellationsCount / (data.newBookingsCount + data.cancellationsCount)) * 100) 
                      : 0}%
                  </span>
                </div>
                <div className="flex justify-between text-xs md:text-sm">
                  <span className="text-muted-foreground">Room/Nights cancellate</span>
                  <span className="font-medium">{data.cancelledRoomNights}</span>
                </div>
                <div className="flex justify-between text-xs md:text-sm">
                  <span className="text-muted-foreground">Revenue cancellato</span>
                  <span className="font-medium text-red-600">
                    €{data.cancelledRevenue.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between text-xs md:text-sm border-t pt-1 mt-1">
                  <span className="text-muted-foreground font-medium">RevPCR</span>
                  <span className="font-bold">
                    €{data.revpcr.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                  </span>
                </div>
                {Object.keys(data.cancelledByChannel || {}).length > 0 && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-1">Per canale:</p>
                    {Object.entries(data.cancelledByChannel || {})
                      .sort(([, a], [, b]) => b - a)
                      .map(([channel, count]) => (
                        <div key={channel} className="flex justify-between text-xs">
                          <span className="text-muted-foreground truncate max-w-[150px]">{channel}</span>
                          <span className="font-medium">
                            {count} ({data.cancellationsCount > 0 ? Math.round((count / data.cancellationsCount) * 100) : 0}%)
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </HoverCardContent>
        </HoverCard>}
      </div>

      {/* SEZIONE 5: Bilancio Giornata - Full Width Hero Card */}
      {kpi("daily_balance") && <Card className={`relative ${(data.newBookingsRevenue - data.cancelledRevenue) >= 0 ? 'bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200' : 'bg-gradient-to-r from-red-50 to-orange-50 border-red-200'}`}>
        <CardContent className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="text-lg font-semibold text-muted-foreground mb-2">Bilancio commerciale della giornata del {format(selectedDate, "d MMMM yyyy", { locale: it })}</p>
              <div className={`text-4xl md:text-5xl font-bold ${(data.newBookingsRevenue - data.cancelledRevenue) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {(data.newBookingsRevenue - data.cancelledRevenue) >= 0 ? '+' : ''}€{(data.newBookingsRevenue - data.cancelledRevenue).toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </div>
            </div>
            <div className="flex flex-wrap gap-6 text-base">
              <div className="text-center md:text-right">
                <div className={`text-2xl font-bold ${(data.newBookingsRoomNights - data.cancelledRoomNights) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {data.newBookingsRoomNights - data.cancelledRoomNights >= 0 ? '+' : ''}{data.newBookingsRoomNights - data.cancelledRoomNights}
                </div>
                <div className="text-sm text-muted-foreground">room/nights nette</div>
              </div>
              <div className="text-center md:text-right">
                <div className="text-2xl font-bold text-slate-700">
                  €{((data.newBookingsRoomNights - data.cancelledRoomNights) > 0 
                    ? ((data.newBookingsRevenue - data.cancelledRevenue) / (data.newBookingsRoomNights - data.cancelledRoomNights))
                    : 0).toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
                <div className="text-sm text-muted-foreground">RevPOR netto</div>
              </div>
            </div>
          </div>
          <DevBadge n={10} />
        </CardContent>
      </Card>}

      {/* SEZIONE 6: Pick Up Time Boxes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {kpi("pickup_bookings") && <HoverCard>
          <HoverCardTrigger asChild>
            <Card className="cursor-pointer hover:border-green-300 transition-colors border-green-200 relative">
              <CardContent className="p-5 md:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-green-700 mb-1">Pick Up Time Prenotazioni</p>
                    <div className="text-3xl md:text-4xl font-bold text-green-700">{data.avgBookingPickup.toFixed(0)} <span className="text-xl">giorni</span></div>
                    <p className="text-sm text-green-600 mt-1">anticipo medio oggi</p>
                  </div>
                  <Calendar className="h-10 w-10 text-green-400" />
                </div>
                <DevBadge n={11} />
              </CardContent>
            </Card>
          </HoverCardTrigger>
          <HoverCardContent className="w-72 md:w-80">
            <div className="space-y-2">
              <h4 className="font-semibold text-green-700">Pick Up Time Prenotazioni</h4>
              <p className="text-sm text-muted-foreground">
                Media dei giorni di anticipo delle <strong>prenotazioni ricevute oggi</strong> rispetto alla loro data di check-in.
              </p>
              <p className="text-sm text-muted-foreground">
                Misura quanto prima, in media, gli ospiti che hanno prenotato oggi arriveranno in struttura.
              </p>
            </div>
          </HoverCardContent>
        </HoverCard>}

        {kpi("pickup_cancellations") && (() => {
          // Se non ci sono cancellazioni (cancellationsCount === 0), mostra verde (ottimo!)
          // Se ci sono cancellazioni, mostra rosso con i giorni di anticipo
          const noCancellations = data.cancellationsCount === 0
          const colorClass = noCancellations ? "green" : "red"
          const borderClass = noCancellations ? "border-green-200 hover:border-green-300" : "border-red-200 hover:border-red-300"
          const textClass = noCancellations ? "text-green-700" : "text-red-700"
          const subTextClass = noCancellations ? "text-green-600" : "text-red-600"
          const iconClass = noCancellations ? "text-green-400" : "text-red-400"
          
          return (
            <HoverCard>
              <HoverCardTrigger asChild>
                <Card className={`cursor-pointer transition-colors relative ${borderClass}`}>
                  <CardContent className="p-5 md:p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={`text-sm font-medium ${textClass} mb-1`}>Pick Up Time Cancellazioni</p>
                        {noCancellations ? (
                          <>
                            <div className={`text-3xl md:text-4xl font-bold ${textClass}`}>0</div>
                            <p className={`text-sm ${subTextClass} mt-1`}>nessuna cancellazione</p>
                          </>
                        ) : (
                          <>
                            <div className={`text-3xl md:text-4xl font-bold ${textClass}`}>{data.avgCancellationPickup.toFixed(0)} <span className="text-xl">giorni</span></div>
                            <p className={`text-sm ${subTextClass} mt-1`}>anticipo medio oggi</p>
                          </>
                        )}
                      </div>
                      <Calendar className={`h-10 w-10 ${iconClass}`} />
                    </div>
                    <DevBadge n={12} />
                  </CardContent>
                </Card>
              </HoverCardTrigger>
              <HoverCardContent className="w-72 md:w-80">
                <div className="space-y-2">
                  <h4 className={`font-semibold ${textClass}`}>Pick Up Time Cancellazioni</h4>
                  {noCancellations ? (
                    <p className="text-sm text-muted-foreground">
                      <strong>Nessuna cancellazione oggi!</strong> Ottimo risultato.
                    </p>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Media dei giorni di anticipo delle <strong>cancellazioni ricevute oggi</strong> rispetto alla loro data di check-in.
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Misura quanto mancava, in media, al check-in delle prenotazioni cancellate oggi.
                      </p>
                    </>
                  )}
                </div>
              </HoverCardContent>
            </HoverCard>
          )
        })()}
      </div>


    </div>
  )
}
