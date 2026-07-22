"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RefreshCw, Activity, Database, Globe, Zap, AlertTriangle, CheckCircle, XCircle, Info, Copy, ClipboardCheck, AlertCircle, Building2 } from "lucide-react"

// ─── Types ──────────────────────────────────────────────────────────
interface ApiSummary {
  summary: { totalRequests: number; p50: number; p95: number; p99: number; avgDbTime: number; avgNonDbTime: number; coldStartCount: number; errorCount: number }
  slowestEndpoints: { route: string; avgMs: number; count: number }[]
  verdict: "FAST" | "ACCEPTABLE" | "SLOW"
  recentLogs: PerfLog[]
}
interface PerfLog { timestamp: string; route: string; method: string; totalMs: number; dbMs: number; nonDbMs: number; coldStart: boolean; hotelId?: string; status: number; error?: string }
interface DbSummary {
  avgDbTime: number
  avgDbTimeInstrumented?: number
  avgNonDbTime: number
  dbCoverage?: number
  instrumentedCount?: number
  totalCount?: number
  recentDbLogs: { route: string; dbMs: number; nonDbMs: number; totalMs: number; timestamp: string }[]
}
interface VitalsSummary { totalMetrics: number; summary: { name: string; count: number; p50: number; p95: number; avg: number; ratings: { good: number; "needs-improvement": number; poor: number } }[]; recentMetrics: { name: string; value: number; rating: string; path: string; timestamp: string }[] }
interface ColdSummary { totalRequests: number; coldStartCount: number; warmCount: number; coldPercent: number; recentColdLogs: { route: string; method: string; totalMs: number; timestamp: string }[] }
interface ErrorsSummary { totalRequests: number; errorCount: number; errorRate: number; errorAnalytics: { route: string; count: number; statuses: Record<number, number>; lastError: string | null; lastAt: string }[]; recentErrorLogs: { route: string; method: string; totalMs: number; status: number; error: string | null; timestamp: string }[] }

type TabKey = "api" | "db" | "vitals" | "coldstart" | "errors"

// ─── Helpers ────────────────────────────────────────────────────────
function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Info className="h-10 w-10 text-muted-foreground/50 mb-3" />
      <h3 className="text-base font-medium text-muted-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground/70 max-w-md mt-1">{description}</p>
    </div>
  )
}
const verdictColor = (v: string) => v === "FAST" ? "bg-green-600" : v === "ACCEPTABLE" ? "bg-yellow-500" : v === "SLOW" ? "bg-red-600" : "bg-muted"
const verdictIcon = (v: string) => v === "FAST" ? <CheckCircle className="h-5 w-5" /> : v === "ACCEPTABLE" ? <AlertTriangle className="h-5 w-5" /> : v === "SLOW" ? <XCircle className="h-5 w-5" /> : null
const verdictLabel = (v: string) => v === "FAST" ? "Veloce" : v === "ACCEPTABLE" ? "Accettabile" : v === "SLOW" ? "Lento" : v
const ratingColor = (r: string) => r === "good" ? "text-green-700 bg-green-100" : r === "needs-improvement" ? "text-yellow-700 bg-yellow-100" : r === "poor" ? "text-red-700 bg-red-100" : "text-muted-foreground bg-muted"
const ratingLabel = (r: string) => r === "good" ? "Buono" : r === "needs-improvement" ? "Da migliorare" : r === "poor" ? "Scarso" : r

// ─── Tab endpoints ──────────────────────────────────────────────────
const TAB_ENDPOINTS: Record<TabKey, string> = {
  api: "/api/perf/api-summary",
  db: "/api/perf/db-summary",
  vitals: "/api/perf/vitals-summary",
  coldstart: "/api/perf/cold-summary",
  errors: "/api/perf/errors-summary",
}

