"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { format, addDays as addDaysFn } from "date-fns"
import { it } from "date-fns/locale"
import { Loader2, TrendingUp, TrendingDown, Minus, Tag, CloudDownload } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AddonLocked } from "@/components/accelerator/addon-locked"
import { CompetitorManager, type Competitor } from "@/components/accelerator/competitor-manager"
import { RoomTypeMatcher } from "@/components/accelerator/room-type-matcher"

interface CompCell {
  competitorId: string
  name: string
  price: number | null
  availability: boolean | null
}
interface DayRow {
  date: string
  ourPrice: number | null
  ourSoldOut?: boolean
  ourOccupancy?: number | null
  competitors: CompCell[]
  market: { min: number | null; median: number | null; max: number | null; count: number }
  diffVsMedianPct: number | null
  rank: number | null
  rankOf: number
}
interface ShopData {
  range: { from: string; to: string; occupancy: number }
  competitors: Array<{ id: string; name: string }>
  days: DayRow[]
  summary: {
    daysCompared: number
    avgDiffVsMedianPct: number | null
    daysCheaper: number
    daysPricier: number
  }
}

interface RoomCompCell {
  competitorId: string
  name: string
  mappedRoom: string | null
  price: number | null
}
interface RoomDayRow {
  date: string
  ourPrice: number | null
  ourSoldOut?: boolean
  ourOccupancy?: number | null
  competitors: RoomCompCell[]
  market: { min: number | null; median: number | null; max: number | null; count: number }
  diffVsMedianPct: number | null
}
interface RoomTypeBlock {
  roomTypeId: string
  roomTypeName: string
  days: RoomDayRow[]
  summary: {
    daysCompared: number
    avgDiffVsMedianPct: number | null
    mapped: number
    competitorsTotal: number
  }
}
interface RoomData {
  range: { from: string; to: string; occupancy: number }
  competitors: Array<{ id: string; name: string }>
  roomTypes: RoomTypeBlock[]
  note?: string
}

const HORIZONS: Record<string, number> = { "30 giorni": 30, "60 giorni": 60, "90 giorni": 90 }
const eur = (n: number | null) => (n == null ? "—" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n))

// Classi per la cella del prezzo del tenant ("Noi"): verde se il nostro prezzo
// è competitivo (<= mediana del mercato), sfumature crescenti di rosso man mano
// che superiamo la mediana. Si basa sullo scostamento % vs mediana del giorno.
function ourPriceCellClass(pct: number | null, hasPrice: boolean): string {
  if (!hasPrice || pct == null) return ""
  if (pct <= -8) return "bg-green-600/20 text-green-800 dark:text-green-300"
  if (pct < 0) return "bg-green-500/12 text-green-800 dark:text-green-300"
  if (pct === 0) return "bg-green-500/8 text-green-800 dark:text-green-300"
  if (pct <= 5) return "bg-red-500/10 text-red-800 dark:text-red-300"
  if (pct <= 12) return "bg-red-500/20 text-red-800 dark:text-red-300"
  if (pct <= 25) return "bg-red-600/30 text-red-900 dark:text-red-300"
  return "bg-red-700/40 text-red-900 dark:text-red-200"
}

