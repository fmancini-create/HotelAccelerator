"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, Pencil, Trash2, Loader2, Plus } from "lucide-react"
import { toast } from "sonner"
import { RegisterPaymentsDialog } from "./register-payments-dialog"

interface Hotel {
  id: string
  name: string
}

interface PaymentRow {
  id: string
  amount: number
  payment_date: string
  notes: string | null
  is_backfill: boolean
  created_at: string
  invoice: {
    id: string
    invoice_number: string | null
    total: number | null
    status: string
    hotel_id: string
    hotel: { id: string; name: string | null } | null
  } | null
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function fmtEuro(n: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function fmtDate(d: string) {
  if (!d) return ""
  // payment_date is YYYY-MM-DD, render dd/mm/yyyy
  const [y, m, day] = d.split("-")
  if (!y || !m || !day) return d
  return `${day}/${m}/${y}`
}

export function PaymentsManager({ hotels }: { hotels: Hotel[] }) {
  const [hotelFilter, setHotelFilter] = useState<string>("all")
  const [from, setFrom] = useState<string>("")
  const [to, setTo] = useState<string>("")
  const [search, setSearch] = useState("")
  const [hideBackfill, setHideBackfill] = useState(false)

  const [editing, setEditing] = useState<PaymentRow | null>(null)
  const [deleting, setDeleting] = useState<PaymentRow | null>(null)
  // 19/05/2026: dialog per AGGIUNGERE nuovi pagamenti. Riusa
  // RegisterPaymentsDialog (gia' utilizzato dal tab Fatture) cosi la UX
  // e' identica e tutta la logica di matching/CSV/multi-fattura sta in
  // un solo posto.
  const [adding, setAdding] = useState(false)
  // Lista fatture necessaria al picker del dialog. La carichiamo SOLO
  // quando l'utente apre il dialog, non al primo render del manager.
  const { data: invoicesData, mutate: mutateInvoices } = useSWR<{
    invoices: { id: string; invoice_number: string; hotel_id: string; total: number | null; paid_amount: number | null; status: string }[]
  }>(adding ? "/api/superadmin/invoices" : null, fetcher)
  // Quando il dialog si apre la prima volta, forza un refresh per avere
  // i paid_amount aggiornati (potrebbero essere cambiati da un altro tab).
  useEffect(() => {
    if (adding) mutateInvoices()
  }, [adding, mutateInvoices])

  const queryUrl = useMemo(() => {
    const p = new URLSearchParams()
    if (hotelFilter !== "all") p.set("hotelId", hotelFilter)
    if (from) p.set("from", from)
    if (to) p.set("to", to)
    if (hideBackfill) p.set("includeBackfill", "0")
    if (search) p.set("search", search)
    const qs = p.toString()
    return `/api/superadmin/invoice-payments${qs ? `?${qs}` : ""}`
  }, [hotelFilter, from, to, hideBackfill, search])

  const { data, isLoading, mutate } = useSWR<{
    payments: PaymentRow[]
    count: number
    totalAmount: number
  }>(queryUrl, fetcher)

  const payments = data?.payments || []

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle>Pagamenti</CardTitle>
            <CardDescription>
              Cronologia di tutti i pagamenti registrati sulle fatture. Modifica
              o cancellazione di un pagamento ricalcola automaticamente il saldo
              della fattura.
            </CardDescription>
          </div>
          <Button onClick={() => setAdding(true)} className="shrink-0">
            <Plus className="h-4 w-4 mr-2" />
            Aggiungi pagamento
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filtri */}
          <div className="grid gap-3 md:grid-cols-5">
            <div className="md:col-span-2">
              <Label className="text-xs">Cerca (n. fattura o struttura)</Label>
              <div className="relative mt-1">
                <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Es. 15/2025 o Tenuta Massabò"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Struttura</Label>
              <Select value={hotelFilter} onValueChange={setHotelFilter}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte</SelectItem>
                  {hotels.map((h) => (
                    <SelectItem key={h.id} value={h.id}>
                      {h.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Dal</Label>
              <Input
                type="date"
                className="mt-1"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Al</Label>
              <Input
                type="date"
                className="mt-1"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="hide-backfill"
              checked={hideBackfill}
              onChange={(e) => setHideBackfill(e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="hide-backfill" className="text-sm font-normal cursor-pointer">
              Nascondi pagamenti di backfill (importati automaticamente dallo
              storico)
            </Label>
          </div>

          {/* Riepilogo */}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">
                Pagamenti nel filtro
              </div>
              <div className="text-2xl font-semibold mt-1">
                {data?.count ?? 0}
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">
                Totale incassato
              </div>
              <div className="text-2xl font-semibold mt-1">
                {fmtEuro(data?.totalAmount ?? 0)}
              </div>
            </div>
          </div>

          {/* Tabella */}
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Data</TableHead>
                  <TableHead>Fattura</TableHead>
                  <TableHead>Struttura</TableHead>
                  <TableHead className="text-right">Importo</TableHead>
                  <TableHead className="text-right">Tot. fattura</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="w-24 text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                      Caricamento...
                    </TableCell>
                  </TableRow>
                ) : payments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Nessun pagamento trovato
                    </TableCell>
                  </TableRow>
                ) : (
                  payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-sm">
                        {fmtDate(p.payment_date)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {p.invoice?.invoice_number || (
                          <span className="text-muted-foreground italic">
                            (senza numero)
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {p.invoice?.hotel?.name || (
                          <span className="text-muted-foreground italic">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {fmtEuro(Number(p.amount || 0))}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">
                        {p.invoice?.total
                          ? fmtEuro(Number(p.invoice.total))
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 items-start">
                          {p.invoice?.status === "paid" ? (
                            <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600">
                              Pagata
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Da pagare</Badge>
                          )}
                          {p.is_backfill && (
                            <Badge variant="outline" className="text-xs">
                              Backfill
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                        {p.notes || ""}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setEditing(p)}
                            aria-label="Modifica pagamento"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setDeleting(p)}
                            aria-label="Elimina pagamento"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <EditPaymentDialog
        payment={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          mutate()
        }}
      />

      <RegisterPaymentsDialog
        open={adding}
        onOpenChange={setAdding}
        hotels={hotels}
        invoices={invoicesData?.invoices ?? []}
        onAllDone={() => {
          // Ricarica la cronologia pagamenti subito dopo il salvataggio
          // (anche parziale: il dialog mostra le righe in errore).
          mutate()
          mutateInvoices()
        }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il pagamento?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && (
                <>
                  Stai per eliminare il pagamento di{" "}
                  <strong>{fmtEuro(Number(deleting.amount))}</strong> del{" "}
                  <strong>{fmtDate(deleting.payment_date)}</strong> sulla fattura{" "}
                  <strong>{deleting.invoice?.invoice_number || "—"}</strong>{" "}
                  ({deleting.invoice?.hotel?.name || "—"}).<br />
                  Il saldo della fattura verrà ricalcolato automaticamente.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleting) return
                const id = deleting.id
                setDeleting(null)
                const res = await fetch(`/api/superadmin/invoice-payments/${id}`, {
                  method: "DELETE",
                })
                const json = await res.json().catch(() => ({}))
                if (!res.ok) {
                  toast.error(json?.error || "Errore eliminazione")
                  return
                }
                toast.success("Pagamento eliminato")
                mutate()
              }}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function EditPaymentDialog({
  payment,
  onClose,
  onSaved,
}: {
  payment: PaymentRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const [amount, setAmount] = useState("")
  const [paymentDate, setPaymentDate] = useState("")
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // sync state with payment prop
  useMemo(() => {
    if (payment) {
      setAmount(String(payment.amount).replace(".", ","))
      setPaymentDate(payment.payment_date)
      setNotes(payment.notes || "")
    }
  }, [payment])

  async function save() {
    if (!payment) return
    const a = Number(amount.replace(",", "."))
    if (!Number.isFinite(a) || a <= 0) {
      toast.error("Importo non valido")
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
      toast.error("Data non valida")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/superadmin/invoice-payments/${payment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: a,
          paymentDate,
          notes: notes.trim() || null,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json?.error || "Errore aggiornamento")
        return
      }
      toast.success("Pagamento aggiornato")
      onSaved()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={!!payment} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifica pagamento</DialogTitle>
          <DialogDescription>
            {payment && (
              <>
                Fattura <strong>{payment.invoice?.invoice_number || "—"}</strong>{" "}
                · {payment.invoice?.hotel?.name || "—"}
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Data pagamento</Label>
              <Input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Importo (€)</Label>
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="es. 1500,00"
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Note (opzionale)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1"
            />
          </div>
          {payment?.is_backfill && (
            <div className="text-xs text-muted-foreground rounded-md border border-dashed p-2">
              Questo è un pagamento di backfill creato automaticamente dallo
              storico delle fatture. Modificarlo è sicuro: il saldo della
              fattura viene ricalcolato.
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Annulla
          </Button>
          <Button onClick={save} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
