"use client"

/**
 * Editor della storia commissioni per la coppia (venditore, hotel).
 *
 * Comportamento:
 *  - Mostra la lista dei periodi (valid_from → valid_to | "oggi") con %
 *    e basis (invoice_total | invoice_subtotal).
 *  - Permette di creare un nuovo periodo: viene proposto valid_from = oggi
 *    o l'indomani del valid_to dell'ultimo periodo chiuso. Il vincolo gist
 *    `sahcp_no_overlap` rifiuta le sovrapposizioni con 409.
 *  - Permette di chiudere il periodo aperto (set valid_to = ieri) per
 *    "tagliarlo" prima di aprirne uno nuovo a una % diversa.
 *  - Permette edit/delete dei periodi esistenti.
 *
 * NB: questa storia e' usata dal commissions-engine per il lookup pct
 * giornaliero. NON modifica retroattivamente il ledger gia' generato: se
 * vuoi propagare un cambio retroattivo, usa il cron mensile o il reconcile
 * manuale.
 */

import { useState } from "react"
import useSWR, { mutate } from "swr"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Trash2, Pencil, Check, X } from "lucide-react"
import { toast } from "sonner"

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json())

type Period = {
  id: string
  sales_agent_id: string
  hotel_id: string
  valid_from: string
  valid_to: string | null
  commission_percentage: number
  commission_basis: "invoice_total" | "invoice_subtotal"
  notes: string | null
}

