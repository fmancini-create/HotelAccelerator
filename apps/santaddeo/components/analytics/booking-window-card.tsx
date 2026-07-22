"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { CalendarClock, TrendingUp, TrendingDown, Minus } from "lucide-react"
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

interface BookingWindowBucket {
  key: string
  label: string
  count: number
  lyCount: number
  pct: number
  lyPct: number
}

interface BookingWindowData {
  avgLeadTime: number
  lyAvgLeadTime: number
  medianLeadTime: number
  lyMedianLeadTime: number
  sampleSize: number
  lySampleSize: number
  buckets: BookingWindowBucket[]
}

interface BookingWindowCardProps {
  data?: BookingWindowData
  year: number
  loading: boolean
}

const CY_COLOR = "#22c55e"
const LY_COLOR = "#94a3b8"

export function BookingWindowCard({ data, year, loading }: BookingWindowCardProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Finestra di prenotazione</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[320px] w-full" />
        </CardContent>
      </Card>
    )
  }

  const avg = data?.avgLeadTime ?? 0
  const lyAvg = data?.lyAvgLeadTime ?? 0
  const median = data?.medianLeadTime ?? 0
  const lyMedian = data?.lyMedianLeadTime ?? 0
  const sample = data?.sampleSize ?? 0
  const lySample = data?.lySampleSize ?? 0
  const buckets = data?.buckets ?? []

  // Delta giorni (positivo = prenotano con piu' anticipo rispetto all'anno scorso)
  const deltaDays = avg - lyAvg
  const hasLy = lySample > 0

  const chartData = buckets.map((b) => ({
    label: b.label,
    current: Number(b.pct.toFixed(1)),
    lastYear: Number(b.lyPct.toFixed(1)),
  }))

  const fmtDays = (v: number) => `${v.toFixed(0)} gg`

  if (sample === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Finestra di prenotazione</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-8 text-center">
            Nessuna prenotazione con data di creazione disponibile per {year}.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">Finestra di prenotazione</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground">
          Con quanto anticipo gli ospiti prenotano il soggiorno, rispetto all&apos;anno precedente.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Metriche chiave */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
              Anticipo medio
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums">{avg.toFixed(0)}</span>
              <span className="text-sm text-muted-foreground">giorni</span>
            </div>
            {hasLy && (
              <div className="mt-1 flex items-center gap-1 text-xs">
                {Math.abs(deltaDays) < 0.5 ? (
                  <Minus className="h-3 w-3 text-muted-foreground" />
                ) : deltaDays > 0 ? (
                  <TrendingUp className="h-3 w-3 text-emerald-600" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-amber-600" />
                )}
                <span
                  className={
                    Math.abs(deltaDays) < 0.5
                      ? "text-muted-foreground"
                      : deltaDays > 0
                        ? "text-emerald-700"
                        : "text-amber-700"
                  }
                >
                  {deltaDays > 0 ? "+" : ""}
                  {deltaDays.toFixed(0)} gg vs {year - 1} ({lyAvg.toFixed(0)} gg)
                </span>
              </div>
            )}
          </div>

          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
              Anticipo mediano
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums">{median.toFixed(0)}</span>
              <span className="text-sm text-muted-foreground">giorni</span>
            </div>
            {hasLy && (
              <div className="mt-1 text-xs text-muted-foreground">
                {year - 1}: {lyMedian.toFixed(0)} gg
              </div>
            )}
          </div>
        </div>

        {/* Distribuzione per fascia di anticipo */}
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
            Distribuzione per fascia di anticipo (% prenotazioni)
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis
                tick={{ fontSize: 10 }}
                stroke="hsl(var(--muted-foreground))"
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "white",
                  color: "#1f2937",
                  border: "1px solid #e5e7eb",
                  borderRadius: "0.5rem",
                  fontSize: "13px",
                  padding: "8px 12px",
                  boxShadow:
                    "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
                }}
                labelStyle={{ color: "#1f2937", fontWeight: 600, marginBottom: "4px" }}
                formatter={(value: number, name: string) => {
                  const label = name === "current" ? `${year}` : `${year - 1}`
                  return [`${value}%`, label]
                }}
                separator=": "
              />
              <Legend
                iconType="square"
                wrapperStyle={{ fontSize: 12 }}
                formatter={(value) => (value === "current" ? `${year}` : `${year - 1}`)}
              />
              <Bar dataKey="current" fill={CY_COLOR} name="current" radius={[3, 3, 0, 0]} maxBarSize={28} />
              {hasLy && (
                <Bar dataKey="lastYear" fill={LY_COLOR} name="lastYear" radius={[3, 3, 0, 0]} maxBarSize={28} />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Calcolato su <strong>{sample.toLocaleString("it-IT")}</strong> prenotazioni {year}
          {hasLy && <> ({lySample.toLocaleString("it-IT")} nel {year - 1})</>}. L&apos;anticipo e&apos; la
          distanza tra la data in cui la prenotazione e&apos; stata ricevuta e il check-in. Usa questi
          valori per tarare le soglie &quot;Data ferma&quot; nel Calendario attivita&apos;.
        </p>
      </CardContent>
    </Card>
  )
}
