"use client"

import { useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import { Card } from "@/components/ui/card"
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ArrowRight, Building2, Coins, TrendingUp, Users, ChevronRight, X, Sparkles, PlayCircle, Plug } from "lucide-react"
import { TodayTasksWidget } from "@/components/sales/today-tasks-widget"
import { PmsIntegrationsShowcase } from "@/components/pms/pms-integrations-showcase"
import type { PmsPublicGroups } from "@/lib/pms-public-catalog"

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json())

type DashboardData = {
  profile: { first_name?: string; last_name?: string; email?: string; role: string } | null
  sales_agent: {
    id: string
    display_name: string | null
    email: string | null
    is_active: boolean
    default_commission_percentage: number | null
  } | null
  kpi: {
    hotels_total: number
    hotels_active: number
    mrr_total_eur: number
    commission_month_eur: number
  } | null
  hotels: Array<{
    hotel_id: string
    hotel_name: string
    is_active: boolean
    lead_status: string
    commission_percentage: number | null
    activated_at: string | null
    notes: string | null
    commissions: {
      total_eur: number
      earned_eur: number
      paid_eur: number
    }
    subscription: {
      plan: string
      status: string
      amount_eur: number
      billing_period: string | null
      last_payment_at: string | null
    } | null
    permissions: {
      view_subscription: boolean
      view_payments: boolean
      view_metrics: boolean
      view_full_dashboard: boolean
    }
  }>
  message?: string
}

type CommissionEntry = {
  id: string
  hotel_id: string
  hotel_name: string
  period_year: number
  period_month: number
  period_start: string
  base_amount_eur: number
  commission_percentage: number
  amount_eur: number
  status: "accrued" | "earned" | "paid" | "voided"
  accrued_at: string | null
  earned_at: string | null
  paid_at: string | null
}

type CommissionsData = {
  kpi: {
    total_paid_eur: number
    total_earned_eur: number
    total_accrued_eur: number
  }
  ledger: CommissionEntry[]
}

