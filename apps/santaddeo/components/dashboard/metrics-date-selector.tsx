"use client"

import { useEffect, useState } from "react"
import { Calendar } from "@/components/ui/calendar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { CalendarIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface MetricsDateSelectorProps {
  hotelId: string
  selectedDate: Date
  onDateChange: (date: Date) => void
}

export function MetricsDateSelector({ hotelId, selectedDate, onDateChange }: MetricsDateSelectorProps) {
  const [data, setData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [calendarOpen, setCalendarOpen] = useState(false)

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true)

      const dateStr = selectedDate.toISOString().split("T")[0]

      const params = new URLSearchParams({
        hotel_id: hotelId,
        type: "date-selector",
        date: dateStr,
      })

      try {
        const response = await fetch(`/api/dashboard/metrics?${params}`)

        if (!response.ok) {
          setData(null)
          setIsLoading(false)
          return
        }

        const contentType = response.headers.get("content-type")
        if (!contentType || !contentType.includes("application/json")) {
          setData(null)
          setIsLoading(false)
          return
        }

        const result = await response.json()
        console.log("[v0] MetricsDateSelector - API response:", result)

        const bookingsData = result.bookings || []
        const cancellationsData = result.cancellations || []

        const totalRevenue = bookingsData.reduce((sum: number, b: any) => sum + Number(b.total_amount), 0)
        const roomNights = bookingsData.reduce((sum: number, b: any) => sum + (b.num_nights || 1), 0)
        const revpor = roomNights > 0 ? totalRevenue / roomNights : 0

        const lostRevenue = cancellationsData.reduce((sum: number, c: any) => sum + Number(c.lost_revenue || 0), 0)
        const lostRoomNights = cancellationsData.reduce((sum: number, c: any) => sum + (c.lost_room_nights || 1), 0)
        const lostRevpor = lostRoomNights > 0 ? lostRevenue / lostRoomNights : 0

        setData({
          bookings: {
            count: bookingsData.length,
            revenue: totalRevenue,
            roomNights,
            revpor,
          },
          cancellations: {
            count: cancellationsData.length,
            lostRevenue,
            lostRoomNights,
            lostRevpor,
          },
        })
      } catch {
        setData(null)
      }

      setIsLoading(false)
    }

    fetchData()
  }, [hotelId, selectedDate])

  return (
    <div className="space-y-4">
      {/* Selettore data compatto */}
      <div className="flex items-center gap-3">
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-[220px] justify-start text-left font-normal",
                !selectedDate && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {selectedDate.toLocaleDateString("it-IT", {
                weekday: "short",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => {
                if (date) {
                  onDateChange(date)
                  setCalendarOpen(false)
                }
              }}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Risultati */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      ) : data ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-green-200/60 bg-green-50/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-green-900">Prenotazioni Ricevute</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-green-700">Numero</span>
                <span className="font-semibold text-green-900">{data.bookings.count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-green-700">Revenue</span>
                <span className="font-semibold text-green-900">
                  {'\u20AC'}{data.bookings.revenue.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-green-700">Room/Nights</span>
                <span className="font-semibold text-green-900">{data.bookings.roomNights}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-green-700">RevPOR</span>
                <span className="font-semibold text-green-900">
                  {'\u20AC'}{data.bookings.revpor.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-red-200/60 bg-red-50/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-red-900">Cancellazioni Ricevute</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-red-700">Numero</span>
                <span className="font-semibold text-red-900">{data.cancellations.count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-red-700">Revenue Perso</span>
                <span className="font-semibold text-red-900">
                  {'\u20AC'}{data.cancellations.lostRevenue.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-red-700">Room/Nights Perse</span>
                <span className="font-semibold text-red-900">{data.cancellations.lostRoomNights}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-red-700">RevPOR Perso</span>
                <span className="font-semibold text-red-900">
                  {'\u20AC'}{data.cancellations.lostRevpor.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="text-center text-sm text-muted-foreground py-8">
          Nessun dato disponibile per questa data
        </div>
      )}
    </div>
  )
}
