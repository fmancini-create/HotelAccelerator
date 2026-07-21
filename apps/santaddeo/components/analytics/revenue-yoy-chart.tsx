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
  }))

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
    if (value >= 1000) return `${(value / 1000).toFixed(0)}k`
    return value.toFixed(0)
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
            <Tooltip
              contentStyle={{
                backgroundColor: "white",
                color: "#1f2937",
                border: "1px solid #e5e7eb",
                borderRadius: "0.5rem",
                fontSize: "13px",
                padding: "8px 12px",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
              }}
              labelStyle={{
                color: "#1f2937",
                fontWeight: 600,
                marginBottom: "4px",
              }}
              itemStyle={{
                color: "#374151",
                padding: "2px 0",
              }}
              formatter={(value: number, name: string) => {
                const label = name === "current" ? `${year}` : `${year - 1}`
                return [new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(value), label]
              }}
              separator=": "
            />
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
