"use client"

/**
 * Pagina Commissioni & Fatture (tenant-side).
 *
 * Due tab:
 *  - "Commissioni mensili" -> visibile solo se l'hotel ha plan_type='commission'.
 *    Tabella con righe Gen-Dic e colonne: Mese | Produzione anno corrente |
 *    Produzione anno precedente | Delta YoY | Commissione % | Commissione € |
 *    Stato fattura.
 *  - "Fatture" -> sempre visibile, archivio invoices read-only.
 */

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ChevronLeft, ChevronRight, FileText, TrendingUp, TrendingDown, Minus, Info, Receipt } from "lucide-react"
import { PageHeader } from "@/components/layout/page-header"

interface MonthRow {
  month: number
  currentRevenue: number
  prevRevenue: number
  deltaYoy: number
  deltaYoyPct: number | null
  commissionPercentage: number | null
  commissionPercentages: number[]
  commissionAmount: number
  invoices: Array<{ id: string; invoice_number: string; status: string; total: number }>
}

interface CommissionsResponse {
  enabled: boolean
  reason?: string
  year?: number
  subscription?: { id: string; plan_type: string; currentPercentage: number | null; startedAt: string | null }
  periods?: Array<{ valid_from: string; valid_to: string | null; commission_percentage: number }>
  months?: MonthRow[]
}

interface InvoiceRow {
  id: string
  invoice_number: string
  status: string
  plan_type: string | null
  issue_date: string | null
  period_start: string | null
  period_end: string | null
  subtotal: number
  tax: number
  total: number
  paid_amount: number | null
  due_date: string | null
  paid_at: string | null
  pdf_url: string | null
  pdf_file_name: string | null
  notes: string | null
  created_at: string
}

const MONTH_NAMES = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"]

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n)

const formatDate = (iso: string | null) => {
  if (!iso) return "-"
  try {
    return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })
  } catch {
    return iso
  }
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    draft: { label: "Bozza", className: "bg-gray-200 text-gray-800" },
    sent: { label: "Inviata", className: "bg-blue-100 text-blue-800" },
    pending: { label: "In attesa", className: "bg-yellow-100 text-yellow-800" },
    paid: { label: "Pagata", className: "bg-green-100 text-green-800" },
    overdue: { label: "Scaduta", className: "bg-red-100 text-red-800" },
    cancelled: { label: "Annullata", className: "bg-gray-100 text-gray-700" },
  }
  const v = map[status] || { label: status, className: "bg-muted text-foreground" }
  return <Badge className={v.className}>{v.label}</Badge>
}

