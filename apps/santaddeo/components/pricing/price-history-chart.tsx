"use client"

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts"
import { format } from "date-fns"
import { it } from "date-fns/locale"

interface HistoryEntry {
  changed_at: string
  old_price: number
  new_price: number
}

interface PriceHistoryChartProps {
  history: HistoryEntry[]
  title?: string
}

export function PriceHistoryChart({ history, title = "Storico Prezzi" }: PriceHistoryChartProps) {
  if (!history || history.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <p>Nessuna variazione prezzo registrata</p>
      </div>
    )
  }

  // Transform data for chart
  const chartData = history.map(entry => ({
    time: format(new Date(entry.changed_at), "dd MMM HH:mm", { locale: it }),
    timestamp: new Date(entry.changed_at).getTime(),
    oldPrice: entry.old_price,
    newPrice: entry.new_price,
    rawDate: entry.changed_at,
  }))

  // Sort by timestamp
  chartData.sort((a, b) => a.timestamp - b.timestamp)

  return (
    <div className="w-full space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">
          {history.length} variazione{history.length !== 1 ? "i" : ""} registrata{history.length !== 1 ? "e" : ""}
        </p>
      </div>

      <div className="w-full h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 12 }}
              angle={-45}
              textAnchor="end"
              height={80}
              className="text-xs"
            />
            <YAxis
              tick={{ fontSize: 12 }}
              className="text-xs"
              label={{ value: "Prezzo (€)", angle: -90, position: "insideLeft", style: { fontSize: 12 } }}
            />
            <Tooltip
              contentStyle={{ backgroundColor: "var(--background)", border: "1px solid var(--border)" }}
              labelStyle={{ color: "var(--foreground)" }}
              formatter={(value: number) => `€ ${value.toFixed(2)}`}
              labelFormatter={(label: string) => label}
            />
            <Legend wrapperStyle={{ paddingTop: "20px" }} />
            <Line
              type="monotone"
              dataKey="oldPrice"
              stroke="hsl(var(--primary) / 0.5)"
              name="Prezzo precedente"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="newPrice"
              stroke="hsl(var(--primary))"
              name="Prezzo nuovo"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="space-y-2 pt-4 border-t border-border">
        <h4 className="text-xs font-semibold">Dettagli Variazioni</h4>
        <div className="space-y-1 max-h-48 overflow-y-auto text-xs">
          {chartData.map((entry, idx) => (
            <div key={idx} className="flex justify-between items-center p-2 rounded bg-muted/50">
              <span className="text-muted-foreground">{entry.time}</span>
              <span>
                € {entry.oldPrice?.toFixed(2) || "—"} → € {entry.newPrice?.toFixed(2) || "—"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