// Pillola occupazione: colore graduale (verde basso -> ambra/rosso alto).
function OccupancyPill({ occ }: { occ: number }) {
  const cls =
    occ >= 90
      ? "bg-red-600/20 text-red-800 dark:text-red-300"
      : occ >= 70
        ? "bg-amber-500/20 text-amber-800 dark:text-amber-300"
        : "bg-muted text-muted-foreground"
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${cls}`}
      title="Occupazione della struttura per questa notte"
    >
      {occ}% occ.
    </span>
  )
}

// Cella del nostro prezzo: se la struttura e' piena (sold out) mostra "sold out"
// al posto del prezzo, altrimenti il prezzo colorato per competitivita'. Sotto,
// quando disponibile, mostra l'occupazione della struttura per quella notte.
function OurPriceCell({
  price,
  soldOut,
  occupancy,
  diffVsMedianPct,
}: {
  price: number | null
  soldOut?: boolean
  occupancy?: number | null
  diffVsMedianPct: number | null
}) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      {soldOut ? (
        <span className="inline-block rounded bg-amber-500/20 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
          Sold out
        </span>
      ) : (
        <span
          className={`inline-block rounded px-2 py-0.5 font-semibold tabular-nums ${ourPriceCellClass(diffVsMedianPct, price != null)}`}
        >
          {eur(price)}
        </span>
      )}
      {occupancy != null && !soldOut ? <OccupancyPill occ={occupancy} /> : null}
    </div>
  )
}

function PriceLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="font-medium">La tua tariffa:</span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded-sm bg-green-600/20" aria-hidden="true" />
        sotto la mediana (competitiva)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded-sm bg-red-500/20" aria-hidden="true" />
        sopra la mediana
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded-sm bg-red-700/40" aria-hidden="true" />
        molto sopra (rosso più intenso)
      </span>
    </div>
  )
}

function DiffBadge({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-xs text-muted-foreground">—</span>
  const cheaper = pct < 0
  const Icon = cheaper ? TrendingDown : pct > 0 ? TrendingUp : Minus
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${cheaper ? "text-green-600" : pct > 0 ? "text-red-600" : "text-muted-foreground"}`}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {pct > 0 ? "+" : ""}
      {pct.toFixed(0)}%
    </span>
  )
}

