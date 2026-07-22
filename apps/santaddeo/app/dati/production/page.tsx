"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react"
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths } from "date-fns"
import { it } from "date-fns/locale"
import { PageHeader } from "@/components/layout/page-header"
import { CalendarScrollContainer } from "@/components/calendar/calendar-scroll-container"
import { accommodationReplace } from "@/lib/utils/accommodation-labels"

interface RoomType {
  id: string
  name: string
  scidoo_room_type_id: number
  display_order?: number
  is_active?: boolean
}

interface DayProduction {
  date: string
  roomTypes: { [scidooRoomTypeId: string]: number } // revenue per room type
  totalRevenue: number
}

export default function DebugProductionPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([])
  const [production, setProduction] = useState<DayProduction[]>([])
  const [loading, setLoading] = useState(true)
  const [hotelId, setHotelId] = useState<string | null>(null)
  const [hotelName, setHotelName] = useState<string>("")
  const [accommodationType, setAccommodationType] = useState<string>("camere")
  const [lastSync, setLastSync] = useState<string | null>(null)

  useEffect(() => {
    loadUserHotel()
  }, [])

  useEffect(() => {
    if (hotelId) {
      loadData()
    }
  }, [hotelId, currentMonth])

  async function loadUserHotel() {
    try {
      const res = await fetch("/api/ui/selected-hotel")
      const data = await res.json()
      
      if (data.error || !data.hotel) {
        setLoading(false)
        return
      }
      
      setHotelId(data.hotel.id)
      setHotelName(data.hotel.name)
      setAccommodationType(data.hotel.accommodation_type || "camere")
      
      // Fetch last sync time
      const syncRes = await fetch(`/api/pms/last-sync?hotel_id=${data.hotel.id}&module=production`)
      if (syncRes.ok) {
        const syncData = await syncRes.json()
        setLastSync(syncData.lastSync)
      }
    } catch (error) {
      console.error("Error loading hotel:", error)
      setLoading(false)
    }
  }

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

      const res = await fetch(`/api/dati/production?${params}`, { cache: "no-store" })
      
      // Get content type to check if it's JSON
      const contentType = res.headers.get("content-type")
      
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = "/login"
          return
        }
        // Try to get error message from response
        const errorText = await res.text()
        console.error("[v0] API error response:", errorText)
        throw new Error(`Errore ${res.status}: ${errorText.substring(0, 100)}`)
      }
      
      // Check if response is JSON
      if (!contentType?.includes("application/json")) {
        throw new Error("La risposta non è in formato JSON")
      }
      
      const data = await res.json()

      if (data.error) throw new Error(data.error)

      setRoomTypes(data.roomTypes || [])
      
      // dailyPrices is { room_type_code: { date: revenue } }
      const dailyPrices = data.dailyPrices || {}
      
      // Build production data per day
      const days = eachDayOfInterval({
        start: startOfMonth(currentMonth),
        end: endOfMonth(currentMonth)
      })

      const productionData: DayProduction[] = days.map(day => {
        const dateStr = format(day, "yyyy-MM-dd")
        const dayProduction: DayProduction = {
          date: dateStr,
          roomTypes: {},
          totalRevenue: 0
        }

        // For each room type, check if there's revenue for this day
        for (const [roomTypeCode, dateRevenues] of Object.entries(dailyPrices)) {
          const revenue = (dateRevenues as Record<string, number>)[dateStr] || 0
          if (revenue > 0) {
            dayProduction.roomTypes[roomTypeCode] = revenue
            dayProduction.totalRevenue += revenue
          }
        }

        return dayProduction
      })

      setProduction(productionData)
      setLoading(false)
    } catch (error) {
      console.error("Error loading data:", error)
      setLoading(false)
    }
  }

  const accReplace = (text: string) => accommodationReplace(text, accommodationType)
  
  // Today's date string for column highlighting
  const todayStr = format(new Date(), "yyyy-MM-dd")
  const todayIdx = production.findIndex((d) => d.date === todayStr)

  // Calculate totals
  const monthTotalRevenue = production.reduce((sum, day) => sum + day.totalRevenue, 0)

  // dailyPrices keys are room_type_name strings (from ETL backfill).
  // Build lookup by name so we never create duplicate rows.
  const roomTypeCodeToName: Record<string, string> = {}
  const roomTypeCodeToOrder: Record<string, number> = {}
  const activeScidooCodes = new Set<string>()

  // Collect all keys actually present in production data
  const keysInData = new Set<string>()
  for (const day of production) {
    for (const code of Object.keys(day.roomTypes)) keysInData.add(code)
  }

  // Determine if the API returned name-based keys or numeric-id-based keys
  // If any key matches a room type name exactly → name-based mode
  const rtNameSet = new Set(roomTypes.map(rt => rt.name))
  const isNameBased = Array.from(keysInData).some(k => rtNameSet.has(k))

  for (const rt of roomTypes) {
    // In name-based mode use rt.name as the key; otherwise use scidoo_room_type_id/uuid
    const code = isNameBased ? rt.name : (rt.scidoo_room_type_id ? String(rt.scidoo_room_type_id) : rt.id)
    roomTypeCodeToName[code] = rt.name
    roomTypeCodeToOrder[code] = rt.display_order ?? 999
    if (rt.is_active !== false) activeScidooCodes.add(code)
  }

  // Start from active room types, then add any name-keyed codes from data not already present
  const allRoomTypeCodes = new Set<string>(activeScidooCodes)
  for (const code of keysInData) {
    if (code && code !== "0" && code !== "unknown") allRoomTypeCodes.add(code)
  }

  // Sort by display_order then name
  const sortedRoomTypeCodes = Array.from(allRoomTypeCodes).sort((a, b) => {
    const orderA = roomTypeCodeToOrder[a] ?? 999
    const orderB = roomTypeCodeToOrder[b] ?? 999
    if (orderA !== orderB) return orderA - orderB
    const nameA = roomTypeCodeToName[a] || a
    const nameB = roomTypeCodeToName[b] || b
    return nameA.localeCompare(nameB)
  })

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(amount)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b bg-white px-6 py-4">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Produzione</h1>
        <p className="text-sm text-muted-foreground mt-1">{`${hotelName} - Ricavi per giorno e tipologia ${accommodationType === "camere" ? "camera" : accommodationType.slice(0, -1)}`}</p>
      </div>
      
      {/* Last Sync Info */}
      {lastSync && (
        <div className="bg-muted/50 border-b px-6 py-2 flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Ultima sincronizzazione: <strong className="text-foreground">{format(new Date(lastSync), "dd MMM yyyy 'alle' HH:mm", { locale: it })}</strong></span>
        </div>
      )}
      
      <main className="p-6">
        <div className="mx-auto max-w-[1800px] space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{accReplace("Ricavi per Giorno e Tipologia Camera")}</CardTitle>
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
                Totale mese: <strong>{formatCurrency(monthTotalRevenue)}</strong>
              </p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">Caricamento...</div>
              ) : sortedRoomTypeCodes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {accReplace("Nessuna tipologia di camera configurata per questa struttura.")}
                  Verifica la configurazione nelle <a href="/settings/hotel" className="underline text-primary">impostazioni</a>.
                </div>
              ) : (
                <CalendarScrollContainer columnCount={production.length} todayIndex={todayIdx}>
                  <table className="min-w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-muted">
                        <th className="border p-2 text-left sticky left-0 bg-muted z-10 min-w-[150px]">Tipologia</th>
                        <th className="border p-2 text-center sticky left-[150px] bg-muted z-10">Tot. Mese</th>
                        {production.map(day => {
                          const isToday = day.date === todayStr
                          return (
                            <th key={day.date} className={`border p-1 text-center min-w-[60px] ${isToday ? "bg-blue-600 text-white ring-2 ring-blue-600 ring-inset" : ""}`}>
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
                        const rtTotal = production.reduce((sum, day) => sum + (day.roomTypes[code] || 0), 0)
                        return (
                          <tr key={code} className="hover:bg-muted/50">
                            <td className="border p-2 font-medium sticky left-0 bg-background z-10">
                              {roomTypeCodeToName[code] || code}
                            </td>
                            <td className="border p-2 text-center font-bold sticky left-[150px] bg-background z-10">
                              {rtTotal > 0 ? formatCurrency(rtTotal) : "-"}
                            </td>
                            {production.map(day => {
                              const revenue = day.roomTypes[code] || 0
                              const isToday = day.date === todayStr
                              // Color based on revenue
                              let bgColor = "bg-gray-50"
                              if (revenue >= 200) bgColor = "bg-green-200"
                              else if (revenue >= 100) bgColor = "bg-green-100"
                              else if (revenue > 0) bgColor = "bg-yellow-100"
                              
                              return (
                                <td key={day.date} className={`border p-1 text-center ${bgColor} ${isToday ? "ring-2 ring-blue-500 ring-inset" : ""}`}>
                                  {revenue > 0 ? (
                                    <div className="font-medium text-xs">{Math.round(revenue)}</div>
                                  ) : (
                                    <div className="text-muted-foreground">-</div>
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                      {/* Total row */}
                      <tr className="bg-muted font-bold">
                        <td className="border p-2 sticky left-0 bg-muted z-10">TOTALE</td>
                        <td className="border p-2 text-center sticky left-[150px] bg-muted z-10">
                          {formatCurrency(monthTotalRevenue)}
                        </td>
                        {production.map(day => {
                          const isToday = day.date === todayStr
                          return (
                            <td key={day.date} className={`border p-1 text-center ${isToday ? "bg-blue-100 ring-2 ring-blue-500 ring-inset" : "bg-muted"}`}>
                              <div className="font-bold text-xs">{day.totalRevenue > 0 ? Math.round(day.totalRevenue) : "-"}</div>
                            </td>
                          )
                        })}
                      </tr>
                    </tbody>
                  </table>
                </CalendarScrollContainer>
              )}
              
              <div className="mt-4 flex gap-4 text-sm">
                <div className="flex items-center gap-2"><span className="w-4 h-4 bg-gray-50 border"></span> Nessuna</div>
                <div className="flex items-center gap-2"><span className="w-4 h-4 bg-yellow-100 border"></span> {'< 100'}</div>
                <div className="flex items-center gap-2"><span className="w-4 h-4 bg-green-100 border"></span> 100-199</div>
                <div className="flex items-center gap-2"><span className="w-4 h-4 bg-green-200 border"></span> {'>= 200'}</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
