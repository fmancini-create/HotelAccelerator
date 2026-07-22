"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from "recharts"

interface ProductionDayOfWeekData {
  day: string
  dayLabel: string
  revenue: number
  lyRevenue: number
  roomNights: number
  lyRoomNights: number
}

interface RevporDayOfWeekChartProps {
  data: ProductionDayOfWeekData[]
  loading: boolean
  showYoY?: boolean
  year?: number
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value)

export function RevporDayOfWeekChart({ data, loading, showYoY = false, year }: RevporDayOfWeekChartProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3 w-64 mt-1" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[250px] w-full" />
        </CardContent>
      </Card>
    )
  }

  const currentYear = year || new Date().getFullYear()
  const lastYear = currentYear - 1

  // Calculate RevPOR (Revenue Per Occupied Room) for each day
  const chartData = data.map((d) => ({
    dayLabel: d.dayLabel,
    revpor: d.roomNights > 0 ? d.revenue / d.roomNights : 0,
    lyRevpor: d.lyRoomNights > 0 ? d.lyRevenue / d.lyRoomNights : 0,
  }))

  // Calculate totals for summary
  const totalRevenue = data.reduce((sum, d) => sum + d.revenue, 0)
  const totalRoomNights = data.reduce((sum, d) => sum + d.roomNights, 0)
  const avgRevpor = totalRoomNights > 0 ? totalRevenue / totalRoomNights : 0

  const lyTotalRevenue = data.reduce((sum, d) => sum + d.lyRevenue, 0)
  const lyTotalRoomNights = data.reduce((sum, d) => sum + d.lyRoomNights, 0)
  const lyAvgRevpor = lyTotalRoomNights > 0 ? lyTotalRevenue / lyTotalRoomNights : 0

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">RevPOR per giorno della settimana</CardTitle>
        <p className="text-xs text-muted-foreground">
          Revenue Per Occupied Room (Ricavo medio per camera occupata) suddiviso per giorno della settimana
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="hsl(var(--border))" />
            <XAxis
              type="number"
              tickFormatter={(v) => `€${v.toFixed(0)}`}
              fontSize={11}
            />
            <YAxis
              type="category"
              dataKey="dayLabel"
              width={40}
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              formatter={(value: number, name: string) => {
                const label = name === "revpor" ? currentYear.toString() : lastYear.toString()
                return [formatCurrency(value), label]
              }}
              labelFormatter={(label) => `${label}`}
              contentStyle={{
                backgroundColor: "#ffffff",
                border: "1px solid #e5e7eb",
                borderRadius: "6px",
                fontSize: "12px",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                color: "#1f2937",
              }}
              itemStyle={{ color: "#1f2937" }}
              labelStyle={{ color: "#1f2937", fontWeight: 600, marginBottom: "4px" }}
            />
            {showYoY && (
              <Legend 
                verticalAlign="top" 
                height={36}
                formatter={(value) => value === "revpor" ? currentYear.toString() : lastYear.toString()}
              />
            )}
            <Bar 
              dataKey="revpor" 
              fill="#8b5cf6"
              radius={[0, 4, 4, 0]} 
              maxBarSize={showYoY ? 14 : 24}
            />
            {showYoY && (
              <Bar 
                dataKey="lyRevpor" 
                fill="#94a3b8"
                radius={[0, 4, 4, 0]} 
                maxBarSize={14}
              />
            )}
          </BarChart>
        </ResponsiveContainer>

        {/* Summary row */}
        <div className="mt-4 pt-3 border-t flex items-center justify-between text-xs">
          <span className="text-muted-foreground">RevPOR Medio</span>
          <div className="flex items-center gap-4">
            <span className="font-semibold text-violet-600">
              {currentYear}: {formatCurrency(avgRevpor)}
            </span>
            {showYoY && (
              <span className="text-muted-foreground">
                {lastYear}: {formatCurrency(lyAvgRevpor)}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
