"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

interface DayOfWeekData {
  day: string
  dayLabel: string
  revenue: number
  lyRevenue: number
  bookings: number
  lyBookings: number
}

interface DayOfWeekChartProps {
  data: DayOfWeekData[]
  loading: boolean
  showYoY?: boolean
  year?: number
}

export function DayOfWeekChart({ data, loading, showYoY = false, year }: DayOfWeekChartProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Revenue per giorno della settimana</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[280px] w-full" />
        </CardContent>
      </Card>
    )
  }

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
    if (value >= 1000) return `${(value / 1000).toFixed(0)}k`
    return value.toFixed(0)
  }

  const chartData = data.map(d => ({
    ...d,
    shortName: d.dayLabel.toLowerCase(),
  }))

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Revenue per giorno della settimana</CardTitle>
        <p className="text-xs text-muted-foreground">
          Fatturato totale suddiviso per il giorno della settimana in cui è stata effettuata la prenotazione
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 60, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="hsl(var(--border))" />
            <XAxis 
              type="number" 
              tick={{ fontSize: 11 }} 
              stroke="hsl(var(--muted-foreground))"
              tickFormatter={formatCurrency}
            />
            <YAxis 
              type="category" 
              dataKey="shortName" 
              tick={{ fontSize: 11 }} 
              stroke="hsl(var(--muted-foreground))"
              width={60}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#ffffff",
                border: "1px solid #e5e7eb",
                borderRadius: "0.5rem",
                fontSize: "12px",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                color: "#1f2937",
              }}
              itemStyle={{ color: "#1f2937" }}
              labelStyle={{ color: "#1f2937", fontWeight: 600, marginBottom: "4px" }}
              formatter={(value: number, name: string) => [
                new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(value),
                name === "revenue" ? (year || new Date().getFullYear()).toString() : ((year || new Date().getFullYear()) - 1).toString()
              ]}
              labelFormatter={(label) => {
                const day = chartData.find(d => d.shortName === label)
                return day?.dayLabel || label
              }}
            />
            {showYoY && (
              <Legend 
                verticalAlign="top" 
                height={36}
                formatter={(value) => value === "revenue" ? (year || new Date().getFullYear()).toString() : ((year || new Date().getFullYear()) - 1).toString()}
              />
            )}
            <Bar
              dataKey="revenue"
              fill="#22c55e"
              radius={[0, 4, 4, 0]}
              maxBarSize={showYoY ? 14 : 28}
            />
            {showYoY && (
              <Bar
                dataKey="lyRevenue"
                fill="#94a3b8"
                radius={[0, 4, 4, 0]}
                maxBarSize={14}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