export default function RateShopperPage() {
  const [hotelId, setHotelId] = useState<string | null>(null)
  const [hotelName, setHotelName] = useState("")
  const [loading, setLoading] = useState(true)
  const [loadingData, setLoadingData] = useState(false)
  const [locked, setLocked] = useState(false)
  const [horizon, setHorizon] = useState("60 giorni")
  const [occupancy, setOccupancy] = useState(2)
  const [data, setData] = useState<ShopData | null>(null)
  const [competitors, setCompetitors] = useState<Competitor[]>([])
  const [view, setView] = useState<"byNight" | "byRoom">("byNight")
  const [roomData, setRoomData] = useState<RoomData | null>(null)
  const [loadingRoom, setLoadingRoom] = useState(false)
  const [autoRefreshing, setAutoRefreshing] = useState(false)
  const autoRefreshTried = useRef(false)

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

  const loadCompetitors = useCallback(async () => {
    if (!hotelId) return
    try {
      const res = await fetch(`/api/accelerator/rate-shopper/competitors?hotelId=${hotelId}`, { cache: "no-store" })
      if (res.ok) {
        const body = await res.json()
        setCompetitors(body.competitors ?? [])
      }
    } catch {
      /* noop */
    }
  }, [hotelId])

  const loadData = useCallback(async () => {
    if (!hotelId) return
    setLoadingData(true)
    setLocked(false)
    try {
      const today = new Date()
      const to = format(addDaysFn(today, HORIZONS[horizon]), "yyyy-MM-dd")
      const params = new URLSearchParams({
        hotelId,
        from: format(today, "yyyy-MM-dd"),
        to,
        occupancy: String(occupancy),
      })
      const res = await fetch(`/api/accelerator/rate-shopper?${params}`, { cache: "no-store" })
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
      console.error("[rate-shopper] load error", e)
      setData(null)
    } finally {
      setLoadingData(false)
      setLoading(false)
    }
  }, [hotelId, horizon, occupancy])

  const loadRoomData = useCallback(async () => {
    if (!hotelId) return
    setLoadingRoom(true)
    try {
      const today = new Date()
      const to = format(addDaysFn(today, HORIZONS[horizon]), "yyyy-MM-dd")
      const params = new URLSearchParams({
        hotelId,
        from: format(today, "yyyy-MM-dd"),
        to,
        occupancy: String(occupancy),
      })
      const res = await fetch(`/api/accelerator/rate-shopper/by-room?${params}`, { cache: "no-store" })
      if (!res.ok) {
        setRoomData(null)
        return
      }
      setRoomData(await res.json())
    } catch (e) {
      console.error("[rate-shopper] room load error", e)
      setRoomData(null)
    } finally {
      setLoadingRoom(false)
    }
  }, [hotelId, horizon, occupancy])

  useEffect(() => {
    if (hotelId) {
      loadCompetitors()
      loadData()
    }
  }, [hotelId, horizon, occupancy, loadCompetitors, loadData])

  useEffect(() => {
    if (hotelId && view === "byRoom") loadRoomData()
  }, [hotelId, view, horizon, occupancy, loadRoomData])

  const refresh = useCallback(() => {
    loadCompetitors()
    loadData()
    if (view === "byRoom") loadRoomData()
  }, [loadCompetitors, loadData, loadRoomData, view])

  // Refresh "pigro": alla prima apertura della pagina, se i prezzi non sono
  // ancora stati scaricati oggi (e c'e' una fonte Google auto-aggiornabile),
  // scarica i prezzi aggiornati una sola volta e poi ricarica i dati. Il cron
  // settimanale resta come baseline garantito anche senza visite.
  useEffect(() => {
    if (!hotelId || autoRefreshTried.current) return
    autoRefreshTried.current = true
    let cancelled = false
    ;(async () => {
      try {
        const fr = await fetch(`/api/accelerator/rate-shopper/freshness?hotelId=${hotelId}`, { cache: "no-store" })
        if (!fr.ok) return
        const f = await fr.json()
        if (cancelled || !f.stale) return
        setAutoRefreshing(true)
        await fetch("/api/accelerator/rate-shopper/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Pull sempre a 60 gg (orizzonte cron), indipendente dalla vista selezionata.
        body: JSON.stringify({ hotelId, ifStale: true, days: 60, occupancy }),
        })
        if (cancelled) return
        loadData()
        if (view === "byRoom") loadRoomData()
      } catch {
        /* silenzioso: il cron resta il baseline */
      } finally {
        if (!cancelled) setAutoRefreshing(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelId])

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
          title="Rate Shopper"
          addonType="rate_shopper"
          description="Confronta i tuoi prezzi con il comp set, giorno per giorno, e scopri dove sei fuori mercato."
          features={[
            "Comp set illimitato per struttura",
            "Confronto prezzo vs mercato (min, mediana, max)",
            "Posizionamento e scostamento per ogni notte",
            "Inserimento manuale, import CSV o feed automatico",
          ]}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {autoRefreshing ? (
        <div
          role="status"
          className="mb-4 flex items-center gap-3 rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-sm"
        >
          <CloudDownload className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <p className="font-medium">Stiamo scaricando i prezzi aggiornati dei competitor…</p>
            <p className="text-xs text-muted-foreground text-pretty">
              Solo al primo accesso di oggi. Potrebbe richiedere qualche secondo — i dati si aggiorneranno da soli.
            </p>
          </div>
          <Loader2 className="ml-auto h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      ) : null}
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-balance">Rate Shopper</h1>
          <p className="text-sm text-muted-foreground text-pretty">
            {hotelName ? `${hotelName} — ` : ""}i tuoi prezzi vs il comp set
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hotelId ? (
            <CompetitorManager hotelId={hotelId} competitors={competitors} occupancy={occupancy} onChanged={refresh} />
          ) : null}
          {hotelId ? <RoomTypeMatcher hotelId={hotelId} onChanged={refresh} /> : null}
          <Select value={String(occupancy)} onValueChange={(v) => setOccupancy(Number(v))}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4].map((o) => (
                <SelectItem key={o} value={String(o)}>
                  {o} ospiti
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={horizon} onValueChange={setHorizon}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.keys(HORIZONS).map((h) => (
                <SelectItem key={h} value={h}>
                  Prossimi {h}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      <div className="mb-4">
        <Tabs value={view} onValueChange={(v) => setView(v as "byNight" | "byRoom")}>
          <TabsList>
            <TabsTrigger value="byNight">Per notte</TabsTrigger>
            <TabsTrigger value="byRoom">Per tipologia</TabsTrigger>
          </TabsList>
        </Tabs>
        <p className="mt-2 text-xs text-muted-foreground text-pretty">
          {view === "byNight"
            ? `Confronto sulla tariffa più bassa disponibile (lead-in), ${occupancy} ospiti, 1 notte. Non è un confronto per tipologia.`
            : `Confronto per tipologia: la tua camera vs la camera equivalente mappata di ogni competitor, ${occupancy} ospiti, 1 notte. Le associazioni si gestiscono da “Associa tipologie”.`}
        </p>
      </div>

      {view === "byRoom" ? (
        loadingRoom ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
          </div>
        ) : !roomData || roomData.roomTypes.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
              <Tag className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="font-medium">Nessuna tipologia monitorata</p>
                <p className="text-sm text-muted-foreground text-pretty">
                  Apri &ldquo;Associa tipologie&rdquo; per scegliere fino a 3 tue camere e collegarle a quelle dei
                  competitor rilevate su Google.
                </p>
              </div>
              {hotelId ? <RoomTypeMatcher hotelId={hotelId} onChanged={refresh} /> : null}
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="rounded-md border bg-card p-3">
              <PriceLegend />
            </div>
            {roomData.roomTypes.map((block) => (
              <Card key={block.roomTypeId}>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">{block.roomTypeName}</CardTitle>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>
                        {block.summary.mapped}/{block.summary.competitorsTotal} competitor associati
                      </span>
                      {block.summary.avgDiffVsMedianPct != null ? (
                        <span>
                          scost. medio{" "}
                          <DiffBadge pct={block.summary.avgDiffVsMedianPct} />
                        </span>
                      ) : null}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  {block.summary.mapped === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      Nessun competitor associato a questa tipologia. Configura le associazioni da &ldquo;Associa
                      tipologie&rdquo;.
                    </p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="py-2 pr-4 font-medium">Data</th>
                          <th className="py-2 pr-4 font-medium text-right">Noi</th>
                          {roomData.competitors.map((c) => (
                            <th key={c.id} className="py-2 pr-4 font-medium text-right">
                              {c.name}
                            </th>
                          ))}
                          <th className="py-2 pr-4 font-medium text-right">Mediana</th>
                          <th className="py-2 font-medium text-right">Scost.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {block.days
                          .filter((d) => d.ourPrice != null || d.ourSoldOut || d.market.count > 0)
                          .map((d) => {
                            const compById = new Map(d.competitors.map((c) => [c.competitorId, c]))
                            return (
                              <tr key={d.date} className="border-b last:border-0">
                                <td className="py-2 pr-4 whitespace-nowrap">
                                  {format(new Date(d.date + "T00:00:00"), "EEE d MMM", { locale: it })}
                                </td>
                                <td className="py-2 pr-4 text-right">
                                  <OurPriceCell price={d.ourPrice} soldOut={d.ourSoldOut} occupancy={d.ourOccupancy} diffVsMedianPct={d.diffVsMedianPct} />
                                </td>
                                {roomData.competitors.map((c) => {
                                  const cell = compById.get(c.id)
                                  return (
                                    <td key={c.id} className="py-2 pr-4 text-right tabular-nums">
                                      {cell?.mappedRoom == null ? (
                                        <span className="text-xs text-muted-foreground" title="Nessuna associazione">
                                          n/d
                                        </span>
                                      ) : (
                                        eur(cell?.price ?? null)
                                      )}
                                    </td>
                                  )
                                })}
                                <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                                  {eur(d.market.median)}
                                </td>
                                <td className="py-2 text-right">
                                  <DiffBadge pct={d.diffVsMedianPct} />
                                </td>
                              </tr>
                            )
                          })}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : loadingData ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      ) : competitors.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <Tag className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <div>
              <p className="font-medium">Nessun competitor nel comp set</p>
              <p className="text-sm text-muted-foreground text-pretty">
                Aggiungi i tuoi competitor e inserisci i loro prezzi per iniziare il confronto.
              </p>
            </div>
            {hotelId ? (
              <CompetitorManager hotelId={hotelId} competitors={competitors} occupancy={occupancy} onChanged={refresh} />
            ) : null}
          </CardContent>
        </Card>
      ) : !data || data.days.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nessun prezzo disponibile nel periodo. Inserisci i prezzi dei competitor dal pannello &quot;Gestisci comp set&quot;.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Riepilogo */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Scostamento medio dal mercato</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-semibold">
                    {data.summary.avgDiffVsMedianPct == null
                      ? "—"
                      : `${data.summary.avgDiffVsMedianPct > 0 ? "+" : ""}${data.summary.avgDiffVsMedianPct.toFixed(1)}%`}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">su {data.summary.daysCompared} notti confrontate</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Notti sotto la mediana</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold text-green-600">{data.summary.daysCheaper}</div>
                <p className="mt-1 text-xs text-muted-foreground">più economici del mercato</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Notti sopra la mediana</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold text-red-600">{data.summary.daysPricier}</div>
                <p className="mt-1 text-xs text-muted-foreground">più cari del mercato</p>
              </CardContent>
            </Card>
          </div>

          {/* Tabella confronto */}
          <Card>
            <CardHeader className="gap-2">
              <CardTitle className="text-base">Confronto per notte</CardTitle>
              <PriceLegend />
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Data</th>
                    <th className="py-2 pr-4 font-medium text-right">Noi</th>
                    {data.competitors.map((c) => (
                      <th key={c.id} className="py-2 pr-4 font-medium text-right">
                        {c.name}
                      </th>
                    ))}
                    <th className="py-2 pr-4 font-medium text-right">Mediana</th>
                    <th className="py-2 pr-4 font-medium text-right">Scost.</th>
                    <th className="py-2 font-medium text-right">Posizione</th>
                  </tr>
                </thead>
                <tbody>
                  {data.days.map((d) => {
                    const compById = new Map(d.competitors.map((c) => [c.competitorId, c]))
                    return (
                      <tr key={d.date} className="border-b last:border-0">
                        <td className="py-2 pr-4 whitespace-nowrap">
                          {format(new Date(d.date + "T00:00:00"), "EEE d MMM", { locale: it })}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          <OurPriceCell price={d.ourPrice} soldOut={d.ourSoldOut} occupancy={d.ourOccupancy} diffVsMedianPct={d.diffVsMedianPct} />
                        </td>
                        {data.competitors.map((c) => {
                          const cell = compById.get(c.id)
                          const sold = cell && cell.availability === false
                          return (
                            <td key={c.id} className="py-2 pr-4 text-right tabular-nums">
                              {sold ? (
                                <span className="text-xs text-muted-foreground">sold out</span>
                              ) : (
                                eur(cell?.price ?? null)
                              )}
                            </td>
                          )
                        })}
                        <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">{eur(d.market.median)}</td>
                        <td className="py-2 pr-4 text-right">
                          <DiffBadge pct={d.diffVsMedianPct} />
                        </td>
                        <td className="py-2 text-right">
                          {d.rank != null ? (
                            <Badge variant="secondary" className="font-normal">
                              {d.rank}º / {d.rankOf}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="font-medium">Prezzo &ldquo;Noi&rdquo;:</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded-sm bg-green-600/20" aria-hidden="true" />
                  competitivo (≤ mediana)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded-sm bg-red-500/20" aria-hidden="true" />
                  sopra la mediana
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded-sm bg-red-700/40" aria-hidden="true" />
                  molto sopra la mediana
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
