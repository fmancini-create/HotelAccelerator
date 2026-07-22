"use client"

import { useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Upload, Trash2, Plus, CheckCircle2, XCircle, FileText, Loader2, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface Hotel {
  id: string
  name: string
}

interface BulkRow {
  /** Identifier locale per react keys (immutabile) */
  uid: string
  file: File | null
  hotelId: string
  invoiceNumber: string
  issueDate: string
  subtotal: string
  taxRate: string
  tax: string
  total: string
  status: string
  planType: string
  notes: string
  paidAt: string
  paidAmount: string
  /** Stato dopo l'upload: undefined = not submitted, true = ok, string = errore */
  result?: { ok: true; invoiceId: string } | { ok: false; error: string }
  /** Stato parsing AI: "idle" | "parsing" | "done" | "error" */
  parseStatus?: "idle" | "parsing" | "done" | "error"
  /** Nome fornitore estratto (per matching hotel) */
  supplierName?: string
}

const STATUS_OPTIONS = [
  { value: "draft", label: "Bozza" },
  { value: "pending", label: "Da pagare" },
  { value: "paid", label: "Pagata" },
  { value: "overdue", label: "Scaduta" },
  { value: "cancelled", label: "Annullata" },
]

const PLAN_TYPE_OPTIONS = [
  { value: "commission", label: "Commissione" },
  { value: "fixed_fee", label: "Fee fissa" },
  { value: "setup", label: "Setup / Onboarding" },
  { value: "other", label: "Altro" },
]

function newUid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function emptyRow(file: File | null = null): BulkRow {
  return {
    uid: newUid(),
    file,
    hotelId: "",
    invoiceNumber: "",
    issueDate: new Date().toISOString().slice(0, 10),
    subtotal: "",
    taxRate: "22",
    tax: "",
    total: "",
    status: "pending",
    planType: "",
    notes: "",
    paidAt: "",
    paidAmount: "",
  }
}

export function BulkInvoiceUploadDialog({
  open,
  onOpenChange,
  hotels,
  onAllDone,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  hotels: Hotel[]
  onAllDone: () => void
}) {
  const [rows, setRows] = useState<BulkRow[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [defaultHotelId, setDefaultHotelId] = useState<string>("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const successCount = useMemo(() => rows.filter((r) => r.result?.ok === true).length, [rows])
  const failureCount = useMemo(() => rows.filter((r) => r.result && r.result.ok === false).length, [rows])
  const pending = useMemo(() => rows.filter((r) => !r.result).length, [rows])

  function resetAll() {
    setRows([])
    setSubmitting(false)
  }

  function handleClose(next: boolean) {
    // Se l'utente sta chiudendo durante il submit, blocchiamo.
    if (!next && submitting) return
    if (!next) resetAll()
    onOpenChange(next)
  }

  /**
   * Chiama l'API di parsing AI per estrarre i dati dal PDF
   */
  async function parsePdfWithAI(uid: string, file: File) {
    console.log("[v0] parsePdfWithAI called for:", uid, file.name)
    setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, parseStatus: "parsing" } : r)))

    try {
      const fd = new FormData()
      fd.append("file", file)
      console.log("[v0] Calling parse-pdf API...")
      const res = await fetch("/api/superadmin/invoices/parse-pdf", { 
        method: "POST", 
        body: fd,
        credentials: "include" // Importante: include cookies per autenticazione
      })
      const json = await res.json()
      console.log("[v0] parse-pdf response:", res.status, json)

      if (!res.ok || !json.success) {
        console.log("[v0] parse-pdf failed:", json)
        setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, parseStatus: "error" } : r)))
        return
      }

      const data = json.data as {
        invoice_number: string | null
        issue_date: string | null
        supplier_name: string | null
        customer_name: string | null
        subtotal: number | null
        tax_rate: number | null
        tax: number | null
        total: number | null
      }

      // Aggiorna la riga con i dati estratti
      setRows((prev) =>
        prev.map((r) => {
          if (r.uid !== uid) return r
          return {
            ...r,
            parseStatus: "done",
            invoiceNumber: data.invoice_number || r.invoiceNumber,
            issueDate: data.issue_date || r.issueDate,
            subtotal: data.subtotal != null ? String(data.subtotal) : r.subtotal,
            taxRate: data.tax_rate != null ? String(data.tax_rate) : r.taxRate,
            tax: data.tax != null ? String(data.tax) : r.tax,
            total: data.total != null ? String(data.total) : r.total,
            supplierName: data.supplier_name || undefined,
            // Prova a matchare l'hotel dal nome del cliente (chi riceve la fattura)
            hotelId: r.hotelId || tryMatchHotel(data.customer_name) || "",
          }
        })
      )
    } catch {
      setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, parseStatus: "error" } : r)))
    }
  }

  /**
   * Prova a matchare il nome cliente con uno degli hotel disponibili
   */
  function tryMatchHotel(name: string | null): string | undefined {
    if (!name) return undefined
    const lower = name.toLowerCase()
    // Match esatto o parziale
    for (const h of hotels) {
      if (h.name.toLowerCase() === lower) return h.id
      if (lower.includes(h.name.toLowerCase()) || h.name.toLowerCase().includes(lower)) return h.id
    }
    return undefined
  }

  function addFiles(files: FileList | File[]) {
    const newRows: BulkRow[] = []
    for (const f of Array.from(files)) {
      if (f.type !== "application/pdf") {
        toast.error(`"${f.name}" non e' un PDF, ignorato`)
        continue
      }
      if (f.size > 10 * 1024 * 1024) {
        toast.error(`"${f.name}" supera 10 MB, ignorato`)
        continue
      }
      const row = emptyRow(f)
      row.parseStatus = "idle"
      // Default: usa l'hotel di filtro se l'utente l'ha pre-selezionato
      if (defaultHotelId) row.hotelId = defaultHotelId
      // Best-effort: prova a estrarre invoice number dal filename
      const stem = f.name.replace(/\.pdf$/i, "")
      row.invoiceNumber = stem
      newRows.push(row)
    }
    if (newRows.length > 0) {
      console.log("[v0] addFiles: adding", newRows.length, "rows")
      setRows((prev) => [...prev, ...newRows])
      // Avvia il parsing AI per ogni nuovo file (in parallelo)
      for (const row of newRows) {
        console.log("[v0] addFiles: checking row", row.uid, "file:", row.file?.name)
        if (row.file) {
          parsePdfWithAI(row.uid, row.file)
        }
      }
    }
  }

  function addEmptyRow() {
    const r = emptyRow(null)
    if (defaultHotelId) r.hotelId = defaultHotelId
    setRows((prev) => [...prev, r])
  }

  function updateRow(uid: string, patch: Partial<BulkRow>) {
    setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)))
  }

  function removeRow(uid: string) {
    setRows((prev) => prev.filter((r) => r.uid !== uid))
  }

  /**
   * Quando l'utente cambia imponibile o aliquota, ricalcola IVA e totale.
   * Se l'utente edita IVA o totale manualmente, NON ri-derivare a meno che
   * non sia stato un nuovo cambio di imponibile.
   */
  function recomputeTotals(uid: string, patch: Partial<BulkRow>) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.uid !== uid) return r
        const next = { ...r, ...patch }
        const sub = parseFloat(next.subtotal)
        const rate = parseFloat(next.taxRate)
        if (!Number.isNaN(sub) && !Number.isNaN(rate)) {
          const tax = (sub * rate) / 100
          next.tax = tax.toFixed(2)
          next.total = (sub + tax).toFixed(2)
        }
        return next
      }),
    )
  }

  function applyDefaultHotelToAll() {
    if (!defaultHotelId) {
      toast.error("Scegli prima una struttura predefinita")
      return
    }
    setRows((prev) => prev.map((r) => (r.result ? r : { ...r, hotelId: defaultHotelId })))
    toast.success("Struttura applicata a tutte le righe non ancora salvate")
  }

  async function handleSubmit() {
    // Solo righe non gia' salvate.
    const toSubmit = rows.filter((r) => !r.result?.ok)
    if (toSubmit.length === 0) {
      toast.error("Nessuna riga da salvare")
      return
    }

    // Valida lato client per evitare round-trip inutili
    const missing = toSubmit.filter((r) => !r.hotelId)
    if (missing.length > 0) {
      toast.error(`${missing.length} riga/e senza struttura selezionata`)
      return
    }

    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.set("count", String(toSubmit.length))
      toSubmit.forEach((r, i) => {
        fd.set(`hotelId_${i}`, r.hotelId)
        if (r.file) fd.set(`file_${i}`, r.file)
        if (r.invoiceNumber) fd.set(`invoiceNumber_${i}`, r.invoiceNumber)
        if (r.issueDate) fd.set(`issueDate_${i}`, r.issueDate)
        if (r.subtotal) fd.set(`subtotal_${i}`, r.subtotal)
        if (r.tax) fd.set(`tax_${i}`, r.tax)
        if (r.total) fd.set(`total_${i}`, r.total)
        if (r.status) fd.set(`status_${i}`, r.status)
        if (r.planType) fd.set(`planType_${i}`, r.planType)
        if (r.notes) fd.set(`notes_${i}`, r.notes)
        if (r.paidAt) fd.set(`paidAt_${i}`, r.paidAt)
        if (r.paidAmount) fd.set(`paidAmount_${i}`, r.paidAmount)
      })

      const res = await fetch("/api/superadmin/invoices/bulk", { method: "POST", body: fd })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json?.error || "Errore upload bulk")
        setSubmitting(false)
        return
      }

      // Rebuild rows applicando i risultati per ogni riga.
      const resultsByIndex: Record<
        number,
        { success: boolean; invoiceId?: string; error?: string; reused?: boolean; pdfAttached?: boolean }
      > = {}
      for (const r of (json.results as Array<{
        index: number
        success: boolean
        invoiceId?: string
        error?: string
        reused?: boolean
        pdfAttached?: boolean
      }>) || []) {
        resultsByIndex[r.index] = r
      }

      // toSubmit[i] mappa all'indice i nel payload, usiamo l'uid per
      // ritrovare la riga nel state senza assumere ordering.
      let pdfAttachedCount = 0
      setRows((prev) =>
        prev.map((r) => {
          // se gia' salvata in run precedente, lascia stare
          if (r.result?.ok) return r
          const idx = toSubmit.findIndex((x) => x.uid === r.uid)
          if (idx === -1) return r
          const res = resultsByIndex[idx]
          if (!res) return r
          if (res.success && res.invoiceId) {
            if (res.pdfAttached) pdfAttachedCount++
            return { ...r, result: { ok: true, invoiceId: res.invoiceId } }
          }
          return { ...r, result: { ok: false, error: res.error || "Errore sconosciuto" } }
        }),
      )

      const ok = json.successCount ?? 0
      const ko = json.failureCount ?? 0
      if (ko === 0) {
        const suffix = pdfAttachedCount > 0 ? ` (${pdfAttachedCount} PDF allegati a fatture esistenti)` : ""
        toast.success(`${ok} fatture caricate${suffix}`)
      } else {
        const suffix = pdfAttachedCount > 0 ? `, ${pdfAttachedCount} PDF allegati` : ""
        toast.warning(`${ok} salvate${suffix}, ${ko} fallite. Controlla le righe in rosso.`)
      }
      onAllDone()
    } catch (err: any) {
      toast.error(err?.message || "Errore di rete")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Carica fatture multiple</DialogTitle>
          <DialogDescription>
            Carica fino a 50 PDF in un colpo solo. Per ognuno scegli la struttura e completa i campi
            (numero, data, imponibile, IVA, totale). Puoi anche aggiungere righe senza PDF se la
            fattura e&apos; solo da registrare.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Bar comandi */}
          <div className="flex flex-wrap items-end gap-3 rounded-md border bg-muted/30 p-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Carica PDF</Label>
              <Input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                multiple
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files)
                  if (fileInputRef.current) fileInputRef.current.value = ""
                }}
                className="cursor-pointer"
              />
            </div>
            <Button type="button" variant="outline" onClick={addEmptyRow}>
              <Plus className="h-4 w-4 mr-2" /> Riga senza PDF
            </Button>
            <div className="flex-1" />
            <div className="space-y-1.5">
              <Label className="text-xs">Struttura predefinita (per tutte le nuove righe)</Label>
              <div className="flex gap-2">
                <Select value={defaultHotelId} onValueChange={setDefaultHotelId}>
                  <SelectTrigger className="w-[220px]"><SelectValue placeholder="Nessuna" /></SelectTrigger>
                  <SelectContent>
                    {hotels.map((h) => (
                      <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="ghost" size="sm" onClick={applyDefaultHotelToAll} disabled={!defaultHotelId || rows.length === 0}>
                  Applica a tutte
                </Button>
              </div>
            </div>
          </div>

          {/* Riepilogo */}
          {rows.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Badge variant="outline">{rows.length} righe</Badge>
              {pending > 0 && <Badge variant="secondary">{pending} da salvare</Badge>}
              {successCount > 0 && (
                <Badge variant="secondary" className="bg-emerald-100 text-emerald-900 border-emerald-200">
                  {successCount} salvate
                </Badge>
              )}
              {failureCount > 0 && <Badge variant="destructive">{failureCount} fallite</Badge>}
            </div>
          )}

          {/* Tabella righe */}
          {rows.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              <Upload className="mx-auto h-6 w-6 mb-2 opacity-60" />
              Nessun file caricato. Usa il selettore qui sopra per caricare PDF, oppure aggiungi una
              riga manuale senza PDF.
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-2 font-medium">File / Stato</th>
                    <th className="text-left p-2 font-medium min-w-[180px]">Struttura</th>
                    <th className="text-left p-2 font-medium min-w-[140px]">Numero</th>
                    <th className="text-left p-2 font-medium">Emissione</th>
                    <th className="text-right p-2 font-medium">Imponibile</th>
                    <th className="text-right p-2 font-medium">% IVA</th>
                    <th className="text-right p-2 font-medium">IVA</th>
                    <th className="text-right p-2 font-medium">Totale</th>
                <th className="text-left p-2 font-medium">Stato</th>
                <th className="text-left p-2 font-medium">Tipo</th>
                <th className="text-left p-2 font-medium min-w-[140px]">Data pagam.</th>
                <th className="text-right p-2 font-medium min-w-[120px]">Importo pag. (€)</th>
                <th className="text-left p-2 font-medium min-w-[160px]">Note</th>
                    <th className="text-right p-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const isDone = r.result?.ok === true
                    const isError = r.result && r.result.ok === false
                    return (
                      <tr key={r.uid} className={`border-t ${isError ? "bg-destructive/5" : isDone ? "bg-emerald-50" : ""}`}>
                        <td className="p-2 align-top">
                          <div className="flex items-start gap-2">
                            {isDone ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-1" />
                            ) : isError ? (
                              <XCircle className="h-4 w-4 text-destructive mt-1" />
                            ) : r.file ? (
                              <FileText className="h-4 w-4 text-muted-foreground mt-1" />
                            ) : null}
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 text-xs truncate max-w-[200px]" title={r.file?.name || "(senza PDF)"}>
                                {r.file?.name || <span className="text-muted-foreground italic">(senza PDF)</span>}
                                {r.parseStatus === "parsing" && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Loader2 className="h-3 w-3 animate-spin text-blue-500 flex-shrink-0" />
                                      </TooltipTrigger>
                                      <TooltipContent>Analisi AI in corso...</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                                {r.parseStatus === "done" && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Sparkles className="h-3 w-3 text-amber-500 flex-shrink-0" />
                                      </TooltipTrigger>
                                      <TooltipContent>Dati estratti con AI</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </div>
                              {isError && (
                                <div className="text-xs text-destructive mt-1 max-w-[180px]">
                                  {r.result && !r.result.ok ? r.result.error : ""}
                                </div>
                              )}
                              {r.supplierName && (
                                <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-[180px]" title={r.supplierName}>
                                  Da: {r.supplierName}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="p-2 align-top">
                          <Select
                            value={r.hotelId}
                            onValueChange={(v) => updateRow(r.uid, { hotelId: v })}
                            disabled={isDone}
                          >
                            <SelectTrigger className="h-8"><SelectValue placeholder="Scegli..." /></SelectTrigger>
                            <SelectContent>
                              {hotels.map((h) => (
                                <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-2 align-top">
                          <Input
                            value={r.invoiceNumber}
                            onChange={(e) => updateRow(r.uid, { invoiceNumber: e.target.value })}
                            disabled={isDone}
                            className="h-8"
                          />
                        </td>
                        <td className="p-2 align-top">
                          <Input
                            type="date"
                            value={r.issueDate}
                            onChange={(e) => updateRow(r.uid, { issueDate: e.target.value })}
                            disabled={isDone}
                            className="h-8 w-[140px]"
                          />
                        </td>
                        <td className="p-2 align-top">
                          <Input
                            type="number"
                            step="0.01"
                            value={r.subtotal}
                            onChange={(e) => recomputeTotals(r.uid, { subtotal: e.target.value })}
                            disabled={isDone}
                            className="h-8 w-[110px] text-right"
                          />
                        </td>
                        <td className="p-2 align-top">
                          <Input
                            type="number"
                            step="0.01"
                            value={r.taxRate}
                            onChange={(e) => recomputeTotals(r.uid, { taxRate: e.target.value })}
                            disabled={isDone}
                            className="h-8 w-[70px] text-right"
                          />
                        </td>
                        <td className="p-2 align-top">
                          <Input
                            type="number"
                            step="0.01"
                            value={r.tax}
                            onChange={(e) => updateRow(r.uid, { tax: e.target.value })}
                            disabled={isDone}
                            className="h-8 w-[100px] text-right"
                          />
                        </td>
                        <td className="p-2 align-top">
                          <Input
                            type="number"
                            step="0.01"
                            value={r.total}
                            onChange={(e) => updateRow(r.uid, { total: e.target.value })}
                            disabled={isDone}
                            className="h-8 w-[110px] text-right font-medium"
                          />
                        </td>
                        <td className="p-2 align-top">
                          <Select
                            value={r.status}
                            onValueChange={(v) => updateRow(r.uid, { status: v })}
                            disabled={isDone}
                          >
                            <SelectTrigger className="h-8 w-[120px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {STATUS_OPTIONS.map((s) => (
                                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-2 align-top">
                          <Select
                            value={r.planType || "none"}
                            onValueChange={(v) => updateRow(r.uid, { planType: v === "none" ? "" : v })}
                            disabled={isDone}
                          >
                            <SelectTrigger className="h-8 w-[140px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">—</SelectItem>
                              {PLAN_TYPE_OPTIONS.map((p) => (
                                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-2 align-top">
                          <Input
                            type="date"
                            value={r.paidAt}
                            onChange={(e) => updateRow(r.uid, { paidAt: e.target.value })}
                            disabled={isDone}
                            className="h-8"
                          />
                        </td>
                        <td className="p-2 align-top text-right">
                          <Input
                            type="number"
                            step="0.01"
                            inputMode="decimal"
                            value={r.paidAmount}
                            onChange={(e) => updateRow(r.uid, { paidAmount: e.target.value })}
                            disabled={isDone}
                            className="h-8 text-right"
                            placeholder="acconto"
                          />
                        </td>
                        <td className="p-2 align-top">
                          <Input
                            value={r.notes}
                            onChange={(e) => updateRow(r.uid, { notes: e.target.value })}
                            disabled={isDone}
                            className="h-8"
                            placeholder="opzionale"
                          />
                        </td>
                        <td className="p-2 align-top text-right">
                          {!isDone && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeRow(r.uid)}
                              disabled={submitting}
                              aria-label="Rimuovi riga"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => handleClose(false)} disabled={submitting}>
            {successCount > 0 ? "Chiudi" : "Annulla"}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || pending === 0}
          >
            {submitting ? "Salvataggio..." : `Salva ${pending} fattur${pending === 1 ? "a" : "e"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
