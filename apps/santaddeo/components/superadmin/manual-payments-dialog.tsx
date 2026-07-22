"use client"

import { useState } from "react"
import { Plus, Trash2, Loader2 } from "lucide-react"
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

export interface Hotel {
  id: string
  name: string
}

interface Row {
  payment_date: string
  hotelId: string // uuid | "" (free text mode)
  organization_name: string
  amount: string
  payment_method: string
  reference: string
}

const FREE = "__free__"

function emptyRow(): Row {
  return {
    payment_date: new Date().toISOString().slice(0, 10),
    hotelId: FREE,
    organization_name: "",
    amount: "",
    payment_method: "bonifico",
    reference: "",
  }
}

export function ManualPaymentsDialog({
  hotels,
  onSaved,
}: {
  hotels: Hotel[]
  onSaved: () => void
}) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<Row[]>([emptyRow()])
  const [saving, setSaving] = useState(false)

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  function addRow() {
    setRows((prev) => [...prev, emptyRow()])
  }
  function removeRow(i: number) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)))
  }

  async function save() {
    const payments = rows.map((r) => {
      const isHotel = r.hotelId !== FREE && r.hotelId !== ""
      return {
        payment_date: r.payment_date,
        hotel_id: isHotel ? r.hotelId : null,
        organization_name: isHotel ? (hotels.find((h) => h.id === r.hotelId)?.name ?? null) : r.organization_name,
        amount: r.amount,
        payment_method: r.payment_method,
        reference: r.reference,
        source: "manual",
      }
    })

    // Validazione client-side
    const invalid = payments.findIndex((p) => !p.payment_date || !p.amount)
    if (invalid !== -1) {
      toast.error(`Riga ${invalid + 1}: data e importo sono obbligatori`)
      return
    }

    setSaving(true)
    try {
      const res = await fetch("/api/superadmin/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payments }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Errore salvataggio")
      toast.success(`${data.inserted} pagament${data.inserted === 1 ? "o" : "i"} registrat${data.inserted === 1 ? "o" : "i"}`)
      setRows([emptyRow()])
      setOpen(false)
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore salvataggio")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          Inserisci pagamenti
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Inserisci pagamenti</DialogTitle>
          <DialogDescription>
            Aggiungi una riga per ogni pagamento ricevuto. Struttura, importo e modalità sono richiesti; il
            riferimento (es. n. fattura) è opzionale.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
          {rows.map((r, i) => {
            const freeText = r.hotelId === FREE
            return (
              <div key={i} className="grid grid-cols-1 gap-2 rounded-md border p-3 sm:grid-cols-12">
                <div className="sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">Data</Label>
                  <Input
                    type="date"
                    value={r.payment_date}
                    onChange={(e) => update(i, { payment_date: e.target.value })}
                    className="h-9"
                  />
                </div>

                <div className="sm:col-span-3">
                  <Label className="text-xs text-muted-foreground">Struttura / Organizzazione</Label>
                  <Select value={r.hotelId} onValueChange={(v) => update(i, { hotelId: v })}>
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
                      value={r.organization_name}
                      onChange={(e) => update(i, { organization_name: e.target.value })}
                      className="mt-1 h-9"
                    />
                  )}
                </div>

                <div className="sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">Importo €</Label>
                  <Input
                    inputMode="decimal"
                    placeholder="0,00"
                    value={r.amount}
                    onChange={(e) => update(i, { amount: e.target.value })}
                    className="h-9"
                  />
                </div>

                <div className="sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">Modalità</Label>
                  <Select value={r.payment_method} onValueChange={(v) => update(i, { payment_method: v })}>
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

                <div className="flex items-end gap-1 sm:col-span-3">
                  <div className="flex-1">
                    <Label className="text-xs text-muted-foreground">Causale / Riferimento</Label>
                    <Input
                      placeholder="Es. Fatt. 12/2026"
                      value={r.reference}
                      onChange={(e) => update(i, { reference: e.target.value })}
                      className="h-9"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeRow(i)}
                    disabled={rows.length === 1}
                    aria-label={`Rimuovi riga ${i + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>

        <Button variant="outline" size="sm" onClick={addRow} className="w-full sm:w-auto bg-transparent">
          <Plus className="h-4 w-4" />
          Aggiungi riga
        </Button>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Annulla
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salva {rows.length > 1 ? `${rows.length} pagamenti` : "pagamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
