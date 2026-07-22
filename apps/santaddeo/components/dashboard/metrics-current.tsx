"use client"

import React from "react"

import { useEffect, useState } from "react"
import { Card, CardContent, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Info } from "lucide-react"
import { accommodationReplace } from "@/lib/utils/accommodation-labels"
import { dedupFetchJson } from "@/lib/dedup-fetch"
import { useVatView, vatViewQuery } from "@/lib/contexts/vat-view-context"

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

interface KpiThreshold {
  metric_key: string
  green_min: number
  green_max: number | null
  orange_min: number
  red_min: number
  is_inverted: boolean
  display_name: string
  description: string
  unit: string
}

interface MetricsCurrentProps {
  hotelId: string
  period: "day" | "month" | "year"
  kpiConfigs?: Record<string, boolean> | null
  kpiMode?: "system" | "custom"
  accommodationType?: string
}

// Semaphore component - supports both threshold and range models
function Semaphore({ value, threshold, yoyChange }: { value: number; threshold?: KpiThreshold; yoyChange?: number }) {
  // If we have YoY change, use that for comparison (green = positive, red = negative)
  if (yoyChange !== undefined) {
    let color: "green" | "orange" | "red" = "orange"
    if (yoyChange > 5) color = "green"
    else if (yoyChange < -5) color = "red"
    else color = "orange"
    
    const colorClasses = {
      green: "bg-green-500",
      orange: "bg-orange-500",
      red: "bg-red-500",
    }

    return (
      <div className="flex gap-0.5 items-center" title={`YoY: ${yoyChange > 0 ? '+' : ''}${yoyChange.toFixed(1)}%`}>
        <div className={`w-2 h-2 rounded-full ${color === "red" ? colorClasses.red : "bg-gray-200"}`} />
        <div className={`w-2 h-2 rounded-full ${color === "orange" ? colorClasses.orange : "bg-gray-200"}`} />
        <div className={`w-2 h-2 rounded-full ${color === "green" ? colorClasses.green : "bg-gray-200"}`} />
      </div>
    )
  }

  if (!threshold) return null

  let color: "green" | "orange" | "red" = "red"
  
  // Range model: value must be between green_min and green_max
  if (threshold.green_max !== null && threshold.green_max > 0) {
    if (value >= threshold.green_min && value <= threshold.green_max) {
      color = "green"
    } else if (value >= threshold.orange_min && value <= (threshold.green_max + 10)) {
      color = "orange"
    } else {
      color = "red"
    }
  } else if (threshold.is_inverted) {
    // For inverted metrics (like cancellation rate), lower is better
    if (value <= threshold.green_min) color = "green"
    else if (value <= threshold.orange_min) color = "orange"
    else color = "red"
  } else {
    // For normal metrics, higher is better
    if (value >= threshold.green_min) color = "green"
    else if (value >= threshold.orange_min) color = "orange"
    else color = "red"
  }

  const colorClasses = {
    green: "bg-green-500",
    orange: "bg-orange-500",
    red: "bg-red-500",
  }

  const tooltipText = threshold.green_max 
    ? `Target: ${threshold.green_min}-${threshold.green_max}${threshold.unit}`
    : `Target: ${threshold.is_inverted ? '≤' : '≥'}${threshold.green_min}${threshold.unit}`

  return (
    <div className="flex gap-0.5 items-center" title={tooltipText}>
      <div className={`w-2 h-2 rounded-full ${color === "red" ? colorClasses.red : "bg-gray-200"}`} />
      <div className={`w-2 h-2 rounded-full ${color === "orange" ? colorClasses.orange : "bg-gray-200"}`} />
      <div className={`w-2 h-2 rounded-full ${color === "green" ? colorClasses.green : "bg-gray-200"}`} />
    </div>
  )
}

