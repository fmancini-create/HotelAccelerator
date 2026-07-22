"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Upload, FileText, Pencil, Trash2, Search, Download, Loader2, Sparkles, Banknote } from "lucide-react"
import { toast } from "sonner"
import { BulkInvoiceUploadDialog } from "./bulk-invoice-upload-dialog"
import { RegisterPaymentsDialog } from "./register-payments-dialog"

interface Hotel {
  id: string
  name: string
}

interface InvoiceRow {
  id: string
  hotel_id: string
  organization_id: string | null
  invoice_number: string | null
  status: string
  plan_type: string | null
  issue_date: string | null
  period_start: string | null
  period_end: string | null
  subtotal: number | null
  tax: number | null
  total: number | null
  due_date: string | null
  paid_at: string | null
  paid_amount: number | null
  pdf_url: string | null
  pdf_file_name: string | null
  pdf_file_size: number | null
  notes: string | null
  created_at: string
  hotels?: { name: string } | null
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const STATUS_OPTIONS = [
  { value: "draft", label: "Bozza", color: "secondary" as const },
  { value: "pending", label: "Da pagare", color: "default" as const },
  { value: "paid", label: "Pagata", color: "secondary" as const },
  { value: "overdue", label: "Scaduta", color: "destructive" as const },
  { value: "cancelled", label: "Annullata", color: "outline" as const },
]

const PLAN_TYPE_OPTIONS = [
  { value: "commission", label: "Commissione" },
  { value: "fixed_fee", label: "Fee fissa" },
  { value: "setup", label: "Setup / Onboarding" },
  { value: "other", label: "Altro" },
]

function statusBadge(status: string) {
  const opt = STATUS_OPTIONS.find((s) => s.value === status)
  return (
    <Badge variant={opt?.color ?? "secondary"} className="capitalize">
      {opt?.label || status}
    </Badge>
  )
}

function formatEur(n: number | null | undefined) {
  if (n === null || n === undefined) return "-"
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n)
}

function formatDate(d: string | null | undefined) {
  if (!d) return "-"
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(d))
}

