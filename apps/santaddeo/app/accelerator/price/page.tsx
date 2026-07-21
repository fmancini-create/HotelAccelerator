"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChevronLeft, ChevronRight, Filter } from "lucide-react"
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
} from "date-fns"
import { it } from "date-fns/locale"

import { CalendarScrollContainer } from "@/components/calendar/calendar-scroll-container"

interface RoomType {
  id: string
  name: string
  scidoo_room_type_id: number
  display_order?: number
  is_active?: boolean
  total_rooms?: number
}

interface DayData {
  date: string
  roomTypes: Record<string, number>
  totalRevenue: number
}

export default function AcceleratorPricePage() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([])
  const [channels, setChannels] = useState<string[]>([])
  const [production, setProduction] = useState<DayData[]>([])
  const [dailyPricesByChannel, setDailyPricesByChannel] = useState<
    Record<string, Record<string, Record<string, number>>>
  >({})
  const [occupancy, setOccupancy] = useState<
    Record<string, Record<string, { occupied: number; total: number }>>
  >({})
  const [loading, setLoading] = useState(true)
  const [hotelId, setHotelId] = useState<string | null>(null)
  const [hotelName, setHotelName] = useState<string>("")
  const [selectedChannelFilter, setSelectedChannelFilter] = useState<string>("all")
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [unauthorized, setUnauthorized] = useState(false)

  useEffect(() => {
    loadUserHotel()
  }, [])

  useEffect(() => {
    if (hotelId && !unauthorized) {
      loadData()
    }
  }, [hotelId, unauthorized, currentMonth])

  async function loadUserHotel() {
    try {
      const meRes = await fetch("/api/auth/me")
      const meData = await meRes.json()
      const allowedRoles = ["super_admin", "system_admin", "property_admin", "villa_admin"]
      const userRole = meData.role || meData.user?.role
      if (!meData.is_superadmin && !allowedRoles.includes(userRole)) {
        setUnauthorized(true)
        setLoading(false)
        return
      }
      setIsSuperAdmin(meData.is_superadmin || false)

      const res = await fetch("/api/ui/selected-hotel")
      const data = await res.json()

      if (data.error || !data.hotel) {
        setLoading(false)
        return
      }

      setHotelId(data.hotel.id)
      setHotelName(data.hotel.name)
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
        month_end: monthEnd,
      })

      // Use channel-production API (groups by channel)
      const res = await fetch(`/api/accelerator/channel-production?hotelId=${hotelId}&month=${currentMonth.toISOString()}`)

      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = "/auth/login"
          return
        }
        throw new Error(`Errore ${res.status}`)
      }

      const data = await res.json()
      if (data.error) throw new Error(data.error)

      setRoomTypes(data.roomTypes || [])
      setChannels(data.channels || [])
      setDailyPricesByChannel(data.dailyPricesByRate || {})
      setOccupancy(data.occupancy || {})

      // dailyPricesByRate is keyed: { roomTypeId: { channel: { date: revenue } } }
      // We aggregate across all channels to get total revenue per room type per day
      const dailyPricesByRate = data.dailyPricesByRate || {}
      const days = eachDayOfInterval({
        start: startOfMonth(currentMonth),
        end: endOfMonth(currentMonth),
      })

      const productionData: DayData[] = days.map((day) => {
        const dateStr = format(day, "yyyy-MM-dd")
        const dayProduction: DayData = {
          date: dateStr,
          roomTypes: {},
          totalRevenue: 0,
        }

        for (const [roomTypeId, channelMap] of Object.entries(dailyPricesByRate)) {
          let rtRevenue = 0
          for (const [, dateRevenues] of Object.entries(channelMap as Record<string, Record<string, number>>)) {
            rtRevenue += (dateRevenues as Record<string, number>)[dateStr] || 0
          }
          if (rtRevenue > 0) {
            dayProduction.roomTypes[roomTypeId] = (dayProduction.roomTypes[roomTypeId] || 0) + rtRevenue
            dayProduction.totalRevenue += rtRevenue
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

  // Build code-to-name and code-to-id maps
  const roomTypeCodeToName: Record<string, string> = {}
  const roomTypeCodeToOrder: Record<string, number> = {}
  const roomTypeCodeToId: Record<string, string> = {}
  const roomTypeCodeToTotalRooms: Record<string, number> = {}
  for (const rt of roomTypes) {
    if (rt.scidoo_room_type_id) {
      const code = String(rt.scidoo_room_type_id)
      roomTypeCodeToName[code] = rt.name
      roomTypeCodeToOrder[code] = rt.display_order ?? 999
      roomTypeCodeToId[code] = rt.id
      roomTypeCodeToTotalRooms[code] = rt.total_rooms ?? 0
    }
    roomTypeCodeToName[rt.id] = rt.name
    roomTypeCodeToOrder[rt.id] = rt.display_order ?? 999
    roomTypeCodeToId[rt.id] = rt.id
    roomTypeCodeToTotalRooms[rt.id] = rt.total_rooms ?? 0
  }

  // Sorted active room type codes
  const sortedRoomTypeCodes = useMemo(() => {
    const codes = new Set<string>()

    for (const rt of roomTypes) {
      if (rt.is_active !== false) {
        codes.add(rt.id)
      }
    }

    for (const rt of roomTypes) {
      if (rt.scidoo_room_type_id && rt.is_active !== false) {
        const scidooCode = String(rt.scidoo_room_type_id)
        const appearsInProduction = production.some((day) => day.roomTypes[scidooCode] !== undefined)
        if (appearsInProduction) codes.add(scidooCode)
      }
    }

    for (const day of production) {
      for (const code of Object.keys(day.roomTypes)) {
        if (!codes.has(code)) codes.add(code)
      }
    }

    return Array.from(codes).sort((a, b) => {
      const orderA = roomTypeCodeToOrder[a] ?? 999
      const orderB = roomTypeCodeToOrder[b] ?? 999
      if (orderA !== orderB) return orderA - orderB
      return (roomTypeCodeToName[a] || a).localeCompare(roomTypeCodeToName[b] || b)
    })
  }, [roomTypes, production])

  // Filter channels to show based on selection
  const filteredChannels = useMemo(() => {
    if (selectedChannelFilter === "all") {
      return channels
    }
    return [selectedChannelFilter]
  }, [selectedChannelFilter, channels])

  const todayStr = format(new Date(), "yyyy-MM-dd")
  const todayIdx = production.findIndex((d) => d.date === todayStr)
  
  const monthTotalRevenue = useMemo(() => {
    const uuidCodes = new Set(roomTypes.filter(rt => rt.is_active !== false).map(rt => rt.id))
    return production.reduce((sum, day) => {
      let daySum = 0
      for (const [code, revenue] of Object.entries(day.roomTypes)) {
        if (uuidCodes.has(code)) daySum += revenue
      }
      return sum + daySum
    }, 0)
  }, [production, roomTypes])

  // Totale del canale selezionato (mese), coerente con le righe canale mostrate
  const channelMonthTotal = useMemo(() => {
    if (selectedChannelFilter === "all") return 0
    return sortedRoomTypeCodes.reduce((sum, code) => {
      const dateRevenues = dailyPricesByChannel[code]?.[selectedChannelFilter] || {}
      for (const rev of Object.values(dateRevenues)) sum += rev || 0
      return sum
    }, 0)
  }, [selectedChannelFilter, sortedRoomTypeCodes, dailyPricesByChannel])

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
    }).format(amount)

  const formatShortCurrency = (amount: number) => {
    if (amount === 0) return "-"
    return Math.round(amount).toString()
  }

  function getOccupancy(
    roomTypeCode: string,
    dateStr: string
  ): { occupied: number; total: number; pct: number } | null {
    const rtId = roomTypeCodeToId[roomTypeCode]
    if (!rtId || !occupancy[rtId]) return null
    const dayData = occupancy[rtId][dateStr]
    if (!dayData) return null
    const pct =
      dayData.total > 0 ? (dayData.occupied / dayData.total) * 100 : 0
    return { ...dayData, pct }
  }

  function getChannelRevenue(
    roomTypeCode: string,
    channel: string,
    dateStr: string
  ): number {
    return dailyPricesByChannel[roomTypeCode]?.[channel]?.[dateStr] || 0
  }

  function getChannelsForRoomType(roomTypeCode: string): string[] {
    const channelData = dailyPricesByChannel[roomTypeCode] || {}
    const allChannelsInData = Object.keys(channelData)
    return allChannelsInData.filter((ch) => {
      if (selectedChannelFilter === "all") return true
      return filteredChannels.includes(ch)
    })
  }

  if (unauthorized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Accesso non autorizzato
            </h2>
            <p className="text-muted-foreground">
              Questa pagina e' accessibile solo agli amministratori del sistema.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="border-b bg-white px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Produzione per Canali</h1>
          <p className="text-sm text-muted-foreground mt-1">{`${hotelName} - Produzione e occupazione per canale di vendita`}</p>
        </div>
      </div>

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-[1800px] space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-foreground">
                    Produzione per Canali
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Totale mese:{" "}
                    <strong className="text-foreground">
                      {formatCurrency(monthTotalRevenue)}
                    </strong>
                  </p>
                  {selectedChannelFilter !== "all" && (
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Totale {selectedChannelFilter}:{" "}
                      <strong className="text-foreground">
                        {formatCurrency(channelMonthTotal)}
                      </strong>{" "}
                      <span className="text-foreground">
                        ({monthTotalRevenue > 0 ? ((channelMonthTotal / monthTotalRevenue) * 100).toFixed(1) : "0"}% del totale)
                      </span>
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {/* Channel Filter */}
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <Select
                      value={selectedChannelFilter}
                      onValueChange={setSelectedChannelFilter}
                    >
                      <SelectTrigger className="w-[220px]">
                        <SelectValue placeholder="Tutti i canali" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">
                          Tutti i canali
                        </SelectItem>
                        {channels.map((channel) => (
                          <SelectItem key={channel} value={channel}>
                            {channel}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Month navigation */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        setCurrentMonth(subMonths(currentMonth, 1))
                      }
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="font-medium min-w-32 text-center text-foreground">
                      {format(currentMonth, "MMMM yyyy", { locale: it })}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        setCurrentMonth(addMonths(currentMonth, 1))
                      }
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Caricamento...
                </div>
              ) : sortedRoomTypeCodes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nessuna tipologia di camera configurata per questa struttura.
                  Verifica la configurazione nelle{" "}
                  <a
                    href="/settings/hotel"
                    className="underline text-primary"
                  >
                    impostazioni
                  </a>
                  .
                </div>
              ) : (
                <CalendarScrollContainer columnCount={production.length} todayIndex={todayIdx}>
                  <table className="min-w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-muted">
                        <th className="border border-border p-2 text-left sticky left-0 bg-muted z-10 min-w-[220px] w-[220px] text-foreground">
                          Tipologia / Canale
                        </th>
                        <th className="border border-border p-2 text-center sticky left-[220px] bg-muted z-10 min-w-[90px] text-foreground">
                          Tot. Mese
                        </th>
                        {production.map((day) => {
                          const isToday = day.date === todayStr
                          return (
                            <th
                              key={day.date}
                              className={`border border-border p-1 text-center min-w-[60px] ${
                                isToday
                                  ? "bg-primary text-primary-foreground ring-2 ring-primary ring-inset"
                                  : "text-foreground"
                              }`}
                            >
                              <div className="text-xs">
                                {format(new Date(day.date), "EEE", {
                                  locale: it,
                                })}
                              </div>
                              <div className="font-bold">
                                {format(new Date(day.date), "d")}
                              </div>
                              {isToday && (
                                <div className="text-[9px] font-semibold uppercase tracking-wider">
                                  OGGI
                                </div>
                              )}
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRoomTypeCodes.map((code) => {
                        const rtTotal = production.reduce(
                          (sum, day) =>
                            sum + (day.roomTypes[code] || 0),
                          0
                        )
                        const channelsForRT = getChannelsForRoomType(code)

                        return (
                          <RoomTypeBlock
                            key={code}
                            code={code}
                            name={
                              roomTypeCodeToName[code] ||
                              `Tipo ${code}`
                            }
                            rtTotal={rtTotal}
                            production={production}
                            todayStr={todayStr}
                            getOccupancy={(dateStr) =>
                              getOccupancy(code, dateStr)
                            }
                            channels={channelsForRT}
                            getChannelRevenue={(channel, dateStr) =>
                              getChannelRevenue(code, channel, dateStr)
                            }
                            formatShortCurrency={formatShortCurrency}
                            formatCurrency={formatCurrency}
                          />
                        )
                      })}

                      {/* Total row */}
                      <tr className="bg-muted font-bold">
                        <td className="border border-border p-2 sticky left-0 bg-muted z-10 min-w-[220px] w-[220px] text-foreground">
                          TOTALE
                        </td>
                        <td className="border border-border p-2 text-center sticky left-[220px] bg-muted z-10 min-w-[90px] text-foreground">
                          {formatCurrency(monthTotalRevenue)}
                        </td>
                        {production.map((day) => {
                          const isToday = day.date === todayStr
                          const uuidSet = new Set(roomTypes.filter(rt => rt.is_active !== false).map(rt => rt.id))
                          const dayTotal = Object.entries(day.roomTypes).reduce((s, [code, rev]) => uuidSet.has(code) ? s + rev : s, 0)
                          return (
                            <td
                              key={day.date}
                              className={`border border-border p-1 text-center ${
                                isToday
                                  ? "bg-primary/10 ring-2 ring-primary ring-inset"
                                  : "bg-muted"
                              }`}
                            >
                              <div className="font-bold text-xs text-foreground">
                                {dayTotal > 0 ? Math.round(dayTotal) : "-"}
                              </div>
                            </td>
                          )
                        })}
                      </tr>

                      {/* Channel total row (only when a channel is selected) */}
                      {selectedChannelFilter !== "all" && (
                        <tr className="bg-blue-50 font-bold">
                          <td className="border border-border p-2 sticky left-0 bg-blue-50 z-10 min-w-[220px] w-[220px] text-foreground">
                            <span className="block truncate" title={selectedChannelFilter}>
                              TOTALE {selectedChannelFilter}
                            </span>
                          </td>
                          <td className="border border-border p-2 text-center sticky left-[220px] bg-blue-50 z-10 min-w-[90px] text-foreground whitespace-nowrap">
                            {channelMonthTotal > 0 ? formatCurrency(channelMonthTotal) : "-"}
                          </td>
                          {production.map((day) => {
                            const isToday = day.date === todayStr
                            const dayChannelTotal = sortedRoomTypeCodes.reduce(
                              (s, code) => s + getChannelRevenue(code, selectedChannelFilter, day.date),
                              0
                            )
                            return (
                              <td
                                key={day.date}
                                className={`border border-border p-1 text-center ${
                                  isToday ? "ring-2 ring-primary ring-inset" : ""
                                }`}
                              >
                                <div className="font-bold text-xs text-foreground">
                                  {dayChannelTotal > 0 ? Math.round(dayChannelTotal) : "-"}
                                </div>
                              </td>
                            )
                          })}
                        </tr>
                      )}
                    </tbody>
                  </table>
                </CalendarScrollContainer>
              )}

              <div className="mt-4 flex flex-wrap gap-4 text-sm">
                <span className="font-medium text-foreground">
                  Legenda produzione:
                </span>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 bg-muted border border-border rounded-sm" />
                  <span className="text-muted-foreground">Nessuna</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 bg-yellow-100 border border-border rounded-sm" />
                  <span className="text-muted-foreground">{"< 100"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 bg-green-100 border border-border rounded-sm" />
                  <span className="text-muted-foreground">100-199</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 bg-green-200 border border-border rounded-sm" />
                  <span className="text-muted-foreground">{">= 200"}</span>
                </div>
                <span className="ml-4 font-medium text-foreground">
                  Occupazione:
                </span>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 bg-red-200 border border-border rounded-sm" />
                  <span className="text-muted-foreground">{"90-100%"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 bg-orange-200 border border-border rounded-sm" />
                  <span className="text-muted-foreground">{"70-89%"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 bg-yellow-100 border border-border rounded-sm" />
                  <span className="text-muted-foreground">{"50-69%"}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}

// --- Sub-component for a room type block ---

interface RoomTypeBlockProps {
  code: string
  name: string
  rtTotal: number
  production: DayData[]
  todayStr: string
  getOccupancy: (dateStr: string) => {
    occupied: number
    total: number
    pct: number
  } | null
  channels: string[]
  getChannelRevenue: (channel: string, dateStr: string) => number
  formatShortCurrency: (amount: number) => string
  formatCurrency: (amount: number) => string
}

function RoomTypeBlock({
  code,
  name,
  rtTotal,
  production,
  todayStr,
  getOccupancy,
  channels,
  getChannelRevenue,
  formatShortCurrency,
  formatCurrency,
}: RoomTypeBlockProps) {
  return (
    <>
      {/* Room Type header row */}
      <tr className="bg-accent/40 hover:bg-accent/60 border-t-2 border-border">
        <td className="border border-border p-2 font-semibold sticky left-0 bg-accent z-10 min-w-[220px] w-[220px] text-foreground">
          <span className="block truncate" title={name}>{name}</span>
        </td>
        <td className="border border-border p-2 text-center font-bold sticky left-[220px] bg-accent z-10 min-w-[90px] text-foreground whitespace-nowrap">
          {rtTotal > 0 ? formatCurrency(rtTotal) : "-"}
        </td>
        {production.map((day) => {
          const revenue = day.roomTypes[code] || 0
          const occ = getOccupancy(day.date)
          const isToday = day.date === todayStr

          let bgColor = "bg-muted/30"
          if (revenue >= 200) bgColor = "bg-green-200"
          else if (revenue >= 100) bgColor = "bg-green-100"
          else if (revenue > 0) bgColor = "bg-yellow-100"

          return (
            <td
              key={day.date}
              className={`border border-border p-1 text-center ${bgColor} ${
                isToday
                  ? "ring-2 ring-primary ring-inset"
                  : ""
              }`}
            >
              <div className="font-bold text-xs text-foreground">
                {revenue > 0 ? formatShortCurrency(revenue) : "-"}
              </div>
              {occ ? (
                <div
                  className={`text-[10px] font-medium rounded px-0.5 mt-0.5 ${
                    occ.pct >= 90
                      ? "text-red-700 bg-red-100"
                      : occ.pct >= 70
                        ? "text-orange-700 bg-orange-100"
                        : occ.pct >= 50
                          ? "text-yellow-700 bg-yellow-50"
                          : "text-muted-foreground"
                  }`}
                >
                  {occ.occupied}/{occ.total}
                </div>
              ) : (
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  -
                </div>
              )}
            </td>
          )
        })}
      </tr>

      {/* Channel rows under this room type */}
      {channels.map((channel) => {
        const channelTotal = production.reduce(
          (sum, day) => sum + getChannelRevenue(channel, day.date),
          0
        )

        return (
          <tr
            key={`${code}-${channel}`}
            className="hover:bg-muted/30"
          >
            <td className="border border-border p-2 pl-4 sticky left-0 bg-background z-10 min-w-[220px] w-[220px]">
              <div className="flex items-center gap-1.5 overflow-hidden">
                <Badge
                  variant="outline"
                  className="text-[10px] px-1 py-0 font-normal shrink-0"
                >
                  Canale
                </Badge>
                <span className="text-[11px] text-muted-foreground truncate" title={channel}>
                  {channel}
                </span>
              </div>
            </td>
            <td className="border border-border p-2 text-center text-xs font-medium sticky left-[220px] bg-background z-10 min-w-[90px] text-foreground whitespace-nowrap">
              {channelTotal > 0 ? formatCurrency(channelTotal) : "-"}
            </td>
            {production.map((day) => {
              const rev = getChannelRevenue(channel, day.date)
              const isToday = day.date === todayStr

              return (
                <td
                  key={day.date}
                  className={`border border-border p-1 text-center ${
                    isToday
                      ? "ring-2 ring-primary ring-inset"
                      : ""
                  } ${rev > 0 ? "bg-blue-50" : ""}`}
                >
                  <div className="text-xs text-foreground">
                    {rev > 0 ? formatShortCurrency(rev) : "-"}
                  </div>
                </td>
              )
            })}
          </tr>
        )
      })}
    </>
  )
}
