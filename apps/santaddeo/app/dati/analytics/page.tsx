"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChevronLeft, ChevronRight, BarChart3, RefreshCw, AlertCircle, Filter } from "lucide-react"
import { AnalyticsKPICards } from "@/components/analytics/analytics-kpi-cards"
import { RevenueYoYChart } from "@/components/analytics/revenue-yoy-chart"
import { DayOfWeekChart } from "@/components/analytics/day-of-week-chart"
import { ProductionDayOfWeekChart } from "@/components/analytics/production-day-of-week-chart"
import { RevParDayOfWeekChart } from "@/components/analytics/revpar-day-of-week-chart"
import { RevporDayOfWeekChart } from "@/components/analytics/revpor-day-of-week-chart"
import { CancellationsPieChart } from "@/components/analytics/cancellations-pie-chart"
import { BookingWindowCard } from "@/components/analytics/booking-window-card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useVatView } from "@/lib/contexts/vat-view-context"

interface AnalyticsKPIs {
  totalRevenue: number
  lyTotalRevenue: number
  revenueYoY: number
  totalRoomNights: number
  lyTotalRoomNights: number
  roomNightsYoY: number
  adr: number
  lyAdr: number
  adrYoY: number
  occupancy: number
  lyOccupancy: number
  occupancyYoY: number
  revpar: number
  lyRevpar: number
  revparYoY: number
}

interface MonthlyData {
  month: string
  monthLabel: string
  revenue: number
  roomNights: number
  lyRevenue: number
  lyRoomNights: number
}

interface DayOfWeekData {
  day: string
  dayLabel: string
  revenue: number
  lyRevenue: number
  bookings: number
  lyBookings: number
}

interface ProductionDayOfWeekData {
  day: string
  dayLabel: string
  revenue: number
  lyRevenue: number
  roomNights: number
  lyRoomNights: number
}

interface BookingStatusData {
  status: string
  label: string
  count: number
  revenue: number
  roomNights: number
}

interface RevParDayOfWeekData {
  day: string
  dayLabel: string
  revpar: number
  lyRevpar: number
  daysCount: number
  lyDaysCount: number
}

interface BookingWindowBucket {
  key: string
  label: string
  count: number
  lyCount: number
  pct: number
  lyPct: number
}

interface BookingWindowData {
  avgLeadTime: number
  lyAvgLeadTime: number
  medianLeadTime: number
  lyMedianLeadTime: number
  sampleSize: number
  lySampleSize: number
  buckets: BookingWindowBucket[]
}

interface AnalyticsData {
  kpis: AnalyticsKPIs
  monthlyData: MonthlyData[]
  dayOfWeekData: DayOfWeekData[]
  productionDayOfWeekData: ProductionDayOfWeekData[]
  revparDayOfWeekData: RevParDayOfWeekData[]
  bookingStatusData: BookingStatusData[]
  bookingWindow: BookingWindowData
}

