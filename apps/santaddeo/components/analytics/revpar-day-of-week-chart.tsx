"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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

interface RevParDayOfWeekData {
  day: string
  dayLabel: string
  revpar: number
  lyRevpar: number
  daysCount: number
  lyDaysCount: number
}

interface RevParDayOfWeekChartProps {
  data: RevParDayOfWeekData[]
  loading?: boolean
  showYoY?: boolean
  year?: number
}

const DAY_FULL_NAMES: Record<string, string> = {
  Lun: "Lunedì",
  Mar: "Martedì",
  Mer: "Mercoledì",
  Gio: "Giovedì",
  Ven: "Venerdì",
  Sab: "Sabato",
  Dom: "Domenica",
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value)
}

export function RevParDayOfWeekChart({
  data,
  loading,
  showYoY = false,
  year,
}: RevParDayOfWeekChartProps) {
  const currentYear = year || new Date().getFullYear()
  const lastYear = currentYear - 1

  const chartData = data.map((d) => ({
    name: d.dayLabel,
    fullName: DAY_FULL_NAMES[d.dayLabel] || d.dayLabel,
    revpar: Math.round(d.revpar * 100) / 100,
    lyRevpar: Math.round(d.lyRevpar * 100) / 100,
  }))

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">RevPAR per giorno della settimana</CardTitle>
        <p className="text-xs text-muted-foreground">
          Revenue Per Available Room medio per ogni giorno della settimana
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-[280px] flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground">Caricamento...</div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
              <XAxis
                type="number"
                tickFormatter={(v) => `€${v}`}
                fontSize={11}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={40}
                fontSize={11}
              />
              <Tooltip
                formatter={(value: number, name: string) => {
                  const label = name === "revpar" ? currentYear.toString() : lastYear.toString()
                  return [formatCurrency(value), label]
                }}
                labelFormatter={(label) => DAY_FULL_NAMES[label] || label}
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
                  formatter={(value) => (value === "revpar" ? currentYear : lastYear)}
                  wrapperStyle={{ fontSize: "12px" }}
                />
              )}
              <Bar
                dataKey="revpar"
                fill="#8b5cf6"
                name="revpar"
                radius={[0, 3, 3, 0]}
                maxBarSize={showYoY ? 18 : 24}
              />
              {showYoY && (
                <Bar
                  dataKey="lyRevpar"
                  fill="#c4b5fd"
                  name="lyRevpar"
                  radius={[0, 3, 3, 0]}
                  maxBarSize={18}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
