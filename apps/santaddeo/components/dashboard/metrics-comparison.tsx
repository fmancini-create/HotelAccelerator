"use client"

import { useEffect, useState } from "react"
import { ArrowDown, ArrowUp, Minus } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { useVatView } from "@/lib/contexts/vat-view-context"

interface MetricsComparisonProps {
  hotelId: string
  period: "day" | "month" | "year"
}

interface MetricRow {
  label: string
  current: number
  previous: number
  change: number
  format: "currency" | "number"
}

interface ComparisonData {
  metrics: MetricRow[]
  currentLabel: string
  previousLabel: string
}

function formatValue(value: number, fmt: "currency" | "number"): string {
  if (fmt === "currency") {
    return `€${value.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  }
  return value.toLocaleString("it-IT")
}

export function MetricsComparison({ hotelId, period }: MetricsComparisonProps) {
  const { vatView } = useVatView()
  const [data, setData] = useState<ComparisonData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true)

      const today = new Date()
      const lastYear = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate())

      let currentStart: string
      let currentEnd: string
      let previousStart: string
      let previousEnd: string
      let currentLabel: string
      let previousLabel: string

      if (period === "day") {
        currentStart = currentEnd = today.toISOString().split("T")[0]
        previousStart = previousEnd = lastYear.toISOString().split("T")[0]
        currentLabel = `Oggi ${today.toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })}`
        previousLabel = `${lastYear.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}`
      } else if (period === "month") {
        currentStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0]
        currentEnd = today.toISOString().split("T")[0]
        previousStart = new Date(lastYear.getFullYear(), lastYear.getMonth(), 1).toISOString().split("T")[0]
        previousEnd = new Date(lastYear.getFullYear(), lastYear.getMonth(), lastYear.getDate()).toISOString().split("T")[0]
        const monthName = today.toLocaleDateString("it-IT", { month: "long" })
        currentLabel = `${monthName} ${today.getFullYear()} (MTD)`
        previousLabel = `${monthName} ${lastYear.getFullYear()} (MTD)`
      } else {
        currentStart = new Date(today.getFullYear(), 0, 1).toISOString().split("T")[0]
        currentEnd = today.toISOString().split("T")[0]
        previousStart = new Date(lastYear.getFullYear(), 0, 1).toISOString().split("T")[0]
        previousEnd = new Date(lastYear.getFullYear(), lastYear.getMonth(), lastYear.getDate()).toISOString().split("T")[0]
        currentLabel = `${today.getFullYear()} (YTD)`
        previousLabel = `${lastYear.getFullYear()} (YTD)`
      }

      const currentParams = new URLSearchParams({ hotel_id: hotelId, from: currentStart, to: currentEnd })
      const previousParams = new URLSearchParams({ hotel_id: hotelId, from: previousStart, to: previousEnd })
      if (vatView) {
        currentParams.set("vatView", vatView)
        previousParams.set("vatView", vatView)
      }

      try {
        const [currentResponse, previousResponse] = await Promise.all([
          fetch(`/api/dashboard/metrics?${currentParams}`),
          fetch(`/api/dashboard/metrics?${previousParams}`),
        ])

        if (!currentResponse.ok || !previousResponse.ok) {
          setData(null)
          setIsLoading(false)
          return
        }

        const [currentResult, previousResult] = await Promise.all([
          currentResponse.json(),
          previousResponse.json(),
        ])

        const calcChange = (current: number, previous: number) => {
          if (previous > 0) return ((current - previous) / previous) * 100
          if (current > 0) return 100
          return 0
        }

        const currentRevenue = currentResult.totalRevenue || 0
        const previousRevenue = previousResult.totalRevenue || 0
        const currentRoomNights = currentResult.roomNights || 0
        const previousRoomNights = previousResult.roomNights || 0
        const currentRevpor = currentResult.revpor || 0
        const previousRevpor = previousResult.revpor || 0
        const currentRevpar = currentResult.revpar || 0
        const previousRevpar = previousResult.revpar || 0

        setData({
          currentLabel,
          previousLabel,
          metrics: [
            { label: "Revenue", current: currentRevenue, previous: previousRevenue, change: calcChange(currentRevenue, previousRevenue), format: "currency" },
            { label: "Room/Nights", current: currentRoomNights, previous: previousRoomNights, change: calcChange(currentRoomNights, previousRoomNights), format: "number" },
            { label: "RevPOR", current: currentRevpor, previous: previousRevpor, change: calcChange(currentRevpor, previousRevpor), format: "currency" },
            { label: "RevPAR", current: currentRevpar, previous: previousRevpar, change: calcChange(currentRevpar, previousRevpar), format: "currency" },
          ],
        })
      } catch (error) {
        console.warn("[v0] metrics comparison error:", error)
        setData(null)
      }

      setIsLoading(false)
    }

    fetchData()
  }, [hotelId, period, vatView])

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    )
  }

  if (!data) {
    return <div className="text-center text-muted-foreground">Nessun dato disponibile</div>
  }

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="grid grid-cols-4 gap-4 px-4 pb-2 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        <div>Metrica</div>
        <div className="text-right">{data.currentLabel}</div>
        <div className="text-right">{data.previousLabel}</div>
        <div className="text-right">Variazione</div>
      </div>

      {data.metrics.map((metric) => {
        const isUp = metric.change > 0
        const isDown = metric.change < 0
        return (
          <div key={metric.label} className="grid grid-cols-4 gap-4 items-center rounded-lg border bg-card px-4 py-5">
            {/* Label */}
            <div>
              <p className="text-base font-semibold">{metric.label}</p>
            </div>

            {/* Current value */}
            <div className="text-right">
              <p className="text-2xl font-bold tabular-nums tracking-tight">{formatValue(metric.current, metric.format)}</p>
            </div>

            {/* Previous value */}
            <div className="text-right">
              <p className="text-2xl font-semibold tabular-nums tracking-tight text-muted-foreground">{formatValue(metric.previous, metric.format)}</p>
            </div>

            {/* Change badge */}
            <div className="flex items-center justify-end gap-1.5">
              {isUp ? (
                <ArrowUp className="h-5 w-5 text-green-600" />
              ) : isDown ? (
                <ArrowDown className="h-5 w-5 text-red-600" />
              ) : (
                <Minus className="h-5 w-5 text-muted-foreground" />
              )}
              <span className={`text-xl font-bold tabular-nums ${isUp ? "text-green-600" : isDown ? "text-red-600" : "text-muted-foreground"}`}>
                {isUp ? "+" : ""}{metric.change.toFixed(1)}%
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
