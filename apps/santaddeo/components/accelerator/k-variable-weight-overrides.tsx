"use client"

/**
 * Editor degli override di importanza (peso) di una K variabile.
 * Mostrato in un accordion sotto ciascuna variabile in /accelerator/pricing/settings.
 *
 * L'utente puo':
 * - vedere la lista degli override gia' configurati
 * - aggiungere un nuovo override (range data + opzionale filtro giorni-settimana
 *   + peso 0..10 + priorita')
 * - modificare un override esistente
 * - eliminarlo
 *
 * Se non ci sono override, la variabile usa default_weight ovunque (comportamento
 * storico). Niente cambia se nessuno definisce override.
 */

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Slider } from "@/components/ui/slider"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Plus, Trash2, Pencil, Loader2, CalendarRange, Info } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

export interface WeightOverride {
  id: string
  hotel_id: string
  variable_id: string
  label: string
  date_from: string
  date_to: string
  days_of_week: number[] | null
  weight: number
  priority: number
  is_active: boolean
}

interface Props {
  hotelId: string
  variableId: string
  variableLabel: string
  defaultWeight: number
}

const DOW_OPTIONS = [
  { value: 1, short: "L", label: "Lun" },
  { value: 2, short: "M", label: "Mar" },
  { value: 3, short: "M", label: "Mer" },
  { value: 4, short: "G", label: "Gio" },
  { value: 5, short: "V", label: "Ven" },
  { value: 6, short: "S", label: "Sab" },
  { value: 0, short: "D", label: "Dom" },
]

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-")
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

function formatDaysOfWeek(dow: number[] | null): string {
  if (!dow || dow.length === 0) return "Tutti i giorni"
  if (dow.length === 7) return "Tutti i giorni"
  const ordered = [...dow].sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
  return ordered.map((d) => DOW_OPTIONS.find((o) => o.value === d)?.label || "?").join(", ")
}