export function SalesDashboardClient() {
  const [selectedHotel, setSelectedHotel] = useState<{
    hotel_id: string
    hotel_name: string
  } | null>(null)

  const { data, isLoading, error } = useSWR<DashboardData>("/api/sales/dashboard", fetcher, {
    revalidateOnFocus: false,
  })

  // Fetch commissioni per l'hotel selezionato
  const { data: commData, isLoading: commLoading } = useSWR<CommissionsData>(
    selectedHotel ? `/api/sales/commissions?hotel_id=${selectedHotel.hotel_id}` : null,
    fetcher,
    { revalidateOnFocus: false },
  )

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-7xl px-6 py-10">
        <div className="text-muted-foreground">Caricamento dashboard...</div>
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="container mx-auto max-w-7xl px-6 py-10">
        <div className="text-destructive">Errore caricamento dashboard.</div>
      </div>
    )
  }

  // Caso: profilo ruolo sales_agent ma senza riga in sales_agents (non
  // ancora configurato dal superadmin). Mostriamo onboarding informativo.
  if (!data.sales_agent) {
    return (
      <div className="container mx-auto max-w-3xl px-6 py-16">
        <Card className="p-8">
          <h2 className="text-xl font-semibold mb-2">Profilo venditore in attesa di attivazione</h2>
          <p className="text-muted-foreground">
            Il tuo account venditore non e&apos; ancora stato configurato dal team SANTADDEO. Una
            volta attivato, qui troverai le tue strutture, lo stato degli abbonamenti e le
            commissioni maturate.
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            Per assistenza scrivici a{" "}
            <a href="mailto:info@santaddeo.com" className="underline">
              info@santaddeo.com
            </a>
            .
          </p>
        </Card>
      </div>
    )
  }

  const { kpi, hotels, sales_agent } = data

  return (
    <div className="container mx-auto max-w-7xl px-6 py-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Ciao {sales_agent.display_name ?? "Venditore"}</h2>
          <p className="text-sm text-muted-foreground">
            Ecco le tue strutture e l&apos;andamento delle commissioni.
          </p>
        </div>
        <Link
          href="/sales/leads/new"
          className="inline-flex items-center gap-2 rounded-md bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700 transition-colors"
        >
          Invia nuovo lead <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard
          icon={Building2}
          label="Strutture totali"
          value={kpi?.hotels_total ?? 0}
          tone="slate"
        />
        <KpiCard
          icon={Users}
          label="Strutture attive"
          value={kpi?.hotels_active ?? 0}
          tone="emerald"
        />
        <KpiCard
          icon={TrendingUp}
          label="MRR portafoglio"
          sublabel="Ricavi Mensili Ricorrenti"
          value={`€ ${formatEuro(kpi?.mrr_total_eur ?? 0)}`}
          tone="blue"
        />
        <KpiCard
          icon={Coins}
          label="Commissioni mese corrente"
          value={`€ ${formatEuro(kpi?.commission_month_eur ?? 0)}`}
          tone="amber"
        />
      </div>

      {/* Cosa fare oggi (promemoria / task scadenti) */}
      <div className="mb-8">
        <TodayTasksWidget />
      </div>

      {/* Modalita' Demo: vetrina navigabile per mostrare il prodotto ai prospect */}
      <Link
        href="/demo"
        className="group block mb-8 rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-amber-50 p-5 lg:p-6 hover:shadow-md transition-shadow"
      >
        <div className="flex items-center gap-4 lg:gap-6">
          <div className="flex-shrink-0 inline-flex h-12 w-12 lg:h-14 lg:w-14 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
            <PlayCircle className="h-6 w-6 lg:h-7 lg:w-7" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-base lg:text-lg">Modalita&apos; Demo</h3>
              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border border-amber-200 gap-1">
                <Sparkles className="h-3 w-3" />
                Novita&apos;
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Naviga la piattaforma SANTADDEO con un hotel demo. Ogni pagina si presenta
              da sola con un popup descrittivo e una voce narrante: perfetto per le
              presentazioni alle strutture.
            </p>
          </div>
          <ArrowRight className="h-5 w-5 text-emerald-700 flex-shrink-0 group-hover:translate-x-1 transition-transform" />
        </div>
      </Link>

      {/* PMS integrati: utile in fase di vendita per rispondere "vi collegate
          col mio gestionale?". Verde = connessione gia' attiva. */}
      <PmsIntegrations />

      {/* Tabella */}
      <Card className="overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Le tue strutture</h3>
            <p className="text-xs text-muted-foreground">
              I dati visibili dipendono dai permessi configurati per ogni struttura.
            </p>
          </div>
        </div>
        {hotels.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <p>Non hai ancora strutture associate.</p>
            <Link
              href="/sales/leads/new"
              className="mt-4 inline-flex items-center gap-2 text-sm text-emerald-700 hover:underline"
            >
              Invia il tuo primo lead <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Struttura</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead>Abbonamento</TableHead>
                  <TableHead className="text-right">Importo</TableHead>
                  <TableHead className="text-right">Commiss. %</TableHead>
                  <TableHead>Ultimo pagamento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hotels.map((h) => (
                  <TableRow
                    key={h.hotel_id}
                    onClick={() => setSelectedHotel({ hotel_id: h.hotel_id, hotel_name: h.hotel_name })}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <TableCell className="font-medium">
                      {/* Il nome porta all'AREA della struttura (note, attività,
                          file, dati). Il resto della riga apre il dettaglio
                          commissioni. stopPropagation per non innescare entrambi. */}
                      <Link
                        href={`/sales/revman/${h.hotel_id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-2 text-emerald-700 hover:underline"
                      >
                        {h.hotel_name}
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </TableCell>
                    <TableCell>
                      <LeadStatusBadge status={h.lead_status} />
                    </TableCell>
                    <TableCell>
                      {h.permissions.view_subscription ? (
                        h.subscription ? (
                          <span className="text-sm">
                            {h.subscription.plan}{" "}
                            <span className="text-muted-foreground">
                              ({h.subscription.status})
                            </span>
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Nessun abbonamento</span>
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground italic">non visibile</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {h.permissions.view_subscription && h.subscription ? (
                        h.subscription.plan === "commission" ? (
                          // Piano commissione: mostra le commissioni totali maturate
                          <span className="text-sm">
                            € {formatEuro(h.commissions.total_eur)}
                            <span className="text-xs text-muted-foreground"> totali</span>
                          </span>
                        ) : (
                          // Piano fixed_fee: mostra il canone mensile
                          <span className="text-sm">
                            € {formatEuro(h.subscription.amount_eur ?? 0)}
                            <span className="text-xs text-muted-foreground">
                              {" "}
                              / {shortPeriod(h.subscription.billing_period)}
                            </span>
                          </span>
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {h.commission_percentage != null ? (
                        <span className="text-sm font-semibold text-emerald-700">
                          {h.commission_percentage}%
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {h.permissions.view_payments && h.subscription?.last_payment_at ? (
                        <span className="text-sm">
                          {new Date(h.subscription.last_payment_at).toLocaleDateString("it-IT")}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Dialog dettaglio commissioni struttura */}
      <Dialog open={!!selectedHotel} onOpenChange={(open) => !open && setSelectedHotel(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-emerald-600" />
              {selectedHotel?.hotel_name}
            </DialogTitle>
          </DialogHeader>

          {commLoading ? (
            <div className="py-8 text-center text-muted-foreground">Caricamento commissioni...</div>
          ) : !commData?.ledger?.length ? (
            <div className="py-8 text-center text-muted-foreground space-y-4">
              <p>Nessuna commissione registrata per questa struttura.</p>
              {selectedHotel && (
                <Link
                  href={`/sales/revman/${selectedHotel.hotel_id}`}
                  className="inline-flex items-center gap-2 rounded-md bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700 transition-colors"
                >
                  Apri l&apos;area della struttura <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-hidden flex flex-col gap-4">
              {/* KPI della struttura */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border bg-amber-50 p-3">
                  <div className="text-xs text-amber-700 font-medium">Maturate</div>
                  <div className="text-lg font-bold text-amber-900">
                    € {formatEuro(commData.kpi.total_accrued_eur)}
                  </div>
                  <div className="text-[10px] text-amber-600">In attesa pagamento tenant</div>
                </div>
                <div className="rounded-lg border bg-blue-50 p-3">
                  <div className="text-xs text-blue-700 font-medium">Liquidabili</div>
                  <div className="text-lg font-bold text-blue-900">
                    € {formatEuro(commData.kpi.total_earned_eur)}
                  </div>
                  <div className="text-[10px] text-blue-600">Pronte per il bonifico</div>
                </div>
                <div className="rounded-lg border bg-emerald-50 p-3">
                  <div className="text-xs text-emerald-700 font-medium">Liquidate</div>
                  <div className="text-lg font-bold text-emerald-900">
                    € {formatEuro(commData.kpi.total_paid_eur)}
                  </div>
                  <div className="text-[10px] text-emerald-600">Gia&apos; incassate</div>
                </div>
              </div>

              {/* Tabella commissioni */}
              <div className="flex-1 overflow-y-auto border rounded-lg">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead>Periodo</TableHead>
                      <TableHead className="text-right">Base fattura</TableHead>
                      <TableHead className="text-right">%</TableHead>
                      <TableHead className="text-right">Commissione</TableHead>
                      <TableHead>Stato</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {commData.ledger.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="text-sm">
                          {monthName(c.period_month)} {c.period_year}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          € {formatEuro(c.base_amount_eur)}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium text-emerald-700">
                          {c.commission_percentage}%
                        </TableCell>
                        <TableCell className="text-right text-sm font-semibold">
                          € {formatEuro(c.amount_eur)}
                        </TableCell>
                        <TableCell>
                          <CommissionStatusBadge status={c.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function KpiCard({
  icon: Icon,
  label,
  sublabel,
  value,
  tone,
}: {
  icon: any
  label: string
  sublabel?: string
  value: string | number
  tone: "slate" | "emerald" | "blue" | "amber"
}) {
  // Mappa esplicita per Tailwind JIT (non usare template literal con variabili
  // tone, le classi devono essere statiche per essere generate).
  const toneClasses: Record<string, string> = {
    slate: "bg-slate-50 text-slate-700",
    emerald: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
  }
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <div className={`inline-flex rounded-lg p-2 ${toneClasses[tone]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
      {sublabel && <div className="text-[10px] text-muted-foreground/70">{sublabel}</div>}
    </Card>
  )
}

function LeadStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
    invited: { label: "Invitato", variant: "outline" },
    registered: { label: "Registrato", variant: "secondary" },
    configured: { label: "Configurato", variant: "secondary" },
    active: { label: "Attivo", variant: "default" },
    suspended: { label: "Sospeso", variant: "outline" },
    churned: { label: "Disattivato", variant: "outline" },
  }
  const cfg = map[status] ?? { label: status, variant: "outline" as const }
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>
}

function formatEuro(n: number) {
  return new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    n,
  )
}
function shortPeriod(p: string | null) {
  if (p === "yearly") return "anno"
  if (p === "quarterly") return "trim"
  return "mese"
}

function CommissionStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    accrued: { label: "Maturata", className: "bg-amber-100 text-amber-800 border-amber-200" },
    earned: { label: "Liquidabile", className: "bg-blue-100 text-blue-800 border-blue-200" },
    paid: { label: "Liquidata", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    voided: { label: "Annullata", className: "bg-gray-100 text-gray-600 border-gray-200" },
  }
  const cfg = map[status] ?? { label: status, className: "bg-gray-100 text-gray-600" }
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}

