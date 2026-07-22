"use client"

import { useCallback, useEffect, useState } from "react"
import useSWR from "swr"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  ExternalLink,
  Loader2,
  Search,
  TrendingUp,
} from "lucide-react"

type TopQuery = {
  query: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

type TrendPoint = {
  date: string
  position: number
  clicks: number
  impressions: number
  ctr: number
}

type TopResponse =
  | { days: number; queries: TopQuery[] }
  | { setupRequired: true; reason: string; siteUrl: string; serviceAccountEmail: string | null }

const PERIODS = [
  { label: "28 giorni", days: 28 },
  { label: "3 mesi", days: 90 },
  { label: "6 mesi", days: 180 },
  { label: "12 mesi", days: 365 },
]

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function fmtDate(d: string) {
  const [y, m, day] = d.split("-")
  return `${day}/${m}`
}

type SortKey = keyof Pick<TopQuery, "query" | "clicks" | "impressions" | "ctr" | "position">

export function SeoMonitorClient() {
  const [days, setDays] = useState(90)
  const [selected, setSelected] = useState<string | null>(null)
  // Default: per clic decrescente (le query più performanti in alto).
  const [sortKey, setSortKey] = useState<SortKey>("clicks")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

  const { data, isLoading } = useSWR<TopResponse>(`/api/superadmin/seo?mode=top&days=${days}`, fetcher)

  const setupRequired = data && "setupRequired" in data
  const rawQueries = data && "queries" in data ? data.queries : []

  // Ordinamento client-side. Per la "Posizione" l'asc (1 in alto) è il default
  // più sensato; per le altre colonne numeriche il default è desc.
  const queries = [...rawQueries].sort((a, b) => {
    let cmp: number
    if (sortKey === "query") cmp = a.query.localeCompare(b.query)
    else cmp = a[sortKey] - b[sortKey]
    return sortDir === "asc" ? cmp : -cmp
  })

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      // Posizione e query partono ascendenti; metriche partono discendenti.
      setSortDir(key === "position" || key === "query" ? "asc" : "desc")
    }
  }

  // Seleziona automaticamente la prima query quando arrivano i dati.
  useEffect(() => {
    if (!selected && queries.length > 0) setSelected(queries[0].query)
  }, [queries, selected])

  if (setupRequired) {
    return <SetupPanel data={data} />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Monitoraggio SEO</h1>
          <p className="text-sm text-muted-foreground text-pretty">
            Posizione per singola query nel tempo da Google Search Console. Usa questo dato, non la
            posizione media globale, per valutare il ranking reale.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {PERIODS.map((p) => (
            <Button
              key={p.days}
              size="sm"
              variant={days === p.days ? "default" : "outline"}
              onClick={() => setDays(p.days)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {selected && <TrendCard query={selected} days={days} />}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Query principali</CardTitle>
          <CardDescription>
            Clicca una query per vederne l&apos;andamento della posizione nel tempo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Caricamento da Search Console…
            </div>
          ) : queries.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nessun dato per il periodo selezionato.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortHead label="Query" col="query" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortHead label="Clic" col="clicks" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortHead label="Impressioni" col="impressions" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortHead label="CTR" col="ctr" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortHead label="Posizione" col="position" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queries.map((q) => (
                    <TableRow
                      key={q.query}
                      className={`cursor-pointer ${selected === q.query ? "bg-muted" : ""}`}
                      onClick={() => setSelected(q.query)}
                    >
                      <TableCell className="font-medium max-w-[280px] truncate">{q.query}</TableCell>
                      <TableCell className="text-right tabular-nums">{q.clicks}</TableCell>
                      <TableCell className="text-right tabular-nums">{q.impressions}</TableCell>
                      <TableCell className="text-right tabular-nums">{q.ctr}%</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Badge variant={q.position <= 10 ? "default" : "secondary"}>{q.position}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function SortHead({
  label,
  col,
  align = "left",
  sortKey,
  sortDir,
  onSort,
}: {
  label: string
  col: SortKey
  align?: "left" | "right"
  sortKey: SortKey
  sortDir: "asc" | "desc"
  onSort: (key: SortKey) => void
}) {
  const active = sortKey === col
  return (
    <TableHead className={align === "right" ? "text-right" : undefined}>
      <button
        type="button"
        onClick={() => onSort(col)}
        className={`inline-flex items-center gap-1 select-none hover:text-foreground transition-colors ${
          align === "right" ? "flex-row-reverse" : ""
        } ${active ? "text-foreground font-medium" : "text-muted-foreground"}`}
        aria-label={`Ordina per ${label}`}
      >
        {label}
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5" />
          )
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
        )}
      </button>
    </TableHead>
  )
}

function TrendCard({ query, days }: { query: string; days: number }) {
  const { data, isLoading } = useSWR<{ trend: TrendPoint[] }>(
    `/api/superadmin/seo?mode=trend&days=${days}&query=${encodeURIComponent(query)}`,
    fetcher,
  )
  const trend = data?.trend || []

  // Confronto inizio vs fine periodo (posizione: più bassa = meglio).
  const first = trend[0]?.position
  const last = trend[trend.length - 1]?.position
  const delta = first != null && last != null ? Math.round((first - last) * 10) / 10 : null

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <span className="truncate">{query}</span>
            </CardTitle>
            <CardDescription>Posizione media giornaliera (1 = miglior risultato)</CardDescription>
          </div>
          {delta != null && (
            <Badge variant={delta >= 0 ? "default" : "destructive"} className="shrink-0">
              {delta >= 0 ? <ArrowUp className="mr-1 h-3 w-3" /> : <ArrowDown className="mr-1 h-3 w-3" />}
              {delta >= 0 ? "+" : ""}
              {delta} pos.
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-[280px] items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Caricamento andamento…
          </div>
        ) : trend.length === 0 ? (
          <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
            Nessun dato di posizione per questa query nel periodo.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={trend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="date"
                tickFormatter={fmtDate}
                tick={{ fontSize: 12 }}
                stroke="currentColor"
                className="text-muted-foreground"
                minTickGap={24}
              />
              <YAxis
                reversed
                domain={[1, "auto"]}
                allowDecimals={false}
                tick={{ fontSize: 12 }}
                stroke="currentColor"
                className="text-muted-foreground"
                width={32}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "var(--popover-foreground)",
                }}
                labelFormatter={(l) => `Data: ${l}`}
                formatter={(value: number, name) => {
                  if (name === "position") return [value, "Posizione"]
                  return [value, name]
                }}
              />
              <Line
                type="monotone"
                dataKey="position"
                stroke="var(--primary)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

function SetupPanel({ data }: { data: Extract<TopResponse, { setupRequired: true }> }) {
  const sa = data.serviceAccountEmail
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Monitoraggio SEO</h1>
        <p className="text-sm text-muted-foreground">Collega Google Search Console per iniziare.</p>
      </div>
      <Card className="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-amber-900 dark:text-amber-200">
            <AlertCircle className="h-5 w-5" />
            Configurazione richiesta (una tantum)
          </CardTitle>
          <CardDescription className="text-amber-800/80 dark:text-amber-200/70">
            {data.reason === "api_disabled"
              ? "La Search Console API non è ancora abilitata nel progetto Google del service account."
              : "Il service account non ha ancora accesso alla property di Search Console."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-amber-900 dark:text-amber-100">
          <ol className="list-decimal space-y-3 pl-5">
            <li>
              Abilita la <strong>Google Search Console API</strong> nel progetto Google Cloud del
              service account.{" "}
              <a
                href="https://console.cloud.google.com/apis/library/searchconsole.googleapis.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium underline"
              >
                Apri la libreria API <ExternalLink className="h-3 w-3" />
              </a>
            </li>
            <li>
              In <strong>Search Console → Impostazioni → Utenti e autorizzazioni</strong>, aggiungi
              questo service account come utente (anche &quot;Con restrizioni&quot;) della property{" "}
              <code className="rounded bg-amber-100 px-1 py-0.5 dark:bg-amber-900">{data.siteUrl}</code>:
              {sa && (
                <div className="mt-1">
                  <code className="break-all rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs dark:bg-amber-900">
                    {sa}
                  </code>
                </div>
              )}
            </li>
            <li>Attendi qualche minuto e ricarica questa pagina.</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
