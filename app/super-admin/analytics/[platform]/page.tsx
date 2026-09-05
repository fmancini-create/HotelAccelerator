"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useParams } from "next/navigation"
import useSWR from "swr"
import { ArrowLeft, Globe2, Loader2, MonitorSmartphone, MousePointerClick, Users } from "lucide-react"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

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

function minusDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return ymd(d)
}

type Row = Record<string, string | number | null>
interface Detail {
  totals?: Record<string, number>
  trend?: Row[]
  topPages?: Row[]
  sources?: Row[]
  campaigns?: Row[]
  devices?: Row[]
  geography?: Row[]
  backendActions?: Row[]
  backendUsers?: Row[]
  recent?: Row[]
}

export default function PlatformAnalyticsPage() {
  const params = useParams<{ platform: string }>()
  const platform = decodeURIComponent(params.platform)
  const today = useMemo(() => ymd(new Date()), [])
  const [start, setStart] = useState(() => minusDays(29))
  const [end, setEnd] = useState(today)
  const { data, error, isLoading } = useSWR<{ platform: { key: string; label: string }; detail: Detail }>(
    `/api/super-admin/analytics/${encodeURIComponent(platform)}?start=${start}&end=${end}`,
    fetcher,
    { refreshInterval: 60_000 },
  )

  const d = data?.detail ?? {}
  const totals = d.totals ?? {}
  const trend = useMemo(() => {
    const map = new Map<string, { day: string; visitors: number; pageviews: number; actions: number }>()
    for (const row of d.trend ?? []) {
      const day = String(row.day)
      const current = map.get(day) ?? { day, visitors: 0, pageviews: 0, actions: 0 }
      current.visitors += Number(row.visitors ?? 0)
      current.pageviews += Number(row.pageviews ?? 0)
      current.actions += Number(row.actions ?? 0)
      map.set(day, current)
    }
    return [...map.values()].sort((a, b) => a.day.localeCompare(b.day))
  }, [d.trend])

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link href="/super-admin/analytics" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Tutte le piattaforme
            </Link>
            <h1 className="text-3xl font-semibold tracking-tight">{data?.platform.label ?? platform}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Analytics pubblico e attività di back-end nello stesso intervallo.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 rounded-xl border bg-background p-3">
            <div className="space-y-1"><Label className="text-xs">Dal</Label><Input type="date" max={end} value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs">Al</Label><Input type="date" min={start} max={today} value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
        </div>

        {isLoading && <div className="flex min-h-64 items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Caricamento…</div>}
        {error && <Card className="border-destructive/30"><CardContent className="py-8 text-sm text-destructive">{error.message}</CardContent></Card>}

        {!isLoading && !error && (
          <>
            <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              <Kpi title="Visitatori" value={totals.visitors} icon={<Users className="h-4 w-4" />} />
              <Kpi title="Sessioni" value={totals.sessions} />
              <Kpi title="Pagine viste" value={totals.pageviews} icon={<Globe2 className="h-4 w-4" />} />
              <Kpi title="Eventi pubblici" value={totals.public_events} />
              <Kpi title="Eventi back-end" value={totals.backend_events} />
              <Kpi title="Azioni back-end" value={totals.backend_actions} icon={<MousePointerClick className="h-4 w-4" />} />
              <Kpi title="Utenti back-end" value={totals.backend_users} />
            </div>

            <Card className="mb-5">
              <CardHeader><CardTitle className="text-base">Andamento giornaliero</CardTitle></CardHeader>
              <CardContent className="h-72">
                {trend.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trend}><CartesianGrid vertical={false} /><XAxis dataKey="day" tickFormatter={(v) => String(v).slice(5)} /><YAxis allowDecimals={false} /><Tooltip /><Area type="monotone" dataKey="visitors" name="Visitatori" fill="currentColor" fillOpacity={0.08} stroke="currentColor" /></AreaChart>
                  </ResponsiveContainer>
                ) : <Empty />}
              </CardContent>
            </Card>

            <Tabs defaultValue="public" className="space-y-4">
              <TabsList><TabsTrigger value="public">Pubblico</TabsTrigger><TabsTrigger value="backend">Back-end</TabsTrigger><TabsTrigger value="events">Eventi recenti</TabsTrigger></TabsList>
              <TabsContent value="public" className="grid gap-4 lg:grid-cols-2">
                <TableCard title="Pagine più viste" rows={d.topPages?.filter((r) => r.surface === "public") ?? []} columns={["page_path", "views", "visitors"]} />
                <TableCard title="Sorgenti / referrer" rows={d.sources ?? []} columns={["source", "medium", "visitors"]} />
                <TableCard title="Campagne UTM" rows={d.campaigns ?? []} columns={["campaign", "visitors"]} />
                <TableCard title="Paesi e città" rows={d.geography ?? []} columns={["country", "city", "visitors"]} />
                <TableCard title="Device, browser e sistema" rows={d.devices ?? []} columns={["device", "browser", "os", "visitors"]} className="lg:col-span-2" />
              </TabsContent>
              <TabsContent value="backend" className="grid gap-4 lg:grid-cols-2">
                <TableCard title="Pagine back-end più usate" rows={d.topPages?.filter((r) => r.surface === "backend") ?? []} columns={["page_path", "views", "visitors"]} />
                <TableCard title="Azioni più frequenti" rows={d.backendActions ?? []} columns={["action", "events", "users"]} />
                <TableCard title="Utenti attivi" rows={d.backendUsers ?? []} columns={["actor", "tenant_id", "events", "last_seen_at"]} className="lg:col-span-2" />
              </TabsContent>
              <TabsContent value="events">
                <TableCard title="Ultimi 100 eventi" rows={d.recent ?? []} columns={["occurred_at", "surface", "event_type", "event_name", "actor_email", "tenant_id", "page_path"]} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </div>
  )
}

