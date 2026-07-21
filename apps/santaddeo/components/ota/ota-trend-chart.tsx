"use client"

import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Bar,
  Line,
} from "recharts"

interface Snapshot {
  period_end: string
  search_views: number | null
  property_views: number | null
  bookings_count: number | null
}

export function OtaTrendChart({ snapshots }: { snapshots: Snapshot[] }) {
  // Chart expects oldest → newest; API returns newest first.
  const data = [...snapshots].reverse().map((s) => ({
    label: formatMonth(s.period_end),
    search: s.search_views ?? 0,
    property: s.property_views ?? 0,
    bookings: s.bookings_count ?? 0,
  }))

  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground h-[260px] flex items-center justify-center">
        Dati insufficienti
      </p>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
        <YAxis
          yAxisId="left"
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
          tickFormatter={(v) => Intl.NumberFormat("it-IT", { notation: "compact" }).format(v)}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
        />
        <Tooltip
          contentStyle={{
            background: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 6,
          }}
        />
        <Legend />
        <Bar
          yAxisId="left"
          dataKey="search"
          name="Visual. ricerca"
          fill="hsl(var(--chart-1))"
          radius={[4, 4, 0, 0]}
        />
        <Bar
          yAxisId="left"
          dataKey="property"
          name="Visual. struttura"
          fill="hsl(var(--chart-2))"
          radius={[4, 4, 0, 0]}
        />
        <Line
          yAxisId="right"
          dataKey="bookings"
          name="Prenotazioni"
          stroke="hsl(var(--chart-3))"
          strokeWidth={2}
          dot={{ r: 4 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

function formatMonth(date: string): string {
  const d = new Date(date)
  return d.toLocaleDateString("it-IT", { month: "short", year: "2-digit" })
}