export function MetricsCurrent({ hotelId, period, kpiConfigs, kpiMode = "system", accommodationType }: MetricsCurrentProps) {
  const accReplace = (s: string) => accommodationReplace(s, accommodationType)
  const { vatView } = useVatView()
  const [data, setData] = useState<any>(null)
  const [thresholds, setThresholds] = useState<Record<string, KpiThreshold>>({})
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true)

      try {
        // Fetch metrics and thresholds in parallel (dedupFetchJson prevents duplicate calls)
        const [metricsData, thresholdsData] = await Promise.all([
          dedupFetchJson(`/api/dashboard/metrics?hotel_id=${hotelId}&period=${period}${vatViewQuery(vatView)}`),
          dedupFetchJson(`/api/kpi-thresholds?hotel_id=${hotelId}&mode=${kpiMode}`)
        ])
        
        if (thresholdsData.thresholds) {
          setThresholds(thresholdsData.thresholds)
        }
        
        if (metricsData.error) {
          console.error("Metrics API error:", metricsData.error)
          setData(null)
        } else {
          setData({
            totalRevenue: metricsData.totalRevenue || 0,
            directRevenue: metricsData.directRevenue || 0,
            intermediatedRevenue: metricsData.intermediatedRevenue || 0,
            channelRevenue: metricsData.channelRevenue || {},
            roomNights: metricsData.roomNights || 0,
            revpor: metricsData.revpor || 0,
            revpar: metricsData.revpar || 0,
            occupancy: metricsData.occupancy || 0,
            availableRooms: metricsData.roomNights || 0,
            totalBookings: metricsData.bookingsCount || 0,
            totalCancellations: metricsData.cancellationsCount || 0,
            cancellationRate: metricsData.cancellationsCount > 0 
              ? (metricsData.cancellationsCount / (metricsData.bookingsCount + metricsData.cancellationsCount)) * 100 
              : 0,
            last24hAvgPickup: metricsData.avgBookingPickup || 0,
            avgCancellationPickup: metricsData.avgCancellationPickup || 0,
            // YoY data
            lyBookingsCount: metricsData.lyBookingsCount || 0,
            lyCancellationsCount: metricsData.lyCancellationsCount || 0,
            bookingsYoY: metricsData.bookingsYoY || 0,
            cancellationsYoY: metricsData.cancellationsYoY || 0,
          })
        }
      } catch (error) {
        console.error("Error fetching metrics:", error)
        setData(null)
      }

      setIsLoading(false)
    }

    fetchData()
  }, [hotelId, period, kpiMode, vatView])

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    )
  }

  if (!data) {
    return <div className="text-center text-muted-foreground">Nessun dato disponibile</div>
  }

  const formatCurrency = (value: number) => {
    return value.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  }

  // Calculate percentages
  const directPercentage = data.totalRevenue > 0 ? (data.directRevenue / data.totalRevenue) * 100 : 0
  const intermediatedPercentage = data.totalRevenue > 0 ? (data.intermediatedRevenue / data.totalRevenue) * 100 : 0

  // Get channel breakdown for hover
  const channelBreakdown = Object.entries(data.channelRevenue || {})
    .sort(([,a], [,b]) => (b as number) - (a as number))

  const formatYoY = (yoy: number) => {
    if (yoy === 0) return ""
    return yoy > 0 ? `+${yoy.toFixed(0)}%` : `${yoy.toFixed(0)}%`
  }

  const metrics: { label: string; value: string | number; rawValue: number; subValue?: string; color: string; tooltip?: string; kpiKey?: string; visibilityKey: string; yoyChange?: number; hoverContent?: React.ReactNode; devN: number }[] = [
    { 
      label: "Revenue Totale", 
      value: `€${formatCurrency(data.totalRevenue)}`,
      rawValue: data.totalRevenue,
      color: "text-blue-600",
      visibilityKey: "metrics_total_revenue",
      tooltip: "Somma di tutti i ricavi delle prenotazioni attive nel periodo selezionato (calcolato dai prezzi giornalieri delle camere).",
      devN: 14,
    },
    { 
      label: "Revenue Diretto", 
      value: `€${formatCurrency(data.directRevenue)}`,
      rawValue: directPercentage,
      subValue: `(${directPercentage.toFixed(1)}%)`,
      color: "text-green-600",
      visibilityKey: "metrics_direct_revenue",
      tooltip: "Ricavi da prenotazioni dirette (sito web, telefono, walk-in, agenzie, aziende). Non include le OTA.",
      devN: 15,
    },
    { 
      label: "Rev. Intermediato", 
      value: `€${formatCurrency(data.intermediatedRevenue)}`,
      rawValue: intermediatedPercentage,
      subValue: `(${intermediatedPercentage.toFixed(1)}%)`,
      color: "text-orange-600",
      kpiKey: "intermediated_revenue_pct",
      visibilityKey: "metrics_intermediated_revenue",
      tooltip: "Ricavi da OTA (Booking.com, Expedia, etc.)",
      devN: 16,
      hoverContent: channelBreakdown.length > 0 ? (
        <div className="space-y-2">
          <h4 className="font-semibold">Dettaglio per Canale OTA</h4>
          <div className="space-y-1">
            {channelBreakdown.map(([channel, revenue]) => (
              <div key={channel} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{channel}</span>
                <span className="font-medium">€{formatCurrency(revenue as number)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : undefined,
    },
    { 
      label: accReplace("Room/Nights"), 
      value: data.roomNights,
      rawValue: data.roomNights,
      color: "text-purple-600",
      visibilityKey: "metrics_room_nights",
      tooltip: accReplace("Numero totale di notti camera vendute nel periodo selezionato."),
      devN: 17,
    },
    {
      label: "RevPOR",
      value: `€${formatCurrency(data.revpor)}`,
      rawValue: data.revpor,
      color: "text-blue-600",
      kpiKey: "revpor",
      visibilityKey: "metrics_revpor",
      tooltip: accReplace(
        "Revenue Per Occupied Room. Revenue totale diviso per il numero di camere vendute. " +
          "Per definizione e' sempre maggiore o uguale al RevPAR (uguale solo a occupancy 100%)."
      ),
      devN: 18,
    },
    {
      label: "RevPAR",
      value: `€${formatCurrency(data.revpar)}`,
      rawValue: data.revpar,
      // Mostra l'occupancy come sub-value: aiuta a capire perche' RevPAR e
      // RevPOR convergono quando il riempimento e' alto (e.g. 99%).
      subValue: data.occupancy > 0 ? `(occ. ${data.occupancy.toFixed(0)}%)` : undefined,
      color: "text-blue-600",
      kpiKey: "revpar",
      visibilityKey: "metrics_revpar",
      tooltip: accReplace(
        "Revenue Per Available Room. Revenue totale diviso per il numero di camere disponibili (vendute + invendute). " +
          "Equivale a ADR x occupancy. Per definizione RevPAR <= RevPOR; i due valori coincidono quando l'occupancy e' al 100%."
      ),
      devN: 19,
    },
    { 
      label: "Prenotazioni", 
      value: data.totalBookings,
      rawValue: data.totalBookings,
      subValue: data.lyBookingsCount > 0 ? `(LY: ${data.lyBookingsCount}, ${formatYoY(data.bookingsYoY)})` : undefined,
      color: "text-green-600",
      visibilityKey: "metrics_bookings",
      yoyChange: data.bookingsYoY,
      tooltip: `Numero di prenotazioni attive nel periodo. Anno scorso: ${data.lyBookingsCount}`,
      devN: 20,
    },
    { 
      label: "Cancellazioni", 
      value: data.totalCancellations,
      rawValue: data.totalCancellations,
      subValue: data.lyCancellationsCount > 0 ? `(LY: ${data.lyCancellationsCount}, ${formatYoY(data.cancellationsYoY)})` : undefined,
      color: "text-red-600",
      visibilityKey: "metrics_cancellations",
      yoyChange: data.cancellationsYoY !== undefined ? -data.cancellationsYoY : undefined, // Invert for cancellations (less = better)
      tooltip: `Numero di cancellazioni nel periodo. Anno scorso: ${data.lyCancellationsCount}`,
      devN: 21,
    },
    { 
      label: "% Cancellazioni", 
      value: `${data.cancellationRate.toFixed(1)}%`,
      rawValue: data.cancellationRate,
      color: "text-red-600",
      kpiKey: "cancellation_rate",
      visibilityKey: "metrics_cancellation_rate",
      tooltip: "Percentuale di cancellazioni rispetto al totale (prenotazioni + cancellazioni) nel periodo.",
      devN: 22,
    },
    { 
      label: "Pick Up Pren.", 
      value: `${data.last24hAvgPickup.toFixed(0)} gg`,
      rawValue: data.last24hAvgPickup,
      color: "text-green-600",
      kpiKey: "pickup_booking_days",
      visibilityKey: "metrics_pickup_bookings",
      tooltip: "Media dei giorni di anticipo delle prenotazioni nel periodo rispetto alla data di check-in. Indica quanto prima prenotano gli ospiti.",
      devN: 23,
    },
    { 
      label: "Pick Up Canc.", 
      value: `${data.avgCancellationPickup.toFixed(0)} gg`,
      rawValue: data.avgCancellationPickup,
      color: "text-red-600",
      kpiKey: "pickup_cancellation_days",
      visibilityKey: "metrics_pickup_cancellations",
      tooltip: "Media dei giorni di anticipo delle cancellazioni nel periodo rispetto alla data di check-in. Indica quanto prima cancellano gli ospiti.",
      devN: 24,
    },
  ]

  // Filter metrics by KPI visibility
  const visibleMetrics = metrics.filter((m) => {
    if (!kpiConfigs) return true // no config loaded = show all
    return kpiConfigs[m.visibilityKey] !== false
  })

  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
      {visibleMetrics.map((metric) => (
        <HoverCard key={metric.label}>
          <HoverCardTrigger asChild>
            <Card className="hover:shadow-md transition-shadow cursor-pointer hover:border-primary/50 relative min-w-0">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <CardTitle className="text-base font-medium text-muted-foreground leading-tight">
                    {metric.label}
                  </CardTitle>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {(metric.kpiKey || metric.yoyChange !== undefined) && (
                      <Semaphore 
                        value={metric.rawValue} 
                        threshold={metric.kpiKey ? thresholds[metric.kpiKey] : undefined}
                        yoyChange={metric.yoyChange}
                      />
                    )}
                    <Info className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2 flex-wrap min-w-0">
                  <p className={`text-3xl font-bold tabular-nums ${metric.color}`}>{metric.value}</p>
                  {metric.subValue && (
                    <span className="text-base text-muted-foreground">{metric.subValue}</span>
                  )}
                </div>
                <DevBadge n={metric.devN} />
              </CardContent>
            </Card>
          </HoverCardTrigger>
          <HoverCardContent className="w-72">
            {metric.hoverContent || (
              <p className="text-sm">{metric.tooltip}</p>
            )}
          </HoverCardContent>
        </HoverCard>
      ))}
    </div>
  )
}
