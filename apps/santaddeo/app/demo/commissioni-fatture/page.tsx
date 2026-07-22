"use client"

import { useEffect, useState } from "react"
import { DemoPage } from "@/components/sales/demo/demo-page"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { PageHeader } from "@/components/layout/page-header"
import { ChevronLeft, ChevronRight, FileText, TrendingUp, Receipt, Download } from "lucide-react"
import {
  DEMO_COMMISSIONS,
  DEMO_COMMISSION_YEAR,
  DEMO_COMMISSION_PERCENTAGE,
  DEMO_INVOICES,
} from "@/components/sales/demo/mock-data"

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n)

const formatDate = (iso: string | null) => {
  if (!iso) return "-"
  return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    draft: { label: "Bozza", className: "bg-gray-200 text-gray-800" },
    sent: { label: "Inviata", className: "bg-blue-100 text-blue-800" },
    pending: { label: "In attesa", className: "bg-yellow-100 text-yellow-800" },
    paid: { label: "Pagata", className: "bg-green-100 text-green-800" },
    overdue: { label: "Scaduta", className: "bg-red-100 text-red-800" },
  }
  const v = map[status] || { label: status, className: "bg-muted text-foreground" }
  return <Badge className={v.className}>{v.label}</Badge>
}

export default function DemoCommissioniFatturePage() {
  const year = DEMO_COMMISSION_YEAR
  const months = DEMO_COMMISSIONS

  // Plan-aware: la stessa demo serve sia i venditori sia i tenant.
  //  - default (nessun param / ?plan=commission) -> piano a commissione:
  //    mostra sia "Commissioni mensili" sia "Fatture" (comportamento storico
  //    della demo venditori, che NON va toccato).
  //  - ?plan=fee | monthly | monthly_fee -> piano a fee mensile: il tenant non
  //    paga commissioni, quindi nascondiamo quel tab e mostriamo solo "Fatture".
  // Leggiamo il param dopo il mount (no window in fase SSR -> niente mismatch
  // di idratazione): si parte dallo scenario commissione e si corregge subito.
  const [showCommissions, setShowCommissions] = useState(true)
  const [activeTab, setActiveTab] = useState<"commissioni" | "fatture">("commissioni")

  useEffect(() => {
    const plan = (new URLSearchParams(window.location.search).get("plan") || "").toLowerCase()
    const isFee = plan === "fee" || plan === "monthly" || plan === "monthly_fee"
    if (isFee) {
      setShowCommissions(false)
      setActiveTab("fatture")
    }
  }, [])

  const narration = showCommissions
    ? "Qui l'albergatore vede il quadro economico del rapporto con Santaddeo: mese per mese la produzione dell'anno corrente confrontata con l'anno precedente, il delta di crescita e la commissione applicata solo sulla crescita generata. Nel secondo tab trova l'archivio delle fatture emesse, con stato dei pagamenti e download del PDF. Trasparenza totale: si paga una percentuale solo sul valore aggiunto."
    : "Qui trovi l'archivio delle tue fatture: il tuo piano prevede una fee mensile fissa, quindi non ci sono commissioni da calcolare. Per ogni fattura vedi periodo, importo, stato del pagamento e puoi scaricare il PDF in qualsiasi momento. Trasparenza totale sui pagamenti."
  const annual = months.reduce(
    (acc, m) => ({
      currentRevenue: acc.currentRevenue + m.currentRevenue,
      prevRevenue: acc.prevRevenue + m.prevRevenue,
      commissionAmount: acc.commissionAmount + (m.deltaYoy > 0 ? m.commission : 0),
    }),
    { currentRevenue: 0, prevRevenue: 0, commissionAmount: 0 },
  )

  return (
    <DemoPage title="Commissioni & Fatture" narration={narration}>
      <div className="container mx-auto p-4 md:p-6 space-y-6">
        <PageHeader
          title="Commissioni & Fatture"
          description={`Quadro economico Hotel Santaddeo - anno ${year}`}
        />

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" aria-label="Anno precedente">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-2xl font-bold tabular-nums w-20 text-center">{year}</span>
            <Button variant="outline" size="icon" disabled aria-label="Anno successivo">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "commissioni" | "fatture")}>
          <TabsList>
            {showCommissions && (
              <TabsTrigger value="commissioni">
                <Receipt className="h-4 w-4 mr-2" />
                Commissioni mensili
              </TabsTrigger>
            )}
            <TabsTrigger value="fatture">
              <FileText className="h-4 w-4 mr-2" />
              Fatture
            </TabsTrigger>
          </TabsList>

          {/* TAB COMMISSIONI (solo piano a commissione) */}
          {showCommissions && (
          <TabsContent value="commissioni" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2 flex-wrap">
                  <span>Riepilogo {year}</span>
                  <Badge variant="outline" className="text-sm">
                    Commissione corrente: {DEMO_COMMISSION_PERCENTAGE}%
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
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
                      {months.map((m) => {
                        const isCurrent = m.month === 5
                        const isPast = m.month < 5
                        const rowBg = isCurrent ? "bg-blue-50/60" : isPast ? "bg-muted/20" : ""
                        return (
                          <tr key={m.month} className={rowBg}>
                            <td className="border p-2 font-medium">
                              {m.label} {String(year).slice(2)}
                            </td>
                            <td className="border p-2 text-right font-mono">
                              {m.currentRevenue > 0 ? formatCurrency(m.currentRevenue) : "-"}
                            </td>
                            <td className="border p-2 text-right font-mono text-muted-foreground">
                              {m.prevRevenue > 0 ? formatCurrency(m.prevRevenue) : "-"}
                            </td>
                            <td className={`border p-2 text-right font-mono ${m.deltaYoy > 0 ? "text-green-600" : ""}`}>
                              {m.currentRevenue > 0 && m.deltaYoy > 0 ? (
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
                              {m.deltaYoy > 0 ? `${DEMO_COMMISSION_PERCENTAGE}%` : "-"}
                            </td>
                            <td className="border p-2 text-right font-mono font-semibold">
                              {m.deltaYoy > 0 && m.commission > 0 ? formatCurrency(m.commission) : "-"}
                            </td>
                            <td className="border p-2 text-center">
                              {m.invoice ? (
                                <div className="flex items-center justify-center gap-1">
                                  <span className="text-xs">{m.invoice.number}</span>
                                  <StatusBadge status={m.invoice.status} />
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground italic">non emessa</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                      <tr className="bg-primary/5 font-semibold">
                        <td className="border p-2">Totale {year}</td>
                        <td className="border p-2 text-right font-mono">{formatCurrency(annual.currentRevenue)}</td>
                        <td className="border p-2 text-right font-mono text-muted-foreground">
                          {formatCurrency(annual.prevRevenue)}
                        </td>
                        <td className="border p-2 text-right font-mono text-green-600">
                          {formatCurrency(annual.currentRevenue - annual.prevRevenue)}
                        </td>
                        <td className="border p-2 text-right text-muted-foreground">-</td>
                        <td className="border p-2 text-right font-mono">{formatCurrency(annual.commissionAmount)}</td>
                        <td className="border p-2" />
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                  La commissione viene calcolata giorno per giorno applicando alla produzione la percentuale in
                  vigore in quella data, e solo sulla crescita rispetto all&apos;anno precedente.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
          )}

          {/* TAB FATTURE */}
          <TabsContent value="fatture" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Archivio fatture {year}</CardTitle>
              </CardHeader>
              <CardContent>
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
                        <th className="border p-2 text-left">Pagata il</th>
                        <th className="border p-2 text-center">Stato</th>
                        <th className="border p-2 text-center">PDF</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DEMO_INVOICES.map((inv) => (
                        <tr key={inv.id} className="hover:bg-muted/30">
                          <td className="border p-2 font-mono text-xs">{inv.number}</td>
                          <td className="border p-2">{formatDate(inv.issue_date)}</td>
                          <td className="border p-2">{inv.period}</td>
                          <td className="border p-2 text-right font-mono">{formatCurrency(inv.subtotal)}</td>
                          <td className="border p-2 text-right font-mono text-muted-foreground">
                            {formatCurrency(inv.tax)}
                          </td>
                          <td className="border p-2 text-right font-mono font-semibold">
                            {formatCurrency(inv.total)}
                          </td>
                          <td className="border p-2">{formatDate(inv.paid_at)}</td>
                          <td className="border p-2 text-center">
                            <StatusBadge status={inv.status} />
                          </td>
                          <td className="border p-2 text-center">
                            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Scarica PDF">
                              <Download className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DemoPage>
  )
}
