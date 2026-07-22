"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

interface MonthlyData {
  month: string
  monthLabel: string
  revenue: number
  roomNights: number
  lyRevenue: number
  lyRoomNights: number
}

interface RevenueYoYChartProps {
  monthlyData: MonthlyData[]
  year: number
  loading: boolean
}

export function RevenueYoYChart({ monthlyData, year, loading }: RevenueYoYChartProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Revenue YoY</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[320px] w-full" />
        </CardContent>
      </Card>
    )
  }

  const data = monthlyData.map((m) => ({
    label: m.monthLabel,
    current: m.revenue,
    lastYear: m.lyRevenue,
    roomNights: m.roomNights,
    lyRoomNights: m.lyRoomNights,
  }))

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
    if (value >= 1000) return `${(value / 1000).toFixed(0)}k`
    return value.toFixed(0)
  }

  const eur = (value: number) =>
    new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(value)

  // RevPOR = Revenue Per Occupied Room = revenue / notti-camera vendute.
  // Se le notti sono 0/assenti NON inventiamo un numero: mostriamo "n/d".
  const revpor = (revenue: number, roomNights: number) =>
    roomNights > 0 ? eur(revenue / roomNights) : "n/d"

  // Tooltip custom: per ogni colonna (anno corrente / precedente) stampa il
  // revenue e, sotto, il RevPOR calcolato sulle notti dello stesso periodo.
  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean
    payload?: Array<{ name: string; value: number; payload: (typeof data)[number] }>
    label?: string
  }) => {
    if (!active || !payload || payload.length === 0) return null
    const row = payload[0].payload
    return (
      <div className="rounded-lg border border-border bg-background px-3 py-2 text-[13px] shadow-md">
        <div className="mb-1 font-semibold text-foreground">{label}</div>
        {payload.map((entry) => {
          const isCurrent = entry.name === "current"
          const yearLabel = isCurrent ? `${year}` : `${year - 1}`
          const nights = isCurrent ? row.roomNights : row.lyRoomNights
          return (
            <div key={entry.name} className="flex flex-col py-0.5">
              <span className="text-foreground">
                <span
                  className="mr-1.5 inline-block h-2 w-2 rounded-[2px] align-middle"
                  style={{ backgroundColor: isCurrent ? "#22c55e" : "#94a3b8" }}
                />
                {yearLabel}: {eur(entry.value)}
              </span>
              <span className="pl-3.5 text-xs text-muted-foreground">
                RevPOR: {revpor(entry.value, nights)}
                {nights > 0 ? ` (${nights.toLocaleString("it-IT")} notti)` : ""}
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Revenue anno corrente vs anno precedente</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis 
              dataKey="label" 
              tick={{ fontSize: 11 }} 
              stroke="hsl(var(--muted-foreground))" 
            />
            <YAxis 
              tick={{ fontSize: 11 }} 
              stroke="hsl(var(--muted-foreground))"
              tickFormatter={formatCurrency}
            />
            <Tooltip cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }} content={<CustomTooltip />} />
            <Legend 
              iconType="square" 
              wrapperStyle={{ fontSize: 12 }}
              formatter={(value) => value === "current" ? `${year}` : `${year - 1}`}
            />
            <Bar
              dataKey="current"
              fill="#22c55e"
              name="current"
              radius={[3, 3, 0, 0]}
              maxBarSize={32}
            />
            <Bar
              dataKey="lastYear"
              fill="#94a3b8"
              name="lastYear"
              radius={[3, 3, 0, 0]}
              maxBarSize={32}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
