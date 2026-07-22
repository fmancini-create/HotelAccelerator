"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { TrendingDown, TrendingUp, Minus } from "lucide-react"

interface AnalyticsKPICardsProps {
  totalRevenue: number
  lyTotalRevenue: number
  totalRevenueYoY: number
  adr: number
  lyAdr: number
  adrYoY: number
  roomNights: number
  lyRoomNights: number
  roomNightsYoY: number
  occupancy: number
  lyOccupancy: number
  occupancyYoY: number
  revpar: number
  lyRevpar: number
  loading: boolean
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("it-IT", { 
    style: "currency", 
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value)
}

function YoYBadge({ value }: { value: number }) {
  const isPositive = value > 0
  const isNegative = value < 0
  const Icon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus
  const colorClass = isPositive ? "text-green-600" : isNegative ? "text-red-600" : "text-muted-foreground"
  
  return (
    <span className={`flex items-center gap-0.5 text-xs font-medium ${colorClass}`}>
      <Icon className="h-3 w-3" />
      {isPositive ? "+" : ""}{value.toFixed(1)}%
    </span>
  )
}

export function AnalyticsKPICards({
  totalRevenue,
  lyTotalRevenue,
  totalRevenueYoY,
  adr,
  lyAdr,
  adrYoY,
  roomNights,
  lyRoomNights,
  roomNightsYoY,
  occupancy,
  lyOccupancy,
  occupancyYoY,
  revpar,
  lyRevpar,
  loading,
}: AnalyticsKPICardsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-4 w-20 mb-2" />
              <Skeleton className="h-8 w-28 mb-2" />
              <Skeleton className="h-3 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const kpis = [
    {
      label: "Revenue Totale",
      value: formatCurrency(totalRevenue),
      lyValue: formatCurrency(lyTotalRevenue),
      yoy: totalRevenueYoY,
      highlight: true,
    },
    {
      label: "ADR",
      value: formatCurrency(adr),
      lyValue: formatCurrency(lyAdr),
      yoy: adrYoY,
    },
    {
      label: "Room Nights",
      value: new Intl.NumberFormat("it-IT").format(roomNights),
      lyValue: new Intl.NumberFormat("it-IT").format(lyRoomNights),
      yoy: roomNightsYoY,
    },
    {
      label: "Occupancy",
      value: `${occupancy.toFixed(1)}%`,
      lyValue: `${lyOccupancy.toFixed(1)}%`,
      yoy: occupancyYoY,
      sublabel: `RevPAR: ${formatCurrency(revpar)} (AP: ${formatCurrency(lyRevpar)})`,
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {kpis.map((kpi) => (
        <Card key={kpi.label} className={kpi.highlight ? "border-primary/50 bg-primary/5" : ""}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {kpi.label}
              </span>
              <YoYBadge value={kpi.yoy} />
            </div>
            <div className="text-2xl font-bold tracking-tight">
              {kpi.value}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              AP: {kpi.lyValue}
            </div>
            {kpi.sublabel && (
              <div className="text-xs text-muted-foreground mt-1 pt-1 border-t border-dashed">
                {kpi.sublabel}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
