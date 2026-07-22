"use client"

import { useRef, useState } from "react"
import { Upload, Loader2, FileText, Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PAYMENT_METHODS } from "@/lib/payments/methods"

interface Hotel {
  id: string
  name: string
}

interface DraftEntry {
  date: string
  amount: number
  sender: string | null
  description: string | null
  // associazione operatore
  hotelId: string // uuid | "__free__"
  organization_name: string
  reference: string
  payment_method: string
  include: boolean
}

const FREE = "__free__"

function fmtEur(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n)
}

export function ImportStatementDialog({
  hotels,
  onSaved,
}: {
  hotels: Hotel[]
  onSaved: () => void
}) {
  const [open, setOpen] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [entries, setEntries] = useState<DraftEntry[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  function reset() {
    setEntries([])
    setFileName(null)
    if (inputRef.current) inputRef.current.value = ""
  }

  async function handleFile(file: File) {
    setParsing(true)
    setEntries([])
    setFileName(file.name)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/superadmin/payments/parse-statement", { method: "POST", body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Errore analisi")
      const drafts: DraftEntry[] = (data.entries ?? []).map((e: { date: string; amount: number; sender: string | null; description: string | null }) => ({
        date: e.date ?? new Date().toISOString().slice(0, 10),
        amount: e.amount,
        sender: e.sender,
        description: e.description,
        hotelId: FREE,
        organization_name: e.sender ?? "",
        reference: "",
        payment_method: "bonifico",
        include: true,
      }))
      setEntries(drafts)
      if (!drafts.length) toast.info("Nessuna entrata rilevata nell'estratto conto")
      else toast.success(`${drafts.length} entrate rilevate. Associa struttura e riferimento.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore analisi")
      setFileName(null)
    } finally {
      setParsing(false)
    }
  }

  function update(i: number, patch: Partial<DraftEntry>) {
    setEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)))
  }

  async function save() {
    const selected = entries.filter((e) => e.include)
    if (!selected.length) {
      toast.error("Seleziona almeno un'entrata da registrare")
      return
    }
    const payments = selected.map((e) => {
      const isHotel = e.hotelId !== FREE && e.hotelId !== ""
      return {
        payment_date: e.date,
        hotel_id: isHotel ? e.hotelId : null,
        organization_name: isHotel ? (hotels.find((h) => h.id === e.hotelId)?.name ?? null) : e.organization_name || null,
        amount: e.amount,
        payment_method: e.payment_method,
        reference: e.reference || null,
        bank_sender: e.sender,
        notes: e.description,
        source: "bank_import",
      }
    })

    setSaving(true)
    try {
      const res = await fetch("/api/superadmin/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payments }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Errore salvataggio")
      toast.success(`${data.inserted} pagamenti importati dall'estratto conto`)
      reset()
      setOpen(false)
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore salvataggio")
    } finally {
      setSaving(false)
    }
  }

  const includedCount = entries.filter((e) => e.include).length

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="bg-transparent">
          <Upload className="h-4 w-4" />
          Importa estratto conto
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Importa estratto conto bancario</DialogTitle>
          <DialogDescription>
            Carica il PDF o il file CSV/Excel della banca. L&apos;AI estrae solo le entrate (data, importo,
            mittente). A te resta da associare struttura e riferimento.
          </DialogDescription>
        </DialogHeader>

        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed p-10 text-center">
            {parsing ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Analisi di {fileName} in corso…</p>
              </>
            ) : (
              <>
                <FileText className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Trascina qui o seleziona un file PDF, CSV o Excel</p>
                <Button variant="outline" className="bg-transparent" onClick={() => inputRef.current?.click()}>
                  <Upload className="h-4 w-4" />
                  Scegli file
                </Button>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.csv,.xls,.xlsx,application/pdf,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
              }}
            />
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                <FileText className="mr-1 inline h-4 w-4" />
                {fileName} — {entries.length} entrate rilevate
              </span>
              <Button variant="ghost" size="sm" onClick={reset}>
                <Trash2 className="h-4 w-4" />
                Cambia file
              </Button>
            </div>
            <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
              {entries.map((e, i) => (
                <div
                  key={i}
                  className={`grid grid-cols-1 gap-2 rounded-md border p-3 sm:grid-cols-12 ${e.include ? "" : "opacity-50"}`}
                >
                  <div className="flex items-center gap-2 sm:col-span-3">
                    <input
                      type="checkbox"
                      checked={e.include}
                      onChange={(ev) => update(i, { include: ev.target.checked })}
                      className="h-4 w-4"
                      aria-label={`Includi entrata ${i + 1}`}
                    />
                    <div className="min-w-0">
                      <p className="font-medium">{fmtEur(e.amount)}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {e.date} {e.sender ? `· ${e.sender}` : ""}
                      </p>
                      {e.description && (
                        <p className="truncate text-xs text-muted-foreground">{e.description}</p>
                      )}
                    </div>
                  </div>

                  <div className="sm:col-span-3">
                    <Label className="text-xs text-muted-foreground">Struttura / Organizzazione</Label>
                    <Select value={e.hotelId} onValueChange={(v) => update(i, { hotelId: v })}>
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
                    {e.hotelId === FREE && (
                      <Input
                        placeholder="Nome organizzazione"
                        value={e.organization_name}
                        onChange={(ev) => update(i, { organization_name: ev.target.value })}
                        className="mt-1 h-9"
                      />
                    )}
                  </div>

                  <div className="sm:col-span-3">
                    <Label className="text-xs text-muted-foreground">Causale / Riferimento</Label>
                    <Input
                      placeholder="Es. Fatt. 12/2026"
                      value={e.reference}
                      onChange={(ev) => update(i, { reference: ev.target.value })}
                      className="h-9"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <Label className="text-xs text-muted-foreground">Modalità</Label>
                    <Select value={e.payment_method} onValueChange={(v) => update(i, { payment_method: v })}>
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
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving || parsing}>
            Annulla
          </Button>
          {entries.length > 0 && (
            <Button onClick={save} disabled={saving || includedCount === 0}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Registra {includedCount} entrate
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