export default function CommissioniFatturePage() {
  const [hotelId, setHotelId] = useState<string | null>(null)
  const [hotelName, setHotelName] = useState("")
  const [year, setYear] = useState(new Date().getFullYear())
  const [commissionsData, setCommissionsData] = useState<CommissionsResponse | null>(null)
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [carryover, setCarryover] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<"commissioni" | "fatture">("commissioni")

  // 1) Hotel corrente
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/ui/selected-hotel")
        const data = await res.json()
        if (data?.hotel) {
          setHotelId(data.hotel.id)
          setHotelName(data.hotel.name)
        }
      } catch {
        // soft fail: hotel selector vuoto -> mostriamo placeholder
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const loadAll = useCallback(async () => {
    if (!hotelId) return
    setLoading(true)
    try {
      const [cRes, iRes] = await Promise.all([
        fetch(`/api/dati/commissions?hotel_id=${hotelId}&year=${year}`),
        fetch(`/api/dati/invoices?hotel_id=${hotelId}&year=${year}`),
      ])
      if (cRes.ok) setCommissionsData(await cRes.json())
      else setCommissionsData({ enabled: false, reason: "fetch_error" })
      if (iRes.ok) {
        const j = await iRes.json()
        setInvoices(j.invoices || [])
        setCarryover(Number(j.carryover || 0))
      } else {
        setInvoices([])
        setCarryover(0)
      }
    } finally {
      setLoading(false)
    }
  }, [hotelId, year])

  useEffect(() => {
    if (hotelId) void loadAll()
  }, [hotelId, year, loadAll])

  // Quando il piano non e' commission, l'unico tab utile e' fatture: forza la
  // selezione iniziale per evitare di vedere il tab vuoto.
  useEffect(() => {
    if (commissionsData && !commissionsData.enabled) setTab("fatture")
  }, [commissionsData])

  const annualTotals = commissionsData?.months
    ? commissionsData.months.reduce(
        (acc, m) => ({
          currentRevenue: acc.currentRevenue + m.currentRevenue,
          prevRevenue: acc.prevRevenue + m.prevRevenue,
          // Somma commissione SOLO se il delta YoY è positivo (come da regola)
          commissionAmount: acc.commissionAmount + (m.deltaYoy > 0 ? m.commissionAmount : 0),
        }),
        { currentRevenue: 0, prevRevenue: 0, commissionAmount: 0 },
      )
    : null

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <PageHeader
        title="Commissioni & Fatture"
        description={
          hotelName
            ? `Quadro economico ${hotelName} - anno ${year}`
            : "Riepilogo commissioni mensili e archivio fatture"
        }
      />

      {/* Anno picker - condiviso tra i tab */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setYear(year - 1)} aria-label="Anno precedente">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-2xl font-bold tabular-nums w-20 text-center">{year}</span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setYear(year + 1)}
            disabled={year >= new Date().getFullYear() + 1}
            aria-label="Anno successivo"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "commissioni" | "fatture")}>
        <TabsList>
          <TabsTrigger value="commissioni" disabled={commissionsData ? !commissionsData.enabled : false}>
            <Receipt className="h-4 w-4 mr-2" />
            Commissioni mensili
          </TabsTrigger>
          <TabsTrigger value="fatture">
            <FileText className="h-4 w-4 mr-2" />
            Fatture
          </TabsTrigger>
        </TabsList>

        {/* TAB COMMISSIONI */}
        <TabsContent value="commissioni" className="space-y-4">
          {loading && !commissionsData && (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">Caricamento...</CardContent>
            </Card>
          )}

          {commissionsData && !commissionsData.enabled && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Questo hotel non ha un piano a commissione attivo. La sezione &ldquo;Commissioni mensili&rdquo;
                e&apos; disponibile solo per gli abbonamenti con plan type <code>commission</code>. Vedi
                comunque l&apos;archivio fatture nel tab successivo.
              </AlertDescription>
            </Alert>
          )}

          {commissionsData?.enabled && commissionsData.months && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2 flex-wrap">
                  <span>Riepilogo {year}</span>
                  {commissionsData.subscription?.currentPercentage != null && (
                    <Badge variant="outline" className="text-sm">
                      Commissione corrente: {commissionsData.subscription.currentPercentage}%
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Alert se non ci sono periodi configurati E la commissione sulla subscription e' null */}
                {(commissionsData.periods?.length || 0) === 0 && commissionsData.subscription?.currentPercentage == null && (
                  <Alert variant="destructive" className="mb-4">
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Commissione non configurata.</strong> Non sono stati definiti periodi di commissione per questo hotel.
                      Contatta l&apos;amministratore per configurare le percentuali di commissione nella sezione Gestione Abbonamenti.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Periodi commissione - banner informativo se ce n'e' piu' di 1 */}
                {(commissionsData.periods?.length || 0) > 1 && (
                  <Alert className="mb-4">
                    <Info className="h-4 w-4" />
                    <AlertDescription className="text-sm leading-relaxed">
                      <div className="font-semibold mb-1">Storia commissioni applicate:</div>
                      <ul className="list-disc list-inside space-y-0.5">
                        {commissionsData.periods?.map((p, idx) => (
                          <li key={idx} className="font-mono text-xs">
                            {p.valid_from} &rarr; {p.valid_to || "in corso"}: <b>{p.commission_percentage}%</b>
                          </li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="border p-2 text-left">Mese</th>
                        <th className="border p-2 text-right">Produzione {year}</th>
                        <th className="border p-2 text-right">Produzione {year - 1}</th>
                        <th className="border p-2 text-right">&Delta; YoY</th>
                        <th className="border p-2 text-right">Comm. %</th>
                        <th className="border p-2 text-right">Commissione &euro;</th>
                        <th className="border p-2 text-center">Fattura</th>
                      </tr>
                    </thead>
                    <tbody>
                      {commissionsData.months.map((m) => {
                        const isCurrentMonth =
                          m.month === new Date().getMonth() + 1 && year === new Date().getFullYear()
                        const isPast =
                          year < new Date().getFullYear() ||
                          (year === new Date().getFullYear() && m.month < new Date().getMonth() + 1)
                        const rowBg = isCurrentMonth ? "bg-blue-50/60" : isPast ? "bg-muted/20" : ""
                        return (
                          <tr key={m.month} className={rowBg}>
                            <td className="border p-2 font-medium">
                              {MONTH_NAMES[m.month - 1]} {String(year).slice(2)}
                            </td>
                            <td className="border p-2 text-right font-mono">
                              {m.currentRevenue > 0 ? formatCurrency(m.currentRevenue) : "-"}
                            </td>
                            <td className="border p-2 text-right font-mono text-muted-foreground">
                              {m.prevRevenue > 0 ? formatCurrency(m.prevRevenue) : "-"}
                            </td>
                            <td
                              className={`border p-2 text-right font-mono ${
                                m.deltaYoy > 0 ? "text-green-600" : ""
                              }`}
                            >
                              {/* Mostra delta YoY SOLO se positivo, altrimenti "-" */}
                              {m.prevRevenue > 0 && m.deltaYoy > 0 ? (
                                <div className="flex items-center justify-end gap-1">
                                  <TrendingUp className="h-3 w-3" />
                                  {formatCurrency(m.deltaYoy)}
                                  {m.deltaYoyPct != null && (
                                    <span className="text-xs text-muted-foreground ml-1">
                                      (+{m.deltaYoyPct.toFixed(1)}%)
                                    </span>
                                  )}
                                </div>
                              ) : (
                                "-"
                              )}
                            </td>
                            <td className="border p-2 text-right font-mono">
                              {/* Se delta YoY <= 0, non mostrare la commissione % */}
                              {m.deltaYoy <= 0
                                ? "-"
                                : m.commissionPercentage != null
                                  ? `${m.commissionPercentage}%`
                                  : m.commissionPercentages.length > 0
                                    ? `${Math.min(...m.commissionPercentages)}-${Math.max(
                                        ...m.commissionPercentages,
                                      )}%`
                                    : "-"}
                            </td>
                            <td className="border p-2 text-right font-mono font-semibold">
                              {/* Non mostrare commissione se delta YoY <= 0 */}
                              {m.deltaYoy <= 0 ? "-" : m.commissionAmount > 0 ? formatCurrency(m.commissionAmount) : "-"}
                            </td>
                            <td className="border p-2 text-center">
                              {m.invoices.length > 0 ? (
                                m.invoices.map((inv) => (
                                  <div key={inv.id} className="flex items-center justify-center gap-1">
                                    <span className="text-xs">{inv.invoice_number}</span>
                                    <StatusBadge status={inv.status} />
                                  </div>
                                ))
                              ) : (
                                <span className="text-xs text-muted-foreground italic">non emessa</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}

                      {/* Totale annuo */}
                      {annualTotals && (
                        <tr className="bg-primary/5 font-semibold">
                          <td className="border p-2">Totale {year}</td>
                          <td className="border p-2 text-right font-mono">
                            {formatCurrency(annualTotals.currentRevenue)}
                          </td>
                          <td className="border p-2 text-right font-mono text-muted-foreground">
                            {formatCurrency(annualTotals.prevRevenue)}
                          </td>
                          <td
                            className={`border p-2 text-right font-mono ${
                              annualTotals.currentRevenue - annualTotals.prevRevenue > 0
                                ? "text-green-600"
                                : ""
                            }`}
                          >
                            {/* Mostra delta YoY annuale SOLO se positivo */}
                            {annualTotals.prevRevenue > 0 && annualTotals.currentRevenue - annualTotals.prevRevenue > 0
                              ? formatCurrency(annualTotals.currentRevenue - annualTotals.prevRevenue)
                              : "-"}
                          </td>
                          <td className="border p-2 text-right text-muted-foreground">-</td>
                          <td className="border p-2 text-right font-mono">
                            {formatCurrency(annualTotals.commissionAmount)}
                          </td>
                          <td className="border p-2"></td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                  La commissione viene calcolata giorno per giorno applicando alla produzione la percentuale
                  in vigore in quella data. Se in un mese la percentuale cambia (es. variazione contrattuale a
                  meta&apos; periodo), la cella &ldquo;Comm. %&rdquo; mostra il range applicato e l&apos;importo
                  &euro; tiene gia&apos; conto del cambio.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* TAB FATTURE */}
        <TabsContent value="fatture" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Archivio fatture {year}</CardTitle>
            </CardHeader>
            <CardContent>
              {loading && invoices.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">Caricamento...</p>
              ) : invoices.length === 0 ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Nessuna fattura per il {year}. Quando vengono emesse, compaiono in questa tabella.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="border p-2 text-left">Numero</th>
                        <th className="border p-2 text-left">Emessa</th>
                        <th className="border p-2 text-left">Periodo</th>
                        <th className="border p-2 text-right">Imponibile</th>
                        <th className="border p-2 text-right">IVA</th>
                        <th className="border p-2 text-right">Totale</th>
                        <th className="border p-2 text-right">Pagato</th>
                        <th className="border p-2 text-right">Residuo riga</th>
                        <th className="border p-2 text-right">Saldo progressivo</th>
                        <th className="border p-2 text-left">Scadenza</th>
                        <th className="border p-2 text-left">Pagata il</th>
                        <th className="border p-2 text-center">Stato</th>
                        <th className="border p-2 text-center">PDF</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        // Calcolo saldo progressivo in ordine cronologico
                        // (oldest first), partendo dal carryover dell'anno
                        // precedente. La tabella visualizza in ordine
                        // DESC quindi popoliamo una map id -> running.
                        const chrono = [...invoices].sort((a, b) => {
                          const da = a.issue_date || a.period_start || a.created_at || ""
                          const db = b.issue_date || b.period_start || b.created_at || ""
                          return da.localeCompare(db)
                        })
                        const runningById = new Map<string, number>()
                        let acc = carryover
                        for (const inv of chrono) {
                          const t = Number(inv.total || 0)
                          const p = Number(inv.paid_amount || 0)
                          acc += Math.max(0, t - p)
                          runningById.set(inv.id, acc)
                        }
                        return (
                          <>
                            {carryover > 0 && (
                              <tr className="bg-amber-50">
                                <td
                                  colSpan={7}
                                  className="border p-2 text-xs italic text-amber-900"
                                >
                                  Riportato dal {year - 1} (residuo non saldato)
                                </td>
                                <td className="border p-2 text-right font-mono font-semibold text-amber-900">
                                  {formatCurrency(carryover)}
                                </td>
                                <td colSpan={4} className="border p-2"></td>
                              </tr>
                            )}
                            {invoices.map((inv) => {
                              const paid = Number(inv.paid_amount || 0)
                              const residuo = Math.max(0, Number(inv.total || 0) - paid)
                              const running = runningById.get(inv.id) ?? 0
                              return (
                                <tr key={inv.id}>
                                  <td className="border p-2 font-mono">{inv.invoice_number || "-"}</td>
                                  <td className="border p-2 text-xs">{formatDate(inv.issue_date)}</td>
                                  <td className="border p-2 text-xs">
                                    {inv.period_start
                                      ? `${formatDate(inv.period_start)} → ${formatDate(inv.period_end)}`
                                      : "-"}
                                  </td>
                                  <td className="border p-2 text-right font-mono">
                                    {formatCurrency(inv.subtotal)}
                                  </td>
                                  <td className="border p-2 text-right font-mono">
                                    {formatCurrency(inv.tax)}
                                  </td>
                                  <td className="border p-2 text-right font-mono font-semibold">
                                    {formatCurrency(inv.total)}
                                  </td>
                                  <td className="border p-2 text-right font-mono text-green-700">
                                    {paid > 0 ? formatCurrency(paid) : "-"}
                                  </td>
                                  <td
                                    className={`border p-2 text-right font-mono ${
                                      residuo > 0 ? "text-amber-700" : "text-muted-foreground"
                                    }`}
                                  >
                                    {residuo > 0 ? formatCurrency(residuo) : formatCurrency(0)}
                                  </td>
                                  <td
                                    className={`border p-2 text-right font-mono font-semibold ${
                                      running > 0 ? "text-amber-800" : "text-muted-foreground"
                                    }`}
                                  >
                                    {formatCurrency(running)}
                                  </td>
                                  <td className="border p-2 text-xs">{formatDate(inv.due_date)}</td>
                                  <td className="border p-2 text-xs">{formatDate(inv.paid_at)}</td>
                                  <td className="border p-2 text-center">
                                    <StatusBadge status={inv.status} />
                                  </td>
                                  <td className="border p-2 text-center">
                                    {inv.pdf_url ? (
                                      <a
                                        href={`/api/dati/invoices/${inv.id}/download`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1 text-blue-600 hover:underline text-xs"
                                      >
                                        <FileText className="h-3 w-3" /> apri
                                      </a>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">-</span>
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                          </>
                        )
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
