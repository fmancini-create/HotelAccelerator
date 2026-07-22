"use client"

import useSWR from "swr"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Video, CalendarClock, Ban, CalendarRange, Clock, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CallOption } from "@/components/sales/email-template-selector"

type FreeSlot = { startIso: string; endIso: string }

/** Stato grezzo del selettore call (gestito dal componente padre). */
export type CallState = {
  kind: "none" | "meet" | "booking" | "propose"
  meetDate: string // yyyy-mm-dd
  meetTime: string // HH:mm
  durationMinutes: number
  /** Slot scelti dal venditore in modalità "propose" (max 3). */
  proposedSlots: FreeSlot[]
}

export const DEFAULT_CALL_STATE: CallState = {
  kind: "none",
  meetDate: "",
  meetTime: "10:00",
  durationMinutes: 30,
  proposedSlots: [],
}

/**
 * Converte lo stato del selettore nel payload `call_option` atteso dalle API
 * (`/api/sales/leads`, `.../send-email`, `.../messages`). Valida i campi del
 * link Meet diretto (data/ora future).
 */
export function buildCallOption(state: CallState): { option: CallOption; error?: string } {
  if (state.kind === "meet") {
    if (!state.meetDate || !state.meetTime) return { option: { type: "none" }, error: "Seleziona data e ora della call." }
    const start = new Date(`${state.meetDate}T${state.meetTime}:00`)
    if (isNaN(start.getTime())) return { option: { type: "none" }, error: "Data o ora non valide." }
    if (start.getTime() <= Date.now()) return { option: { type: "none" }, error: "Scegli una data e ora future." }
    const end = new Date(start.getTime() + state.durationMinutes * 60 * 1000)
    return { option: { type: "meet", startIso: start.toISOString(), endIso: end.toISOString() } }
  }
  if (state.kind === "booking") {
    return { option: { type: "booking", durationMinutes: state.durationMinutes } }
  }
  if (state.kind === "propose") {
    const slots = (state.proposedSlots || []).slice(0, 3)
    if (slots.length === 0) {
      return { option: { type: "none" }, error: "Seleziona da 1 a 3 orari da proporre al cliente." }
    }
    return { option: { type: "propose", slots, durationMinutes: state.durationMinutes } }
  }
  return { option: { type: "none" } }
}

const slotsFetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json())

function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Europe/Rome",
  })
}
function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" })
}

/**
 * Griglia degli slot liberi (lun-ven 9-18) da cui il venditore sceglie fino a 3
 * orari da proporre al lead. Raggruppati per giorno; il toggle seleziona/deseleziona.
 */
