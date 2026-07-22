"use client"

import React, { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { ChevronLeft, ChevronRight, Loader2, GripVertical, AlertTriangle } from "lucide-react"
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addDays, subDays } from "date-fns"
import { it } from "date-fns/locale"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

interface RoomType {
  id: string
  name: string
  total_rooms: number
  is_active: boolean
  display_order?: number
  pms_room_type_id?: string
}

interface DailyData {
  date: string
  roomTypeId: string
  availability: number
  occupancy: number
  minstay: number | null
}

interface AvailabilityCalendarProps {
  hotelId: string
}

function SortableRow({
  roomType,
  dates,
  getDataForDateAndRoom,
  index,
  rowType,
}: {
  roomType: RoomType
  dates: Date[]
  getDataForDateAndRoom: (date: Date, roomTypeId: string) => DailyData | undefined
  index: number
  rowType: "available" | "occupied" | "minstay"
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `${roomType.id}-${rowType}`,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const getRowLabel = () => {
    switch (rowType) {
      case "available":
        return "Disponibilità"
      case "occupied":
        return "Occupate"
      case "minstay":
        return "Minimum Stay"
    }
  }

  const getCellValue = (data: DailyData | undefined) => {
    if (!data) return "-"
    switch (rowType) {
      case "available":
        return data.availability
      case "occupied":
        return data.occupancy
      case "minstay":
        return data.minstay !== null ? data.minstay : "-"
    }
  }

  const getCellColor = (data: DailyData | undefined) => {
    if (!data) return "text-muted-foreground"
    switch (rowType) {
      case "available": {
        const available = data.availability
        const total = roomType.total_rooms
        const percentage = total > 0 ? (available / total) * 100 : 0
        if (percentage === 0) return "text-red-600 font-semibold"
        if (percentage < 30) return "text-orange-600 font-semibold"
        return "text-green-600 font-medium"
      }
      case "occupied":
        return "text-blue-600 font-medium"
      case "minstay":
        return "text-purple-600 font-medium"
    }
  }

  return (
    <tr ref={setNodeRef} style={style} className={index % 2 === 0 ? "bg-background" : "bg-muted/20"}>
      <td className="sticky left-0 z-10 border-r bg-inherit p-2">
        <div className="flex items-center gap-2">
          {rowType === "available" && (
            <button
              {...attributes}
              {...listeners}
              className="cursor-grab touch-none hover:text-primary active:cursor-grabbing"
            >
              <GripVertical className="h-4 w-4" />
            </button>
          )}
          {rowType !== "available" && <div className="w-4" />}
          <div className="flex flex-col">
            {rowType === "available" && <span className="font-medium text-sm">{roomType.name}</span>}
            <span className={`text-xs ${rowType === "available" ? "text-muted-foreground" : "text-sm"}`}>
              {getRowLabel()}
            </span>
          </div>
        </div>
      </td>
      <td className="border-r p-2 text-center text-sm">{rowType === "available" ? roomType.total_rooms : "-"}</td>
      {dates.map((date) => {
        const data = getDataForDateAndRoom(date, roomType.id)
        const value = getCellValue(data)
        const colorClass = getCellColor(data)
        return (
          <td key={date.toISOString()} className="border-r p-2 text-center text-sm">
            <span className={colorClass}>{value}</span>
          </td>
        )
      })}
    </tr>
  )
}

export function AvailabilityCalendar({ hotelId }: AvailabilityCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([])
  const [dailyData, setDailyData] = useState<DailyData[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [hasMappings, setHasMappings] = useState(true)

  const [scrollContainerRef, setScrollContainerRef] = useState<HTMLDivElement | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const startDate = subDays(startOfMonth(currentDate), 3)
  const endDate = addDays(endOfMonth(currentDate), 3)
  const dates = eachDayOfInterval({ start: startDate, end: endDate })

  const loadData = async () => {
    setLoading(true)
    console.log("[v0] Loading calendar data for hotel:", hotelId)

    try {
      const response = await fetch(`/api/calendar?hotelId=${hotelId}&date=${currentDate.toISOString()}`)
      const data = await response.json()

      console.log("[v0] Calendar API response:", {
        hasMappings: data.hasMappings,
        roomTypes: data.roomTypes?.length || 0,
        availability: data.availability?.length || 0,
        occupancy: data.occupancy?.length || 0,
        minstay: data.minstay?.length || 0,
      })

      setHasMappings(data.hasMappings !== false)
      setRoomTypes(data.roomTypes || [])

      const mergedData: DailyData[] = []
      const availabilityMap = new Map(data.availability?.map((a: any) => [`${a.date}|${a.room_type_id}`, a]) || [])
      const occupancyMap = new Map(data.occupancy?.map((o: any) => [`${o.date}|${o.room_type_id}`, o]) || [])
      const minstayMap = new Map(data.minstay?.map((m: any) => [`${m.date}|${m.room_type_id}`, m]) || [])

      const suitePrivateAccess = data.roomTypes?.find((rt: any) => rt.name.includes("Suite Private Access"))
      if (suitePrivateAccess) {
        console.log("[v0] Suite Private Access room type:", {
          id: suitePrivateAccess.id,
          name: suitePrivateAccess.name,
          pms_id: suitePrivateAccess.pms_room_type_id,
          total_rooms: suitePrivateAccess.total_rooms,
        })

        const jan4Key = `2026-01-04|${suitePrivateAccess.id}`
        const jan4Avail = availabilityMap.get(jan4Key)
        const jan4Occ = occupancyMap.get(jan4Key)

        console.log("[v0] Suite Private Access on 2026-01-04:", {
          availability: jan4Avail,
          occupancy: jan4Occ,
          key: jan4Key,
        })
      }

      for (const roomType of data.roomTypes || []) {
        for (const date of dates) {
          const dateStr = format(date, "yyyy-MM-dd")
          const key = `${dateStr}|${roomType.id}`

          const avail = availabilityMap.get(key)
          const occ = occupancyMap.get(key)
          const min = minstayMap.get(key)

          mergedData.push({
            date: dateStr,
            roomTypeId: roomType.id,
            availability: avail?.rooms_available ?? 0,
            occupancy: occ?.rooms_sold ?? 0,
            minstay: min?.minstay ?? null,
          })
        }
      }

      setDailyData(mergedData)
      console.log("[v0] Merged data points:", mergedData.length)
    } catch (error) {
      console.error("[v0] Error loading calendar data:", error)
    } finally {
      setLoading(false)
    }
  }

  const getDataForDateAndRoom = (date: Date, roomTypeId: string) => {
    return dailyData.find((dd) => dd.date === format(date, "yyyy-MM-dd") && dd.roomTypeId === roomTypeId)
  }

  const getTotalsForDate = (date: Date) => {
    const totalRooms = roomTypes.reduce((sum, rt) => sum + rt.total_rooms, 0)

    const availableRooms = roomTypes.reduce((sum, rt) => {
      const data = getDataForDateAndRoom(date, rt.id)
      return sum + (data ? data.availability : 0)
    }, 0)

    const soldRooms = roomTypes.reduce((sum, rt) => {
      const data = getDataForDateAndRoom(date, rt.id)
      return sum + (data ? data.occupancy : 0)
    }, 0)

    // clamp a 100%: l'occupazione non puo' superare il 100% (vedi nota Obiettivi 27/06/2026).
    const occupancyRate = totalRooms > 0 ? Math.min(100, Math.round((soldRooms / totalRooms) * 100)) : 0

    return {
      available: availableRooms,
      sold: soldRooms,
      occupancyRate: occupancyRate,
    }
  }

  const previousMonth = () => {
    setCurrentDate((prevDate) => {
      const newDate = new Date(prevDate)
      newDate.setMonth(newDate.getMonth() - 1)
      return newDate
    })
  }

  const nextMonth = () => {
    setCurrentDate((prevDate) => {
      const newDate = new Date(prevDate)
      newDate.setMonth(newDate.getMonth() + 1)
      return newDate
    })
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event

    if (!over || active.id === over.id) return

    console.log("[v0] Drag ended:", { activeId: active.id, overId: over.id })

    const activeRoomTypeId = String(active.id).replace(/-(?:available|occupied|minstay)$/, "")
    const overRoomTypeId = String(over.id).replace(/-(?:available|occupied|minstay)$/, "")

    console.log("[v0] Room type IDs:", { activeRoomTypeId, overRoomTypeId })

    const activeIndex = roomTypes.findIndex((rt) => rt.id === activeRoomTypeId)
    const overIndex = roomTypes.findIndex((rt) => rt.id === overRoomTypeId)

    console.log("[v0] Indices:", { activeIndex, overIndex })

    if (activeIndex === -1 || overIndex === -1) {
      console.error("[v0] Could not find room type indices")
      return
    }

    if (activeIndex !== overIndex) {
      const newRoomTypes = arrayMove(roomTypes, activeIndex, overIndex)
      setRoomTypes(newRoomTypes)

      const reorderedIds = newRoomTypes.map((rt) => rt.id)
      console.log("[v0] New order:", reorderedIds)

      setSaving(true)
      try {
        const response = await fetch("/api/room-types/reorder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hotelId, roomTypeIds: reorderedIds }),
        })

        const result = await response.json()
        console.log("[v0] Reorder API response:", result)

        if (!response.ok) {
          console.error("[v0] Failed to save order:", result.error)
          setRoomTypes(roomTypes)
        }
      } catch (error) {
        console.error("[v0] Error saving order:", error)
        setRoomTypes(roomTypes)
      } finally {
        setSaving(false)
      }
    }
  }

  useEffect(() => {
    loadData()
  }, [hotelId, currentDate])

  useEffect(() => {
    if (!loading && scrollContainerRef && dates.length > 0) {
      const today = format(new Date(), "yyyy-MM-dd")
      const todayIndex = dates.findIndex((d) => format(d, "yyyy-MM-dd") === today)

      if (todayIndex !== -1) {
        setTimeout(() => {
          const cellWidth = 80 // approximate cell width
          const fixedColumnsWidth = 200 // sticky columns width
          const scrollPosition = Math.max(0, todayIndex * cellWidth - 3 * cellWidth)

          if (scrollContainerRef) {
            scrollContainerRef.scrollLeft = scrollPosition
            console.log("[v0] Scrolled to today at position:", scrollPosition, "todayIndex:", todayIndex)
          }
        }, 100)
      }
    }
  }, [loading, dates, scrollContainerRef])

  if (!loading && !hasMappings) {
    return (
      <Card className="p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Mappature non configurate</AlertTitle>
          <AlertDescription>
            Le mappature delle tipologie camera non sono ancora state configurate dal SuperAdmin. Contatta
            l'amministratore di sistema per abilitare la visualizzazione del calendario.
          </AlertDescription>
        </Alert>
      </Card>
    )
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <Card className="overflow-hidden">
        <div className="border-b bg-muted/30 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold">{format(currentDate, "MMMM yyyy", { locale: it })}</h2>
              {saving && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Salvataggio...
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={previousMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={nextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : roomTypes.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground">
            Nessuna tipologia camera con mappatura attiva trovata.
          </div>
        ) : (
          <>
            <div ref={setScrollContainerRef} className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="sticky left-0 z-20 border-r bg-muted/50 p-3 text-left font-semibold">
                      Tipologia Camera
                    </th>
                    <th className="border-r bg-muted/50 p-3 text-center font-semibold">Totale</th>
                    {dates.map((date) => {
                      const isToday = format(date, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd")
                      return (
                        <th
                          key={date.getTime()}
                          className={`border-r bg-muted/50 p-3 text-center font-semibold ${isToday ? "bg-primary/10" : ""}`}
                        >
                          <div className="flex flex-col">
                            <span className="text-xs text-muted-foreground">{format(date, "EEE", { locale: it })}</span>
                            <span>{format(date, "d")}</span>
                          </div>
                        </th>
                      )
                    })}
                  </tr>
                  <tr className="border-b bg-primary/5">
                    <td className="sticky left-0 z-20 border-r bg-primary/5 p-3 font-semibold">TOTALI</td>
                    <td className="border-r bg-primary/5 p-3 text-center font-semibold">
                      {roomTypes.reduce((sum, rt) => sum + rt.total_rooms, 0)}
                    </td>
                    {dates.map((date) => {
                      const totals = getTotalsForDate(date)
                      const isToday = format(date, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd")
                      return (
                        <td
                          key={date.getTime()}
                          className={`border-r bg-primary/5 p-3 text-center ${isToday ? "bg-primary/15" : ""}`}
                        >
                          <div className="flex flex-col gap-1">
                            <div className="text-xs">
                              <span className="text-green-600 font-medium">{totals.available}</span>
                              <span className="text-muted-foreground"> / </span>
                              <span className="text-red-600 font-medium">{totals.sold}</span>
                            </div>
                            <div className="text-xs font-semibold text-primary">{totals.occupancyRate}%</div>
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                </thead>
                <SortableContext
                  items={roomTypes.flatMap((rt) => [`${rt.id}-available`, `${rt.id}-occupied`, `${rt.id}-minstay`])}
                  strategy={verticalListSortingStrategy}
                >
                  <tbody>
                    {roomTypes.map((roomType, index) => (
                      <React.Fragment key={roomType.id}>
                        <SortableRow
                          roomType={roomType}
                          dates={dates}
                          getDataForDateAndRoom={getDataForDateAndRoom}
                          index={index * 3}
                          rowType="available"
                        />
                        <SortableRow
                          roomType={roomType}
                          dates={dates}
                          getDataForDateAndRoom={getDataForDateAndRoom}
                          index={index * 3 + 1}
                          rowType="occupied"
                        />
                        <SortableRow
                          roomType={roomType}
                          dates={dates}
                          getDataForDateAndRoom={getDataForDateAndRoom}
                          index={index * 3 + 2}
                          rowType="minstay"
                        />
                      </React.Fragment>
                    ))}
                  </tbody>
                </SortableContext>
              </table>
            </div>

            <div className="border-t bg-muted/30 p-4">
              <div className="flex items-center gap-6 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded bg-green-600" />
                  <span>Disponibili</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded bg-blue-600" />
                  <span>Occupate</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded bg-purple-600" />
                  <span>Minimum Stay</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded bg-primary" />
                  <span>% Occupazione</span>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <GripVertical className="h-3 w-3" />
                  <span>Trascina per riordinare</span>
                </div>
              </div>
            </div>
          </>
        )}
      </Card>
    </DndContext>
  )
}
