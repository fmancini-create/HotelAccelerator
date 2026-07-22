"use client"

import { useEffect, useState } from "react"
import { format } from "date-fns"
import { it } from "date-fns/locale"
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"
import { Loader2, TrendingUp, BedDouble, Tag } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"

interface EvolutionPoint {
  timestamp: string
  price: number
}

interface PickupPoint {
  date: string
  occupied: number
  occupancyPct: number | null
}

export interface DayDetail {
  date: string
  currentPrice: number | null
  startingPrice: number | null
  changeCount: number
  evolutionSeries: EvolutionPoint[]
  occupancyPct: number | null
  hotelRoomsOccupied: number | null
  hotelTotalRooms: number | null
}

interface MergedPoint {
  t: number // epoch ms
  label: string
  price: number | null
  occupancy: number | null
}

/**
 * Unisce evoluzione tariffa (eventi a timestamp) e curva di pickup occupazione
 * (eventi a booking_date) su un UNICO asse di tempo calendario, con
 * forward-fill (step) di ciascuna serie. Cosi' si vede, per la data di
 * soggiorno scelta, come prezzo e occupazione sono evoluti nel tempo.
 */
function mergeSeries(evolution: EvolutionPoint[], pickup: PickupPoint[]): MergedPoint[] {
  const priceEvents = evolution
    .map((e) => ({ t: new Date(e.timestamp).getTime(), price: e.price }))
    .filter((e) => Number.isFinite(e.t))
    .sort((a, b) => a.t - b.t)
  const occEvents = pickup
    .map((p) => ({ t: new Date(p.date + "T00:00:00").getTime(), occ: p.occupancyPct }))
    .filter((e) => Number.isFinite(e.t))
    .sort((a, b) => a.t - b.t)

  const allT = Array.from(new Set([...priceEvents.map((e) => e.t), ...occEvents.map((e) => e.t)])).sort(
    (a, b) => a - b,
  )

  const out: MergedPoint[] = []
  let pi = 0
  let oi = 0
  let lastPrice: number | null = null
  let lastOcc: number | null = null
  for (const t of allT) {
    while (pi < priceEvents.length && priceEvents[pi].t <= t) {
      lastPrice = priceEvents[pi].price
      pi++
    }
    while (oi < occEvents.length && occEvents[oi].t <= t) {
      lastOcc = occEvents[oi].occ
      oi++
    }
    out.push({
      t,
      label: format(new Date(t), "dd/MM/yy", { locale: it }),
      price: lastPrice,
      occupancy: lastOcc,
    })
  }
  return out
}

export function DayDetailDialog({
  open,
  onOpenChange,
  hotelId,
  day,
  roomTypeName,
  rateName,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  hotelId: string | null
  day: DayDetail | null
  roomTypeName?: string
  rateName?: string
}) {
  const [loading, setLoading] = useState(false)
  const [pickup, setPickup] = useState<PickupPoint[]>([])
  const [capacity, setCapacity] = useState<number | null>(null)

  useEffect(() => {
    if (!open || !hotelId || !day) return
    let cancelled = false
    setLoading(true)
    setPickup([])
    const params = new URLSearchParams({ hotel_id: hotelId, date: day.date })
    fetch(`/api/accelerator/rate-trend/occupancy-pickup?${params}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json) return
        setPickup(json.series || [])
        setCapacity(json.capacity ?? null)
      })
      .catch((e) => console.error("[v0] DayDetail pickup error:", e))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, hotelId, day])

  if (!day) return null

  const merged = mergeSeries(day.evolutionSeries || [], pickup)
  const dayLabel = format(new Date(day.date + "T00:00:00"), "EEEE d MMMM yyyy", { locale: it })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 capitalize">
            <TrendingUp className="h-5 w-5 text-primary" />
            {dayLabel}
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2">
            {roomTypeName && (
              <span className="inline-flex items-center gap-1">
                <BedDouble className="h-3.5 w-3.5" /> {roomTypeName}
              </span>
            )}
            {rateName && (
              <span className="inline-flex items-center gap-1">
                <Tag className="h-3.5 w-3.5" /> {rateName}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Riepilogo */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-border p-3">
            <div className="text-xs text-muted-foreground">Tariffa attuale</div>
            <div className="text-lg font-bold">
              {day.currentPrice != null ? `€ ${day.currentPrice.toFixed(0)}` : "--"}
            </div>
            {day.startingPrice != null && day.currentPrice != null && (
              <div className="text-[11px] text-muted-foreground">
                da € {day.startingPrice.toFixed(0)} · {day.changeCount} modifiche
              </div>
            )}
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="text-xs text-muted-foreground">Occupazione</div>
            <div className="text-lg font-bold">
              {day.occupancyPct != null ? `${day.occupancyPct.toFixed(0)}%` : "--"}
            </div>
            {day.hotelRoomsOccupied != null && day.hotelTotalRooms != null && (
              <div className="text-[11px] text-muted-foreground">
                {day.hotelRoomsOccupied}/{day.hotelTotalRooms} camere
              </div>
            )}
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="text-xs text-muted-foreground">Capacità vendibile</div>
            <div className="text-lg font-bold">{capacity != null ? capacity : "--"}</div>
            <div className="text-[11px] text-muted-foreground">camere nette</div>
          </div>
        </div>

        {/* Grafico evoluzione nel tempo */}
        <div>
          <div className="mb-1 text-sm font-medium">Evoluzione nel tempo</div>
          <p className="mb-2 text-xs text-muted-foreground text-pretty">
            Come tariffa e occupazione di questa data sono cambiate col passare del tempo. La curva di
            occupazione è il pickup delle prenotazioni (struttura), ricostruito dalle prenotazioni ricevute.
          </p>
          {loading ? (
            <div className="flex h-[300px] items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : merged.length === 0 ? (
            <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
              Nessuno storico disponibile per questa data.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={merged} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--border)" }}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                <YAxis
                  yAxisId="price"
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  width={48}
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
                <Line
                  yAxisId="occ"
                  type="stepAfter"
                  dataKey="occupancy"
                  name="Occupazione"
                  stroke="var(--chart-2)"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
                <Line
                  yAxisId="price"
                  type="stepAfter"
                  dataKey="price"
                  name="Tariffa"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        {day.evolutionSeries && day.evolutionSeries.length > 0 && (
          <div className="max-h-40 overflow-y-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/60">
                <tr className="text-muted-foreground">
                  <th className="px-3 py-1.5 text-left font-medium">Quando</th>
                  <th className="px-3 py-1.5 text-right font-medium">Tariffa</th>
                </tr>
              </thead>
              <tbody>
                {day.evolutionSeries.map((e, i) => (
                  <tr key={i} className="border-t border-border/50">
                    <td className="px-3 py-1.5">
                      {format(new Date(e.timestamp), "dd/MM/yy HH:mm", { locale: it })}
                    </td>
                    <td className="px-3 py-1.5 text-right font-medium">
                      <Badge variant="secondary">€ {e.price.toFixed(0)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