export default function AnalyticsPage() {
  const currentYear = new Date().getFullYear()
  const { vatView } = useVatView()
  const [year, setYear] = useState(currentYear)
  const [filterYtd, setFilterYtd] = useState(false)
  const [hotelId, setHotelId] = useState<string | null>(null)
  const [hotelName, setHotelName] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<AnalyticsData | null>(null)

  // Generate year options (last 5 years)
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i)

  useEffect(() => {
    loadUserHotel()
  }, [])

  useEffect(() => {
    if (hotelId) {
      loadData()
    }
  }, [hotelId, year, filterYtd, vatView])

  async function loadUserHotel() {
    try {
      const res = await fetch("/api/ui/selected-hotel")
      const data = await res.json()
      
      if (data.error || !data.hotel) {
        setError("Nessuna struttura selezionata")
        setLoading(false)
        return
      }
      
      setHotelId(data.hotel.id)
      setHotelName(data.hotel.name)
    } catch (err) {
      console.error("Error loading hotel:", err)
      setError("Errore nel caricamento della struttura")
      setLoading(false)
    }
  }

  async function loadData() {
    if (!hotelId) return
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        hotel_id: hotelId,
        year: year.toString(),
      })
      if (filterYtd) {
        params.set("filter", "ytd")
      }
      if (vatView) {
        params.set("vatView", vatView)
      }

      const res = await fetch(`/api/dati/analytics?${params}`, { cache: "no-store" })
      
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = "/login"
          return
        }
        if (res.status === 403) {
          setError("Questa funzionalita richiede un abbonamento Accelerator attivo.")
          setLoading(false)
          return
        }
        throw new Error(`Errore ${res.status}`)
      }
      
      const result = await res.json()
      if (result.error) throw new Error(result.error)
      
      setData(result)
      setLoading(false)
    } catch (err: any) {
      console.error("Error loading analytics:", err)
      setError(err.message || "Errore nel caricamento dei dati")
      setLoading(false)
    }
  }

  const kpis = data?.kpis
  const today = new Date()
  const ytdLabel = `${today.getDate()}/${today.getMonth() + 1}`

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Analytics</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {hotelName ? `${hotelName} - ` : ""}Statistiche sulle vendite
            </p>
          </div>
        </div>
      </div>

      <main className="p-6">
        <div className="mx-auto max-w-[1400px] space-y-6">
          {/* Year Selector + Filters */}
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => setYear(y => y - 1)}
                disabled={year <= currentYear - 4}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Select value={year.toString()} onValueChange={(v) => setYear(parseInt(v))}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => setYear(y => y + 1)}
                disabled={year >= currentYear}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              
              {/* YTD Filter Button */}
              <Button
                variant={filterYtd ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterYtd(f => !f)}
                className="ml-4"
                title={filterYtd 
                  ? "Mostra dati anno completo" 
                  : "Filtra dati ad oggi e confronta con stesso periodo anno precedente"
                }
              >
                <Filter className="h-4 w-4 mr-1" />
                {filterYtd ? `Ad Oggi (${ytdLabel})` : "Anno Completo"}
              </Button>
            </div>
            
            <Button 
              variant="outline" 
              size="sm" 
              onClick={loadData}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Aggiorna
            </Button>
          </div>

          {/* Mode info banner */}
          {filterYtd && (
            <div className="rounded-lg px-4 py-2 text-sm bg-blue-50 text-blue-700 border border-blue-200">
              <strong>Modalita Ad Oggi:</strong> Dati dal 1 Gennaio al {ytdLabel}/{year}. 
              Anno precedente comparato: 1 Gennaio - {ytdLabel}/{year - 1} (stessa finestra temporale).
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* KPI Cards */}
          <AnalyticsKPICards
            totalRevenue={kpis?.totalRevenue || 0}
            lyTotalRevenue={kpis?.lyTotalRevenue || 0}
            totalRevenueYoY={kpis?.revenueYoY || 0}
            adr={kpis?.adr || 0}
            lyAdr={kpis?.lyAdr || 0}
            adrYoY={kpis?.adrYoY || 0}
            roomNights={kpis?.totalRoomNights || 0}
            lyRoomNights={kpis?.lyTotalRoomNights || 0}
            roomNightsYoY={kpis?.roomNightsYoY || 0}
            occupancy={kpis?.occupancy || 0}
            lyOccupancy={kpis?.lyOccupancy || 0}
            occupancyYoY={kpis?.occupancyYoY || 0}
            revpar={kpis?.revpar || 0}
            lyRevpar={kpis?.lyRevpar || 0}
            loading={loading}
          />

          {/* Revenue YoY Chart */}
          <RevenueYoYChart
            monthlyData={data?.monthlyData || []}
            year={year}
            loading={loading}
          />

          {/* Day of Week Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DayOfWeekChart
              data={data?.dayOfWeekData || []}
              loading={loading}
              showYoY={filterYtd}
              year={year}
            />
            <ProductionDayOfWeekChart
              data={data?.productionDayOfWeekData || []}
              loading={loading}
              showYoY={filterYtd}
              year={year}
            />
          </div>

          {/* RevPAR & RevPOR Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RevParDayOfWeekChart
              data={data?.revparDayOfWeekData || []}
              loading={loading}
              showYoY={filterYtd}
              year={year}
            />
            <RevporDayOfWeekChart
              data={data?.productionDayOfWeekData || []}
              loading={loading}
              showYoY={filterYtd}
              year={year}
            />
          </div>

          {/* Finestra di prenotazione (lead time) */}
          <BookingWindowCard
            data={data?.bookingWindow}
            year={year}
            loading={loading}
          />

          {/* Cancellations */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <CancellationsPieChart
              data={data?.bookingStatusData || []}
              loading={loading}
            />
            
            {/* Annual Summary Card */}
            {!loading && kpis && (
              <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-transparent">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    Riepilogo {filterYtd ? `YTD al ${ytdLabel}` : "Annuale"} - {year}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Occupancy</div>
                      <div className="text-xl font-bold">{kpis.occupancy.toFixed(1)}%</div>
                      <div className="text-xs text-muted-foreground">AP: {kpis.lyOccupancy.toFixed(1)}%</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">RevPAR</div>
                      <div className="text-xl font-bold">
                        {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(kpis.revpar)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        AP: {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(kpis.lyRevpar)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">ADR Medio</div>
                      <div className="text-xl font-bold">
                        {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(kpis.adr)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        AP: {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(kpis.lyAdr)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Room Nights</div>
                      <div className="text-xl font-bold">
                        {new Intl.NumberFormat("it-IT").format(kpis.totalRoomNights)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        AP: {new Intl.NumberFormat("it-IT").format(kpis.lyTotalRoomNights)}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