export function KVariableWeightOverrides({
  hotelId,
  variableId,
  variableLabel,
  defaultWeight,
}: Props) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [overrides, setOverrides] = useState<WeightOverride[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<WeightOverride | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    label: "",
    date_from: new Date().toISOString().split("T")[0],
    date_to: new Date().toISOString().split("T")[0],
    weight: defaultWeight,
    days_of_week: [] as number[],
    priority: 0,
  })

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/settings/pricing-variables/${variableId}/weight-overrides?hotel_id=${hotelId}`,
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        console.error("[v0] load overrides error:", err)
        return
      }
      const data = await res.json()
      setOverrides(data.overrides ?? [])
    } catch (err) {
      console.error("[v0] load overrides exception:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (hotelId && variableId) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelId, variableId])

  function openAdd() {
    setEditing(null)
    const today = new Date().toISOString().split("T")[0]
    setForm({
      label: "",
      date_from: today,
      date_to: today,
      weight: defaultWeight,
      days_of_week: [],
      priority: 0,
    })
    setDialogOpen(true)
  }

  function openEdit(o: WeightOverride) {
    setEditing(o)
    setForm({
      label: o.label,
      date_from: o.date_from,
      date_to: o.date_to,
      weight: o.weight,
      days_of_week: o.days_of_week ?? [],
      priority: o.priority,
    })
    setDialogOpen(true)
  }

  function toggleDow(dow: number) {
    setForm((f) => ({
      ...f,
      days_of_week: f.days_of_week.includes(dow)
        ? f.days_of_week.filter((d) => d !== dow)
        : [...f.days_of_week, dow],
    }))
  }

  async function handleSave() {
    if (!form.label.trim()) {
      toast({ title: "Inserisci un'etichetta", variant: "destructive" })
      return
    }
    if (form.date_to < form.date_from) {
      toast({ title: "La data di fine deve essere uguale o successiva a quella di inizio", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const payload = {
        hotel_id: hotelId,
        label: form.label.trim(),
        date_from: form.date_from,
        date_to: form.date_to,
        weight: form.weight,
        days_of_week: form.days_of_week.length === 0 ? null : form.days_of_week,
        priority: form.priority,
      }
      const url = editing
        ? `/api/settings/pricing-variables/${variableId}/weight-overrides/${editing.id}`
        : `/api/settings/pricing-variables/${variableId}/weight-overrides`
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast({ title: err.error || "Salvataggio non riuscito", variant: "destructive" })
        return
      }
      // 13/05/2026: il backend mette automaticamente in coda il ricalcolo dei
      // prezzi per il range impattato. Mostriamo una descrizione informativa
      // cosi' l'utente capisce DOVE/QUANDO vedra' gli effetti.
      const json = (await res.json().catch(() => ({}))) as {
        recalc?: { queued?: boolean; reason?: string; range_days?: number }
      }
      const recalc = json.recalc
      let description: string | undefined
      if (recalc?.queued) {
        description = `Ricalcolo prezzi in corso per ${recalc.range_days ?? "?"} giorni. Aggiorna la pagina prezzi tra qualche secondo per vederli aggiornati.`
      } else if (recalc?.reason === "already_pending") {
        description = "Ricalcolo gia' in coda: i prezzi si aggiorneranno a breve."
      } else if (recalc?.reason === "no_active_subscription") {
        description = "Modifica salvata. Nessun ricalcolo: l'hotel non ha una sottoscrizione pricing attiva."
      }
      toast({
        title: editing ? "Override aggiornato" : "Override creato",
        description,
      })
      setDialogOpen(false)
      load()
    } catch (err) {
      console.error("[v0] save override exception:", err)
      toast({ title: "Errore imprevisto", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(o: WeightOverride) {
    if (!confirm(`Eliminare l'override "${o.label}"?`)) return
    try {
      const res = await fetch(
        `/api/settings/pricing-variables/${variableId}/weight-overrides/${o.id}`,
        { method: "DELETE" },
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast({ title: err.error || "Eliminazione non riuscita", variant: "destructive" })
        return
      }
      const json = (await res.json().catch(() => ({}))) as {
        recalc?: { queued?: boolean; reason?: string; range_days?: number }
      }
      const recalc = json.recalc
      let description: string | undefined
      if (recalc?.queued) {
        description = `Ricalcolo prezzi in corso per ${recalc.range_days ?? "?"} giorni interessati dall'override eliminato.`
      } else if (recalc?.reason === "already_pending") {
        description = "Ricalcolo gia' in coda."
      }
      toast({ title: "Override eliminato", description })
      load()
    } catch (err) {
      console.error("[v0] delete override exception:", err)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <CalendarRange className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground">
              Modula l&apos;importanza per periodo
            </p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Definisci periodi in cui questa variabile deve contare di piu&apos; o meno
              rispetto al valore base (
              <span className="font-medium">{defaultWeight}/10</span>). Esempi: fiere,
              eventi, alta o bassa stagione, sabato d&apos;inverno.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 shrink-0 h-7 text-[11px]"
          onClick={openAdd}
        >
          <Plus className="h-3 w-3" /> Aggiungi periodo
        </Button>
      </div>

      {loading ? (
        <div className="text-[11px] text-muted-foreground flex items-center gap-2 py-2">
          <Loader2 className="h-3 w-3 animate-spin" /> Caricamento periodi...
        </div>
      ) : overrides.length === 0 ? (
        <div className="text-[11px] text-muted-foreground py-2 px-3 bg-muted/30 rounded border border-dashed flex items-center gap-2">
          <Info className="h-3 w-3 shrink-0" />
          Nessun periodo configurato. La variabile usa sempre l&apos;importanza base
          ({defaultWeight}/10).
        </div>
      ) : (
        <ul className="space-y-1.5">
          {overrides.map((o) => (
            <li
              key={o.id}
              className={`flex items-center justify-between gap-2 px-3 py-2 rounded border ${
                o.is_active ? "bg-indigo-50/40 border-indigo-200" : "bg-muted/30 border-border opacity-60"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-foreground truncate">{o.label}</span>
                  <Badge variant="secondary" className="text-[9px] shrink-0">
                    Importanza {o.weight}/10
                  </Badge>
                  {o.priority > 0 && (
                    <Badge variant="outline" className="text-[9px] shrink-0">
                      Priorita&apos; {o.priority}
                    </Badge>
                  )}
                  {!o.is_active && (
                    <Badge variant="outline" className="text-[9px] shrink-0">
                      Disattivato
                    </Badge>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {formatDate(o.date_from)} → {formatDate(o.date_to)} ·{" "}
                  {formatDaysOfWeek(o.days_of_week)}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => openEdit(o)}
                >
                  <Pencil className="h-3 w-3 text-muted-foreground" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                  onClick={() => handleDelete(o)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              {editing ? "Modifica periodo" : "Nuovo periodo di importanza"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Variabile: <span className="font-medium">{variableLabel}</span>. Importanza
              base: <span className="font-medium">{defaultWeight}/10</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="ovr-label" className="text-xs">
                Etichetta del periodo
              </Label>
              <Input
                id="ovr-label"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Es. Vinitaly 2026, Sabato d'inverno, Bassa stagione"
                maxLength={120}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ovr-from" className="text-xs">
                  Dal
                </Label>
                <Input
                  id="ovr-from"
                  type="date"
                  value={form.date_from}
                  onChange={(e) => setForm({ ...form, date_from: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ovr-to" className="text-xs">
                  Al
                </Label>
                <Input
                  id="ovr-to"
                  type="date"
                  value={form.date_to}
                  onChange={(e) => setForm({ ...form, date_to: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">
                Giorni della settimana (opzionale)
              </Label>
              <div className="flex items-center gap-1">
                {DOW_OPTIONS.map((d) => {
                  const active = form.days_of_week.includes(d.value)
                  return (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => toggleDow(d.value)}
                      className={`h-8 w-8 rounded-full text-xs font-medium border transition-colors ${
                        active
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-background text-muted-foreground border-border hover:bg-muted"
                      }`}
                      aria-pressed={active}
                      aria-label={d.label}
                    >
                      {d.short}
                    </button>
                  )
                })}
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Lascia vuoto per applicare a tutti i giorni del periodo. Esempio: per
                &quot;Sabato d&apos;inverno&quot; seleziona solo S.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Importanza nel periodo</Label>
                <span className="text-xs font-medium">{form.weight}/10</span>
              </div>
              <Slider
                value={[form.weight]}
                min={0}
                max={10}
                step={1}
                onValueChange={([v]) => setForm({ ...form, weight: v })}
              />
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                0 = ignora la variabile in questo periodo · {defaultWeight}/10 = uguale al
                valore base · 10 = peso massimo
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ovr-priority" className="text-xs">
                Priorita&apos; (in caso di sovrapposizione)
              </Label>
              <Input
                id="ovr-priority"
                type="number"
                min={0}
                step={1}
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: Math.max(0, Number(e.target.value) || 0) })}
              />
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Quando piu&apos; periodi coprono la stessa data, vince quello con priorita&apos;
                piu&apos; alta. Lascia 0 se non hai sovrapposizioni.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Annulla
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
              {editing ? "Salva modifiche" : "Crea periodo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
