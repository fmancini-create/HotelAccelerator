"use client"

/**
 * Editor della storia delle commissioni per un singolo abbonamento.
 *
 * Pensato per essere montato dentro il dialog "Gestisci Abbonamento" del
 * SuperAdmin, viene mostrato solo per i piani `commission`. Permette di:
 *  - vedere la storia di tutti i periodi (piu' recenti in alto)
 *  - aggiungere un nuovo periodo (valid_from + valid_to opzionale + %)
 *  - modificare inline un periodo esistente
 *  - cancellare un periodo
 *
 * I conflitti di sovrapposizione sono garantiti dal vincolo gist
 * `cp_no_overlap` lato DB, quindi qui ci limitiamo a mostrare l'errore
 * 409 ritornato dall'API senza fare validazione duplicata in client.
 */

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Trash2, Plus, Pencil, Check, X, Calendar } from "lucide-react"
import { toast } from "sonner"

interface Period {
  id: string
  valid_from: string
  valid_to: string | null
  commission_percentage: number
  commission_basis: "total" | "delta"
  notes: string | null
}

interface Props {
  subscriptionId: string
}

const today = () => new Date().toISOString().slice(0, 10)

export function CommissionPeriodsEditor({ subscriptionId }: Props) {
  const [periods, setPeriods] = useState<Period[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Partial<Period>>({})
  const [showNew, setShowNew] = useState(false)
  const [newDraft, setNewDraft] = useState<Partial<Period>>({
    valid_from: today(),
    valid_to: null,
    commission_percentage: 5,
    commission_basis: "total",
    notes: "",
  })
  const [busy, setBusy] = useState(false)

  const refresh = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/superadmin/subscriptions/${subscriptionId}/commission-periods`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Errore caricamento")
      setPeriods(json.periods || [])
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore caricamento periodi"
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscriptionId])

  const startEdit = (p: Period) => {
    setEditingId(p.id)
    setDraft({
      valid_from: p.valid_from,
      valid_to: p.valid_to,
      commission_percentage: p.commission_percentage,
      commission_basis: p.commission_basis || "total",
      notes: p.notes,
    })
  }
  const cancelEdit = () => {
    setEditingId(null)
    setDraft({})
  }

  const saveEdit = async (periodId: string) => {
    setBusy(true)
    try {
      const res = await fetch(
        `/api/superadmin/subscriptions/${subscriptionId}/commission-periods/${periodId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Errore salvataggio")
      toast.success("Periodo aggiornato")
      cancelEdit()
      await refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore salvataggio"
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  const deletePeriod = async (periodId: string) => {
    if (!confirm("Cancellare questo periodo? L'azione e' irreversibile.")) return
    setBusy(true)
    try {
      const res = await fetch(
        `/api/superadmin/subscriptions/${subscriptionId}/commission-periods/${periodId}`,
        { method: "DELETE" },
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || "Errore cancellazione")
      toast.success("Periodo cancellato")
      await refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore cancellazione"
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  const createPeriod = async () => {
    if (!newDraft.valid_from || newDraft.commission_percentage == null) {
      toast.error("Data di inizio e percentuale sono obbligatorie")
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/superadmin/subscriptions/${subscriptionId}/commission-periods`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          valid_from: newDraft.valid_from,
          valid_to: newDraft.valid_to || null,
          commission_percentage: newDraft.commission_percentage,
          commission_basis: newDraft.commission_basis || "total",
          notes: newDraft.notes || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Errore creazione")
      toast.success("Periodo aggiunto")
      setShowNew(false)
      setNewDraft({ valid_from: today(), valid_to: null, commission_percentage: 5, commission_basis: "total", notes: "" })
      await refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore creazione"
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-semibold">Storia commissioni</h4>
        </div>
        {!showNew && (
          <Button size="sm" variant="outline" className="gap-1" onClick={() => setShowNew(true)}>
            <Plus className="h-3.5 w-3.5" />
            Aggiungi periodo
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        La percentuale di commissione puo&apos; cambiare nel tempo. Imposta un periodo per ogni
        scaglione: &ldquo;Fino al&rdquo; vuoto = periodo aperto (vale fino a nuova revisione). I
        periodi non possono sovrapporsi.
      </p>

      {showNew && (
        <div className="rounded-md border bg-background p-3 space-y-2">
          <div className="grid grid-cols-4 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Da</Label>
              <Input
                type="date"
                value={newDraft.valid_from || ""}
                onChange={(e) => setNewDraft({ ...newDraft, valid_from: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Fino al (vuoto = aperto)</Label>
              <Input
                type="date"
                value={newDraft.valid_to || ""}
                onChange={(e) => setNewDraft({ ...newDraft, valid_to: e.target.value || null })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Commissione %</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={newDraft.commission_percentage ?? ""}
                onChange={(e) =>
                  setNewDraft({ ...newDraft, commission_percentage: parseFloat(e.target.value) || 0 })
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Base calcolo</Label>
              <select
                className="w-full border rounded-md px-2 py-1.5 text-sm bg-background"
                value={newDraft.commission_basis || "total"}
                onChange={(e) => setNewDraft({ ...newDraft, commission_basis: e.target.value as "total" | "delta" })}
              >
                <option value="total">Produzione</option>
                <option value="delta">Incremento YoY</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Note (opzionale)</Label>
            <Input
              value={newDraft.notes || ""}
              placeholder="Es. Variazione contrattuale 2027"
              onChange={(e) => setNewDraft({ ...newDraft, notes: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" onClick={() => setShowNew(false)} disabled={busy}>
              Annulla
            </Button>
            <Button size="sm" onClick={createPeriod} disabled={busy}>
              {busy ? "Salvo..." : "Crea"}
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-muted-foreground">Caricamento...</p>
      ) : periods.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Nessun periodo configurato.</p>
      ) : (
        <div className="space-y-1.5">
          {periods.map((p) => {
            const isEditing = editingId === p.id
            return (
              <div
                key={p.id}
                className="rounded-md border bg-background p-2 text-sm flex items-start gap-2"
              >
                {isEditing ? (
                  <div className="flex-1 grid grid-cols-4 gap-2">
                    <Input
                      type="date"
                      value={draft.valid_from || ""}
                      onChange={(e) => setDraft({ ...draft, valid_from: e.target.value })}
                    />
                    <Input
                      type="date"
                      value={draft.valid_to || ""}
                      onChange={(e) => setDraft({ ...draft, valid_to: e.target.value || null })}
                      placeholder="aperto"
                    />
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.01}
                        value={draft.commission_percentage ?? ""}
                        onChange={(e) =>
                          setDraft({ ...draft, commission_percentage: parseFloat(e.target.value) || 0 })
                        }
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                    <select
                      className="border rounded-md px-2 py-1.5 text-sm bg-background"
                      value={draft.commission_basis || "total"}
                      onChange={(e) => setDraft({ ...draft, commission_basis: e.target.value as "total" | "delta" })}
                    >
                      <option value="total">Produzione</option>
                      <option value="delta">Incremento YoY</option>
                    </select>
                  </div>
                ) : (
                  <div className="flex-1">
                    <div className="font-mono">
                      {p.valid_from} &rarr; {p.valid_to || "aperto"}
                      <span className="ml-3 font-semibold">{p.commission_percentage}%</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({p.commission_basis === "delta" ? "su incremento" : "su produzione"})
                      </span>
                    </div>
                    {p.notes && <div className="text-xs text-muted-foreground mt-0.5">{p.notes}</div>}
                  </div>
                )}
                <div className="flex gap-1 shrink-0">
                  {isEditing ? (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => saveEdit(p.id)}
                        disabled={busy}
                      >
                        <Check className="h-4 w-4 text-green-600" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={cancelEdit}
                        disabled={busy}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => startEdit(p)}
                        disabled={busy}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-red-600 hover:text-red-700"
                        onClick={() => deletePeriod(p.id)}
                        disabled={busy}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
