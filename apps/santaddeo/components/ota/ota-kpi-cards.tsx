"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Eye, Home, ShoppingCart, TrendingDown, TrendingUp } from "lucide-react"

interface Snapshot {
  search_views: number | null
  property_views: number | null
  bookings_count: number | null
  prev_search_views: number | null
  prev_property_views: number | null
  prev_bookings_count: number | null
  period_start: string
  period_end: string
}

interface Props {
  latest: Snapshot | null
  previous: Snapshot | null
}

export function OtaKpiCards({ latest, previous }: Props) {
  if (!latest) return null

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <KpiCard
        label="Visualizzazioni ricerca"
        value={latest.search_views}
        yoy={computeYoY(latest.search_views, latest.prev_search_views)}
        trend={computeTrend(latest.search_views, previous?.search_views)}
        icon={Eye}
      />
      <KpiCard
        label="Visualizzazioni struttura"
        value={latest.property_views}
        yoy={computeYoY(latest.property_views, latest.prev_property_views)}
        trend={computeTrend(latest.property_views, previous?.property_views)}
        icon={Home}
      />
      <KpiCard
        label="Prenotazioni"
        value={latest.bookings_count}
        yoy={computeYoY(latest.bookings_count, latest.prev_bookings_count)}
        trend={computeTrend(latest.bookings_count, previous?.bookings_count)}
        icon={ShoppingCart}
      />
      <ConversionCard latest={latest} previous={previous} />
    </div>
  )
}

function KpiCard({
  label,
  value,
  yoy,
  trend,
  icon: Icon,
}: {
  label: string
  value: number | null
  yoy: number | null
  trend: number | null
  icon: React.ElementType
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold mt-1">
              {value != null ? Intl.NumberFormat("it-IT").format(value) : "—"}
            </p>
          </div>
          <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
        <div className="flex items-center gap-3 mt-3 text-xs">
          <DeltaPill label="vs. anno scorso" value={yoy} />
          <DeltaPill label="vs. periodo precedente" value={trend} />
        </div>
      </CardContent>
    </Card>
  )
}

function ConversionCard({ latest, previous }: { latest: Snapshot; previous: Snapshot | null }) {
  const currentConv = computeConversion(latest.bookings_count, latest.property_views)
  const prevConv = previous
    ? computeConversion(previous.bookings_count, previous.property_views)
    : null
  const yoyConv = computeConversion(latest.prev_bookings_count, latest.prev_property_views)

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Conversion rate</p>
            <p className="text-2xl font-bold mt-1">
              {currentConv != null ? `${currentConv.toFixed(2)}%` : "—"}
            </p>
          </div>
          <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
        <div className="flex items-center gap-3 mt-3 text-xs">
          <DeltaPill
            label="vs. anno scorso"
            value={
              yoyConv != null && currentConv != null
                ? ((currentConv - yoyConv) / yoyConv) * 100
                : null
            }
          />
          <DeltaPill
            label="vs. periodo precedente"
            value={
              prevConv != null && currentConv != null
                ? ((currentConv - prevConv) / prevConv) * 100
                : null
            }
          />
        </div>
      </CardContent>
    </Card>
  )
}

function DeltaPill({ label, value }: { label: string; value: number | null }) {
  if (value == null || !Number.isFinite(value)) {
    return <span className="text-muted-foreground">— {label}</span>
  }
  const positive = value >= 0
  const Icon = positive ? TrendingUp : TrendingDown
  const color = positive ? "text-emerald-600" : "text-red-600"
  return (
    <span className={`inline-flex items-center gap-1 ${color}`}>
      <Icon className="h-3 w-3" />
      {positive ? "+" : ""}
      {value.toFixed(1)}%
      <span className="text-muted-foreground ml-1">{label}</span>
    </span>
  )
}

function computeYoY(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous === 0) return null
  return ((current - previous) / previous) * 100
}

function computeTrend(current: number | null, previous: number | null | undefined): number | null {
  if (current == null || previous == null || previous === 0) return null
  return ((current - previous) / previous) * 100
}

function computeConversion(bookings: number | null, views: number | null): number | null {
  if (bookings == null || views == null || views === 0) return null
  return (bookings / views) * 100
}
