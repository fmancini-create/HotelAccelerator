"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  TrendingUp,
  TrendingDown,
  BedDouble,
  Euro,
  Percent,
  Activity as ActivityIcon,
} from "lucide-react"

/**
 * Pannello DATI in sola lettura per il VENDITORE dentro l'area struttura.
 *
 * Permessi (vedi lib/sales/revman-access.getSellerHotelPermissions):
 *  - `metrics` -> KPI/analytics dell'hotel (occupazione, ADR, RevPAR, revenue YoY)
 *  - `full`    -> oltre ai KPI, anche il booking pace (pickup) se l'addon e' attivo
 *
 * Le route consumate (`/api/dati/analytics`, `/api/accelerator/pace`) sono state
 * aperte ai venditori per livello via `validateHotelAccess(..., { allowSeller })`.
 */

type AnalyticsKPIs = {
  totalRevenue: number
  lyTotalRevenue: number
  revenueYoY: number
  totalRoomNights: number
  lyTotalRoomNights: number
  roomNightsYoY: number
  adr: number
  lyAdr: number
  adrYoY: number
  occupancy: number
  lyOccupancy: number
  occupancyYoY: number
  revpar: number
  lyRevpar: number
  revparYoY: number
}

type MonthlyData = {
  month: string
  monthLabel: string
  revenue: number
  roomNights: number
  lyRevenue: number
  lyRoomNights: number
}

const eur = (n: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(
    Number.isFinite(n) ? n : 0,
  )
const num = (n: number) => new Intl.NumberFormat("it-IT").format(Math.round(Number.isFinite(n) ? n : 0))
const pct = (n: number) => `${(Number.isFinite(n) ? n : 0).toFixed(1)}%`

function YoYBadge({ value }: { value: number }) {
  const v = Number.isFinite(value) ? value : 0
  const up = v >= 0
  return (
    <Badge variant="outline" className={`gap-1 ${up ? "text-emerald-600" : "text-destructive"}`}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? "+" : ""}
      {v.toFixed(1)}%
    </Badge>
  )
}

function KpiCard({
  icon,
  label,
  value,
  ly,
  yoy,
}: {
  icon: React.ReactNode
  label: string
  value: string
  ly: string
  yoy: number
}) {
  return (
    <Card>
      <CardContent className="pt-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            {icon}
            {label}
          </span>
          <YoYBadge value={yoy} />
        </div>
        <div className="text-2xl font-semibold">{value}</div>
        <div className="text-xs text-muted-foreground">Anno prec.: {ly}</div>
      </CardContent>
    </Card>
  )
}

export function SellerHotelDataPanel({
  hotelId,
  full,
}: {
  hotelId: string
  full: boolean
}) {
  const [kpis, setKpis] = useState<AnalyticsKPIs | null>(null)
  const [monthly, setMonthly] = useState<MonthlyData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Booking pace (solo livello full + addon attivo)
  const [pace, setPace] = useState<{ otb: number; stly: number; pickup: number } | null>(null)
  const [paceMsg, setPaceMsg] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const year = new Date().getFullYear()
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/dati/analytics?hotel_id=${hotelId}&year=${year}&filter=ytd`)
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j?.error || `Errore ${res.status}`)
        }
        const j = await res.json()
        if (!active) return
        setKpis(j.kpis ?? null)
        setMonthly(Array.isArray(j.monthlyData) ? j.monthlyData : [])
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Errore caricamento dati")
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [hotelId])

  useEffect(() => {
    if (!full) return
    let active = true
    ;(async () => {
      try {
        const res = await fetch(`/api/accelerator/pace?hotelId=${hotelId}`)
        const j = await res.json().catch(() => ({}))
        if (!active) return
        if (res.status === 403 && j?.code === "ADDON_REQUIRED") {
          setPaceMsg("Modulo Booking Pace non attivo per questa struttura.")
          return
        }
        if (!res.ok) {
          setPaceMsg(null)
          return
        }
        // Shape reale: { current:{rooms,revenue}, stly:{rooms,revenue}, variance:{roomsPct} }
        const otb = Number(j?.current?.rooms ?? 0)
        const stly = Number(j?.stly?.rooms ?? 0)
        setPace({ otb, stly, pickup: otb - stly })
      } catch {
        if (active) setPaceMsg(null)
      }
    })()
    return () => {
      active = false
    }
  }, [hotelId, full])

  if (loading) {
    return <div className="text-sm text-muted-foreground">Caricamento dati struttura...</div>
  }
  if (error) {
    return (
      <div className="text-sm text-destructive">
        Impossibile caricare i dati: {error}
      </div>
    )
  }
  if (!kpis) {
    return <div className="text-sm text-muted-foreground italic">Nessun dato disponibile per questa struttura.</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">
          Performance {new Date().getFullYear()} (anno in corso ad oggi)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <KpiCard
            icon={<Euro className="h-4 w-4" />}
            label="Revenue"
            value={eur(kpis.totalRevenue)}
            ly={eur(kpis.lyTotalRevenue)}
            yoy={kpis.revenueYoY}
          />
          <KpiCard
            icon={<BedDouble className="h-4 w-4" />}
            label="Camere vendute"
            value={num(kpis.totalRoomNights)}
            ly={num(kpis.lyTotalRoomNights)}
            yoy={kpis.roomNightsYoY}
          />
          <KpiCard
            icon={<Percent className="h-4 w-4" />}
            label="Occupazione"
            value={pct(kpis.occupancy)}
            ly={pct(kpis.lyOccupancy)}
            yoy={kpis.occupancyYoY}
          />
          <KpiCard
            icon={<Euro className="h-4 w-4" />}
            label="ADR"
            value={eur(kpis.adr)}
            ly={eur(kpis.lyAdr)}
            yoy={kpis.adrYoY}
          />
          <KpiCard
            icon={<Euro className="h-4 w-4" />}
            label="RevPAR"
            value={eur(kpis.revpar)}
            ly={eur(kpis.lyRevpar)}
            yoy={kpis.revparYoY}
          />
        </div>
      </div>

      {monthly.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenue per mese (vs anno prec.)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4 font-medium">Mese</th>
                    <th className="py-2 px-4 font-medium text-right">Revenue</th>
                    <th className="py-2 px-4 font-medium text-right">Anno prec.</th>
                    <th className="py-2 pl-4 font-medium text-right">Camere</th>
                  </tr>
                </thead>
                <tbody>
                  {monthly.map((m) => (
                    <tr key={m.month} className="border-b last:border-b-0">
                      <td className="py-2 pr-4">{m.monthLabel}</td>
                      <td className="py-2 px-4 text-right">{eur(m.revenue)}</td>
                      <td className="py-2 px-4 text-right text-muted-foreground">{eur(m.lyRevenue)}</td>
                      <td className="py-2 pl-4 text-right">{num(m.roomNights)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {full && (pace || paceMsg) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ActivityIcon className="h-4 w-4" />
              Booking Pace (pickup vs anno scorso)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {paceMsg && <div className="text-sm text-muted-foreground italic">{paceMsg}</div>}
            {pace && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">OTB (camere prenotate)</div>
                  <div className="text-xl font-semibold">{num(pace.otb)}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">STLY (stesso punto anno scorso)</div>
                  <div className="text-xl font-semibold">{num(pace.stly)}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Pickup</div>
                  <div className={`text-xl font-semibold ${pace.pickup >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                    {pace.pickup >= 0 ? "+" : ""}
                    {num(pace.pickup)}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
