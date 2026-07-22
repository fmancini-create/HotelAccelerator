"use client"

import { useState, useMemo, useEffect } from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Trash2, FileText, AlertCircle, CheckCircle2, Search, ListPlus } from "lucide-react"

type HotelOption = { id: string; name: string }

type InvoiceLite = {
  id: string
  invoice_number: string
  hotel_id: string
  total: number | null
  paid_amount: number | null
  status: string
}

type Row = {
  uid: string
  invoiceId: string // lock alla riga DB precisa, evita ambiguita' numero+struttura
  invoiceNumber: string
  hotelId: string
  hotelName: string
  total: number
  alreadyPaid: number
  paidAt: string
  amount: string
  result?: { ok: boolean; error?: string; newPaidAmount?: number; newStatus?: string }
}

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  hotels: HotelOption[]
  invoices: InvoiceLite[]
  onAllDone: () => void
}

const todayISO = () => new Date().toISOString().slice(0, 10)

function fmtEur(n: number | null | undefined) {
  if (n == null) return "-"
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n)
}

/**
 * Parse di una riga CSV/incollata. Supporta separatori , ; tab.
 * Formato atteso: invoiceNumber; hotelName; paidAt(YYYY-MM-DD o DD/MM/YYYY); amount
 * Con header opzionale (riga 1).
 */
