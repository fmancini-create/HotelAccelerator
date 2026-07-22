"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts"

interface BookingStatusData {
  status: string
  label: string
  count: number
  revenue: number
  roomNights: number
}

interface CancellationsPieChartProps {
  data: BookingStatusData[]
  loading: boolean
}

const COLORS: Record<string, string> = {
  confirmed: "hsl(142, 71%, 45%)",  // Green
  cancelled: "hsl(0, 84%, 60%)",     // Red  
  pending: "hsl(45, 93%, 47%)",      // Yellow/Orange
}

export function CancellationsPieChart({ data, loading }: CancellationsPieChartProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stato prenotazioni</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[280px] w-full" />
        </CardContent>
      </Card>
    )
  }

  const total = data.reduce((sum, d) => sum + d.count, 0)
  const cancelled = data.find(d => d.status === "cancelled")?.count || 0
  const cancelledPct = total > 0 ? ((cancelled / total) * 100).toFixed(1) : "0"

  const chartData = data
    .filter(d => d.count > 0)
    .map(d => ({
      name: d.label,
      value: d.count,
      revenue: d.revenue,
      roomNights: d.roomNights,
      color: COLORS[d.status] || "hsl(var(--muted))",
    }))

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Stato prenotazioni</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
            Nessuna prenotazione nel periodo
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Stato prenotazioni</CardTitle>
        <p className="text-xs text-muted-foreground">
          Tasso di cancellazione: {cancelledPct}%
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <ResponsiveContainer width="60%" height={240}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={90}
                paddingAngle={2}
                dataKey="value"
                stroke="none"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "white",
                  color: "#1f2937",
                  border: "1px solid #e5e7eb",
                  borderRadius: "0.5rem",
                  fontSize: "12px",
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
                formatter={(value: number, name: string) => [
                  `${value} prenotazioni`,
                  name,
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
          
          <div className="flex flex-col gap-4">
            {chartData.map((entry) => (
              <div key={entry.name} className="flex items-start gap-2">
                <div 
                  className="w-3 h-3 rounded-full mt-1" 
                  style={{ backgroundColor: entry.color }}
                />
                <div className="text-sm">
                  <div className="font-medium">{entry.name}</div>
                  <div className="text-muted-foreground text-xs space-y-0.5">
                    <div>{entry.value} prenotazioni</div>
                    <div>{entry.roomNights.toLocaleString("it-IT")} notti</div>
                    <div>{new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(entry.revenue)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
