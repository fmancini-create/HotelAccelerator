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

interface ProductionDayOfWeekChartProps {
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

export function ProductionDayOfWeekChart({ data, loading, showYoY = false, year }: ProductionDayOfWeekChartProps) {
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

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Produzione per giorno della settimana</CardTitle>
        <p className="text-xs text-muted-foreground">
          Fatturato giornaliero suddiviso per il giorno della settimana in cui cade ogni notte di soggiorno
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="hsl(var(--border))" />
            <XAxis
              type="number"
              tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
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
                const label = name === "revenue" ? currentYear.toString() : lastYear.toString()
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
                formatter={(value) => value === "revenue" ? currentYear.toString() : lastYear.toString()}
              />
            )}
            <Bar 
              dataKey="revenue" 
              fill="#22c55e"
              radius={[0, 4, 4, 0]} 
              maxBarSize={showYoY ? 14 : 24}
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

        {/* Summary row */}
        <div className="mt-4 pt-3 border-t flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Totale Room Nights</span>
          <div className="flex items-center gap-4">
            <span className="font-semibold text-green-600">
              {currentYear}: {new Intl.NumberFormat("it-IT").format(
                data.reduce((sum, d) => sum + d.roomNights, 0)
              )}
            </span>
            {showYoY && (
              <span className="text-muted-foreground">
                {lastYear}: {new Intl.NumberFormat("it-IT").format(
                  data.reduce((sum, d) => sum + d.lyRoomNights, 0)
                )}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
