"use client"

import { useEffect, useState, useCallback } from "react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Trash2, Plus, Zap, Info } from "lucide-react"
import {
  K_INTENSITY_GLOBAL_FALLBACK,
  K_BASE_INTENSITY_GLOBAL_FALLBACK,
  K_INTENSITY_PRESETS,
  matchKIntensityPreset,
  resolveKIntensity,
  type KIntensityRule,
} from "@/lib/pricing/k-intensity"

type Scope = "default" | "period" | "day"

interface EditableRule {
  scope: Scope
  date_from: string | null
  date_to: string | null
  increment_intensity: number
  base_intensity: number
  label: string | null
}

interface KIntensityDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  hotelId: string
  rules: KIntensityRule[]
  onSaved: (rules: KIntensityRule[]) => void
}

function toEditable(r: KIntensityRule): EditableRule {
  return {
    scope: r.scope,
    date_from: r.date_from,
    date_to: r.date_to,
    increment_intensity: r.increment_intensity,
    base_intensity: r.base_intensity,
    label: (r as any).label ?? null,
  }
}

export function KIntensityDialog({
  open,
  onOpenChange,
  hotelId,
  rules,
  onSaved,
}: KIntensityDialogProps) {
  const [draft, setDraft] = useState<EditableRule[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sincronizza il draft all'apertura. Garantisce sempre la presenza del default.
  useEffect(() => {
    if (!open) return
    const incoming = rules.map(toEditable)
    const hasDefault = incoming.some((r) => r.scope === "default")
    if (!hasDefault) {
      incoming.unshift({
        scope: "default",
        date_from: null,
        date_to: null,
        increment_intensity: K_INTENSITY_GLOBAL_FALLBACK,
        base_intensity: K_BASE_INTENSITY_GLOBAL_FALLBACK,
        label: null,
      })
    }
    setDraft(incoming)
    setError(null)
  }, [open, rules])

  const defaultRule = draft.find((r) => r.scope === "default")
  const overrides = draft.filter((r) => r.scope !== "default")

  const updateRule = useCallback((idx: number, patch: Partial<EditableRule>) => {
    setDraft((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }, [])

  const removeRule = useCallback((idx: number) => {
    setDraft((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  const addOverride = useCallback((scope: "period" | "day") => {
    const today = new Date().toISOString().slice(0, 10)
    setDraft((prev) => [
      ...prev,
      {
        scope,
        date_from: today,
        date_to: today,
        increment_intensity: K_INTENSITY_GLOBAL_FALLBACK,
        base_intensity: K_BASE_INTENSITY_GLOBAL_FALLBACK,
        label: null,
      },
    ])
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)
    // Validazione client (specchio del server) prima dell'invio.
    for (const r of draft) {
      if (r.scope === "period") {
        if (!r.date_from || !r.date_to) {
          setError("Ogni periodo deve avere data inizio e fine.")
          setSaving(false)
          return
        }
        if (r.date_from > r.date_to) {
          setError("In un periodo la data inizio non puo' essere dopo la fine.")
          setSaving(false)
          return
        }
      }
      if (r.scope === "day" && !r.date_from) {
        setError("Ogni eccezione giorno deve avere una data.")
        setSaving(false)
        return
      }
    }
    try {
      const res = await fetch("/api/accelerator/k-intensity", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotel_id: hotelId,
          rules: draft.map((r) => ({
            scope: r.scope,
            date_from: r.scope === "day" ? r.date_from : r.scope === "period" ? r.date_from : null,
            date_to: r.scope === "day" ? r.date_from : r.scope === "period" ? r.date_to : null,
            increment_intensity: r.increment_intensity,
            base_intensity: r.base_intensity,
            label: r.label,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Errore nel salvataggio.")
        setSaving(false)
        return
      }
      onSaved(Array.isArray(data.rules) ? data.rules : [])
      onOpenChange(false)
    } catch {
      setError("Errore di rete nel salvataggio.")
    } finally {
      setSaving(false)
    }
  }, [draft, hotelId, onSaved, onOpenChange])

  // Anteprima impatto: con K=-1 (tutte le variabili a 0) e K=+1, quanto sposta
  // su un prezzo base di esempio (uso 164 = mediana reale Barronci come default).
  const previewBase = 164
  const previewIncrement = 20
  const renderPreview = (r: EditableRule) => {
    const fakeRules: KIntensityRule[] = [
      { ...r, is_active: true } as KIntensityRule,
    ]
    const probeDate = r.scope === "default" ? "1900-01-01" : r.date_from || "1900-01-01"
    const resolved = resolveKIntensity(fakeRules, probeDate)
    const priceAt = (k: number) =>
      previewBase * (1 + k * resolved.baseIntensity) +
      previewIncrement * (1 + k * resolved.incrementIntensity)
    const low = priceAt(-1)
    const high = priceAt(1)
    const neutral = priceAt(0)
    return (
      <p className="text-[11px] text-muted-foreground mt-1">
        Esempio su base {previewBase}€ + incr. {previewIncrement}€:{" "}
        K-1 ={" "}
        <span className="font-semibold text-foreground">{low.toFixed(0)}€</span>{" "}
        · K0 = {neutral.toFixed(0)}€ · K+1 ={" "}
        <span className="font-semibold text-foreground">{high.toFixed(0)}€</span>
      </p>
    )
  }

  const renderIntensityControls = (idx: number, r: EditableRule) => {
    const current = matchKIntensityPreset(r.increment_intensity, r.base_intensity)
    return (
      <div className="mt-3">
        <Label className="text-xs">Livello di intensita&apos;</Label>
        <Select
          value={current.id}
          onValueChange={(id) => {
            const preset = K_INTENSITY_PRESETS.find((p) => p.id === id)
            if (preset) {
              updateRule(idx, {
                increment_intensity: preset.increment_intensity,
                base_intensity: preset.base_intensity,
              })
            }
          }}
        >
          <SelectTrigger className="mt-1 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {K_INTENSITY_PRESETS.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground mt-1">{current.description}</p>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-purple-600" />
            Intensificatore K
          </DialogTitle>
          <DialogDescription>
            Regola quanto il coefficiente K influisce sul prezzo. Vale solo in
            modalita&apos; K-Driven. Precedenza: giorno &gt; periodo &gt; default.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg bg-muted/50 border p-3 flex gap-2 text-xs text-muted-foreground">
          <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>
            L&apos;intensita&apos; <strong>incremento</strong> modula gli scatti di
            banda/domanda (storico, default {(K_INTENSITY_GLOBAL_FALLBACK * 100).toFixed(0)}%).
            L&apos;intensita&apos; <strong>prezzo base</strong> e&apos; la leva forte: fa
            muovere K direttamente sull&apos;intero prezzo (default 0 = spento).
          </span>
        </div>

        {/* Default hotel */}
        {defaultRule && (
          <div className="border rounded-lg p-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Default struttura</h4>
              <span className="text-[11px] text-muted-foreground">
                applicato a tutte le date senza regole specifiche
              </span>
            </div>
            {renderIntensityControls(
              draft.findIndex((x) => x === defaultRule),
              defaultRule,
            )}
            {renderPreview(defaultRule)}
          </div>
        )}

        {/* Override periodi / giorni */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Eccezioni</h4>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addOverride("period")}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Periodo
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addOverride("day")}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Giorno
              </Button>
            </div>
          </div>

          {overrides.length === 0 && (
            <p className="text-xs text-muted-foreground italic">
              Nessuna eccezione: tutte le date usano il default struttura.
            </p>
          )}

          {overrides.map((r) => {
            const idx = draft.findIndex((x) => x === r)
            return (
              <div key={idx} className="border rounded-lg p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-purple-700">
                    {r.scope === "period" ? "Periodo" : "Giorno"}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeRule(idx)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-3 mt-2">
                  <div>
                    <Label className="text-xs">
                      {r.scope === "period" ? "Dal" : "Data"}
                    </Label>
                    <Input
                      type="date"
                      value={r.date_from ?? ""}
                      onChange={(e) => updateRule(idx, { date_from: e.target.value })}
                      className="h-8 text-xs"
                    />
                  </div>
                  {r.scope === "period" && (
                    <div>
                      <Label className="text-xs">Al</Label>
                      <Input
                        type="date"
                        value={r.date_to ?? ""}
                        onChange={(e) => updateRule(idx, { date_to: e.target.value })}
                        className="h-8 text-xs"
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-[140px]">
                    <Label className="text-xs">Etichetta (opzionale)</Label>
                    <Input
                      type="text"
                      value={r.label ?? ""}
                      placeholder="es. Ferragosto, evento..."
                      onChange={(e) => updateRule(idx, { label: e.target.value })}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
                {renderIntensityControls(idx, r)}
                {renderPreview(r)}
              </div>
            )
          })}
        </div>

        {error && (
          <p className="text-xs text-destructive font-medium">{error}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annulla
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvataggio..." : "Salva intensita'"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
