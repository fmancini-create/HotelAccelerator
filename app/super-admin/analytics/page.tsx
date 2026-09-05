"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import useSWR from "swr"
import { ArrowRight, BarChart3, CalendarDays, Loader2 } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface AnalyticsOverviewItem {
  platform_key: string
  label: string
  today_visitors: number
  yesterday_visitors: number
  month_visitors: number
  custom_visitors: number | null
  last_event_at: string | null
}

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.error || "Errore nel caricamento")
  return payload
}

function ymd(date: Date): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const dd = String(date.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

export default function SuperAdminAnalyticsPage() {
  const today = useMemo(() => ymd(new Date()), [])
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const query = start && end ? `?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}` : ""
  const { data, error, isLoading } = useSWR<{ items: AnalyticsOverviewItem[] }>(
    `/api/super-admin/analytics/overview${query}`,
    fetcher,
    { refreshInterval: 60_000 },
  )

  const customLabel = start && end ? `${start.split("-").reverse().join("/")} – ${end.split("-").reverse().join("/")}` : "Intervallo personalizzato"

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <BarChart3 className="h-4 w-4" /> SuperAdmin
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">Analytics</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Visitatori unici per piattaforma. Clicca una card per aprire l'analisi completa.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-xl border bg-background p-3 shadow-sm">
            <div className="space-y-1">
              <Label htmlFor="analytics-start" className="text-xs">Dal</Label>
              <Input id="analytics-start" type="date" max={end || today} value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="analytics-end" className="text-xs">Al</Label>
              <Input id="analytics-end" type="date" min={start || undefined} max={today} value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
        </header>

        {isLoading && (
          <div className="flex min-h-60 items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Caricamento analytics…
          </div>
        )}

        {error && (
          <Card className="border-destructive/30">
            <CardContent className="py-8 text-sm text-destructive">
              Non riesco a leggere gli analytics: {error.message}
            </CardContent>
          </Card>
        )}

        {!isLoading && !error && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(data?.items ?? []).map((item) => (
              <Link key={item.platform_key} href={`/super-admin/analytics/${encodeURIComponent(item.platform_key)}`} className="group block">
                <Card className="h-full transition hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                    <CardTitle className="text-xl">{item.label}</CardTitle>
                    <ArrowRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3">
                      <Metric label="Oggi" value={item.today_visitors} />
                      <Metric label="Ieri" value={item.yesterday_visitors} />
                      <Metric label="Questo mese" value={item.month_visitors} />
                      <Metric label={customLabel} value={item.custom_visitors} custom />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Metric({ label, value, custom }: { label: string; value: number | null; custom?: boolean }) {
  return (
    <div className="rounded-lg border bg-muted/25 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        {custom && <CalendarDays className="h-3.5 w-3.5" />}
        <span className="truncate" title={label}>{label}</span>
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value === null ? "—" : Number(value).toLocaleString("it-IT")}</div>
      <div className="text-[11px] text-muted-foreground">visitatori</div>
    </div>
  )
}
