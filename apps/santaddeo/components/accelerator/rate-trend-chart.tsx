"use client"

import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"

export interface TrendChartPoint {
  date: string // YYYY-MM-DD
  label: string // dd/MM
  price: number | null
  occupancy: number | null // 0-100
}

/**
 * Grafico combinato: linea della tariffa attuale (asse sinistro) + barre
 * dell'occupazione struttura in % (asse destro), per ogni data del range.
 * Stesso linguaggio visivo del resto dell'Accelerator (token --chart-*).
 */
export function RateTrendChart({ data }: { data: TrendChartPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickLine={false}
          axisLine={{ stroke: "var(--border)" }}
          interval="preserveStartEnd"
          minTickGap={16}
        />
        <YAxis
          yAxisId="price"
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickLine={false}
          axisLine={false}
          width={48}
          tickFormatter={(v) => `${v}`}
        />
        <YAxis
          yAxisId="occ"
          orientation="right"
          domain={[0, 100]}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickLine={false}
          axisLine={false}
          width={40}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
          contentStyle={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
            color: "var(--popover-foreground)",
          }}
          formatter={(value: number | string, name: string) => {
            if (value == null) return ["--", name]
            if (name === "Occupazione") return [`${value}%`, name]
            return [`€ ${value}`, name]
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar
          yAxisId="occ"
          dataKey="occupancy"
          name="Occupazione"
          fill="var(--chart-2)"
          fillOpacity={0.35}
          radius={[3, 3, 0, 0]}
          maxBarSize={28}
        />
        <Line
          yAxisId="price"
          type="monotone"
          dataKey="price"
          name="Tariffa"
          stroke="var(--chart-1)"
          strokeWidth={2}
          dot={{ r: 2 }}
          activeDot={{ r: 4 }}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/**
 * Mini sparkline SVG dell'evoluzione di una singola cella (per la tabella
 * di dettaglio). Verde se in crescita, rosso se in calo, grigio se piatto.
 */
export function MiniSparkline({
  values,
  width = 110,
  height = 28,
}: {
  values: number[]
  width?: number
  height?: number
}) {
  if (!values || values.length === 0) {
    return <span className="text-[10px] text-muted-foreground">--</span>
  }
  if (values.length === 1) {
    return (
      <svg width={width} height={height} className="block">
        <circle cx={width / 2} cy={height / 2} r="2.5" fill="var(--muted-foreground)" />
      </svg>
    )
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const padding = 3

  const points = values.map((val, i) => {
    const x = padding + (i / (values.length - 1)) * (width - 2 * padding)
    const y = height - padding - ((val - min) / range) * (height - 2 * padding)
    return { x, y }
  })

  const trend = values[values.length - 1] - values[0]
  const color = trend > 0 ? "#16a34a" : trend < 0 ? "#dc2626" : "#6b7280"

  return (
    <svg width={width} height={height} className="block">
      <polyline
        points={points.map((p) => `${p.x},${p.y}`).join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={points[0].x} cy={points[0].y} r="2" fill={color} />
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="2" fill={color} />
    </svg>
  )
}
