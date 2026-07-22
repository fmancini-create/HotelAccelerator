"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { Download, Search, Pencil, Trash2, Loader2, Building2, Upload as UploadIcon, Receipt, Plus, Link2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
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
import { PAYMENT_METHODS, paymentMethodLabel } from "@/lib/payments/methods"
import { ManualPaymentsDialog } from "@/components/superadmin/manual-payments-dialog"
import { ImportStatementDialog } from "@/components/superadmin/import-statement-dialog"
import { RegisterPaymentsDialog } from "@/components/superadmin/register-payments-dialog"

interface Hotel {
  id: string
  name: string
}

type Origin = "manual" | "bank_import" | "invoice"

interface Payment {
  id: string
  payment_date: string
  hotel_id: string | null
  organization_name: string | null
  amount: number
  payment_method: string | null
  reference: string | null
  notes: string | null
  source: string
  bank_sender: string | null
  created_at: string
  hotels?: { id: string; name: string } | null
  origin: Origin
  // presenti solo per origin === "invoice"
  invoice_id?: string | null
  invoice_number?: string | null
  invoice_status?: string | null
  invoice_total?: number | null
  is_backfill?: boolean
}

const FREE = "__free__"

function fmtEur(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n)
}
function fmtDate(d: string) {
  if (!d) return "—"
  const [y, m, day] = d.split("-")
  return `${day}/${m}/${y}`
}
/** Converte "1.250,50" / "1250.50" / "1250,50" in numero. */
function parseAmount(v: string): number {
  let c = v.replace(/[€$\s]/g, "").trim()
  if (c.includes(",") && c.includes(".")) c = c.replace(/\./g, "").replace(",", ".")
  else if (c.includes(",")) c = c.replace(",", ".")
  const n = Number.parseFloat(c)
  return Number.isFinite(n) ? n : 0
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function PaymentsRegistryManager({ hotels }: { hotels: Hotel[] }) {
  const [hotelId, setHotelId] = useState("all")
  const [method, setMethod] = useState("all")
  const [origin, setOrigin] = useState("all")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(t)
  }, [search])

  const query = useMemo(() => {
    const p = new URLSearchParams()
    if (hotelId !== "all") p.set("hotelId", hotelId)
    if (method !== "all") p.set("method", method)
    if (origin !== "all") p.set("origin", origin)
    if (from) p.set("from", from)
    if (to) p.set("to", to)
    if (debouncedSearch.trim()) p.set("search", debouncedSearch.trim())
    return p.toString()
  }, [hotelId, method, origin, from, to, debouncedSearch])

  const { data, isLoading, mutate } = useSWR<{ payments: Payment[] }>(
    `/api/superadmin/payments${query ? `?${query}` : ""}`,
    fetcher,
  )
  const payments = data?.payments ?? []
  const total = payments.reduce((s, p) => s + Number(p.amount || 0), 0)

  const refresh = useCallback(() => mutate(), [mutate])

  // --- "Aggiungi su fattura" + "Associa a fattura": entrambi hanno bisogno
  // dell'elenco fatture, caricato solo quando serve. ---
  const [addingInvoice, setAddingInvoice] = useState(false)
  const [linking, setLinking] = useState<Payment | null>(null)
  const needInvoices = addingInvoice || !!linking
  const { data: invoicesData, mutate: mutateInvoices } = useSWR<{
    invoices: { id: string; invoice_number: string; hotel_id: string; total: number | null; paid_amount: number | null; status: string }[]
  }>(needInvoices ? "/api/superadmin/invoices" : null, fetcher)
  useEffect(() => {
    if (needInvoices) mutateInvoices()
  }, [needInvoices, mutateInvoices])

  // --- edit state ---
  const [editing, setEditing] = useState<Payment | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Payment | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function saveEdit(form: EditForm) {
    if (!editing) return
    setEditSaving(true)
    try {
      let res: Response
      if (editing.origin === "invoice") {
        // Pagamento collegato a una fattura: si modificano solo data,
        // importo e note; il saldo fattura viene ricalcolato dal trigger.
        res = await fetch(`/api/superadmin/invoice-payments/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: parseAmount(form.amount),
            paymentDate: form.payment_date,
            notes: form.notes.trim() || null,
          }),
        })
      } else {
        const isHotel = form.hotelId !== FREE && form.hotelId !== ""
        res = await fetch("/api/superadmin/payments", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editing.id,
            payment_date: form.payment_date,
            hotel_id: isHotel ? form.hotelId : null,
            organization_name: isHotel ? (hotels.find((h) => h.id === form.hotelId)?.name ?? null) : form.organization_name,
            amount: form.amount,
            payment_method: form.payment_method,
            reference: form.reference,
            notes: form.notes.trim() || null,
          }),
        })
      }
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || "Errore aggiornamento")
      toast.success("Pagamento aggiornato")
      setEditing(null)
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore aggiornamento")
    } finally {
      setEditSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const url =
        deleteTarget.origin === "invoice"
          ? `/api/superadmin/invoice-payments/${deleteTarget.id}`
          : `/api/superadmin/payments?id=${deleteTarget.id}`
      const res = await fetch(url, { method: "DELETE" })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || "Errore eliminazione")
      toast.success("Pagamento eliminato")
      setDeleteTarget(null)
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore eliminazione")
    } finally {
      setDeleting(false)
    }
  }

  const [linkSaving, setLinkSaving] = useState(false)
  async function confirmLink(invoiceId: string) {
    if (!linking) return
    setLinkSaving(true)
    try {
      const res = await fetch("/api/superadmin/payments/link-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId: linking.id, invoiceId }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || "Errore associazione")
      toast.success(
        d.invoice?.status === "paid"
          ? `Associato: fattura ${d.invoice?.invoice_number ?? ""} saldata`
          : "Pagamento associato alla fattura",
      )
      setLinking(null)
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore associazione")
    } finally {
      setLinkSaving(false)
    }
  }

  function exportCsv() {
    if (!payments.length) {
      toast.info("Nessun pagamento da esportare")
      return
    }
    const headers = ["Data", "Struttura/Organizzazione", "Importo", "Modalità", "Riferimento", "Mittente", "Origine"]
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
    const lines = payments.map((p) =>
      [
        fmtDate(p.payment_date),
        p.hotels?.name ?? p.organization_name ?? "",
        String(p.amount).replace(".", ","),
        paymentMethodLabel(p.payment_method),
        p.reference ?? "",
        p.bank_sender ?? "",
        p.source === "bank_import" ? "Estratto conto" : "Manuale",
      ]
        .map((c) => escape(String(c)))
        .join(";"),
    )
    const csv = [headers.map(escape).join(";"), ...lines].join("\n")
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `registro-pagamenti-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <ManualPaymentsDialog hotels={hotels} onSaved={refresh} />
          <ImportStatementDialog hotels={hotels} onSaved={refresh} />
          <Button variant="outline" className="bg-transparent" onClick={() => setAddingInvoice(true)}>
            <Receipt className="h-4 w-4" />
            Aggiungi su fattura
          </Button>
        </div>
        <Button variant="outline" className="bg-transparent" onClick={exportCsv} disabled={!payments.length}>
          <Download className="h-4 w-4" />
          Esporta CSV
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <Label className="text-xs text-muted-foreground">Cerca</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Organizzazione, riferimento, mittente…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 pl-8"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Struttura</Label>
            <Select value={hotelId} onValueChange={setHotelId}>
              <SelectTrigger className="h-9">
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
            <Label className="text-xs text-muted-foreground">Origine</Label>
            <Select value={origin} onValueChange={setOrigin}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte</SelectItem>
                <SelectItem value="manual">Manuale</SelectItem>
                <SelectItem value="bank_import">Estratto conto</SelectItem>
                <SelectItem value="invoice">Fattura</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Modalità</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte</SelectItem>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Dal</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Al</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="flex items-center justify-between rounded-md border bg-muted/40 px-4 py-2 text-sm">
        <span className="text-muted-foreground">
          {payments.length} pagament{payments.length === 1 ? "o" : "i"}
        </span>
        <span className="font-semibold">Totale: {fmtEur(total)}</span>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Struttura / Organizzazione</TableHead>
                <TableHead className="text-right">Importo</TableHead>
                <TableHead>Modalità</TableHead>
                <TableHead>Riferimento</TableHead>
                <TableHead>Origine</TableHead>
                <TableHead className="w-[90px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : payments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    Nessun pagamento registrato. Inserisci un pagamento o importa un estratto conto.
                  </TableCell>
                </TableRow>
              ) : (
                payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap">{fmtDate(p.payment_date)}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5">
                        {p.hotel_id && <Building2 className="h-3.5 w-3.5 text-muted-foreground" />}
                        {p.hotels?.name ?? p.organization_name ?? "—"}
                      </span>
                      {p.bank_sender && !p.hotels?.name && (
                        <p className="text-xs text-muted-foreground">da {p.bank_sender}</p>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-medium">{fmtEur(Number(p.amount))}</TableCell>
                    <TableCell>{p.payment_method ? paymentMethodLabel(p.payment_method) : "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.origin === "invoice" && p.invoice_number ? `Fatt. ${p.invoice_number}` : p.reference ?? "—"}
                    </TableCell>
                    <TableCell>
                      <OriginBadge origin={p.origin} isBackfill={p.is_backfill} />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {p.origin !== "invoice" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-primary"
                            onClick={() => setLinking(p)}
                            aria-label="Associa a fattura"
                            title="Associa a una fattura"
                          >
                            <Link2 className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setEditing(p)}
                          aria-label="Modifica"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteTarget(p)}
                          aria-label="Elimina"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit dialog */}
      {editing && (
        <EditPaymentDialog
          payment={editing}
          hotels={hotels}
          saving={editSaving}
          onClose={() => setEditing(null)}
          onSave={saveEdit}
        />
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il pagamento?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.origin === "invoice"
                ? "Il pagamento è collegato a una fattura: eliminandolo il saldo della fattura verrà ricalcolato automaticamente. L'operazione non è reversibile."
                : "L'operazione non è reversibile e rimuoverà il pagamento dal registro."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                confirmDelete()
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Aggiungi pagamento su fattura (riusa il dialog del sistema fatture) */}
      <RegisterPaymentsDialog
        open={addingInvoice}
        onOpenChange={setAddingInvoice}
        hotels={hotels}
        invoices={invoicesData?.invoices ?? []}
        onAllDone={() => {
          refresh()
          mutateInvoices()
        }}
      />

      {/* Associa un pagamento libero a una fattura esistente */}
      {linking && (
        <LinkInvoiceDialog
          payment={linking}
          hotels={hotels}
          invoices={invoicesData?.invoices ?? []}
          invoicesLoading={!invoicesData}
          saving={linkSaving}
          onClose={() => setLinking(null)}
          onConfirm={confirmLink}
        />
      )}
    </div>
  )
}

function LinkInvoiceDialog({
  payment,
  hotels,
  invoices,
  invoicesLoading,
  saving,
  onClose,
  onConfirm,
}: {
  payment: Payment
  hotels: Hotel[]
  invoices: { id: string; invoice_number: string; hotel_id: string; total: number | null; paid_amount: number | null; status: string }[]
  invoicesLoading: boolean
  saving: boolean
  onClose: () => void
  onConfirm: (invoiceId: string) => void
}) {
  const [search, setSearch] = useState("")
  const [selectedId, setSelectedId] = useState<string>("")
  const hotelMap = useMemo(() => new Map(hotels.map((h) => [h.id, h.name])), [hotels])

  const list = useMemo(() => {
    const term = search.trim().toLowerCase()
    return invoices
      .filter((inv) => {
        if (inv.status === "cancelled") return false
        // Suggerisci prima le fatture della stessa struttura del pagamento
        if (!term) return true
        const hotelName = (hotelMap.get(inv.hotel_id) || "").toLowerCase()
        return (inv.invoice_number || "").toLowerCase().includes(term) || hotelName.includes(term)
      })
      .map((inv) => {
        const residual = Math.max(0, Number(inv.total || 0) - Number(inv.paid_amount || 0))
        const sameHotel = !!payment.hotel_id && inv.hotel_id === payment.hotel_id
        return { ...inv, residual, sameHotel }
      })
      .sort((a, b) => {
        // Stessa struttura prima, poi residuo > 0 prima, poi per numero
        if (a.sameHotel !== b.sameHotel) return a.sameHotel ? -1 : 1
        const ar = a.residual > 0.005 ? 0 : 1
        const br = b.residual > 0.005 ? 0 : 1
        if (ar !== br) return ar - br
        return (a.invoice_number || "").localeCompare(b.invoice_number || "", "it", { numeric: true })
      })
  }, [invoices, search, hotelMap, payment.hotel_id])

  const payTarget = payment.hotels?.name ?? payment.organization_name ?? "—"

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Associa pagamento a una fattura</DialogTitle>
          <DialogDescription>
            Pagamento di <strong>{fmtEur(Number(payment.amount))}</strong> del {fmtDate(payment.payment_date)} —{" "}
            {payTarget}. Selezionando una fattura, l&apos;importo verrà registrato su di essa e lo scoperto
            ricalcolato automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca per numero o struttura..."
            className="pl-8"
          />
        </div>

        <div className="max-h-[45vh] overflow-y-auto rounded-md border">
          {invoicesLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Caricamento fatture...
            </div>
          ) : list.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Nessuna fattura trovata.</div>
          ) : (
            <ul className="divide-y">
              {list.map((inv) => {
                const selected = selectedId === inv.id
                return (
                  <li key={inv.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(inv.id)}
                      className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors ${
                        selected ? "bg-primary/10" : "hover:bg-muted/50"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 font-medium">
                          {inv.invoice_number || "(senza numero)"}
                          {inv.sameHotel && (
                            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                              stessa struttura
                            </Badge>
                          )}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {hotelMap.get(inv.hotel_id) || "—"}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="tabular-nums">{fmtEur(Number(inv.total || 0))}</div>
                        <div
                          className={`text-xs tabular-nums ${
                            inv.residual > 0.005 ? "text-amber-600" : "text-emerald-600"
                          }`}
                        >
                          {inv.residual > 0.005 ? `Residuo ${fmtEur(inv.residual)}` : "Saldata"}
                        </div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Annulla
          </Button>
          <Button onClick={() => selectedId && onConfirm(selectedId)} disabled={!selectedId || saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Associa pagamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function OriginBadge({ origin, isBackfill }: { origin: Origin; isBackfill?: boolean }) {
  if (origin === "invoice") {
    return (
      <span className="inline-flex items-center gap-1">
        <Badge variant="default" className="gap-1 bg-sky-600 hover:bg-sky-600">
          <Receipt className="h-3 w-3" />
          Fattura
        </Badge>
        {isBackfill && (
          <Badge variant="outline" className="text-[10px]">
            Backfill
          </Badge>
        )}
      </span>
    )
  }
  if (origin === "bank_import") {
    return (
      <Badge variant="secondary" className="gap-1">
        <UploadIcon className="h-3 w-3" />
        Estratto
      </Badge>
    )
  }
  return <Badge variant="outline">Manuale</Badge>
}

interface EditForm {
  payment_date: string
  hotelId: string
  organization_name: string
  amount: string
  payment_method: string
  reference: string
  notes: string
}

function EditPaymentDialog({
  payment,
  hotels,
  saving,
  onClose,
  onSave,
}: {
  payment: Payment
  hotels: Hotel[]
  saving: boolean
  onClose: () => void
  onSave: (f: EditForm) => void
}) {
  const isInvoice = payment.origin === "invoice"
  const [form, setForm] = useState<EditForm>({
    payment_date: payment.payment_date,
    hotelId: payment.hotel_id ?? FREE,
    organization_name: payment.hotel_id ? "" : payment.organization_name ?? "",
    amount: String(payment.amount).replace(".", ","),
    payment_method: payment.payment_method ?? "bonifico",
    reference: payment.reference ?? "",
    notes: payment.notes ?? "",
  })
  const set = (patch: Partial<EditForm>) => setForm((p) => ({ ...p, ...patch }))
  const freeText = form.hotelId === FREE

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Modifica pagamento</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {isInvoice && (
            <div className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Pagamento collegato alla fattura <strong>{payment.invoice_number || "—"}</strong>
              {payment.organization_name ? ` · ${payment.organization_name}` : ""}. Puoi modificare data,
              importo e note: struttura e riferimento derivano dalla fattura.
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Data</Label>
              <Input type="date" value={form.payment_date} onChange={(e) => set({ payment_date: e.target.value })} className="h-9" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Importo €</Label>
              <Input inputMode="decimal" value={form.amount} onChange={(e) => set({ amount: e.target.value })} className="h-9" />
            </div>
          </div>
          {!isInvoice && (
            <>
              <div>
                <Label className="text-xs text-muted-foreground">Struttura / Organizzazione</Label>
                <Select value={form.hotelId} onValueChange={(v) => set({ hotelId: v })}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={FREE}>Testo libero…</SelectItem>
                    {hotels.map((h) => (
                      <SelectItem key={h.id} value={h.id}>
                        {h.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {freeText && (
                  <Input
                    placeholder="Nome organizzazione"
                    value={form.organization_name}
                    onChange={(e) => set({ organization_name: e.target.value })}
                    className="mt-1 h-9"
                  />
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Modalità</Label>
                  <Select value={form.payment_method} onValueChange={(v) => set({ payment_method: v })}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Riferimento</Label>
                  <Input value={form.reference} onChange={(e) => set({ reference: e.target.value })} className="h-9" />
                </div>
              </div>
            </>
          )}
          <div>
            <Label className="text-xs text-muted-foreground">Note</Label>
            <Textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Annulla
          </Button>
          <Button onClick={() => onSave(form)} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salva modifiche
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
