"use client"

/**
 * Tool superadmin per la gestione del ledger commissioni venditori.
 *
 * Funzionalita':
 *  - Filtri: venditore, hotel, stato, anno, mese
 *  - KPI per stato (maturate, liquidabili, liquidate, annullate) con totale €
 *  - Tabella con selezione multipla per liquidazione in batch
 *  - Azioni per riga: segna pagata, void, dettaglio fattura collegata
 *  - Bulk-pay: paga tutte le righe selezionate (con dati bonifico opzionali)
 *
 * Sicurezza: pagina protetta lato server (page.tsx). Tutte le mutation
 * passano dalle API in /api/superadmin/sales-commissions/.
 */

import { useMemo, useState } from "react"
import Link from "next/link"
import useSWR, { mutate as swrMutate } from "swr"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ArrowLeft, BadgeCheck, Ban, CircleDollarSign, Clock, HandCoins, ExternalLink } from "lucide-react"
import { toast } from "sonner"

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json())

type LedgerRow = {
  id: string
  sales_agent_id: string
  hotel_id: string
  invoice_id: string | null
  period_year: number
  period_month: number
  base_amount_eur: number
  commission_percentage: number
  commission_basis: string
  amount_eur: number
  status: "accrued" | "earned" | "paid" | "voided"
  accrued_at: string | null
  earned_at: string | null
  paid_at: string | null
  voided_at: string | null
  voided_reason: string | null
  payment_method: string | null
  payment_reference: string | null
  notes: string | null
  sales_agents: { display_name: string | null; email: string | null } | null
  hotels: { name: string } | null
  invoices: {
    invoice_number: string | null
    status: string | null
    total: number | null
    paid_at: string | null
    due_date: string | null
    issue_date: string | null
  } | null
}

type Totals = Record<"accrued" | "earned" | "paid" | "voided", { count: number; amount: number }>

type AgentOpt = {
  id: string
  display_name: string | null
  email?: string | null
  profiles?: { email?: string | null } | null
}
type HotelOpt = { id: string; name: string }

