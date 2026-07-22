"use client"

import { useState, useEffect, useCallback } from "react"
import { Loader2, Settings2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

// Tiene allineati slug/etichette/default al modulo server lib/pace/channel-commissions.
const CATEGORIES: Array<{ slug: string; label: string; hint: string }> = [
  { slug: "diretto", label: "Diretto", hint: "Sito, telefono, email: di norma 0%." },
  { slug: "ota", label: "OTA", hint: "Booking, Expedia, Airbnb…" },
  { slug: "to_agenzie", label: "Tour Operator / Agenzie", hint: "TO, agenzie, gruppi." },
  { slug: "altro", label: "Altro", hint: "Canali non classificati." },
]

interface CommissionRow {
  category: string
  commissionPct: number
  isConfigured: boolean
  defaultPct: number
}

/**
 * Dialog per impostare la % di commissione per ciascun canale, per struttura.
 * Lasciando un campo vuoto si torna alla stima di default per quel canale.
 */
export function CommissionSettingsDialog({
  hotelId,
  onSaved,
}: {
  hotelId: string
  onSaved?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // valore del form per slug: stringa per gestire "vuoto = default"
  const [values, setValues] = useState<Record<string, string>>({})
  const [defaults, setDefaults] = useState<Record<string, number>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/accelerator/pace/commissions?hotelId=${hotelId}`, { cache: "no-store" })
      if (!res.ok) throw new Error("Impossibile caricare le commissioni")
      const body = (await res.json()) as { commissions: CommissionRow[] }
      const v: Record<string, string> = {}
      const d: Record<string, number> = {}
      for (const row of body.commissions) {
        d[row.category] = row.defaultPct
        v[row.category] = row.isConfigured ? String(row.commissionPct) : ""
      }
      setValues(v)
      setDefaults(d)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [hotelId])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      // invia null per i campi vuoti (= torna al default)
      const commissions: Record<string, number | null> = {}
      for (const { slug } of CATEGORIES) {
        const raw = values[slug]
        commissions[slug] = raw == null || raw.trim() === "" ? null : Number(raw)
      }
      const res = await fetch("/api/accelerator/pace/commissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId, commissions }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || "Errore nel salvataggio")
      setOpen(false)
      onSaved?.()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 bg-transparent">
          <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
          Commissioni
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Commissioni per canale</DialogTitle>
          <DialogDescription className="text-pretty">
            Imposta la percentuale di commissione per ciascun canale. Lascia un campo vuoto per usare la stima di
            default. Vale solo quando il PMS non fornisce la commissione reale.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
          </div>
        ) : (
          <div className="flex flex-col gap-4 py-2">
            {CATEGORIES.map(({ slug, label, hint }) => (
              <div key={slug} className="grid grid-cols-[1fr_auto] items-center gap-3">
                <div>
                  <Label htmlFor={`comm-${slug}`} className="text-sm font-medium">
                    {label}
                  </Label>
                  <p className="text-xs text-muted-foreground">{hint}</p>
                </div>
                <div className="relative w-28">
                  <Input
                    id={`comm-${slug}`}
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    inputMode="decimal"
                    placeholder={`${defaults[slug] ?? 0}`}
                    value={values[slug] ?? ""}
                    onChange={(e) => setValues((prev) => ({ ...prev, [slug]: e.target.value }))}
                    className="pr-7 text-right tabular-nums"
                    aria-label={`Commissione ${label} in percento`}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    %
                  </span>
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Default: OTA {defaults.ota ?? 15}%, Tour Operator / Agenzie {defaults.to_agenzie ?? 12}%, Diretto e Altro{" "}
              {defaults.diretto ?? 0}%.
            </p>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
            Annulla
          </Button>
          <Button onClick={save} disabled={saving || loading}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Salva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
