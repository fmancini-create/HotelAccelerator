"use client"

import { useState, useEffect, useCallback } from "react"
import { format, subDays } from "date-fns"
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  Euro,
  BedDouble,
  CalendarCheck,
  CalendarX,
  Scale,
  Target,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { AddonLocked } from "@/components/accelerator/addon-locked"

type BalanceStatus = "on-track" | "at-risk" | "off-track" | "no-target"

interface DailyRow {
  date: string
  receivedCount: number
  receivedEur: number
  receivedRoomNights: number
  receivedRevpor: number
  cancelledCount: number
  cancelledEur: number
  cancelledRoomNights: number
  netCount: number
  netEur: number
  netRoomNights: number
  trailingNetEurPerDay: number
  requiredEurPerDay: number
  paceRatio: number | null
  status: BalanceStatus
}
interface MonthTarget {
  month: string
  objectiveEur: number
  otbEur: number
  otbRoomNights: number
  adr: number
  gapEur: number
  gapRoomNights: number
  gapBookings: number
  daysWindow: number
  requiredEurPerDay: number
  requiredBookingsPerDay: number
  recentEurPerDay: number
  paceRatio: number | null
  status: BalanceStatus
}
interface BalanceData {
  range: { from: string; to: string; today: string }
  los: number
  leadTimeDays: number
  cancellationsDated: boolean
  totals: {
    receivedCount: number
    receivedEur: number
    receivedRoomNights: number
    cancelledCount: number
    cancelledEur: number
    cancelledRoomNights: number
    netCount: number
    netEur: number
    netRoomNights: number
    receivedRevpor: number
  }
  totalRequiredEurPerDay: number
  trailingNetEurPerDay: number
  overallStatus: BalanceStatus
  daily: DailyRow[]
  months: MonthTarget[]
}

const eur = (n: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n)
const num = (n: number) => new Intl.NumberFormat("it-IT").format(n)
const fmtDay = (iso: string) => {
  const d = new Date(iso + "T00:00:00")
  return d.toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "short" })
}
const fmtMonth = (m: string) => {
  const d = new Date(m + "-01T00:00:00")
  return d.toLocaleDateString("it-IT", { month: "long", year: "numeric" })
}

const STATUS_META: Record<BalanceStatus, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  "on-track": { label: "In linea", cls: "border-teal-200 bg-teal-50 text-teal-700", Icon: CheckCircle2 },
  "at-risk": { label: "A rischio", cls: "border-amber-200 bg-amber-50 text-amber-700", Icon: AlertTriangle },
  "off-track": { label: "Fuori linea", cls: "border-red-200 bg-red-50 text-red-700", Icon: TrendingDown },
  "no-target": { label: "n/d", cls: "border-border bg-muted/40 text-muted-foreground", Icon: TrendingUp },
}

