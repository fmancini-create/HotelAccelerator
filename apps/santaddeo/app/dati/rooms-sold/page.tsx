"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react"
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths } from "date-fns"
import { it } from "date-fns/locale"

import { CalendarScrollContainer } from "@/components/calendar/calendar-scroll-container"
import { accommodationReplace } from "@/lib/utils/accommodation-labels"

// Safe hook that doesn't throw if provider is missing
function useSafeHotel() {
  try {
    // Dynamic import to avoid crash if provider is missing
    const { useHotel } = require("@/lib/contexts/hotel-context")
    return useHotel()
  } catch {
    return null
  }
}

interface RoomType {
  id: string
  name: string
  scidoo_room_type_id: number
}

interface RoomData {
  sold: number
  total: number
  percentage: number
}

interface DayRoomsSold {
  date: string
  roomTypes: { [scidooRoomTypeId: string]: RoomData }
  totalRooms: number
  totalAvailable: number
  overallPercentage: number
}

// Production data: { room_type_code: { date: revenue } }
type ProductionMap = Record<string, Record<string, number>>

export default function DebugRoomsSoldPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([])
  const [roomsSold, setRoomsSold] = useState<DayRoomsSold[]>([])
  const [productionMap, setProductionMap] = useState<ProductionMap>({})
  const [loading, setLoading] = useState(true)
  const [hotelId, setHotelId] = useState<string | null>(null)
  const [hotelName, setHotelName] = useState<string>("")
  const [accommodationType, setAccommodationType] = useState<string>("camere")
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [dataSource, setDataSource] = useState<string | null>(null)
  const [fixing, setFixing] = useState(false)
  const [fixResult, setFixResult] = useState<string | null>(null)

  // Call safe hook at the top level of the component (won't crash if provider is missing)
  const hotelCtx = useSafeHotel()

  useEffect(() => {
    // Use hotel context if available
    if (hotelCtx?.selectedHotel) {
      setHotelId(hotelCtx.selectedHotel.id)
      setHotelName(hotelCtx.selectedHotel.name)
      setAccommodationType(hotelCtx.selectedHotel.accommodation_type || "camere")
      
      // Fetch last sync time
      fetch(`/api/pms/last-sync?hotel_id=${hotelCtx.selectedHotel.id}&module=availability`)
        .then(res => res.ok ? res.json() : null)
        .then(data => data && setLastSync(data.lastSync))
        .catch(() => {})
    } else {
      // Fallback to API call for compatibility
      fetch("/api/ui/selected-hotel")
        .then(res => res.json())
        .then(data => {
          if (data.error || !data.hotel) {
            setLoading(false)
            return
          }
          
          setHotelId(data.hotel.id)
          setHotelName(data.hotel.name)
          setAccommodationType(data.hotel.accommodation_type || "camere")
          
          // Fetch last sync time
          fetch(`/api/pms/last-sync?hotel_id=${data.hotel.id}&module=availability`)
            .then(res => res.ok ? res.json() : null)
            .then(syncData => syncData && setLastSync(syncData.lastSync))
            .catch(() => {})
        })
        .catch(error => {
          console.error("Error loading hotel:", error)
          setLoading(false)
        })
    }
  }, [hotelCtx?.selectedHotel])

  useEffect(() => {
    if (hotelId) {
      loadData()
    }
  }, [hotelId, currentMonth])

  async function loadData() {
    if (!hotelId) return
    setLoading(true)

    const monthStart = format(startOfMonth(currentMonth), "yyyy-MM-dd")
    const monthEnd = format(endOfMonth(currentMonth), "yyyy-MM-dd")

    try {
      const params = new URLSearchParams({
        hotel_id: hotelId,
        month_start: monthStart,
        month_end: monthEnd
      })

      const res = await fetch(`/api/dati/rooms-sold?${params}`)
      
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = "/login"
          return
        }
        throw new Error(`Errore ${res.status}`)
      }
      
      const contentType = res.headers.get("content-type")
      if (!contentType?.includes("application/json")) {
        throw new Error("La risposta non è in formato JSON")
      }
      
      const data = await res.json()

      if (data.error) throw new Error(data.error)

      setRoomTypes(data.roomTypes || [])
      setDataSource(data.dataSource || null)
      
      // dailyRoomsSold is { room_type_code: { date: rooms_sold } }
      const dailyRoomsSold = data.dailyRoomsSold || {}

      // Build rooms sold data per day
      const days = eachDayOfInterval({
        start: startOfMonth(currentMonth),
        end: endOfMonth(currentMonth)
      })

      const roomsSoldData: DayRoomsSold[] = days.map(day => {
        const dateStr = format(day, "yyyy-MM-dd")
        const dayData: DayRoomsSold = {
          date: dateStr,
          roomTypes: {},
          totalRooms: 0,
          totalAvailable: 0,
          overallPercentage: 0
        }

        // For each room type, check if there are rooms sold for this day
        for (const [roomTypeCode, dateRooms] of Object.entries(dailyRoomsSold)) {
          const roomData = (dateRooms as Record<string, RoomData>)[dateStr]
          if (roomData) {
            dayData.roomTypes[roomTypeCode] = roomData
            dayData.totalRooms += roomData.sold
            dayData.totalAvailable += roomData.total
          }
        }
        
        // Calculate overall percentage for the day
        dayData.overallPercentage = dayData.totalAvailable > 0 
          ? Math.round((dayData.totalRooms / dayData.totalAvailable) * 100) 
          : 0

        return dayData
      })

      setRoomsSold(roomsSoldData)

      // Fetch production data in parallel for tooltip overlay
      try {
        const prodRes = await fetch(`/api/dati/production?${params}`)
        if (prodRes.ok) {
          const prodData = await prodRes.json()
          setProductionMap(prodData.dailyPrices || {})
        }
      } catch {
        // Non-blocking: production tooltip is optional
      }

      setLoading(false)
    } catch (error) {
      console.error("Error loading data:", error)
      setLoading(false)
    }
  }

  async function fixMissingRoomTypes() {
    if (!hotelId) return
    setFixing(true)
    setFixResult(null)
    try {
      const res = await fetch("/api/dati/fix-room-type-etl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotel_id: hotelId }),
      })
      const data = await res.json()
      if (data.error) {
        setFixResult(`Errore: ${data.error}`)
      } else if (data.recordsInserted > 0) {
        setFixResult(`Corretto! Inseriti ${data.recordsInserted} record per tipologie: ${data.missingRoomTypes.join(", ")}`)
        // Reload data
        loadData()
      } else {
        setFixResult(data.message || "Nessuna correzione necessaria")
      }
    } catch (error: any) {
      setFixResult(`Errore: ${error.message}`)
    }
    setFixing(false)
  }

  const accReplace = (text: string) => accommodationReplace(text, accommodationType)
  
  // Today's date string for column highlighting
  const todayStr = format(new Date(), "yyyy-MM-dd")
  const todayIdx = roomsSold.findIndex((d) => d.date === todayStr)

  // Helper to format currency
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(amount)

  // Calculate totals
  const monthTotalRooms = roomsSold.reduce((sum, day) => sum + day.totalRooms, 0)

  // Build room type code mappings (name + display_order) from hotel config
  const roomTypeCodeToName: Record<string, string> = {}
  const roomTypeCodeToOrder: Record<string, number> = {}
  const activeScidooCodes = new Set<string>()
  for (const rt of roomTypes) {
    const code = rt.scidoo_room_type_id ? String(rt.scidoo_room_type_id) : rt.id
    roomTypeCodeToName[code] = rt.name
    roomTypeCodeToOrder[code] = rt.display_order ?? 999
    if (rt.is_active !== false) {
      activeScidooCodes.add(code)
    }
  }

  // Show ALL active room types from config + any unmapped codes from data
  const allRoomTypeCodes = new Set<string>(activeScidooCodes)
  for (const day of roomsSold) {
    for (const code of Object.keys(day.roomTypes)) {
      if (!roomTypeCodeToName[code]) {
        allRoomTypeCodes.add(code)
      }
    }
  }
  
  // Sort by display_order (from /settings/pms), then by name as fallback
  const sortedRoomTypeCodes = Array.from(allRoomTypeCodes).sort((a, b) => {
    const orderA = roomTypeCodeToOrder[a] ?? 999
    const orderB = roomTypeCodeToOrder[b] ?? 999
    if (orderA !== orderB) return orderA - orderB
    const nameA = roomTypeCodeToName[a] || a
    const nameB = roomTypeCodeToName[b] || b
    return nameA.localeCompare(nameB)
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b bg-white px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{accommodationReplace("Camere Vendute", accommodationType)}</h1>
          <p className="text-sm text-muted-foreground mt-1">{`${hotelName} - ${accommodationReplace("Camere vendute", accommodationType)} per giorno e tipologia`}</p>
  </div>
  </div>
      
      {/* Last Sync Info */}
      {(lastSync || dataSource) && (
        <div className="bg-muted/50 border-b px-6 py-2 flex items-center gap-4 text-sm text-muted-foreground">
          {lastSync && (
            <span className="flex items-center gap-2">
              <RefreshCw className="h-3.5 w-3.5" />
              Ultima sincronizzazione: <strong className="text-foreground">{format(new Date(lastSync), "dd MMM yyyy 'alle' HH:mm", { locale: it })}</strong>
            </span>
          )}
          {dataSource === "scidoo_raw_availability" && (
            <span className="text-amber-600 font-medium">
              Fonte dati: Scidoo raw (ETL non ancora elaborato)
            </span>
          )}
        </div>
      )}
      
      <main className="p-6">
        <div className="mx-auto max-w-[1800px] space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{accommodationReplace("% Occupazione per Giorno e Tipologia Camera", accommodationType)}</CardTitle>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="font-medium min-w-32 text-center">
                    {format(currentMonth, "MMMM yyyy", { locale: it })}
                  </span>
                  <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Totale mese: <strong>{monthTotalRooms} {accommodationReplace("camere vendute", accommodationType)}</strong> su {roomsSold.reduce((sum, day) => sum + day.totalAvailable, 0)} disponibili
              </p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">Caricamento...</div>
              ) : sortedRoomTypeCodes.length === 0 ? (
                <div className="text-center py-12 space-y-3">
                  <p className="text-lg font-medium text-muted-foreground">
                    {accommodationReplace("Nessuna tipologia di camera configurata", accommodationType)}
                  </p>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    Verifica che le tipologie di camera siano configurate correttamente nelle <a href="/settings/hotel" className="underline text-primary">impostazioni della struttura</a>.
                  </p>
                </div>
              ) : (
                <TooltipProvider delayDuration={100}>
                <CalendarScrollContainer columnCount={roomsSold.length} todayIndex={todayIdx}>
                  <table className="min-w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-muted">
                        <th className="border p-2 text-left sticky left-0 bg-muted z-10 min-w-[150px]">Tipologia</th>
                        <th className="border p-2 text-center sticky left-[150px] bg-muted z-10">Tot. Mese</th>
                        {roomsSold.map(day => {
                          const isToday = day.date === todayStr
                          return (
                            <th key={day.date} className={`border p-1 text-center min-w-[60px] ${isToday ? "bg-blue-600 text-white ring-2 ring-blue-600 ring-inset" : "bg-muted"}`}>
                              <div className="text-xs">{format(new Date(day.date), "EEE", { locale: it })}</div>
                              <div className="font-bold">{format(new Date(day.date), "d")}</div>
                              {isToday && <div className="text-[9px] font-semibold uppercase tracking-wider">OGGI</div>}
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRoomTypeCodes.map(code => {
                        const rtTotalSold = roomsSold.reduce((sum, day) => sum + (day.roomTypes[code]?.sold || 0), 0)
                        const rtTotalAvailable = roomsSold.reduce((sum, day) => sum + (day.roomTypes[code]?.total || 0), 0)
                        const rtAvgPercentage = rtTotalAvailable > 0 ? Math.round((rtTotalSold / rtTotalAvailable) * 100) : 0
                        return (
                          <tr key={code} className="hover:bg-muted/50">
                            <td className="border p-2 font-medium sticky left-0 bg-background z-10">
                              {roomTypeCodeToName[code] || `Tipo ${code}`}
                            </td>
                            <td className="border p-2 text-center font-bold sticky left-[150px] bg-background z-10">
                              {rtTotalSold > 0 ? (
                                <div>
                                  <div>{rtTotalSold}</div>
                                  <div className="text-[10px] text-muted-foreground font-normal">{rtAvgPercentage}%</div>
                                </div>
                              ) : "-"}
                            </td>
                            {roomsSold.map(day => {
                              const roomData = day.roomTypes[code]
                              const percentage = roomData?.percentage || 0
                              const sold = roomData?.sold || 0
                              const total = roomData?.total || 0
                              const isToday = day.date === todayStr
                              // Production revenue for this cell
                              const revenue = productionMap[code]?.[day.date] || 0
                              // Color based on percentage
                              let bgColor = "bg-gray-50"
                              if (percentage >= 75) bgColor = "bg-green-300"
                              else if (percentage >= 50) bgColor = "bg-green-200"
                              else if (percentage >= 25) bgColor = "bg-yellow-100"
                              else if (percentage > 0) bgColor = "bg-yellow-50"

                              return (
                                <Tooltip key={day.date}>
                                  <TooltipTrigger asChild>
                                    <td
                                      className={`border p-1 text-center cursor-default ${bgColor} ${isToday ? "ring-2 ring-blue-500 ring-inset" : ""}`}
                                    >
                                      {percentage > 0 ? (
                                        <div>
                                          <div className="font-medium text-xs">{sold}/{total}</div>
                                          <div className="text-[10px] text-muted-foreground">{percentage}%</div>
                                        </div>
                                      ) : (
                                        <div className="text-muted-foreground">-</div>
                                      )}
                                    </td>
                                  </TooltipTrigger>
                                  <TooltipContent className="text-base px-4 py-3">
                                    <div className="font-semibold">{roomTypeCodeToName[code] || `Tipo ${code}`}</div>
                                    <div className="text-sm">{format(new Date(day.date), "EEEE d MMMM", { locale: it })}</div>
                                    <div className="mt-2">{sold}/{total} {accReplace("camere")} ({percentage}%)</div>
                                    {revenue > 0 && (
                                      <div className="mt-1 font-medium text-green-600">Produzione: {formatCurrency(revenue)}</div>
                                    )}
                                  </TooltipContent>
                                </Tooltip>
                              )
                            })}
                          </tr>
                        )
                      })}
                      {/* Total row */}
                      <tr className="bg-muted font-bold">
                        <td className="border p-2 sticky left-0 bg-muted z-10">TOTALE</td>
                        <td className="border p-2 text-center sticky left-[150px] bg-muted z-10">
                          {monthTotalRooms > 0 ? (
                            <div>
                              <div>{monthTotalRooms}</div>
                              <div className="text-[10px] text-muted-foreground font-normal">{Math.round((monthTotalRooms / roomsSold.reduce((sum, day) => sum + day.totalAvailable, 0)) * 100)}%</div>
                            </div>
                          ) : "-"}
                        </td>
                        {roomsSold.map(day => {
                          const isToday = day.date === todayStr
                          // Total production for this day across all room types
                          const dayTotalRevenue = Object.values(productionMap).reduce(
                            (sum, rtMap) => sum + (rtMap[day.date] || 0), 0
                          )
                          return (
                            <Tooltip key={day.date}>
                              <TooltipTrigger asChild>
                                <td className={`border p-1 text-center cursor-default ${isToday ? "bg-blue-100 ring-2 ring-blue-500 ring-inset" : "bg-muted"}`}>
                                  {day.totalRooms > 0 ? (
                                    <div>
                                      <div className="font-bold text-xs">{day.totalRooms}/{day.totalAvailable}</div>
                                      <div className="text-[10px] text-muted-foreground font-normal">{day.overallPercentage}%</div>
                                    </div>
                                  ) : (
                                    <div className="text-muted-foreground">-</div>
                                  )}
                                </td>
                              </TooltipTrigger>
                              <TooltipContent className="text-base px-4 py-3">
                                <div className="font-semibold">Totale {format(new Date(day.date), "EEEE d MMMM", { locale: it })}</div>
                                <div className="mt-2">{day.totalRooms}/{day.totalAvailable} {accReplace("camere")} ({day.overallPercentage}%)</div>
                                {dayTotalRevenue > 0 && (
                                  <div className="mt-1 font-medium text-green-600">Produzione: {formatCurrency(dayTotalRevenue)}</div>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          )
                        })}
                      </tr>
                    </tbody>
                  </table>
                </CalendarScrollContainer>
                </TooltipProvider>
              )}
              
              <div className="mt-4 flex flex-wrap gap-4 text-sm">
                <div className="flex items-center gap-2"><span className="w-4 h-4 bg-gray-50 border"></span> 0%</div>
                <div className="flex items-center gap-2"><span className="w-4 h-4 bg-yellow-50 border"></span> 1-24%</div>
                <div className="flex items-center gap-2"><span className="w-4 h-4 bg-yellow-100 border"></span> 25-49%</div>
                <div className="flex items-center gap-2"><span className="w-4 h-4 bg-green-200 border"></span> 50-74%</div>
                <div className="flex items-center gap-2"><span className="w-4 h-4 bg-green-300 border"></span> 75-100%</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