function ProposeSlotPicker({
  durationMinutes,
  selected,
  onChange,
  disabled,
}: {
  durationMinutes: number
  selected: FreeSlot[]
  onChange: (next: FreeSlot[]) => void
  disabled?: boolean
}) {
  const { data, isLoading } = useSWR<{ calendarConfigured: boolean; slots: FreeSlot[] }>(
    `/api/sales/calendar/free-slots?days=14&duration=${durationMinutes}`,
    slotsFetcher,
  )

  const slots = data?.slots ?? []
  const isSelected = (iso: string) => selected.some((s) => s.startIso === iso)
  const toggle = (slot: FreeSlot) => {
    if (isSelected(slot.startIso)) {
      onChange(selected.filter((s) => s.startIso !== slot.startIso))
    } else if (selected.length < 3) {
      onChange([...selected, slot].sort((a, b) => new Date(a.startIso).getTime() - new Date(b.startIso).getTime()))
    }
  }

  // Raggruppa per giorno.
  const groups: { key: string; label: string; slots: FreeSlot[] }[] = []
  for (const s of slots) {
    const key = new Date(s.startIso).toISOString().slice(0, 10)
    let g = groups.find((x) => x.key === key)
    if (!g) {
      g = { key, label: dayLabel(s.startIso), slots: [] }
      groups.push(g)
    }
    g.slots.push(s)
  }

  if (isLoading) {
    return (
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carico gli orari liberi...
      </div>
    )
  }
  if (data && data.calendarConfigured === false) {
    return (
      <p className="mt-3 text-xs text-destructive">
        Calendario non configurato: impossibile proporre orari liberi.
      </p>
    )
  }
  if (slots.length === 0) {
    return <p className="mt-3 text-xs text-muted-foreground">Nessuno slot libero nei prossimi 14 giorni.</p>
  }

  return (
    <div className="mt-3">
      <p className="mb-2 text-xs text-muted-foreground">
        Seleziona fino a 3 orari ({selected.length}/3 scelti). Durata: {durationMinutes} min.
      </p>
      <div className="max-h-48 space-y-3 overflow-y-auto pr-1">
        {groups.map((g) => (
          <div key={g.key}>
            <p className="mb-1 text-xs font-semibold capitalize text-foreground">{g.label}</p>
            <div className="flex flex-wrap gap-1.5">
              {g.slots.map((s) => {
                const active = isSelected(s.startIso)
                const full = !active && selected.length >= 3
                return (
                  <button
                    key={s.startIso}
                    type="button"
                    disabled={disabled || full}
                    onClick={() => toggle(s)}
                    className={cn(
                      "flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-40",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:border-primary hover:bg-primary/5",
                    )}
                  >
                    <Clock className="h-3 w-3" />
                    {timeLabel(s.startIso)}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Selettore compatto per allegare una call all'email: nessuna / link Google
 * Meet diretto (data+ora+durata) / form di prenotazione (durata). Lo stato e'
 * controllato dal padre, che al momento dell'invio chiama `buildCallOption`.
 */
export function CallOptionPicker({
  value,
  onChange,
  error,
  disabled,
}: {
  value: CallState
  onChange: (v: CallState) => void
  error?: string | null
  disabled?: boolean
}) {
  const set = (patch: Partial<CallState>) => onChange({ ...value, ...patch })

  return (
    <div className="rounded-md border border-border p-3">
      <Label className="text-xs font-semibold">Aggiungi una call (opzionale)</Label>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {[
          { key: "none" as const, label: "Nessuna", icon: Ban },
          { key: "meet" as const, label: "Link Meet", icon: Video },
          { key: "booking" as const, label: "Prenotazione", icon: CalendarClock },
          { key: "propose" as const, label: "Proponi 3 orari", icon: CalendarRange },
        ].map((opt) => {
          const Icon = opt.icon
          const active = value.kind === opt.key
          return (
            <button
              key={opt.key}
              type="button"
              disabled={disabled}
              onClick={() => set({ kind: opt.key })}
              className={cn(
                "flex items-center gap-1.5 rounded-md border p-2 text-left text-xs transition-colors disabled:opacity-50",
                active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted",
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0", active && "text-primary")} />
              <span className="font-medium">{opt.label}</span>
            </button>
          )
        })}
      </div>

      {value.kind === "meet" ? (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div>
            <Label htmlFor="cp-meet-date" className="text-xs">
              Data
            </Label>
            <Input
              id="cp-meet-date"
              type="date"
              value={value.meetDate}
              onChange={(e) => set({ meetDate: e.target.value })}
              disabled={disabled}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="cp-meet-time" className="text-xs">
              Ora
            </Label>
            <Input
              id="cp-meet-time"
              type="time"
              value={value.meetTime}
              onChange={(e) => set({ meetTime: e.target.value })}
              disabled={disabled}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="cp-meet-duration" className="text-xs">
              Durata (min)
            </Label>
            <Input
              id="cp-meet-duration"
              type="number"
              min={15}
              step={15}
              value={value.durationMinutes}
              onChange={(e) => set({ durationMinutes: Number(e.target.value) || 30 })}
              disabled={disabled}
              className="mt-1"
            />
          </div>
          <p className="col-span-3 text-xs text-muted-foreground">
            Verrà creata una richiesta &quot;da confermare&quot;: il link Meet viene inserito nell&apos;email e
            l&apos;evento appare sul calendario in attesa di approvazione.
          </p>
        </div>
      ) : null}

      {value.kind === "booking" ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="cp-booking-duration" className="text-xs">
              Durata call (min)
            </Label>
            <Input
              id="cp-booking-duration"
              type="number"
              min={15}
              step={15}
              value={value.durationMinutes}
              onChange={(e) => set({ durationMinutes: Number(e.target.value) || 30 })}
              disabled={disabled}
              className="mt-1"
            />
          </div>
          <p className="col-span-2 text-xs text-muted-foreground">
            L&apos;email conterrà un pulsante per prenotare la call: il lead sceglierà uno slot libero dal
            calendario e la richiesta resterà &quot;da confermare&quot;.
          </p>
        </div>
      ) : null}

      {value.kind === "propose" ? (
        <div className="mt-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="cp-propose-duration" className="text-xs">
                Durata call (min)
              </Label>
              <Input
                id="cp-propose-duration"
                type="number"
                min={15}
                step={15}
                value={value.durationMinutes}
                onChange={(e) => set({ durationMinutes: Number(e.target.value) || 30, proposedSlots: [] })}
                disabled={disabled}
                className="mt-1"
              />
            </div>
            <p className="col-span-2 text-xs text-muted-foreground">
              Il lead riceverà i pulsanti con gli orari scelti: cliccandone uno conferma quello slot. La
              richiesta resterà &quot;da confermare&quot;.
            </p>
          </div>
          <ProposeSlotPicker
            durationMinutes={value.durationMinutes}
            selected={value.proposedSlots}
            onChange={(next) => set({ proposedSlots: next })}
            disabled={disabled}
          />
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