function StatusBadge({ status }: { status: BalanceStatus }) {
  const m = STATUS_META[status]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${m.cls}`}>
      <m.Icon className="h-3 w-3" aria-hidden="true" />
      {m.label}
    </span>
  )
}

/** Valore con segno: verde se positivo, rosso se negativo. */
function Signed({ value, format: fmt }: { value: number; format: (n: number) => string }) {
  if (value === 0) return <span className="text-muted-foreground">—</span>
  const positive = value > 0
  return (
    <span className={`font-medium tabular-nums ${positive ? "text-teal-600" : "text-red-600"}`}>
      {positive ? "+" : ""}
      {fmt(value)}
    </span>
  )
}

export default function CommercialBalancePage() {
  const [hotelId, setHotelId] = useState<string | null>(null)
  const [hotelName, setHotelName] = useState("")
  const [loading, setLoading] = useState(true)
  const [loadingData, setLoadingData] = useState(false)
  const [locked, setLocked] = useState(false)
  const [from, setFrom] = useState(format(subDays(new Date(), 59), "yyyy-MM-dd"))
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"))
  const [data, setData] = useState<BalanceData | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/ui/selected-hotel", { cache: "no-store" })
        const d = await res.json()
        if (cancelled) return
        if (d.error || !d.hotel) {
          setLoading(false)
          return
        }
        setHotelId(d.hotel.id)
        setHotelName(d.hotel.name)
      } catch {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const load = useCallback(async () => {
    if (!hotelId) return
    setLoadingData(true)
    setLocked(false)
    try {
      const params = new URLSearchParams({ hotelId, from, to })
      const res = await fetch(`/api/accelerator/commercial-balance?${params}`, { cache: "no-store" })
      if (res.status === 403) {
        const body = await res.json()
        if (body.code === "ADDON_REQUIRED") setLocked(true)
        setData(null)
        return
      }
      if (!res.ok) {
        setData(null)
        return
      }
      setData(await res.json())
    } catch (e) {
      console.error("[commercial-balance] load error", e)
      setData(null)
    } finally {
      setLoadingData(false)
      setLoading(false)
    }
  }, [hotelId, from, to])

  useEffect(() => {
    if (hotelId) load()
  }, [hotelId, from, to, load])

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    )
  }

  if (locked) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <AddonLocked
          title="Bilancio Commerciale"
          addonType="booking_pace"
          description="Vedi giorno per giorno le prenotazioni ricevute, le cancellate e il saldo netto, con la valutazione del raggiungimento degli obiettivi."
          features={[
            "Prenotazioni ricevute e cancellate per ogni giorno",
            "Saldo netto in valore, prenotazioni e room nights",
            "Valutazione obiettivi per mese di soggiorno",
            "Ritmo richiesto vs ritmo attuale (lead time e soggiorno medio)",
          ]}
        />
      </div>
    )
  }

  const readable = data ? STATUS_META[data.overallStatus] : null

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-balance">Bilancio Commerciale</h1>
          <p className="text-sm text-muted-foreground text-pretty">
            {hotelName ? `${hotelName} — ` : ""}prenotazioni ricevute, cancellate e saldo netto, giorno per giorno
          </p>
        </div>
        <div className="flex items-end gap-2">
          <label className="flex flex-col text-xs text-muted-foreground">
            Da
            <Input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="h-9 w-[150px]"
            />
          </label>
          <label className="flex flex-col text-xs text-muted-foreground">
            A
            <Input
              type="date"
              value={to}
              min={from}
              max={data?.range.today}
              onChange={(e) => setTo(e.target.value)}
              className="h-9 w-[150px]"
            />
          </label>
        </div>
      </header>

      {loadingData ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      ) : !data ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nessun dato di prenotazione disponibile per questa struttura nel periodo selezionato.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Avviso cancellazioni non datate (es. BRiG) */}
          {!data.cancellationsDated && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900" role="status">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <p className="text-sm leading-relaxed text-pretty">
                Il gestionale di questa struttura non registra la data di cancellazione: la colonna
                &quot;cancellate&quot; e il saldo possono non essere attendibili. Le prenotazioni ricevute restano corrette.
              </p>
            </div>
          )}

          {/* Lettura automatica / valutazione complessiva */}
          {readable && (
            <div className={`flex items-start gap-3 rounded-lg border p-4 ${readable.cls}`} role="status">
              <readable.Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div className="text-sm leading-relaxed text-pretty">
                <span className="font-medium">Valutazione: {readable.label}.</span>{" "}
                Negli ultimi 7 giorni stai acquisendo in media{" "}
                <strong>{eur(data.trailingNetEurPerDay)}/giorno</strong> di produzione netta, contro un ritmo richiesto
                di <strong>{eur(data.totalRequiredEurPerDay)}/giorno</strong> per raggiungere gli obiettivi dei mesi
                ancora aperti (soggiorno medio {data.los.toFixed(1).replace(".", ",")} notti, anticipo medio{" "}
                {Math.round(data.leadTimeDays)} giorni).
              </div>
            </div>
          )}

          {/* KPI di sintesi */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Ricevute</CardTitle>
                <CalendarCheck className="h-4 w-4 text-teal-600" aria-hidden="true" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold text-teal-600">{eur(data.totals.receivedEur)}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {num(data.totals.receivedCount)} prenotazioni · {num(data.totals.receivedRoomNights)} notti
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  RevPOR medio <span className="font-medium text-foreground">{eur(data.totals.receivedRevpor)}</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Cancellate</CardTitle>
                <CalendarX className="h-4 w-4 text-red-600" aria-hidden="true" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold text-red-600">{eur(data.totals.cancelledEur)}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {num(data.totals.cancelledCount)} prenotazioni · {num(data.totals.cancelledRoomNights)} notti
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Saldo netto</CardTitle>
                <Scale className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  <Signed value={data.totals.netEur} format={eur} />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {data.totals.netCount >= 0 ? "+" : ""}
                  {num(data.totals.netCount)} prenotazioni · {data.totals.netRoomNights >= 0 ? "+" : ""}
                  {num(data.totals.netRoomNights)} notti
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Ritmo netto / giorno</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{eur(data.trailingNetEurPerDay)}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  richiesto {eur(data.totalRequiredEurPerDay)} · ultimi 7 gg
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sintesi obiettivi per mese di soggiorno (B) */}
          {data.months.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <CardTitle className="text-base">Obiettivi per mese di soggiorno</CardTitle>
                  </div>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs text-muted-foreground">
                        <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        Come funziona
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-80 text-sm">
                      <div className="space-y-2">
                        <p className="font-medium text-foreground">Dal gap al ritmo richiesto</p>
                        <ol className="list-decimal space-y-1.5 pl-4 text-muted-foreground">
                          <li>Gap € = Obiettivo del mese − produzione già acquisita (OTB).</li>
                          <li>Gap notti = Gap € ÷ ADR del mese.</li>
                          <li>Gap prenotazioni = Gap notti ÷ soggiorno medio.</li>
                          <li>Ritmo richiesto = Gap € ÷ giorni da oggi a fine mese di soggiorno.</li>
                          <li>Confronto col ritmo netto degli ultimi 7 giorni verso quel mese.</li>
                        </ol>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Mese</TableHead>
                        <TableHead className="text-right">Obiettivo</TableHead>
                        <TableHead className="text-right">Acquisito (OTB)</TableHead>
                        <TableHead className="text-right">Gap €</TableHead>
                        <TableHead className="text-right">Pren. mancanti</TableHead>
                        <TableHead className="text-right">Richiesto/g</TableHead>
                        <TableHead className="text-right">Attuale/g</TableHead>
                        <TableHead className="text-center">Valutazione</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.months.map((m) => (
                        <TableRow key={m.month}>
                          <TableCell className="font-medium capitalize">{fmtMonth(m.month)}</TableCell>
                          <TableCell className="text-right tabular-nums">{eur(m.objectiveEur)}</TableCell>
                          <TableCell className="text-right tabular-nums">{eur(m.otbEur)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {m.gapEur > 0 ? eur(m.gapEur) : <span className="text-teal-600">raggiunto</span>}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {m.gapEur > 0 ? num(Math.ceil(m.gapBookings)) : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {m.gapEur > 0 ? eur(m.requiredEurPerDay) : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <Signed value={Math.round(m.recentEurPerDay)} format={eur} />
                          </TableCell>
                          <TableCell className="text-center">
                            <StatusBadge status={m.status} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tabella giornaliera (A) */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Euro className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <CardTitle className="text-base">Andamento giornaliero</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Giorno</TableHead>
                      <TableHead className="text-right">Ricevute €</TableHead>
                      <TableHead className="text-right">RevPOR ric.</TableHead>
                      <TableHead className="text-right">Cancellate €</TableHead>
                      <TableHead className="text-right">Saldo €</TableHead>
                      <TableHead className="text-right">Saldo pren.</TableHead>
                      <TableHead className="text-right">Saldo notti</TableHead>
                      <TableHead className="text-center">Trend obiettivi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...data.daily].reverse().map((r) => (
                      <TableRow key={r.date}>
                        <TableCell className="font-medium capitalize whitespace-nowrap">{fmtDay(r.date)}</TableCell>
                        <TableCell className="text-right tabular-nums text-teal-600">
                          {r.receivedEur > 0 ? eur(r.receivedEur) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {r.receivedRevpor > 0 ? eur(r.receivedRevpor) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-red-600">
                          {r.cancelledEur > 0 ? `-${eur(r.cancelledEur)}` : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Signed value={r.netEur} format={eur} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Signed value={r.netCount} format={num} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Signed value={r.netRoomNights} format={num} />
                        </TableCell>
                        <TableCell className="text-center">
                          <StatusBadge status={r.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="mt-3 text-xs text-muted-foreground text-pretty">
                Il &quot;Trend obiettivi&quot; confronta la media mobile a 7 giorni del saldo netto con il ritmo
                richiesto complessivo per raggiungere gli obiettivi dei mesi ancora aperti.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
