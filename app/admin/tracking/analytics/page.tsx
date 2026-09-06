"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { BarChart3, CalendarDays, CircleAlert, Eye, MousePointerClick, Search, ShoppingBag, Users } from "lucide-react"

import { AdminHeader } from "@/components/admin/admin-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw Object.assign(new Error(body?.error || "Errore caricamento"), { status: response.status })
  return body
}

type DimRow = {
  key: string
  label: string
  events: number
  sessions: number
  searches: number
  selections: number
  sharePct: number
  searchRatePct: number
}

type AnalyticsResponse = {
  period: { days: number; from: string; to: string }
  coverage: { enrichedEvents: number; enrichedSessions: number; note: string; lastEventAt: string | null }
  totals: {
    pageviews: number
    sessions: number
    selections: number
    searches: number
    directBookings: number
    directRevenue: number
    unconvertedSearches: number
    bookingConversionPct: number
    pagesPerSession: number
  }
  series: Array<{ day: string; pageviews: number; sessions: number; searches: number }>
  sources: DimRow[]
  campaigns: DimRow[]
  devices: DimRow[]
  countries: DimRow[]
  pages: DimRow[]
  landingPages: DimRow[]
  attributionNote: string
}

const integer = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 })
const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })

function Metric({ label, value, hint, icon: Icon }: { label: string; value: string; hint: string; icon: typeof Eye }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
          </div>
          <div className="rounded-lg bg-ha-brand-soft p-2 text-ha-brand"><Icon className="h-4 w-4" /></div>
        </div>
      </CardContent>
    </Card>
  )
}

function Ranking({ title, description, rows, valueLabel = "sessioni" }: { title: string; description: string; rows?: DimRow[]; valueLabel?: string }) {
  const visible = (rows || []).slice(0, 8)
  const max = Math.max(1, ...visible.map((row) => row.sessions || row.events || 0))
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {visible.length === 0 ? <p className="text-sm text-muted-foreground">Dati non ancora sufficienti.</p> : visible.map((row) => {
          const amount = row.sessions || row.events || 0
          return (
            <div key={`${title}-${row.key}`}>
              <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-foreground">{row.label}</span>
                <span className="shrink-0 font-medium tabular-nums">{integer.format(amount)} {valueLabel}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-ha-brand" style={{ width: `${Math.max(4, (amount / max) * 100)}%` }} />
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

export default function WebsiteAnalyticsPage() {
  const [days, setDays] = useState(30)
  const url = useMemo(() => `/api/admin/web-traffic/analytics?days=${days}`, [days])
  const { data, error, isLoading } = useSWR<AnalyticsResponse>(url, fetcher, { revalidateOnFocus: false })

  const seriesMax = Math.max(1, ...(data?.series || []).map((row) => row.pageviews))

  return (
    <div className="min-h-screen bg-background">
      <AdminHeader title="Visite sito" subtitle="Analytics Intelligence condivisa con Santaddeo" />
      <main className="mx-auto w-full max-w-7xl space-y-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Cosa succede sul sito</h1>
            <p className="text-sm text-muted-foreground">Un solo tracker e un solo dato per tutta la suite 4BID. Qui vedi analisi aggregate; la pagina Visitatori resta dedicata alle sessioni CRM in tempo reale.</p>
          </div>
          <div className="flex gap-1 rounded-lg border bg-card p-1">
            {[7, 30, 60, 90].map((value) => (
              <Button key={value} size="sm" variant={days === value ? "default" : "ghost"} onClick={() => setDays(value)}>
                {value}g
              </Button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Caricamento Analytics Intelligence…</CardContent></Card>
        ) : error ? (
          <Card className="border-destructive/30">
            <CardContent className="flex items-start gap-3 p-5">
              <CircleAlert className="mt-0.5 h-5 w-5 text-destructive" />
              <div><p className="font-medium">Dati non disponibili</p><p className="text-sm text-muted-foreground">{error.message}</p></div>
            </CardContent>
          </Card>
        ) : data ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Visualizzazioni" value={integer.format(data.totals.pageviews)} hint={`${data.totals.pagesPerSession.toFixed(1)} pagine per sessione`} icon={Eye} />
              <Metric label="Sessioni" value={integer.format(data.totals.sessions)} hint="visite anonime aggregate" icon={Users} />
              <Metric label="Ricerche disponibilità" value={integer.format(data.totals.searches)} hint={`${integer.format(data.totals.selections)} selezioni date`} icon={Search} />
              <Metric label="Prenotazioni dirette" value={integer.format(data.totals.directBookings)} hint={`${data.totals.bookingConversionPct.toFixed(1)}% conversione`} icon={ShoppingBag} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Ricavo diretto" value={euro.format(data.totals.directRevenue)} hint="prenotazioni dirette attribuite" icon={BarChart3} />
              <Metric label="Ricerche non convertite" value={integer.format(data.totals.unconvertedSearches)} hint="opportunità ancora aperte" icon={MousePointerClick} />
              <Metric label="Eventi arricchiti" value={integer.format(data.coverage.enrichedEvents)} hint="campione Analytics Intelligence" icon={BarChart3} />
              <Metric label="Sessioni arricchite" value={integer.format(data.coverage.enrichedSessions)} hint="sessioni con dettaglio" icon={CalendarDays} />
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Andamento visite</CardTitle>
                <CardDescription>Pageview giornaliere negli ultimi {data.period.days} giorni</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex h-40 items-end gap-1">
                  {(data.series || []).map((row) => (
                    <div key={row.day} className="group relative flex min-w-0 flex-1 items-end" title={`${row.day}: ${row.pageviews} visualizzazioni, ${row.sessions} sessioni, ${row.searches} ricerche`}>
                      <div className="w-full rounded-t bg-ha-brand/70 transition-colors group-hover:bg-ha-brand" style={{ height: `${Math.max(3, (row.pageviews / seriesMax) * 100)}%` }} />
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex justify-between text-[11px] text-muted-foreground"><span>{data.period.from}</span><span>{data.period.to}</span></div>
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Ranking title="Da dove arrivano" description="Sorgenti che portano traffico e ricerche." rows={data.sources} />
              <Ranking title="Dispositivi" description="Desktop, mobile e tablet usati nelle sessioni." rows={data.devices} />
              <Ranking title="Paesi" description="Paese stimato della connessione, non nazionalità dell'ospite." rows={data.countries} />
              <Ranking title="Pagine più viste" description="Contenuti che concentrano l'attenzione." rows={data.pages} valueLabel="sessioni" />
            </div>

            <Card>
              <CardContent className="p-5">
                <p className="text-sm font-medium text-foreground">Come leggere questi dati</p>
                <p className="mt-1 text-sm text-muted-foreground">{data.attributionNote || data.coverage.note}</p>
              </CardContent>
            </Card>
          </>
        ) : null}
      </main>
    </div>
  )
}