export function AgentCommissionPeriodsEditor({
  agentId,
  hotelId,
}: {
  agentId: string
  hotelId: string
}) {
  const key = `/api/superadmin/sales-commissions/periods?agentId=${agentId}&hotelId=${hotelId}`
  const { data, isLoading } = useSWR<{ periods: Period[] }>(key, fetcher, {
    revalidateOnFocus: false,
  })
  const periods = data?.periods ?? []

  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Suggerisci valid_from = giorno dopo il piu' recente valid_to (se chiuso),
  // altrimenti oggi.
  const suggestedFrom = (() => {
    const closed = periods.find((p) => p.valid_to)
    if (closed && closed.valid_to) {
      const d = new Date(closed.valid_to)
      d.setUTCDate(d.getUTCDate() + 1)
      return d.toISOString().slice(0, 10)
    }
    return new Date().toISOString().slice(0, 10)
  })()

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-semibold text-sm">Storia commissioni</h4>
          <p className="text-xs text-muted-foreground">
            La % applicata dal sistema al momento dell&apos;emissione di ogni fattura.
          </p>
        </div>
        {!creating && (
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Nuovo periodo
          </Button>
        )}
      </div>

      {creating && (
        <PeriodForm
          mode="create"
          initial={{
            valid_from: suggestedFrom,
            valid_to: null,
            commission_percentage: periods[0]?.commission_percentage ?? 10,
            commission_basis: periods[0]?.commission_basis ?? "invoice_total",
            notes: "",
          }}
          onCancel={() => setCreating(false)}
          onSubmit={async (values) => {
            const res = await fetch("/api/superadmin/sales-commissions/periods", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ agentId, hotelId, ...values }),
            })
            const j = await res.json()
            if (res.ok) {
              toast.success("Periodo creato")
              setCreating(false)
              await mutate(key)
            } else {
              toast.error(j.error || "Errore")
            }
          }}
        />
      )}

      {isLoading ? (
        <div className="text-xs text-muted-foreground">Caricamento…</div>
      ) : periods.length === 0 && !creating ? (
        <Card className="p-4 text-center text-xs text-muted-foreground">
          Nessun periodo configurato. Crea il primo per attivare le commissioni su questa struttura.
        </Card>
      ) : (
        <div className="space-y-2">
          {periods.map((p) => (
            <PeriodRow
              key={p.id}
              period={p}
              isEditing={editingId === p.id}
              onEdit={() => setEditingId(p.id)}
              onCancel={() => setEditingId(null)}
              onSave={async (values) => {
                const res = await fetch(`/api/superadmin/sales-commissions/periods/${p.id}`, {
                  method: "PATCH",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify(values),
                })
                const j = await res.json()
                if (res.ok) {
                  toast.success("Periodo aggiornato")
                  setEditingId(null)
                  await mutate(key)
                } else {
                  toast.error(j.error || "Errore")
                }
              }}
              onDelete={async () => {
                if (!confirm("Eliminare questo periodo? L'azione non puo' essere annullata."))
                  return
                const res = await fetch(`/api/superadmin/sales-commissions/periods/${p.id}`, {
                  method: "DELETE",
                })
                if (res.ok) {
                  toast.success("Periodo eliminato")
                  await mutate(key)
                } else {
                  toast.error("Errore eliminazione")
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PeriodRow({
  period,
  isEditing,
  onEdit,
  onCancel,
  onSave,
  onDelete,
}: {
  period: Period
  isEditing: boolean
  onEdit: () => void
  onCancel: () => void
  onSave: (values: any) => Promise<void>
  onDelete: () => Promise<void>
}) {
  if (isEditing) {
    return (
      <Card className="p-3">
        <PeriodForm
          mode="edit"
          initial={{
            valid_from: period.valid_from,
            valid_to: period.valid_to,
            commission_percentage: period.commission_percentage,
            commission_basis: period.commission_basis,
            notes: period.notes ?? "",
          }}
          onCancel={onCancel}
          onSubmit={onSave}
        />
      </Card>
    )
  }
  return (
    <Card className="p-3 flex items-center justify-between gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={period.valid_to ? "secondary" : "default"}>
            {period.valid_to ? "Chiuso" : "Aperto (corrente)"}
          </Badge>
          <span className="text-sm font-semibold">
            {period.commission_percentage}%
          </span>
          <span className="text-xs text-muted-foreground">
            su {period.commission_basis === "invoice_total" ? "totale fattura" : "imponibile"}
          </span>
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          Dal {fmtDate(period.valid_from)}{" "}
          {period.valid_to ? `al ${fmtDate(period.valid_to)}` : "(in corso)"}
          {period.notes && <span className="italic"> · {period.notes}</span>}
        </div>
      </div>
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" onClick={onEdit} aria-label="Modifica">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" onClick={onDelete} aria-label="Elimina">
          <Trash2 className="h-3.5 w-3.5 text-rose-600" />
        </Button>
      </div>
    </Card>
  )
}

function PeriodForm({
  mode,
  initial,
  onSubmit,
  onCancel,
}: {
  mode: "create" | "edit"
  initial: {
    valid_from: string
    valid_to: string | null
    commission_percentage: number
    commission_basis: "invoice_total" | "invoice_subtotal"
    notes: string
  }
  onSubmit: (values: any) => Promise<void>
  onCancel: () => void
}) {
  const [validFrom, setValidFrom] = useState(initial.valid_from)
  const [validTo, setValidTo] = useState<string>(initial.valid_to ?? "")
  const [pct, setPct] = useState(String(initial.commission_percentage))
  const [basis, setBasis] = useState<"invoice_total" | "invoice_subtotal">(initial.commission_basis)
  const [notes, setNotes] = useState(initial.notes)
  const [busy, setBusy] = useState(false)

  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <Label className="text-xs">Valido dal</Label>
        <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">Valido fino al (vuoto = aperto)</Label>
        <Input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">% commissione</Label>
        <Input
          type="number"
          min="0"
          max="100"
          step="0.5"
          value={pct}
          onChange={(e) => setPct(e.target.value)}
        />
      </div>
      <div>
        <Label className="text-xs">Base di calcolo</Label>
        <Select value={basis} onValueChange={(v: any) => setBasis(v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="invoice_total">Totale fattura (IVA inclusa)</SelectItem>
            <SelectItem value="invoice_subtotal">Imponibile (escl. IVA)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-2">
        <Label className="text-xs">Note (opz.)</Label>
        <Textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="es. revisione contrattuale del 01/06"
        />
      </div>
      <div className="col-span-2 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          <X className="h-3.5 w-3.5 mr-1" /> Annulla
        </Button>
        <Button
          size="sm"
          disabled={busy || !validFrom || !pct}
          onClick={async () => {
            setBusy(true)
            try {
              await onSubmit({
                validFrom,
                validTo: validTo || null,
                commissionPercentage: Number(pct),
                commissionBasis: basis,
                notes: notes || null,
              })
            } finally {
              setBusy(false)
            }
          }}
        >
          <Check className="h-3.5 w-3.5 mr-1" />
          {mode === "create" ? "Crea periodo" : "Salva"}
        </Button>
      </div>
    </div>
  )
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT")
}