function monthName(m: number) {
  const names = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"]
  return names[m - 1] ?? m
}

// Elenco PMS/gestionali con cui SANTADDEO si integra. I dati arrivano dal DB
// (tabella pms_public_catalog, via /api/pms-catalog), fonte unica condivisa con
// la pagina pubblica /integrazioni e il superadmin. Nota: NON nominiamo i
// connettori intermedi, qui contano solo i nomi dei gestionali lato cliente.
function PmsIntegrations() {
  const { data, isLoading } = useSWR("/api/pms-catalog", fetcher)
  const groups = data?.groups as PmsPublicGroups | undefined
  const hasData =
    !!groups && (groups.connected.length > 0 || groups.certifying.length > 0 || groups.upcoming.length > 0)

  return (
    <Card className="overflow-hidden mb-8">
      <div className="px-6 py-4 border-b border-border flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
          <Plug className="h-4 w-4" />
        </span>
        <div>
          <h3 className="font-semibold">Gestionali (PMS) integrati</h3>
          <p className="text-xs text-muted-foreground">
            Verifica subito se il gestionale della struttura è già collegabile.
          </p>
        </div>
      </div>

      <div className="p-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Caricamento gestionali…</p>
        ) : hasData ? (
          <PmsIntegrationsShowcase groups={groups} />
        ) : (
          <p className="text-sm text-muted-foreground">Elenco gestionali non disponibile al momento.</p>
        )}
      </div>
    </Card>
  )
}