export function PerformanceDashboard() {
  const [activeTab, setActiveTab] = useState<TabKey>("api")
  const [hotelFilter, setHotelFilter] = useState("all")
  const [hoursFilter, setHoursFilter] = useState("24")
  const [hotels, setHotels] = useState<{ id: string; name: string }[]>([])
  const [copied, setCopied] = useState(false)

  // Per-tab data + loading state
  const [apiData, setApiData] = useState<ApiSummary | null>(null)
  const [dbData, setDbData] = useState<DbSummary | null>(null)
  const [vitalsData, setVitalsData] = useState<VitalsSummary | null>(null)
  const [coldData, setColdData] = useState<ColdSummary | null>(null)
  const [errorsData, setErrorsData] = useState<ErrorsSummary | null>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadedTabs = useRef<Set<string>>(new Set())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load hotels once.
  // FIX 14/07/2026: puntava a /api/ui/hotels che NON esiste (404 silenzioso)
  // -> il filtro hotel mostrava solo "Tutti gli hotel". La route corretta e'
  // /api/hotels (RLS-scoped: ognuno vede solo i propri hotel).
  useEffect(() => {
    fetch("/api/hotels").then(r => r.ok ? r.json() : null).then(d => { if (d?.hotels) setHotels(d.hotels) }).catch(() => {})
  }, [])

  const buildParams = useCallback(() => {
    const p = new URLSearchParams({ hours: hoursFilter })
    if (hotelFilter !== "all") p.set("hotel_id", hotelFilter)
    return p.toString()
  }, [hotelFilter, hoursFilter])

  // Fetch a single tab
  const fetchTab = useCallback(async (tab: TabKey, force = false) => {
    if (!force && loadedTabs.current.has(tab + buildParams())) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${TAB_ENDPOINTS[tab]}?${buildParams()}`)
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`) }
      const data = await res.json()
      switch (tab) {
        case "api": setApiData(data); break
        case "db": setDbData(data); break
        case "vitals": setVitalsData(data); break
        case "coldstart": setColdData(data); break
        case "errors": setErrorsData(data); break
      }
      loadedTabs.current.add(tab + buildParams())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore nel caricamento")
    } finally {
      setLoading(false)
    }
  }, [buildParams])

  // Fetch active tab on mount and on tab/filter change
  useEffect(() => {
    fetchTab(activeTab, true)
  }, [activeTab, hotelFilter, hoursFilter, fetchTab])

  // Auto-refresh active tab every 30s
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => fetchTab(activeTab, true), 30000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [activeTab, fetchTab])

  // Reset cache on filter change
  useEffect(() => { loadedTabs.current.clear() }, [hotelFilter, hoursFilter])

  const handleTabChange = (tab: string) => {
    const t = tab as TabKey
    setActiveTab(t)
    fetchTab(t)
  }

  // ─── Copy Diagnostic Report (Markdown) ────────────────────────────
  // 14/07/2026: riscritto da JSON minimale a report Markdown auto-descrittivo,
  // pensato per essere incollato in una chat AI (v0) e analizzato senza
  // contesto aggiuntivo: include semantica dei campi, soglie ufficiali,
  // caveat di copertura strumentazione e dettaglio errori con messaggi.
  const copyDiagnosticReport = useCallback(async () => {
    const params = buildParams()
    try {
      const [apiRes, dbRes, vitRes, coldRes, errRes] = await Promise.all(
        (Object.keys(TAB_ENDPOINTS) as TabKey[]).map(k =>
          fetch(`${TAB_ENDPOINTS[k]}?${params}`).then(r => (r.ok ? r.json() : null)),
        ),
      )
      const hotelName = hotelFilter === "all" ? "Tutti gli hotel" : hotels.find(h => h.id === hotelFilter)?.name || hotelFilter
      const fmtMs = (n: number | undefined | null) => (n == null ? "n/d" : `${Math.round(n)}ms`)
      const L: string[] = []

      L.push(`# Performance Report - SANTADDEO`)
      L.push(``)
      L.push(`- Generato: ${new Date().toISOString()}`)
      L.push(`- Finestra: ultime ${hoursFilter}h`)
      L.push(`- Scope: ${hotelName}${hotelFilter !== "all" ? ` (hotel_id: ${hotelFilter})` : ""}`)
      L.push(``)
      L.push(`> Nota per l'analisi: le metriche API coprono SOLO le route strumentate`)
      L.push(`> con withPerf/measureRoute, non tutte le API dell'app. La colonna`)
      L.push(`> "DB ms" e' valorizzata solo dalle route con measureDb; per le altre`)
      L.push(`> il tempo DB e' incluso nel totale ma non scorporato.`)
      L.push(``)

      // ── API ──
      L.push(`## API (server)`)
      if (apiRes?.summary) {
        const s = apiRes.summary
        L.push(``)
        L.push(`- Richieste totali: ${s.totalRequests}`)
        L.push(`- Latenza p50: ${fmtMs(s.p50)} | p95: ${fmtMs(s.p95)} | p99: ${fmtMs(s.p99)}`)
        L.push(`- Verdetto pagina: ${apiRes.verdict} (FAST=p95<500ms, ACCEPTABLE=p95<1500ms, SLOW=oltre)`)
        L.push(`- Errori (status>=400): ${s.errorCount} | Cold start: ${s.coldStartCount}`)
        if (apiRes.slowestEndpoints?.length) {
          L.push(``)
          L.push(`### Endpoint piu' lenti (media, con conteggio richieste)`)
          L.push(``)
          L.push(`| Route | Media | Richieste |`)
          L.push(`|---|---|---|`)
          for (const e of apiRes.slowestEndpoints.slice(0, 10)) L.push(`| ${e.route} | ${fmtMs(e.avgMs)} | ${e.count} |`)
        }
      } else L.push(`- Nessun dato nella finestra.`)
      L.push(``)

      // ── DB ──
      L.push(`## Database`)
      if (dbRes) {
        L.push(``)
        L.push(`- Tempo medio DB (solo log strumentati con measureDb): ${fmtMs(dbRes.avgDbTimeInstrumented ?? dbRes.avgDbTime)}`)
        L.push(`- Tempo medio DB globale (diluito sui log non strumentati a 0): ${fmtMs(dbRes.avgDbTime)}`)
        L.push(`- Tempo medio non-DB: ${fmtMs(dbRes.avgNonDbTime)}`)
        if (dbRes.dbCoverage != null) L.push(`- Copertura measureDb: ${dbRes.dbCoverage}% dei log (${dbRes.instrumentedCount}/${dbRes.totalCount}) — sotto il 50% il tempo medio DB e' sottostimato`)
      } else L.push(`- Nessun dato.`)
      L.push(``)

      // ── Errori ──
      L.push(`## Errori`)
      if (errRes) {
        L.push(``)
        L.push(`- Totale: ${errRes.errorCount}/${errRes.totalRequests} richieste (${errRes.errorRate}%)`)
        if (errRes.errorAnalytics?.length) {
          L.push(``)
          L.push(`| Route | Errori | Status | Ultimo messaggio |`)
          L.push(`|---|---|---|---|`)
          for (const e of errRes.errorAnalytics.slice(0, 10)) {
            const statuses = Object.entries(e.statuses || {}).map(([k, v]) => `${k}x${v}`).join(", ")
            L.push(`| ${e.route} | ${e.count} | ${statuses} | ${(e.lastError || "-").slice(0, 120).replace(/\|/g, "/")} |`)
          }
        }
      } else L.push(`- Nessun dato.`)
      L.push(``)

      // ── Cold starts ──
      L.push(`## Cold Starts`)
      if (coldRes) L.push(`\n- ${coldRes.coldStartCount}/${coldRes.totalRequests} richieste (${coldRes.coldPercent}%) — fisiologici su serverless, rilevanti solo se >10%`)
      else L.push(`- Nessun dato.`)
      L.push(``)

      // ── Web Vitals ──
      L.push(`## Web Vitals (browser reali, campionamento ~20% sessioni)`)
      if (vitRes?.summary?.length) {
        L.push(``)
        L.push(`Soglie Google (good/poor): LCP 2500/4000ms, INP 200/500ms, CLS 0.1/0.25, FCP 1800/3000ms, TTFB 800/1800ms.`)
        L.push(`Misurazione: pacchetto ufficiale web-vitals di Google (INP a percentile, CLS con session windows). Dati precedenti al 14/07/2026 usavano un'approssimazione che sovrastimava INP.`)
        L.push(``)
        L.push(`| Metrica | Campioni | p50 | p95 | Buoni | Da migliorare | Scarsi |`)
        L.push(`|---|---|---|---|---|---|---|`)
        for (const v of vitRes.summary) {
          const unit = v.name === "CLS" ? "" : "ms"
          L.push(`| ${v.name} | ${v.count} | ${v.name === "CLS" ? v.p50.toFixed(3) : Math.round(v.p50)}${unit} | ${v.name === "CLS" ? v.p95.toFixed(3) : Math.round(v.p95)}${unit} | ${v.ratings.good} | ${v.ratings["needs-improvement"]} | ${v.ratings.poor} |`)
        }
      } else L.push(`- Nessun dato.`)
      L.push(``)
      L.push(`---`)
      L.push(`Report generato da /admin/performance. Per approfondire una route: tabella perf_api_logs (colonne route, total_ms, db_ms, status, cold_start, hotel_id, created_at).`)

      await navigator.clipboard.writeText(L.join("\n"))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* silent */ }
  }, [buildParams, hotelFilter, hoursFilter, hotels])

  const hasApiData = apiData && apiData.summary.totalRequests > 0

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl md:text-3xl font-bold tracking-tight text-balance">Performance Report</h1>
          <p className="text-sm md:text-base text-muted-foreground">Monitoraggio prestazioni</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
          <Select value={hotelFilter} onValueChange={setHotelFilter}>
            <SelectTrigger className="w-[180px] h-9 text-xs">
              <Building2 className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />
              <SelectValue placeholder="Tutti gli hotel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli hotel</SelectItem>
              {hotels.map(h => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={hoursFilter} onValueChange={setHoursFilter}>
            <SelectTrigger className="w-[120px] h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Ultima ora</SelectItem>
              <SelectItem value="6">Ultime 6h</SelectItem>
              <SelectItem value="24">Ultime 24h</SelectItem>
              <SelectItem value="72">Ultimi 3gg</SelectItem>
              <SelectItem value="168">Ultimi 7gg</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={copyDiagnosticReport} variant="outline" size="sm">
            {copied ? <ClipboardCheck className="h-4 w-4 mr-2 text-green-600" /> : <Copy className="h-4 w-4 mr-2" />}
            <span className="hidden sm:inline">{copied ? "Copiato!" : "Copia Report"}</span>
          </Button>
          <Button onClick={() => fetchTab(activeTab, true)} disabled={loading} variant="outline" size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Aggiorna</span>
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6"><p className="text-destructive">{error}</p></CardContent>
        </Card>
      )}

      {/* Verdict Banner (only shows when API tab has data) */}
      {hasApiData && apiData && (
        <Card className={`${verdictColor(apiData.verdict)} text-white`}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              {verdictIcon(apiData.verdict)}
              <div>
                <h2 className="text-2xl font-bold">Verdetto: {verdictLabel(apiData.verdict)}</h2>
                <p className="opacity-90">p95 = {apiData.summary.p95}ms {apiData.verdict === "FAST" && "(< 1000ms)"}{apiData.verdict === "ACCEPTABLE" && "(1000-3000ms)"}{apiData.verdict === "SLOW" && "(> 3000ms)"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      {hasApiData && apiData && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardHeader className="pb-2"><CardDescription>Richieste Totali</CardDescription><CardTitle className="text-2xl">{apiData.summary.totalRequests}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="pb-2"><CardDescription>p50</CardDescription><CardTitle className="text-2xl">{apiData.summary.p50}ms</CardTitle></CardHeader></Card>
          <Card><CardHeader className="pb-2"><CardDescription>p95</CardDescription><CardTitle className="text-2xl">{apiData.summary.p95}ms</CardTitle></CardHeader></Card>
          <Card><CardHeader className="pb-2"><CardDescription>p99</CardDescription><CardTitle className="text-2xl">{apiData.summary.p99}ms</CardTitle></CardHeader></Card>
        </div>
      )}

      {/* Tabs - lazy load per tab */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className="w-max md:w-auto">
            <TabsTrigger value="api" className="gap-1.5 min-h-[44px] text-xs md:text-sm"><Activity className="h-4 w-4" /><span className="hidden sm:inline">API</span><span className="sm:hidden">API</span></TabsTrigger>
            <TabsTrigger value="db" className="gap-1.5 min-h-[44px] text-xs md:text-sm"><Database className="h-4 w-4" /><span>DB</span></TabsTrigger>
            <TabsTrigger value="vitals" className="gap-1.5 min-h-[44px] text-xs md:text-sm"><Globe className="h-4 w-4" /><span className="hidden sm:inline">Web Vitals</span><span className="sm:hidden">Vitals</span></TabsTrigger>
            <TabsTrigger value="coldstart" className="gap-1.5 min-h-[44px] text-xs md:text-sm"><Zap className="h-4 w-4" /><span className="hidden sm:inline">Cold Starts</span></TabsTrigger>
            <TabsTrigger value="errors" className="gap-1.5 min-h-[44px] text-xs md:text-sm">
              <AlertCircle className="h-4 w-4" /><span className="hidden sm:inline">Errori</span>
              {apiData && apiData.summary.errorCount > 0 && <Badge variant="destructive" className="ml-1 text-[10px] px-1.5 py-0">{apiData.summary.errorCount}</Badge>}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ─── API Tab ─── */}
        <TabsContent value="api" className="space-y-4">
          {loading && !apiData ? <div className="flex justify-center py-12"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></div> :
          hasApiData && apiData ? (
            <>
              <Card>
                <CardHeader><CardTitle>Endpoint piu lenti (Top 10)</CardTitle><CardDescription>Tempo medio di risposta per route</CardDescription></CardHeader>
                <CardContent>
                  <div className="overflow-x-auto -mx-6 px-6">
                    <Table>
                      <TableHeader><TableRow><TableHead>Route</TableHead><TableHead className="text-right">Tempo medio</TableHead><TableHead className="text-right">Chiamate</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {apiData.slowestEndpoints.map(ep => (
                          <TableRow key={ep.route}>
                            <TableCell className="font-mono text-xs md:text-sm">{ep.route}</TableCell>
                            <TableCell className="text-right"><Badge variant={ep.avgMs > 1000 ? "destructive" : ep.avgMs > 500 ? "secondary" : "default"}>{ep.avgMs}ms</Badge></TableCell>
                            <TableCell className="text-right">{ep.count}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Log API Recenti</CardTitle><CardDescription>Ultime 50 richieste</CardDescription></CardHeader>
                <CardContent>
                  <div className="max-h-96 overflow-auto -mx-6 px-6">
                    <Table>
                      <TableHeader><TableRow><TableHead>Ora</TableHead><TableHead>Route</TableHead><TableHead className="hidden sm:table-cell">Metodo</TableHead><TableHead className="text-right">Totale</TableHead><TableHead className="text-right hidden md:table-cell">DB</TableHead><TableHead className="text-right hidden md:table-cell">Non-DB</TableHead><TableHead>Stato</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {apiData.recentLogs.map((log, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(log.timestamp).toLocaleTimeString("it-IT")}</TableCell>
                            <TableCell className="font-mono text-xs max-w-32 md:max-w-48 truncate">{log.route}</TableCell>
                            <TableCell className="hidden sm:table-cell"><Badge variant="outline">{log.method}</Badge></TableCell>
                            <TableCell className="text-right whitespace-nowrap">{log.totalMs}ms</TableCell>
                            <TableCell className="text-right hidden md:table-cell">{log.dbMs}ms</TableCell>
                            <TableCell className="text-right hidden md:table-cell">{log.nonDbMs}ms</TableCell>
                            <TableCell><Badge variant={log.status >= 400 ? "destructive" : "default"}>{log.status}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : <Card><CardContent className="pt-6"><EmptyState title="Nessun dato API" description="Le metriche verranno raccolte automaticamente quando le API instrumentate vengono chiamate." /></CardContent></Card>}
        </TabsContent>

        {/* ─── DB Tab ─── */}
        <TabsContent value="db" className="space-y-4">
          {loading && !dbData ? <div className="flex justify-center py-12"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></div> :
          dbData && dbData.recentDbLogs.length > 0 ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base md:text-lg">Tempo medio DB</CardTitle>
                    <CardDescription className="text-xs">Solo richieste strumentate con measureDb (misura reale)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl md:text-4xl font-bold">{dbData.avgDbTimeInstrumented ?? dbData.avgDbTime}ms</p>
                    {typeof dbData.dbCoverage === "number" && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Copertura: {dbData.dbCoverage}% dei log ({dbData.instrumentedCount}/{dbData.totalCount}) — media globale diluita: {dbData.avgDbTime}ms
                      </p>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base md:text-lg">Tempo medio Non-DB</CardTitle>
                    <CardDescription className="text-xs">Tempo speso fuori dal DB (CPU, I/O esterno, network)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl md:text-4xl font-bold">{dbData.avgNonDbTime}ms</p>
                  </CardContent>
                </Card>
              </div>
              <Card>
                <CardHeader><CardTitle>Ripartizione DB per Route</CardTitle></CardHeader>
                <CardContent>
                  <div className="max-h-80 overflow-auto -mx-6 px-6">
                    <Table>
                      <TableHeader><TableRow><TableHead>Route</TableHead><TableHead className="text-right">DB</TableHead><TableHead className="text-right hidden sm:table-cell">Non-DB</TableHead><TableHead className="text-right hidden sm:table-cell">Totale</TableHead><TableHead className="text-right">% DB</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {dbData.recentDbLogs.map((log, i) => {
                          const pct = log.totalMs > 0 ? Math.round((log.dbMs / log.totalMs) * 100) : 0
                          return (
                            <TableRow key={i}>
                              <TableCell className="font-mono text-xs max-w-32 md:max-w-48 truncate">{log.route}</TableCell>
                              <TableCell className="text-right whitespace-nowrap">{log.dbMs}ms</TableCell>
                              <TableCell className="text-right hidden sm:table-cell">{log.nonDbMs}ms</TableCell>
                              <TableCell className="text-right hidden sm:table-cell">{log.totalMs}ms</TableCell>
                              <TableCell className="text-right"><Badge variant={pct > 80 ? "destructive" : pct > 50 ? "secondary" : "default"}>{pct}%</Badge></TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : <Card><CardContent className="pt-6"><EmptyState title="Nessun dato database" description="I tempi di query verranno monitorati quando le API con tracking DB saranno eseguite." /></CardContent></Card>}
        </TabsContent>

        {/* ─── Web Vitals Tab ─── */}
        <TabsContent value="vitals" className="space-y-4">
          {loading && !vitalsData ? <div className="flex justify-center py-12"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></div> :
          vitalsData && vitalsData.totalMetrics > 0 ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 md:gap-4">
                {vitalsData.summary.map(m => (
                  <Card key={m.name}>
                    <CardHeader className="pb-2"><CardDescription>{m.name}</CardDescription><CardTitle className="text-2xl">{m.name === "CLS" ? m.avg.toFixed(3) : `${m.avg}ms`}</CardTitle></CardHeader>
                    <CardContent>
                      <div className="flex gap-1 text-xs">
                        <Badge className="bg-green-100 text-green-700">{m.ratings.good}</Badge>
                        <Badge className="bg-yellow-100 text-yellow-700">{m.ratings["needs-improvement"]}</Badge>
                        <Badge className="bg-red-100 text-red-700">{m.ratings.poor}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Card>
                <CardHeader><CardTitle>Web Vitals Recenti</CardTitle></CardHeader>
                <CardContent>
                  <div className="max-h-96 overflow-auto -mx-6 px-6">
                    <Table>
                      <TableHeader><TableRow><TableHead>Metrica</TableHead><TableHead>Valore</TableHead><TableHead>Valutazione</TableHead><TableHead className="hidden sm:table-cell">Pagina</TableHead><TableHead className="hidden sm:table-cell">Ora</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {vitalsData.recentMetrics.map((m, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium text-xs md:text-sm">{m.name}</TableCell>
                            <TableCell className="whitespace-nowrap text-xs md:text-sm">{m.name === "CLS" ? m.value.toFixed(3) : `${Math.round(m.value)}ms`}</TableCell>
                            <TableCell><Badge className={`${ratingColor(m.rating)} text-xs`}>{ratingLabel(m.rating)}</Badge></TableCell>
                            <TableCell className="font-mono text-xs max-w-32 truncate hidden sm:table-cell">{m.path}</TableCell>
                            <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">{new Date(m.timestamp).toLocaleTimeString("it-IT")}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : <Card><CardContent className="pt-6"><EmptyState title="Nessun dato Web Vitals" description="Le metriche Core Web Vitals vengono raccolte automaticamente dal browser. Naviga nell'app per generarle." /></CardContent></Card>}
        </TabsContent>

        {/* ─── Cold Starts Tab ─── */}
        <TabsContent value="coldstart" className="space-y-4">
          {loading && !coldData ? <div className="flex justify-center py-12"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></div> :
          coldData ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card>
                  <CardHeader><CardTitle className="text-base md:text-lg">Cold Start</CardTitle><CardDescription>Avvio a freddo serverless</CardDescription></CardHeader>
                  <CardContent>
                    <p className="text-3xl md:text-4xl font-bold">{coldData.coldStartCount}</p>
                    <p className="text-muted-foreground text-sm">{coldData.coldPercent}% delle richieste</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-base md:text-lg">Richieste Warm</CardTitle><CardDescription>Istanza gia attiva</CardDescription></CardHeader>
                  <CardContent><p className="text-3xl md:text-4xl font-bold">{coldData.warmCount}</p></CardContent>
                </Card>
              </div>
              <Card>
                <CardHeader><CardTitle>Cold Start Recenti</CardTitle></CardHeader>
                <CardContent>
                  {coldData.recentColdLogs.length > 0 ? (
                    <Table>
                      <TableHeader><TableRow><TableHead>Ora</TableHead><TableHead>Route</TableHead><TableHead>Tipo</TableHead><TableHead className="text-right">Tempo</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {coldData.recentColdLogs.map((log, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs">{new Date(log.timestamp).toLocaleTimeString("it-IT")}</TableCell>
                            <TableCell className="font-mono text-xs">{log.route}</TableCell>
                            <TableCell><Badge variant="destructive">Cold</Badge></TableCell>
                            <TableCell className="text-right">{log.totalMs}ms</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : <p className="text-sm text-muted-foreground text-center py-8">Nessun cold start rilevato nel periodo corrente.</p>}
                </CardContent>
              </Card>
            </>
          ) : <Card><CardContent className="pt-6"><EmptyState title="Nessun dato cold start" description="Le informazioni sui cold start verranno visualizzate quando le API riceveranno traffico." /></CardContent></Card>}
        </TabsContent>

        {/* ─── Errors Tab ─── */}
        <TabsContent value="errors" className="space-y-4">
          {loading && !errorsData ? <div className="flex justify-center py-12"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></div> :
          errorsData ? (
            <>
              <Card className={`${errorsData.errorRate > 5 ? "bg-red-600" : errorsData.errorRate > 1 ? "bg-yellow-500" : "bg-green-600"} text-white`}>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <AlertCircle className="h-8 w-8" />
                    <div>
                      <p className="text-2xl font-bold">{errorsData.errorRate}% error rate</p>
                      <p className="text-sm opacity-90">{errorsData.errorCount} errori su {errorsData.totalRequests} richieste</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              {errorsData.errorAnalytics.length > 0 ? (
                <Card>
                  <CardHeader><CardTitle className="text-base">Errori per Endpoint</CardTitle><CardDescription>Top 15 endpoint con piu errori</CardDescription></CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader><TableRow><TableHead>Route</TableHead><TableHead className="text-right">Conteggio</TableHead><TableHead>Status</TableHead><TableHead>Ultimo Errore</TableHead><TableHead className="text-right">Ultimo</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {errorsData.errorAnalytics.map((e, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-mono text-xs">{e.route}</TableCell>
                              <TableCell className="text-right"><Badge variant="destructive">{e.count}</Badge></TableCell>
                              <TableCell>
                                <div className="flex gap-1 flex-wrap">
                                  {Object.entries(e.statuses).map(([s, c]) => (
                                    <Badge key={s} variant="outline" className={`text-[10px] ${Number(s) >= 500 ? "border-red-300 text-red-700" : "border-yellow-300 text-yellow-700"}`}>{s}: {c}x</Badge>
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{e.lastError || "-"}</TableCell>
                              <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">{new Date(e.lastAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              ) : <Card><CardContent className="pt-6"><EmptyState title="Nessun errore nel periodo" description="Tutte le API hanno risposto correttamente." /></CardContent></Card>}
              {errorsData.recentErrorLogs.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Log Errori Recenti</CardTitle></CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader><TableRow><TableHead>Ora</TableHead><TableHead>Route</TableHead><TableHead>Metodo</TableHead><TableHead>Status</TableHead><TableHead>Tempo</TableHead><TableHead>Errore</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {errorsData.recentErrorLogs.map((l, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-xs whitespace-nowrap">{new Date(l.timestamp).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</TableCell>
                              <TableCell className="font-mono text-xs">{l.route}</TableCell>
                              <TableCell><Badge variant="outline" className="text-[10px]">{l.method}</Badge></TableCell>
                              <TableCell><Badge variant="destructive" className="text-[10px]">{l.status}</Badge></TableCell>
                              <TableCell className="text-right text-xs">{l.totalMs}ms</TableCell>
                              <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{l.error || "-"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : <Card><CardContent className="pt-6"><EmptyState title="Nessun dato disponibile" description="I dati sugli errori verranno visualizzati quando le API riceveranno traffico." /></CardContent></Card>}
        </TabsContent>
      </Tabs>

      {/* Route monitorate */}
      <Card>
        <CardHeader><CardTitle>Route API Monitorate</CardTitle><CardDescription>Route instrumentate con il monitoraggio delle performance</CardDescription></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { route: "/api/dashboard/metrics", method: "GET", desc: "Metriche dashboard principale" },
              { route: "/api/rates", method: "GET", desc: "Lettura tariffe" },
              { route: "/api/scidoo/sync", method: "POST", desc: "Sincronizzazione completa Scidoo" },
              { route: "/api/scidoo/rates/sync", method: "POST", desc: "Sincronizzazione tariffe Scidoo" },
              { route: "/api/scidoo/sync-availability", method: "POST", desc: "Sincronizzazione disponibilita" },
              { route: "/api/ai-chat", method: "POST", desc: "Chat AI assistente" },
            ].map(item => (
              <div key={item.route} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Badge variant="outline" className="shrink-0">{item.method}</Badge>
                <div className="min-w-0">
                  <code className="text-xs font-mono block truncate">{item.route}</code>
                  <span className="text-xs text-muted-foreground">{item.desc}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-4">Per aggiungere il monitoraggio a una nuova route, wrappala con <code className="bg-muted px-1 rounded">measureRoute</code> da <code className="bg-muted px-1 rounded">@/lib/performance/with-perf</code></p>
        </CardContent>
      </Card>
    </div>
  )
}