function Kpi({ title, value, icon }: { title: string; value?: number; icon?: React.ReactNode }) {
  return <Card><CardContent className="p-4"><div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{title}</div><div className="text-2xl font-semibold tabular-nums">{Number(value ?? 0).toLocaleString("it-IT")}</div></CardContent></Card>
}

function TableCard({ title, rows, columns, className = "" }: { title: string; rows: Row[]; columns: string[]; className?: string }) {
  return <Card className={className}><CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader><CardContent>{rows.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground">{columns.map((c) => <th key={c} className="px-2 py-2 font-medium">{label(c)}</th>)}</tr></thead><tbody>{rows.slice(0, 40).map((row, i) => <tr key={i} className="border-b last:border-0">{columns.map((c) => <td key={c} className="max-w-80 truncate px-2 py-2" title={String(row[c] ?? "")}>{format(row[c], c)}</td>)}</tr>)}</tbody></table></div> : <Empty />}</CardContent></Card>
}

function Empty() { return <div className="flex h-full min-h-24 items-center justify-center text-sm text-muted-foreground"><MonitorSmartphone className="mr-2 h-4 w-4" />Nessun dato nel periodo</div> }
function label(key: string) { return ({ page_path: "Pagina", views: "Visite", visitors: "Visitatori", source: "Sorgente", medium: "Medium", campaign: "Campagna", country: "Paese", city: "Città", device: "Device", browser: "Browser", os: "OS", action: "Azione", events: "Eventi", users: "Utenti", actor: "Utente", tenant_id: "Tenant", last_seen_at: "Ultima attività", occurred_at: "Data/ora", surface: "Area", event_type: "Tipo", event_name: "Evento", actor_email: "Email" } as Record<string, string>)[key] ?? key }
function format(value: string | number | null, key: string) { if (value === null || value === undefined || value === "") return "—"; if ((key.endsWith("_at") || key === "occurred_at") && typeof value === "string") return new Date(value).toLocaleString("it-IT"); if (typeof value === "number") return value.toLocaleString("it-IT"); return String(value) }
