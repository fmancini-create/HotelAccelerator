"use client"

import {
  Line,
  LineChart,
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts"

export type PaceMetric = "rooms" | "revenue"

export interface CurvePoint {
  daysBefore: number
  cyRooms: number
  lyRooms: number
  cyRevenue: number
  lyRevenue: number
}

export interface MonthPoint {
  month: string
  rooms: number
  stlyRooms: number
  revenue: number
  stlyRevenue: number
}

const CY_COLOR = "#0d9488" // teal-600 (anno corrente)
const LY_COLOR = "#94a3b8" // slate-400 (anno scorso)

const fmtMonth = (m: string) => {
  const [y, mm] = m.split("-")
  const names = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"]
  return `${names[Number(mm) - 1]} ${y.slice(2)}`
}

const eur0 = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n)
const num0 = (n: number) => new Intl.NumberFormat("it-IT").format(n)
// asse Y compatto: 12.500 € -> "12,5k", 1.350 camere -> "1.350"
const axisFmt = (metric: PaceMetric) => (v: number) =>
  metric === "revenue"
    ? v >= 1000
      ? `${(v / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 })}k`
      : `${v}`
    : num0(v)

const tooltipFmt = (metric: PaceMetric) => (value: number) =>
  metric === "revenue" ? eur0(value) : `${num0(value)} camere`

const sharedTooltip = {
  contentStyle: {
    backgroundColor: "white",
    color: "#1f2937",
    border: "1px solid #e5e7eb",
    borderRadius: "0.5rem",
    fontSize: "13px",
    padding: "8px 12px",
    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
  },
  labelStyle: { color: "#1f2937", fontWeight: 600, marginBottom: "4px" },
  itemStyle: { color: "#374151", padding: "2px 0" },
}

export function BookingCurveChart({ data, metric }: { data: CurvePoint[]; metric: PaceMetric }) {
  // x = giorni all'arrivo (a ritroso): da "molto prima" a 0 (oggi)
  const chartData = data.map((d) => ({
    label: d.daysBefore === 0 ? "oggi" : `-${d.daysBefore}g`,
    "Anno corrente": metric === "revenue" ? d.cyRevenue : d.cyRooms,
    "Anno scorso (stesso anticipo)": metric === "revenue" ? d.lyRevenue : d.lyRooms,
  }))
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
        <YAxis
          tick={{ fontSize: 12 }}
          stroke="hsl(var(--muted-foreground))"
          tickLine={false}
          axisLine={false}
          width={44}
          tickFormatter={axisFmt(metric)}
        />
        <Tooltip {...sharedTooltip} formatter={tooltipFmt(metric)} />
        <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="Anno corrente" stroke={CY_COLOR} strokeWidth={2.5} dot={false} />
        <Line
          type="monotone"
          dataKey="Anno scorso (stesso anticipo)"
          stroke={LY_COLOR}
          strokeWidth={2}
          strokeDasharray="5 4"
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function MonthlyPaceChart({ data, metric }: { data: MonthPoint[]; metric: PaceMetric }) {
  const chartData = data.map((d) => ({
    label: fmtMonth(d.month),
    "Anno corrente": metric === "revenue" ? d.revenue : d.rooms,
    "Anno scorso": metric === "revenue" ? d.stlyRevenue : d.stlyRooms,
  }))
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
        <YAxis
          tick={{ fontSize: 12 }}
          stroke="hsl(var(--muted-foreground))"
          tickLine={false}
          axisLine={false}
          width={44}
          tickFormatter={axisFmt(metric)}
        />
        <Tooltip cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }} {...sharedTooltip} formatter={tooltipFmt(metric)} />
        <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Anno corrente" fill={CY_COLOR} radius={[4, 4, 0, 0]} maxBarSize={32} />
        <Bar dataKey="Anno scorso" fill={LY_COLOR} radius={[4, 4, 0, 0]} maxBarSize={32} />
      </BarChart>
    </ResponsiveContainer>
  )
}