export function CommissionsManagerClient() {
  const [filters, setFilters] = useState({
    agentId: "all",
    hotelId: "all",
    status: "all",
    year: String(new Date().getUTCFullYear()),
    month: "all",
  })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [payDialog, setPayDialog] = useState<{ ids: string[] } | null>(null)
  const [voidRow, setVoidRow] = useState<LedgerRow | null>(null)
  const [deleteRow, setDeleteRow] = useState<LedgerRow | null>(null)

  // Build querystring
  const qs = useMemo(() => {
    const p = new URLSearchParams()
    if (filters.agentId !== "all") p.set("agentId", filters.agentId)
    if (filters.hotelId !== "all") p.set("hotelId", filters.hotelId)
    if (filters.status !== "all") p.set("status", filters.status)
    if (filters.year) p.set("year", filters.year)
    if (filters.month !== "all") p.set("month", filters.month)
    const s = p.toString()
    return s ? `?${s}` : ""
  }, [filters])

  const { data, isLoading } = useSWR<{ ledger: LedgerRow[]; totals: Totals }>(
    `/api/superadmin/sales-commissions/ledger${qs}`,
    fetcher,
    { revalidateOnFocus: false },
  )
  const { data: agentsData } = useSWR<{ agents: AgentOpt[] }>("/api/superadmin/sales/agents", fetcher)
  const { data: hotelsData } = useSWR<{ hotels: HotelOpt[] }>("/api/hotels", fetcher)

  const ledger = data?.ledger ?? []
  const totals = data?.totals ?? {
    accrued: { count: 0, amount: 0 },
    earned: { count: 0, amount: 0 },
    paid: { count: 0, amount: 0 },
    voided: { count: 0, amount: 0 },
  }

  const reloadAll = () => swrMutate((k) => typeof k === "string" && k.startsWith("/api/superadmin/sales-commissions"))

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  // Selezionabili = solo righe "earned" (liquidabili) o "accrued" (con override)
  const selectableIds = ledger.filter((r) => r.status === "earned" || r.status === "accrued").map((r) => r.id)
  const toggleSelectAll = () => {
    if (selected.size === selectableIds.length && selectableIds.length > 0) {
      setSelected(new Set())
    } else {
      setSelected(new Set(selectableIds))
    }
  }

  return (
    <div className="container max-w-7xl mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/superadmin/sales"
            className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1 mb-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Torna ai venditori
          </Link>
          <h1 className="text-2xl font-bold">Commissioni venditori</h1>
          <p className="text-sm text-muted-foreground">
            Gestione ledger e ciclo di pagamento (maturata → liquidabile → liquidata).
          </p>
        </div>
        <div className="flex gap-2">
          <BackfillButton onDone={reloadAll} />
          <Button
            disabled={selected.size === 0}
            onClick={() => setPayDialog({ ids: Array.from(selected) })}
          >
            <HandCoins className="h-4 w-4 mr-2" />
            Liquida selezionate ({selected.size})
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Maturate"
          subtitle="Fattura emessa, tenant non ha pagato"
          tone="slate"
          icon={Clock}
          total={totals.accrued}
        />
        <KpiCard
          label="Liquidabili"
          subtitle="Tenant ha pagato, bonifico da fare"
          tone="amber"
          icon={HandCoins}
          total={totals.earned}
        />
        <KpiCard
          label="Liquidate"
          subtitle="Bonifico al venditore eseguito"
          tone="emerald"
          icon={BadgeCheck}
          total={totals.paid}
        />
        <KpiCard
          label="Annullate"
          subtitle="Storno / fattura cancellata"
          tone="rose"
          icon={Ban}
          total={totals.voided}
        />
      </div>

      {/* Filtri */}
      <Card>
        <CardContent className="py-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <FilterSelect
              label="Venditore"
              value={filters.agentId}
              onChange={(v) => setFilters({ ...filters, agentId: v })}
              options={[
                { value: "all", label: "Tutti" },
                ...(agentsData?.agents ?? []).map((a) => ({
                  value: a.id,
                  label: a.display_name || a.profiles?.email || a.email || a.id.slice(0, 8),
                })),
              ]}
            />
            <FilterSelect
              label="Struttura"
              value={filters.hotelId}
              onChange={(v) => setFilters({ ...filters, hotelId: v })}
              options={[
                { value: "all", label: "Tutte" },
                ...(hotelsData?.hotels ?? []).map((h) => ({ value: h.id, label: h.name })),
              ]}
            />
            <FilterSelect
              label="Stato"
              value={filters.status}
              onChange={(v) => setFilters({ ...filters, status: v })}
              options={[
                { value: "all", label: "Tutti" },
                { value: "accrued", label: "Maturate" },
                { value: "earned", label: "Liquidabili" },
                { value: "paid", label: "Liquidate" },
                { value: "voided", label: "Annullate" },
              ]}
            />
            <FilterSelect
              label="Anno"
              value={filters.year}
              onChange={(v) => setFilters({ ...filters, year: v })}
              options={yearOptions()}
            />
            <FilterSelect
              label="Mese"
              value={filters.month}
              onChange={(v) => setFilters({ ...filters, month: v })}
              options={[
                { value: "all", label: "Tutti" },
                ...Array.from({ length: 12 }, (_, i) => ({
                  value: String(i + 1),
                  label: new Date(2000, i, 1).toLocaleDateString("it-IT", { month: "long" }),
                })),
              ]}
            />
          </div>
        </CardContent>
      </Card>

      {/* Tabella */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Caricamento…</div>
          ) : ledger.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <p className="font-medium">Nessuna riga corrisponde ai filtri.</p>
              <p className="text-xs mt-1">
                Le righe vengono create automaticamente all&apos;emissione delle fatture.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selected.size > 0 && selected.size === selectableIds.length}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Seleziona tutte le righe liquidabili"
                      />
                    </TableHead>
                    <TableHead>Periodo</TableHead>
                    <TableHead>Venditore</TableHead>
                    <TableHead>Struttura</TableHead>
                    <TableHead>Fattura</TableHead>
                    <TableHead className="text-right">Base</TableHead>
                    <TableHead className="text-right">%</TableHead>
                    <TableHead className="text-right">Commissione</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead className="w-24">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledger.map((r) => {
                    const canSelect = r.status === "accrued" || r.status === "earned"
                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          {canSelect && (
                            <Checkbox
                              checked={selected.has(r.id)}
                              onCheckedChange={() => toggleSelect(r.id)}
                              aria-label="Seleziona riga"
                            />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          {monthLabel(r.period_year, r.period_month)}
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/superadmin/sales/${r.sales_agent_id}`}
                            className="hover:underline"
                          >
                            {r.sales_agents?.display_name || r.sales_agents?.email || "—"}
                          </Link>
                        </TableCell>
                        <TableCell>{r.hotels?.name ?? "—"}</TableCell>
                        <TableCell className="text-xs">
                          {r.invoices ? (
                            <div className="flex flex-col">
                              <span className="font-medium">
                                {r.invoices.invoice_number || "(senza n.)"}
                              </span>
                              <span className="text-muted-foreground">
                                tot € {formatEuro(Number(r.invoices.total || 0))} ·{" "}
                                <InvoiceStatusBadge status={r.invoices.status} />
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          € {formatEuro(r.base_amount_eur)}
                        </TableCell>
                        <TableCell className="text-right text-sm">{r.commission_percentage}%</TableCell>
                        <TableCell className="text-right font-semibold">
                          € {formatEuro(r.amount_eur)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={r.status} />
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {dateLabel(r)}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs max-w-[160px] truncate">
                          {r.voided_reason || r.notes || ""}
                        </TableCell>
                        <TableCell>
                          <RowActions
                            row={r}
                            onPay={() => setPayDialog({ ids: [r.id] })}
                            onVoid={() => setVoidRow(r)}
                            onUnpay={async () => {
                              await fetch(`/api/superadmin/sales-commissions/ledger/${r.id}`, {
                                method: "PATCH",
                                headers: { "content-type": "application/json" },
                                body: JSON.stringify({ action: "unpay" }),
                              })
                              await reloadAll()
                            }}
                            onDelete={() => setDeleteRow(r)}
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog Liquida */}
      <PayDialog
        ids={payDialog?.ids ?? []}
        open={!!payDialog}
        onClose={() => setPayDialog(null)}
        onDone={async () => {
          setPayDialog(null)
          setSelected(new Set())
          await reloadAll()
        }}
      />

      {/* Dialog Delete */}
      <AlertDialog open={!!deleteRow} onOpenChange={(o) => !o && setDeleteRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina commissione</AlertDialogTitle>
            <AlertDialogDescription>
              Stai per eliminare definitivamente questa riga dal ledger.
              {deleteRow && (
                <span className="block mt-2 font-medium">
                  {deleteRow.hotels?.name} - {monthLabel(deleteRow.period_year, deleteRow.period_month)} - € {formatEuro(deleteRow.amount_eur)}
                </span>
              )}
              <span className="block mt-2 text-destructive">Questa azione non puo essere annullata.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleteRow) return
                const res = await fetch(`/api/superadmin/sales-commissions/ledger/${deleteRow.id}`, {
                  method: "DELETE",
                })
                if (res.ok) {
                  toast.success("Commissione eliminata")
                  setDeleteRow(null)
                  await reloadAll()
                } else {
                  const j = await res.json().catch(() => ({}))
                  toast.error(j.error || "Errore eliminazione")
                }
              }}
            >
              Elimina definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog Void */}
      <AlertDialog open={!!voidRow} onOpenChange={(o) => !o && setVoidRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annulla commissione</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione marca la commissione come &quot;annullata&quot;. La riga resta
              visibile a fini di audit ma non viene piu' conteggiata nei totali.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <VoidForm
            row={voidRow}
            onConfirm={async (reason) => {
              if (!voidRow) return
              const res = await fetch(`/api/superadmin/sales-commissions/ledger/${voidRow.id}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ action: "void", reason }),
              })
              if (res.ok) {
                toast.success("Commissione annullata")
                setVoidRow(null)
                await reloadAll()
              } else {
                const j = await res.json().catch(() => ({}))
                toast.error(j.error || "Errore annullamento")
              }
            }}
            onCancel={() => setVoidRow(null)}
          />
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/* ----------------------------------------------------------------------- */
function KpiCard({
  label,
  subtitle,
  total,
  tone,
  icon: Icon,
}: {
  label: string
  subtitle: string
  total: { count: number; amount: number }
  tone: "slate" | "amber" | "emerald" | "rose"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any
}) {
  const toneClasses: Record<string, string> = {
    slate: "bg-slate-50 text-slate-700",
    amber: "bg-amber-50 text-amber-700",
    emerald: "bg-emerald-50 text-emerald-700",
    rose: "bg-rose-50 text-rose-700",
  }
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className={`inline-flex rounded-lg p-2 ${toneClasses[tone]}`}>
            <Icon className="h-4 w-4" />
          </div>
          <Badge variant="outline" className="text-xs">
            {total.count} righe
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">€ {formatEuro(total.amount)}</div>
        <div className="text-xs font-medium mt-1">{label}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</div>
      </CardContent>
    </Card>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    accrued: { label: "Maturata", className: "bg-slate-100 text-slate-700 border-slate-200" },
    earned: { label: "Liquidabile", className: "bg-amber-100 text-amber-800 border-amber-200" },
    paid: { label: "Liquidata", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    voided: { label: "Annullata", className: "bg-rose-50 text-rose-700 border-rose-200" },
  }
  const cfg = map[status] ?? { label: status, className: "bg-muted" }
  return (
    <Badge variant="outline" className={cfg.className}>
      {cfg.label}
    </Badge>
  )
}