export function InvoicesManager({ hotels }: { hotels: Hotel[] }) {
  const [filterHotel, setFilterHotel] = useState<string>("all")
  const [filterYear, setFilterYear] = useState<string>(String(new Date().getFullYear()))
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [search, setSearch] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [showBulk, setShowBulk] = useState(false)
  const [showPayments, setShowPayments] = useState(false)
  const [editing, setEditing] = useState<InvoiceRow | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const queryKey = useMemo(() => {
    const params = new URLSearchParams()
    if (filterHotel !== "all") params.set("hotelId", filterHotel)
    if (filterYear !== "all") params.set("year", filterYear)
    return `/api/superadmin/invoices?${params.toString()}`
  }, [filterHotel, filterYear])

  const { data, error, isLoading, mutate } = useSWR<{ invoices: InvoiceRow[] }>(queryKey, fetcher)

  const filtered = useMemo(() => {
    const arr = data?.invoices ?? []
    return arr.filter((inv) => {
      if (filterStatus !== "all" && inv.status !== filterStatus) return false
      if (search) {
        const q = search.toLowerCase()
        const num = (inv.invoice_number || "").toLowerCase()
        const hot = (inv.hotels?.name || "").toLowerCase()
        if (!num.includes(q) && !hot.includes(q)) return false
      }
      return true
    })
  }, [data, filterStatus, search])

  // Helper: importo effettivamente pagato per una fattura.
  // Logica:
  //  - paid_amount valorizzato => quello (anche parziale)
  //  - paid_amount null e status='paid' => total (back-compat: pagamento totale)
  //  - status 'cancelled' => 0 (non incassata, non incide sul saldo)
  //  - altrimenti 0 (pending/overdue/draft)
  function paidValue(inv: InvoiceRow): number {
    if (inv.status === "cancelled") return 0
    if (inv.paid_amount != null) return Number(inv.paid_amount)
    if (inv.status === "paid") return Number(inv.total || 0)
    return 0
  }

  // Saldo progressivo: per ogni fattura, somma cumulativa di (total - paid)
  // ordinata per data emissione crescente. Calcoliamo due varianti:
  //   - per struttura: solo fatture dello stesso hotel
  //   - globale: tutte le fatture
  // Usiamo `data?.invoices` (non filtered) per essere coerenti col totale
  // dello scoperto, indipendentemente dai filtri della tabella.
  const balances = useMemo(() => {
    const all = data?.invoices ?? []
    // ordina per issue_date crescente (null in fondo)
    const sorted = [...all].sort((a, b) => {
      const da = a.issue_date || "9999-12-31"
      const db = b.issue_date || "9999-12-31"
      if (da !== db) return da < db ? -1 : 1
      return a.created_at < b.created_at ? -1 : 1
    })
    const perHotel = new Map<string, number>()
    let global = 0
    const byId = new Map<string, { perHotel: number; global: number }>()
    for (const inv of sorted) {
      const owed = Number(inv.total || 0) - paidValue(inv)
      if (inv.status === "cancelled") {
        // saldo non cambia
      } else {
        const prev = perHotel.get(inv.hotel_id) ?? 0
        perHotel.set(inv.hotel_id, prev + owed)
        global += owed
      }
      byId.set(inv.id, {
        perHotel: perHotel.get(inv.hotel_id) ?? 0,
        global,
      })
    }
    return byId
  }, [data])

  const totalsRow = useMemo(() => {
    let subtotal = 0
    let tax = 0
    let total = 0
    let paid = 0
    for (const inv of filtered) {
      subtotal += Number(inv.subtotal || 0)
      tax += Number(inv.tax || 0)
      total += Number(inv.total || 0)
      paid += paidValue(inv)
    }
    return { subtotal, tax, total, paid, owed: total - paid }
  }, [filtered])

  const years = useMemo(() => {
    const now = new Date().getFullYear()
    return [now + 1, now, now - 1, now - 2, now - 3].map(String)
  }, [])

  async function handleDelete() {
    if (!deletingId) return
    const id = deletingId
    setDeletingId(null)
    const res = await fetch(`/api/superadmin/invoices/${id}`, { method: "DELETE" })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(json?.error || "Errore eliminazione fattura")
      return
    }
    toast.success("Fattura eliminata")
    mutate()
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>Fatture</CardTitle>
            <CardDescription>
              Carica e gestisci le fatture per ogni struttura. Le fatture caricate sono visibili
              al tenant nella pagina &ldquo;Commissioni &amp; Fatture&rdquo;.
            </CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setShowPayments(true)}>
              <Banknote className="h-4 w-4 mr-2" /> Registra pagamenti
            </Button>
            <Button variant="outline" onClick={() => setShowBulk(true)}>
              <Upload className="h-4 w-4 mr-2" /> Carica multiple
            </Button>
            <Button onClick={() => { setEditing(null); setShowForm(true) }}>
              <Plus className="h-4 w-4 mr-2" /> Nuova fattura
            </Button>
          </div>
        </div>
      </CardHeader>

      <BulkInvoiceUploadDialog
        open={showBulk}
        onOpenChange={setShowBulk}
        hotels={hotels}
        onAllDone={() => mutate()}
      />

      <RegisterPaymentsDialog
        open={showPayments}
        onOpenChange={setShowPayments}
        hotels={hotels}
        invoices={(data?.invoices ?? []).map((inv) => ({
          id: inv.id,
          invoice_number: inv.invoice_number || "",
          hotel_id: inv.hotel_id,
          total: inv.total,
          paid_amount: inv.paid_amount,
          status: inv.status,
        }))}
        onAllDone={() => mutate()}
      />

      <CardContent className="space-y-4">
        {/* Filtri */}
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Struttura</Label>
            <Select value={filterHotel} onValueChange={setFilterHotel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte le strutture</SelectItem>
                {hotels.map((h) => (
                  <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Anno</Label>
            <Select value={filterYear} onValueChange={setFilterYear}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli anni</SelectItem>
                {years.map((y) => (
                  <SelectItem key={y} value={y}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Stato</Label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli stati</SelectItem>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Cerca</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Numero o hotel..."
                className="pl-8"
              />
            </div>
          </div>
        </div>

        {/* Riepilogo */}
        <div className="grid gap-3 md:grid-cols-5">
          <SummaryCard label="Totale fatture" value={String(filtered.length)} />
          <SummaryCard label="Imponibile" value={formatEur(totalsRow.subtotal)} />
          <SummaryCard label="IVA" value={formatEur(totalsRow.tax)} />
          <SummaryCard label="Totale (pagato)" value={`${formatEur(totalsRow.total)} (${formatEur(totalsRow.paid)})`} />
          <SummaryCard
            label="Scoperto"
            value={formatEur(totalsRow.owed)}
            highlight={totalsRow.owed > 0 ? "warning" : "ok"}
          />
        </div>

        {/* Tabella */}
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Numero</TableHead>
                <TableHead>Struttura</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Emessa</TableHead>
                <TableHead>Periodo</TableHead>
                <TableHead className="text-right">Imponibile</TableHead>
                <TableHead className="text-right">IVA</TableHead>
                <TableHead className="text-right">Totale</TableHead>
                <TableHead>Scadenza</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead className="text-right">Pagato</TableHead>
                <TableHead className="text-right" title="Scoperto progressivo per la stessa struttura, per data emissione">
                  Saldo struttura
                </TableHead>
                <TableHead className="text-right" title="Scoperto progressivo cumulativo su tutte le strutture">
                  Saldo globale
                </TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>PDF</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={16} className="text-center text-muted-foreground py-8">Caricamento...</TableCell></TableRow>
              )}
              {error && (
                <TableRow><TableCell colSpan={16} className="text-center text-destructive py-8">Errore caricamento fatture</TableCell></TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={16} className="text-center text-muted-foreground py-8">Nessuna fattura trovata con i filtri attuali.</TableCell></TableRow>
              )}
              {filtered.map((inv) => {
                const paid = paidValue(inv)
                const bal = balances.get(inv.id)
                const owed = Number(inv.total || 0) - paid
                const isPartial = inv.paid_amount != null && owed > 0.01 && paid > 0
                return (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.invoice_number || "-"}</TableCell>
                  <TableCell>{inv.hotels?.name || hotels.find(h => h.id === inv.hotel_id)?.name || "-"}</TableCell>
                  <TableCell>{PLAN_TYPE_OPTIONS.find(p => p.value === inv.plan_type)?.label || inv.plan_type || "-"}</TableCell>
                  <TableCell>{formatDate(inv.issue_date)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {inv.period_start ? `${formatDate(inv.period_start)} → ${formatDate(inv.period_end)}` : "-"}
                  </TableCell>
                  <TableCell className="text-right font-mono">{formatEur(inv.subtotal)}</TableCell>
                  <TableCell className="text-right font-mono">{formatEur(inv.tax)}</TableCell>
                  <TableCell className="text-right font-mono font-semibold">{formatEur(inv.total)}</TableCell>
                  <TableCell>{formatDate(inv.due_date)}</TableCell>
                  <TableCell className="text-xs">
                    {inv.paid_at ? (
                      <span>{formatDate(inv.paid_at)}</span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {paid > 0 ? (
                      <span className={isPartial ? "text-amber-600" : ""}>
                        {formatEur(paid)}
                        {isPartial && <span className="block text-[10px] text-muted-foreground">acconto</span>}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    <span className={bal && bal.perHotel > 0 ? "text-destructive" : "text-emerald-600"}>
                      {formatEur(bal?.perHotel ?? 0)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">
                    {formatEur(bal?.global ?? 0)}
                  </TableCell>
                  <TableCell>{statusBadge(inv.status)}</TableCell>
                  <TableCell>
                    {inv.pdf_url ? (
                      <a
                        href={`/api/superadmin/invoices/${inv.id}/download`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline text-xs"
                      >
                        <FileText className="h-3 w-3" /> apri
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(inv); setShowForm(true) }} aria-label="Modifica">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setDeletingId(inv.id)} aria-label="Elimina">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      {/* Dialog form */}
      <InvoiceFormDialog
        open={showForm}
        onClose={() => setShowForm(false)}
        hotels={hotels}
        editing={editing}
        onSaved={() => { setShowForm(false); mutate() }}
        defaultHotelId={filterHotel !== "all" ? filterHotel : undefined}
      />

      {/* Conferma eliminazione */}
      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare la fattura?</AlertDialogTitle>
            <AlertDialogDescription>
              Operazione irreversibile. Verra&apos; eliminata anche dall&apos;archivio del tenant
              e il PDF associato verra&apos; rimosso dallo storage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

function SummaryCard({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: "ok" | "warning"
}) {
  const valueClass =
    highlight === "warning"
      ? "text-destructive"
      : highlight === "ok"
        ? "text-emerald-600"
        : ""
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold mt-1 ${valueClass}`}>{value}</div>
    </div>
  )
}

function InvoiceFormDialog({
  open,
  onClose,
  hotels,
  editing,
  onSaved,
  defaultHotelId,
}: {
  open: boolean
  onClose: () => void
  hotels: Hotel[]
  editing: InvoiceRow | null
  onSaved: () => void
  defaultHotelId?: string
}) {
  const isEdit = !!editing
  const [submitting, setSubmitting] = useState(false)
  const [hotelId, setHotelId] = useState<string>("")
  const [invoiceNumber, setInvoiceNumber] = useState("")
  const [issueDate, setIssueDate] = useState("")
  const [periodStart, setPeriodStart] = useState("")
  const [periodEnd, setPeriodEnd] = useState("")
  const [subtotal, setSubtotal] = useState("")
  const [taxRate, setTaxRate] = useState("22")
  const [tax, setTax] = useState("")
  const [total, setTotal] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [paidAt, setPaidAt] = useState("")
  const [paidAmount, setPaidAmount] = useState("")
  const [status, setStatus] = useState("pending")
  const [planType, setPlanType] = useState<string>("commission")
  const [notes, setNotes] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [autoTotal, setAutoTotal] = useState(true)
  const [parsing, setParsing] = useState(false)
  const [parseDone, setParseDone] = useState(false)

  // Reset form quando si apre/cambia editing
  useEffect(() => {
    if (!open) return
    if (editing) {
      setHotelId(editing.hotel_id)
      setInvoiceNumber(editing.invoice_number || "")
      setIssueDate(editing.issue_date || "")
      setPeriodStart(editing.period_start || "")
      setPeriodEnd(editing.period_end || "")
      setSubtotal(editing.subtotal != null ? String(editing.subtotal) : "")
      setTax(editing.tax != null ? String(editing.tax) : "")
      setTotal(editing.total != null ? String(editing.total) : "")
      // deduco taxRate se possibile
      if (editing.subtotal && editing.tax) {
        setTaxRate(String(Math.round((Number(editing.tax) / Number(editing.subtotal)) * 100)))
      }
      setDueDate(editing.due_date || "")
      setPaidAt(editing.paid_at || "")
      setPaidAmount(editing.paid_amount != null ? String(editing.paid_amount) : "")
      setStatus(editing.status)
      setPlanType(editing.plan_type || "commission")
      setNotes(editing.notes || "")
      setFile(null)
      setAutoTotal(false)
    } else {
      setHotelId(defaultHotelId || "")
      setInvoiceNumber("")
      setIssueDate(new Date().toISOString().slice(0, 10))
      setPeriodStart("")
      setPeriodEnd("")
      setSubtotal("")
      setTaxRate("22")
      setTax("")
      setTotal("")
      setDueDate("")
      setPaidAt("")
      setPaidAmount("")
      setStatus("pending")
      setPlanType("commission")
      setNotes("")
      setFile(null)
      setAutoTotal(true)
      setParsing(false)
      setParseDone(false)
    }
  }, [open, editing, defaultHotelId])

  // Funzione per parsare il PDF con AI
  async function handleFileChange(f: File | null) {
    setFile(f)
    setParseDone(false)
    if (!f || f.type !== "application/pdf") return

    setParsing(true)
    try {
      const fd = new FormData()
      fd.append("file", f)
      const res = await fetch("/api/superadmin/invoices/parse-pdf", { 
        method: "POST", 
        body: fd,
        credentials: "include" 
      })
      const json = await res.json()

      if (res.ok && json.success) {
        const data = json.data
        // Popola i campi con i dati estratti (solo se vuoti o se utente non ha modificato)
        if (data.invoice_number && !invoiceNumber) setInvoiceNumber(data.invoice_number)
        if (data.issue_date && !issueDate) setIssueDate(data.issue_date)
        if (data.subtotal != null && !subtotal) {
          setSubtotal(String(data.subtotal))
          setAutoTotal(true)
        }
        if (data.tax_rate != null) setTaxRate(String(data.tax_rate))
        if (data.tax != null && !tax) setTax(String(data.tax))
        if (data.total != null && !total) setTotal(String(data.total))
        // Prova a matchare l'hotel dal customer_name
        if (data.customer_name && !hotelId) {
          const matched = hotels.find(h => 
            h.name.toLowerCase().includes(data.customer_name.toLowerCase()) ||
            data.customer_name.toLowerCase().includes(h.name.toLowerCase())
          )
          if (matched) setHotelId(matched.id)
        }
        setParseDone(true)
      }
    } catch {
      // Ignora errori di parsing, l'utente puo' compilare manualmente
    } finally {
      setParsing(false)
    }
  }

  // Auto-calcolo IVA + totale dal subtotal e dalla taxRate, finche' l'utente
  // non li modifica manualmente.
  useEffect(() => {
    if (!autoTotal) return
    const s = parseFloat(subtotal)
    const r = parseFloat(taxRate)
    if (!Number.isFinite(s)) return
    const t = Number.isFinite(r) ? +(s * r / 100).toFixed(2) : 0
    setTax(String(t))
    setTotal(String(+(s + t).toFixed(2)))
  }, [subtotal, taxRate, autoTotal])

  async function handleSubmit() {
    if (!hotelId) {
      toast.error("Seleziona una struttura")
      return
    }
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append("hotelId", hotelId)
      fd.append("invoiceNumber", invoiceNumber)
      fd.append("issueDate", issueDate)
      fd.append("periodStart", periodStart)
      fd.append("periodEnd", periodEnd)
      fd.append("subtotal", subtotal)
      fd.append("tax", tax)
      fd.append("total", total)
      fd.append("dueDate", dueDate)
      fd.append("paidAt", paidAt)
      fd.append("paidAmount", paidAmount)
      fd.append("status", status)
      fd.append("planType", planType)
      fd.append("notes", notes)
      if (file) fd.append("file", file)

      const url = isEdit ? `/api/superadmin/invoices/${editing!.id}` : "/api/superadmin/invoices"
      const method = isEdit ? "PATCH" : "POST"
      const res = await fetch(url, { method, body: fd })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json?.error || "Errore salvataggio")
      }
      toast.success(isEdit ? "Fattura aggiornata" : "Fattura creata")
      onSaved()
    } catch (err: any) {
      toast.error(err?.message || "Errore")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifica fattura" : "Nuova fattura"}</DialogTitle>
          <DialogDescription>
            Carica una fattura per una struttura. Il PDF (max 10MB) e&apos; opzionale ma
            consigliato. Una volta salvata, il tenant la vedra&apos; nella sua pagina
            &ldquo;Commissioni &amp; Fatture&rdquo;.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Struttura *">
              <Select value={hotelId} onValueChange={setHotelId} disabled={isEdit}>
                <SelectTrigger><SelectValue placeholder="Seleziona..." /></SelectTrigger>
                <SelectContent>
                  {hotels.map((h) => (
                    <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Numero fattura">
              <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="es. 2026/0001" />
            </Field>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Data emissione">
              <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </Field>
            <Field label="Periodo dal">
              <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </Field>
            <Field label="Periodo al">
              <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </Field>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Tipo voce">
              <Select value={planType} onValueChange={setPlanType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLAN_TYPE_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Stato">
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <Field label="Imponibile (€)">
              <Input
                type="number" step="0.01" inputMode="decimal"
                value={subtotal}
                onChange={(e) => { setSubtotal(e.target.value); setAutoTotal(true) }}
              />
            </Field>
            <Field label="IVA (%)">
              <Input
                type="number" step="0.01"
                value={taxRate}
                onChange={(e) => { setTaxRate(e.target.value); setAutoTotal(true) }}
              />
            </Field>
            <Field label="IVA (€)">
              <Input
                type="number" step="0.01"
                value={tax}
                onChange={(e) => { setTax(e.target.value); setAutoTotal(false) }}
              />
            </Field>
            <Field label="Totale (€)">
              <Input
                type="number" step="0.01"
                value={total}
                onChange={(e) => { setTotal(e.target.value); setAutoTotal(false) }}
                className="font-semibold"
              />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            IVA e Totale vengono calcolati automaticamente dall&apos;imponibile e dall&apos;aliquota.
            Modifica manualmente se necessario.
          </p>

          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Scadenza pagamento">
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
            <Field label="Data pagamento">
              <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            </Field>
            <Field label="Importo pagato (€)">
              <Input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                placeholder="Es. acconto 500,00"
              />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            Lascia vuoto l&apos;importo se la fattura e&apos; pagata in toto: viene assunto pari al Totale.
            Se inserisci un acconto (importo &lt; totale), lo stato resta &ldquo;Da pagare&rdquo; e il saldo progressivo riflette la differenza.
          </p>

          <Field label="Note interne">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Eventuali note (es. pagamento via bonifico, riferimento mese, ecc.)" />
          </Field>

          <Field label={isEdit && editing?.pdf_url ? "Sostituisci PDF (opzionale)" : "Allega PDF (auto-estrazione dati)"}>
            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept="application/pdf"
                onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                disabled={parsing}
              />
              {isEdit && editing?.pdf_url && !file && (
                <a
                  href={`/api/superadmin/invoices/${editing.id}/download`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline whitespace-nowrap"
                >
                  <Download className="h-3 w-3" /> PDF attuale
                </a>
              )}
            </div>
            {file && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                <Upload className="h-3 w-3" /> 
                <span>{file.name} ({Math.round(file.size / 1024)} KB)</span>
                {parsing && (
                  <span className="flex items-center gap-1 text-blue-600">
                    <Loader2 className="h-3 w-3 animate-spin" /> Analisi AI...
                  </span>
                )}
                {parseDone && (
                  <span className="flex items-center gap-1 text-amber-600">
                    <Sparkles className="h-3 w-3" /> Dati estratti
                  </span>
                )}
              </div>
            )}
            {!isEdit && (
              <p className="text-xs text-muted-foreground mt-1">
                Carica un PDF: numero, data, imponibile e IVA verranno estratti automaticamente.
              </p>
            )}
          </Field>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={onClose} disabled={submitting}>Annulla</Button>
          <Button onClick={handleSubmit} disabled={submitting || !hotelId}>
            {submitting ? "Salvataggio..." : (isEdit ? "Aggiorna" : "Crea fattura")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  )
}