function parseCsv(text: string): { invoiceNumber: string; hotelName: string; paidAt: string; amount: string }[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (lines.length === 0) return []

  const first = lines[0].toLowerCase()
  const startIdx = /numero|invoice|fattura|hotel|struttura|data|amount|importo/.test(first) ? 1 : 0

  const out: { invoiceNumber: string; hotelName: string; paidAt: string; amount: string }[] = []
  for (let i = startIdx; i < lines.length; i++) {
    const sep = lines[i].includes("\t") ? "\t" : lines[i].includes(";") ? ";" : ","
    const cells = lines[i].split(sep).map((c) => c.trim())
    if (cells.length < 4) continue
    const [num, hotel, dateRaw, amountRaw] = cells
    let paidAt = dateRaw
    const m = dateRaw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
    if (m) {
      const day = m[1].padStart(2, "0")
      const month = m[2].padStart(2, "0")
      const year = m[3].length === 2 ? `20${m[3]}` : m[3]
      paidAt = `${year}-${month}-${day}`
    }
    const amount = amountRaw.replace(/[€\s]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")
    out.push({ invoiceNumber: num, hotelName: hotel, paidAt, amount })
  }
  return out
}

export function RegisterPaymentsDialog({ open, onOpenChange, hotels, invoices, onAllDone }: Props) {
  const [tab, setTab] = useState<"manual" | "csv">("manual")
  const [rows, setRows] = useState<Row[]>([])
  const [csvText, setCsvText] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerSearch, setPickerSearch] = useState("")
  const [pickerHotelFilter, setPickerHotelFilter] = useState<string>("")

  const hotelMap = useMemo(() => new Map(hotels.map((h) => [h.id, h.name])), [hotels])

  // Reset on open/close
  useEffect(() => {
    if (open) {
      setTab("manual")
      setRows([])
      setCsvText("")
      setPickerSearch("")
      setPickerHotelFilter("")
    }
  }, [open])

  function updateRow(uid: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)))
  }
  function removeRow(uid: string) {
    setRows((prev) => prev.filter((r) => r.uid !== uid))
  }

  // Set degli invoice id gia' nella griglia, per disabilitarli nel picker
  const selectedIds = useMemo(() => new Set(rows.map((r) => r.invoiceId).filter(Boolean)), [rows])

  // Lista picker: solo fatture con saldo residuo > 0 (escluse "paid" gia' integralmente)
  const pickerInvoices = useMemo(() => {
    const term = pickerSearch.trim().toLowerCase()
    return invoices
      .filter((inv) => {
        const total = Number(inv.total || 0)
        const paid = Number(inv.paid_amount || 0)
        const residual = total - paid
        if (residual <= 0.005) return false
        if (pickerHotelFilter && inv.hotel_id !== pickerHotelFilter) return false
        if (!term) return true
        const hotelName = (hotelMap.get(inv.hotel_id) || "").toLowerCase()
        return (
          inv.invoice_number?.toLowerCase().includes(term) ||
          hotelName.includes(term)
        )
      })
      .sort((a, b) => {
        // Ordinamento: prima per struttura, poi per numero
        const ah = hotelMap.get(a.hotel_id) || ""
        const bh = hotelMap.get(b.hotel_id) || ""
        if (ah !== bh) return ah.localeCompare(bh, "it")
        return (a.invoice_number || "").localeCompare(b.invoice_number || "", "it", { numeric: true })
      })
  }, [invoices, pickerSearch, pickerHotelFilter, hotelMap])

  function addInvoicesToRows(invoiceIds: string[]) {
    const additions: Row[] = []
    for (const id of invoiceIds) {
      if (selectedIds.has(id)) continue
      const inv = invoices.find((x) => x.id === id)
      if (!inv) continue
      const total = Number(inv.total || 0)
      const paid = Number(inv.paid_amount || 0)
      const residual = Math.max(0, total - paid)
      additions.push({
        uid: crypto.randomUUID(),
        invoiceId: inv.id,
        invoiceNumber: inv.invoice_number,
        hotelId: inv.hotel_id,
        hotelName: hotelMap.get(inv.hotel_id) || "(struttura sconosciuta)",
        total,
        alreadyPaid: paid,
        paidAt: todayISO(),
        amount: residual > 0 ? residual.toFixed(2) : "",
      })
    }
    if (additions.length > 0) {
      setRows((prev) => [...prev, ...additions])
      toast.success(
        additions.length === 1
          ? "1 fattura aggiunta"
          : `${additions.length} fatture aggiunte`,
      )
    }
  }

  function loadCsv() {
    const parsed = parseCsv(csvText)
    if (parsed.length === 0) {
      toast.error("Nessuna riga riconosciuta nel CSV")
      return
    }
    let matched = 0
    let unmatched = 0
    const newRows: Row[] = []
    for (const p of parsed) {
      const hLc = p.hotelName.toLowerCase().trim()
      const matchedHotel =
        hotels.find((h) => h.name.toLowerCase() === hLc) ||
        hotels.find((h) => h.name.toLowerCase().includes(hLc) || hLc.includes(h.name.toLowerCase()))

      // Cerca la fattura corrispondente
      const inv = invoices.find(
        (x) =>
          x.invoice_number?.trim() === p.invoiceNumber.trim() &&
          (matchedHotel ? x.hotel_id === matchedHotel.id : true),
      )

      if (inv) {
        matched++
        const total = Number(inv.total || 0)
        const paid = Number(inv.paid_amount || 0)
        newRows.push({
          uid: crypto.randomUUID(),
          invoiceId: inv.id,
          invoiceNumber: inv.invoice_number,
          hotelId: inv.hotel_id,
          hotelName: hotelMap.get(inv.hotel_id) || "(struttura sconosciuta)",
          total,
          alreadyPaid: paid,
          paidAt: p.paidAt,
          amount: p.amount,
        })
      } else {
        unmatched++
      }
    }
    if (newRows.length === 0) {
      toast.error("Nessuna fattura corrispondente trovata in archivio")
      return
    }
    setRows((prev) => [...prev, ...newRows])
    setTab("manual")
    if (unmatched > 0) {
      toast.warning(`${matched} righe caricate. ${unmatched} righe scartate (fattura non trovata).`)
    } else {
      toast.success(`${matched} righe caricate. Verifica i dati e salva.`)
    }
    setCsvText("")
  }

  async function submit() {
    const valid = rows.map((r, idx) => ({ r, idx })).filter(({ r }) => !r.result?.ok)
    if (valid.length === 0) {
      onOpenChange(false)
      return
    }
    const payload = valid.map(({ r }) => ({
      invoiceId: r.invoiceId || null,
      invoiceNumber: r.invoiceNumber.trim(),
      hotelId: r.hotelId || null,
      paidAt: r.paidAt,
      amount: Number(String(r.amount).replace(",", ".")),
    }))

    setSubmitting(true)
    try {
      const res = await fetch("/api/superadmin/invoices/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payments: payload }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json?.error || "Errore registrazione pagamenti")
        return
      }
      const resultsByIdx = new Map<number, any>()
      for (const r of json.results as any[]) resultsByIdx.set(r.index, r)

      setRows((prev) =>
        prev.map((r) => {
          if (r.result?.ok) return r
          const idx = valid.findIndex((v) => v.r.uid === r.uid)
          if (idx === -1) return r
          const apiRes = resultsByIdx.get(idx)
          if (!apiRes) return r
          return {
            ...r,
            result: apiRes.success
              ? { ok: true, newPaidAmount: apiRes.newPaidAmount, newStatus: apiRes.newStatus }
              : { ok: false, error: apiRes.error },
          }
        }),
      )

      const ok = json.successCount ?? 0
      const ko = json.failureCount ?? 0
      if (ko === 0) {
        toast.success(`${ok} pagamenti registrati`)
        onAllDone()
        setTimeout(() => onOpenChange(false), 800)
      } else {
        toast.warning(`${ok} salvati, ${ko} falliti. Controlla le righe in rosso.`)
        onAllDone()
      }
    } catch (err: any) {
      toast.error(err?.message || "Errore di rete")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Registra pagamenti</DialogTitle>
          <DialogDescription>
            Seleziona una o pi&ugrave; fatture e applica un pagamento per ciascuna. Gli importi si sommano ai pagamenti
            gi&agrave; registrati (acconti); quando la somma raggiunge il totale, lo stato diventa &ldquo;Pagata&rdquo;.
          </DialogDescription>
        </DialogHeader>

        {/* Tab buttons */}
        <div className="flex gap-2 border-b">
          <button
            type="button"
            onClick={() => setTab("manual")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === "manual"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Selezione fatture
          </button>
          <button
            type="button"
            onClick={() => setTab("csv")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === "csv"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Incolla CSV
          </button>
        </div>

        {tab === "manual" ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="default" disabled={submitting}>
                    <ListPlus className="h-4 w-4 mr-2" />
                    Aggiungi fatture
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[560px] p-0" align="start">
                  <div className="p-3 border-b space-y-2">
                    <div className="relative">
                      <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground pointer-events-none" />
                      <Input
                        autoFocus
                        value={pickerSearch}
                        onChange={(e) => setPickerSearch(e.target.value)}
                        placeholder="Cerca per numero o struttura..."
                        className="pl-8 h-9"
                      />
                    </div>
                    <select
                      value={pickerHotelFilter}
                      onChange={(e) => setPickerHotelFilter(e.target.value)}
                      className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                    >
                      <option value="">Tutte le strutture</option>
                      {hotels.map((h) => (
                        <option key={h.id} value={h.id}>{h.name}</option>
                      ))}
                    </select>
                  </div>
                  <PickerList
                    invoices={pickerInvoices}
                    hotelMap={hotelMap}
                    excludedIds={selectedIds}
                    onConfirm={(ids) => {
                      addInvoicesToRows(ids)
                      setPickerOpen(false)
                    }}
                  />
                </PopoverContent>
              </Popover>
              <span className="text-xs text-muted-foreground">
                {rows.length === 0
                  ? "Nessuna fattura selezionata"
                  : rows.length === 1
                    ? "1 fattura selezionata"
                    : `${rows.length} fatture selezionate`}
              </span>
            </div>

            {rows.length === 0 ? (
              <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                Nessuna fattura selezionata. Clicca <strong>Aggiungi fatture</strong> per scegliere
                quelle a cui registrare un pagamento.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border max-h-[55vh]">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr className="border-b">
                      <th className="text-left p-2 font-medium min-w-[140px]">Numero</th>
                      <th className="text-left p-2 font-medium min-w-[200px]">Struttura</th>
                      <th className="text-right p-2 font-medium min-w-[100px]">Tot</th>
                      <th className="text-right p-2 font-medium min-w-[100px]">Gi&agrave; pagato</th>
                      <th className="text-left p-2 font-medium min-w-[140px]">Data pagamento</th>
                      <th className="text-right p-2 font-medium min-w-[120px]">Importo (&euro;)</th>
                      <th className="text-left p-2 font-medium min-w-[180px]">Esito</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const isDone = !!r.result?.ok
                      const residual = Math.max(0, r.total - r.alreadyPaid)
                      return (
                        <tr
                          key={r.uid}
                          className={`border-b ${
                            r.result?.ok
                              ? "bg-emerald-50/50"
                              : r.result?.error
                                ? "bg-destructive/5"
                                : ""
                          }`}
                        >
                          <td className="p-2 align-top font-medium">{r.invoiceNumber}</td>
                          <td className="p-2 align-top text-muted-foreground">{r.hotelName}</td>
                          <td className="p-2 align-top text-right tabular-nums">{fmtEur(r.total)}</td>
                          <td className="p-2 align-top text-right tabular-nums text-muted-foreground">
                            {fmtEur(r.alreadyPaid)}
                            {residual > 0 && (
                              <div className="text-[11px] text-amber-700">
                                Residuo {fmtEur(residual)}
                              </div>
                            )}
                          </td>
                          <td className="p-2 align-top">
                            <Input
                              type="date"
                              value={r.paidAt}
                              onChange={(e) => updateRow(r.uid, { paidAt: e.target.value })}
                              disabled={isDone || submitting}
                              className="h-8"
                            />
                          </td>
                          <td className="p-2 align-top text-right">
                            <Input
                              type="number"
                              step="0.01"
                              inputMode="decimal"
                              value={r.amount}
                              onChange={(e) => updateRow(r.uid, { amount: e.target.value })}
                              disabled={isDone || submitting}
                              className="h-8 text-right"
                            />
                          </td>
                          <td className="p-2 align-top text-xs">
                            {r.result?.ok ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Pagato {fmtEur(r.result.newPaidAmount)}
                                {r.result.newStatus === "paid" && " — saldata"}
                              </span>
                            ) : r.result?.error ? (
                              <span className="inline-flex items-start gap-1 text-destructive">
                                <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                                <span>{r.result.error}</span>
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="p-2 align-top">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeRow(r.uid)}
                              disabled={submitting}
                              aria-label="Rimuovi riga"
                              className="h-8 w-8"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Incolla qui i pagamenti (uno per riga)</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Formato: <code className="text-[11px]">numero;struttura;data;importo</code>. Separatori supportati:
                punto e virgola, virgola, tab. Date in formato <code>YYYY-MM-DD</code> o <code>DD/MM/YYYY</code>. La
                prima riga di intestazione viene ignorata se presente. Le righe con fattura non trovata in archivio
                vengono scartate.
              </p>
              <textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                rows={10}
                placeholder={"15/2025;Tenuta Massabò;18/05/2026;1600,00\n17/2025;Tenuta Massabò;18/05/2026;1000,00"}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              />
            </div>
            <div className="flex justify-end">
              <Button type="button" onClick={loadCsv} disabled={!csvText.trim() || submitting}>
                <FileText className="h-4 w-4 mr-2" /> Carica nella griglia
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Chiudi
          </Button>
          {tab === "manual" && (
            <Button
              onClick={submit}
              disabled={submitting || rows.length === 0 || rows.every((r) => r.result?.ok)}
            >
              {submitting ? "Salvataggio..." : "Salva pagamenti"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Lista checkbox per selezione multipla di fatture nel popover.
 * Stato locale isolato per evitare di propagare ad ogni toggle al parent.
 * Conferma con bottone "Aggiungi N fatture".
 */
function PickerList({
  invoices,
  hotelMap,
  excludedIds,
  onConfirm,
}: {
  invoices: InvoiceLite[]
  hotelMap: Map<string, string>
  excludedIds: Set<string>
  onConfirm: (ids: string[]) => void
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set())

  // Reset quando la lista filtrata cambia
  useEffect(() => {
    setChecked(new Set())
  }, [invoices])

  const visible = invoices.filter((inv) => !excludedIds.has(inv.id))
  const allChecked = visible.length > 0 && visible.every((i) => checked.has(i.id))
  const someChecked = visible.some((i) => checked.has(i.id))

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function toggleAll() {
    if (allChecked) {
      setChecked(new Set())
    } else {
      setChecked(new Set(visible.map((i) => i.id)))
    }
  }

  return (
    <div>
      {visible.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">
          Nessuna fattura con saldo residuo trovata.
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox
                checked={allChecked ? true : someChecked ? "indeterminate" : false}
                onCheckedChange={toggleAll}
              />
              <span>
                {allChecked ? "Deseleziona tutto" : "Seleziona tutte"} ({visible.length})
              </span>
            </label>
            <span className="text-xs text-muted-foreground">{checked.size} selezionate</span>
          </div>
          <div className="max-h-[320px] overflow-y-auto">
            {visible.map((inv) => {
              const total = Number(inv.total || 0)
              const paid = Number(inv.paid_amount || 0)
              const residual = Math.max(0, total - paid)
              const isChecked = checked.has(inv.id)
              return (
                <label
                  key={inv.id}
                  className="flex items-center gap-3 px-3 py-2 border-b last:border-b-0 hover:bg-muted/50 cursor-pointer"
                >
                  <Checkbox checked={isChecked} onCheckedChange={() => toggle(inv.id)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{inv.invoice_number || "(senza numero)"}</span>
                      {paid > 0 && (
                        <Badge variant="outline" className="text-[10px] py-0">acconto</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {hotelMap.get(inv.hotel_id) || "(struttura sconosciuta)"}
                    </div>
                  </div>
                  <div className="text-right text-xs tabular-nums">
                    <div>{fmtEur(total)}</div>
                    <div className="text-amber-700">Residuo {fmtEur(residual)}</div>
                  </div>
                </label>
              )
            })}
          </div>
        </>
      )}
      <div className="p-2 border-t flex justify-end">
        <Button
          type="button"
          size="sm"
          disabled={checked.size === 0}
          onClick={() => onConfirm(Array.from(checked))}
        >
          Aggiungi {checked.size > 0 ? `${checked.size} ` : ""}
          {checked.size === 1 ? "fattura" : "fatture"}
        </Button>
      </div>
    </div>
  )
}
