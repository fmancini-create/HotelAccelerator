"use client"

import { useState, useCallback } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { PriceHistoryChart } from "./price-history-chart"
import { BarChart3 } from "lucide-react"

interface HistoryEntry {
  changed_at: string
  old_price: number
  new_price: number
}

interface PricingCellProps {
  hotelId: string
  roomTypeId: string
  rateId: string
  occupancy: number
  date: string
  price: number
  onPriceChange?: (price: number) => void
  disabled?: boolean
}

export function PricingCell({
  hotelId,
  roomTypeId,
  rateId,
  occupancy,
  date,
  price,
  onPriceChange,
  disabled,
}: PricingCellProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  const loadHistory = useCallback(async () => {
    if (isLoading || history.length > 0) return

    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        hotel_id: hotelId,
        room_type_id: roomTypeId,
        rate_id: rateId,
        occupancy: occupancy.toString(),
        date,
      })

      const res = await fetch(`/api/accelerator/pricing-history?${params}`)
      const data = await res.json()

      if (res.ok && data.history) {
        setHistory(data.history)
      }
    } catch (e) {
      console.error("[v0] PricingCell loadHistory error:", e)
    } finally {
      setIsLoading(false)
    }
  }, [hotelId, roomTypeId, rateId, occupancy, date, isLoading, history.length])

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
    if (open && history.length === 0) {
      loadHistory()
    }
  }

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <div className="relative group cursor-pointer">
          <div
            className={`
              flex items-center justify-between p-2 rounded border border-border
              ${disabled ? "bg-muted opacity-50 cursor-not-allowed" : "hover:bg-muted/50 transition-colors"}
            `}
          >
            <span className="font-semibold">€ {price.toFixed(2)}</span>
            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-96" align="start">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-sm text-muted-foreground">Caricamento storico...</div>
          </div>
        ) : (
          <PriceHistoryChart
            history={history}
            title={`Storico Prezzi - ${date}`}
          />
        )}
      </PopoverContent>
    </Popover>
  )
}
