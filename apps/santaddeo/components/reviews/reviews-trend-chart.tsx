"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

/**
 * 12-month trend: bars for review volume, line/area for avg rating.
 * Dual Y axis so both series are readable even when volumes are very small.
 */
export function ReviewsTrendChart({
  monthly,
  loading,
}: {
  monthly: Array<{ month: string; count: number; avg: number | null }> | undefined
  loading: boolean
}) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Trend ultimi 12 mesi</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[280px] w-full" />
        </CardContent>
      </Card>
    )
  }

  const data = (monthly ?? []).map((m) => {
    const [y, mm] = m.month.split("-")
    const labels = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"]
    const idx = Number(mm) - 1
    return {
      ...m,
      label: `${labels[idx] ?? mm} ${y.slice(2)}`,
    }
  })

  const allEmpty = data.every((d) => d.count === 0)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Trend ultimi 12 mesi</CardTitle>
      </CardHeader>
      <CardContent>
        {allEmpty ? (
          <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
            Nessuna recensione negli ultimi 12 mesi
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="ratingGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis
                yAxisId="count"
                orientation="left"
                tick={{ fontSize: 11 }}
                stroke="hsl(var(--muted-foreground))"
                label={{ value: "n°", angle: -90, position: "insideLeft", fontSize: 10 }}
              />
              <YAxis
                yAxisId="rating"
                orientation="right"
                domain={[1, 5]}
                tick={{ fontSize: 11 }}
                stroke="hsl(var(--muted-foreground))"
                label={{ value: "★", angle: 90, position: "insideRight", fontSize: 10 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "0.5rem",
                  fontSize: "12px",
                }}
                formatter={(value: any, name: string) => {
                  if (name === "count") return [`${value} recensioni`, "Volume"]
                  if (name === "avg")
                    return [value != null ? `${Number(value).toFixed(2)}★` : "n/a", "Rating medio"]
                  return [value, name]
                }}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Bar
                yAxisId="count"
                dataKey="count"
                fill="var(--chart-2)"
                name="Volume"
                opacity={0.85}
                radius={[3, 3, 0, 0]}
                maxBarSize={28}
              />
              <Area
                yAxisId="rating"
                type="monotone"
                dataKey="avg"
                stroke="var(--chart-1)"
                strokeWidth={2.5}
                fill="url(#ratingGradient)"
                name="Rating"
                connectNulls
                dot={{ r: 3, fill: "var(--chart-1)", stroke: "var(--chart-1)" }}
                activeDot={{ r: 5, fill: "var(--chart-1)", stroke: "var(--background)", strokeWidth: 2 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