function InvoiceStatusBadge({ status }: { status: string | null }) {
  if (!status) return <span>—</span>
  const map: Record<string, string> = {
    paid: "text-emerald-700",
    pending: "text-amber-700",
    overdue: "text-rose-700",
    cancelled: "text-muted-foreground",
    draft: "text-muted-foreground",
  }
  return <span className={map[status] ?? ""}>{status}</span>
}

function RowActions({
  row,
  onPay,
  onVoid,
  onUnpay,
  onDelete,
}: {
  row: LedgerRow
  onPay: () => void
  onVoid: () => void
  onUnpay: () => void
  onDelete: () => void
}) {
  if (row.status === "paid") {
    return (
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" onClick={onUnpay} title="Annulla liquidazione (errore)">
          Annulla
        </Button>
      </div>
    )
  }
  if (row.status === "voided") {
    return (
      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={onDelete}>
        Elimina
      </Button>
    )
  }
  return (
    <div className="flex gap-1">
      <Button size="sm" variant="default" className="h-7 px-2 text-xs" onClick={onPay}>
        <CircleDollarSign className="h-3.5 w-3.5 mr-1" /> Paga
      </Button>
      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onVoid}>
        Void
      </Button>
    </div>
  )
}

function PayDialog({
  ids,
  open,
  onClose,
  onDone,
}: {
  ids: string[]
  open: boolean
  onClose: () => void
  onDone: () => void
}) {
  const [method, setMethod] = useState<string>("bonifico")
  const [reference, setReference] = useState<string>("")
  const [allowFromAccrued, setAllowFromAccrued] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!open) return null

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Liquidazione commissioni</DialogTitle>
          <DialogDescription>
            Stai per marcare {ids.length} {ids.length === 1 ? "riga" : "righe"} come liquidate.
            I venditori riceveranno una notifica.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label>Metodo di pagamento</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bonifico">Bonifico bancario</SelectItem>
                <SelectItem value="paypal">PayPal</SelectItem>
                <SelectItem value="cash">Contanti</SelectItem>
                <SelectItem value="other">Altro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="ref">Riferimento (opzionale)</Label>
            <Input
              id="ref"
              placeholder="es. CRO bonifico, n. transazione"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>

          <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200">
            <Checkbox
              id="allow-accrued"
              checked={allowFromAccrued}
              onCheckedChange={(v) => setAllowFromAccrued(!!v)}
            />
            <div>
              <Label htmlFor="allow-accrued" className="text-sm">
                Pagare anche commissioni &quot;maturate&quot; (tenant non ha ancora pagato)
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                Di default vengono pagate solo le righe &quot;liquidabili&quot; (tenant ha gia&apos;
                saldato la fattura). Attiva questa opzione solo se vuoi anticipare la liquidazione.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Annulla
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                const res = await fetch("/api/superadmin/sales-commissions/ledger/bulk-pay", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    ids,
                    paymentMethod: method,
                    paymentReference: reference || null,
                    allowFromAccrued,
                  }),
                })
                const j = await res.json()
                if (res.ok) {
                  toast.success(
                    `${j.paidCount} righe liquidate${j.skippedCount ? `, ${j.skippedCount} saltate` : ""}`,
                  )
                  onDone()
                } else {
                  toast.error(j.error || "Errore")
                }
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? "Liquidazione…" : "Conferma liquidazione"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function VoidForm({
  row,
  onConfirm,
  onCancel,
}: {
  row: LedgerRow | null
  onConfirm: (reason: string) => void
  onCancel: () => void
}) {
  const [reason, setReason] = useState("")
  if (!row) return null
  return (
    <>
      <div className="space-y-3 py-3">
        <div className="text-sm">
          <div>
            <span className="text-muted-foreground">Importo:</span>{" "}
            <strong>€ {formatEuro(row.amount_eur)}</strong>
          </div>
          <div>
            <span className="text-muted-foreground">Venditore:</span>{" "}
            {row.sales_agents?.display_name || row.sales_agents?.email || "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Struttura:</span> {row.hotels?.name || "—"}
          </div>
        </div>
        <div>
          <Label htmlFor="void-reason">Motivo (richiesto)</Label>
          <Input
            id="void-reason"
            placeholder="es. fattura cancellata, errore importo, ecc."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel onClick={onCancel}>Annulla</AlertDialogCancel>
        <AlertDialogAction onClick={() => onConfirm(reason)} disabled={!reason.trim()}>
          Conferma annullamento
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  )
}

/* ----------------------------------------------------------------------- */
function monthLabel(year: number, month: number) {
  const d = new Date(Date.UTC(year, Math.max(0, month - 1), 1))
  return d.toLocaleDateString("it-IT", { month: "short", year: "numeric" })
}
function dateLabel(r: LedgerRow): string {
  if (r.status === "paid" && r.paid_at) return `Liquidata ${dt(r.paid_at)}`
  if (r.status === "earned" && r.earned_at) return `Dal ${dt(r.earned_at)}`
  if (r.status === "voided" && r.voided_at) return `Annullata ${dt(r.voided_at)}`
  if (r.accrued_at) return `Maturata ${dt(r.accrued_at)}`
  return ""
}
function dt(iso: string) {
  return new Date(iso).toLocaleDateString("it-IT")
}
function formatEuro(n: number) {
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}
function yearOptions() {
  const cur = new Date().getUTCFullYear()
  const arr = []
  for (let y = cur + 1; y >= cur - 4; y--) arr.push({ value: String(y), label: String(y) })
  return arr
}

// keep import used
void ExternalLink

/* ----------------------------------------------------------------------- */
function BackfillButton({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{
    total_invoices: number
    already_in_ledger: number
    processed: number
    errors: number
  } | null>(null)

  async function run() {
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch("/api/superadmin/sales-commissions/backfill", {
        method: "POST",
        headers: { "content-type": "application/json" },
      })
      const data = await res.json()
      setResult(data)
      if (data.processed > 0) {
        toast.success(`Backfill completato: ${data.processed} commissioni create`)
        onDone()
      } else if (data.total_invoices === 0) {
        toast.info("Nessuna fattura con venditore associato trovata")
      } else {
        toast.info("Tutte le commissioni erano gia' presenti nel ledger")
      }
    } catch (e: any) {
      toast.error("Errore backfill: " + e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" onClick={run} disabled={busy}>
        {busy ? "Elaborazione..." : "Backfill commissioni"}
      </Button>
      {result && (
        <span className="text-xs text-muted-foreground">
          {result.processed}/{result.total_invoices} processate
        </span>
      )}
    </div>
  )
}
