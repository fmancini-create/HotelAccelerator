"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import useSWR from "swr"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, CalendarCheck, CalendarX, Clock, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"

type Slot = { startIso: string; endIso: string }
type ApiInfo = {
  status: "active" | "used" | "expired"
  hotelName: string | null
  leadFirstName: string | null
  durationMinutes: number
  calendarConfigured: boolean
  /** true se il venditore ha proposto orari specifici (mostriamo solo quelli). */
  proposedMode?: boolean
  slots: Slot[]
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function groupByDay(slots: Slot[]) {
  const groups: { dayLabel: string; dayKey: string; slots: Slot[] }[] = []
  for (const s of slots) {
    const d = new Date(s.startIso)
    const dayKey = d.toISOString().slice(0, 10)
    const dayLabel = d.toLocaleDateString("it-IT", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "Europe/Rome",
    })
    let g = groups.find((x) => x.dayKey === dayKey)
    if (!g) {
      g = { dayKey, dayLabel, slots: [] }
      groups.push(g)
    }
    g.slots.push(s)
  }
  return groups
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Rome",
  })
}

export function BookCallClient({ token }: { token: string }) {
  const { data, error, isLoading } = useSWR<ApiInfo>(`/api/public/call-booking/${token}`, fetcher)
  const searchParams = useSearchParams()
  const slotParam = searchParams.get("slot")
  const [selected, setSelected] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmed, setConfirmed] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const dayGroups = useMemo(() => groupByDay(data?.slots ?? []), [data?.slots])

  // Preseleziona lo slot indicato nell'email (?slot=ISO) se è tra quelli
  // disponibili. Confronto per istante (gestisce eventuali differenze di formato).
  useEffect(() => {
    if (!slotParam || selected || !data?.slots?.length) return
    const target = new Date(slotParam).getTime()
    const match = data.slots.find((s) => new Date(s.startIso).getTime() === target)
    if (match) setSelected(match.startIso)
  }, [slotParam, selected, data?.slots])

  async function handleConfirm() {
    if (!selected) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch(`/api/public/call-booking/${token}/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ startIso: selected }),
      })
      const json = await res.json()
      if (!res.ok) {
        setSubmitError(json?.message || "Impossibile completare la prenotazione.")
        return
      }
      setConfirmed(json.when || timeLabel(selected))
    } catch {
      setSubmitError("Errore di rete. Riprova.")
    } finally {
      setSubmitting(false)
    }
  }

  // Stati di caricamento / errore
  if (isLoading) {
    return (
      <div className="mx-auto flex max-w-md items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !data || data.status === undefined) {
    return <StateCard icon="x" title="Link non valido" message="Il link di prenotazione non è valido o è stato rimosso." />
  }

  // Conferma avvenuta
  if (confirmed) {
    return (
      <StateCard
        icon="check"
        title="Richiesta inviata!"
        message={`Abbiamo registrato la tua preferenza per ${confirmed}. Riceverai una conferma via email una volta validato l'appuntamento.`}
      />
    )
  }

  if (data.status === "used") {
    return (
      <StateCard
        icon="check"
        title="Hai già prenotato"
        message="Risulta già una prenotazione associata a questo link. Controlla la tua email per i dettagli."
      />
    )
  }

  if (data.status === "expired") {
    return (
      <StateCard
        icon="x"
        title="Link scaduto"
        message="Questo link di prenotazione non è più valido. Contatta il tuo referente SANTADDEO per riceverne uno nuovo."
      />
    )
  }

  if (!data.calendarConfigured || dayGroups.length === 0) {
    return (
      <StateCard
        icon="x"
        title="Nessuno slot disponibile"
        message="Al momento non ci sono orari liberi. Riprova più tardi o contatta il tuo referente SANTADDEO."
      />
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8 text-center">
        <h1 className="text-balance text-3xl font-bold">
          {data.proposedMode ? "Conferma l'orario della demo" : "Prenota la tua call"}
        </h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          {data.proposedMode
            ? data.hotelName
              ? `Scegli uno degli orari proposti per la demo dedicata a ${data.hotelName}.`
              : "Scegli uno degli orari proposti per la tua call dimostrativa."
            : data.hotelName
              ? `Scegli l'orario migliore per la demo dedicata a ${data.hotelName}.`
              : "Scegli l'orario migliore per la tua call dimostrativa."}{" "}
          Durata: {data.durationMinutes} minuti.
        </p>
      </div>

      <div className="space-y-5">
        {dayGroups.map((group) => (
          <Card key={group.dayKey}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base capitalize">{group.dayLabel}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {group.slots.map((s) => {
                  const active = selected === s.startIso
                  return (
                    <button
                      key={s.startIso}
                      type="button"
                      onClick={() => setSelected(s.startIso)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "hover:border-primary hover:bg-primary/5",
                      )}
                    >
                      <Clock className="h-3.5 w-3.5" />
                      {timeLabel(s.startIso)}
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {submitError && <p className="mt-4 text-center text-sm text-destructive">{submitError}</p>}

      <div className="sticky bottom-4 mt-6">
        <Button
          size="lg"
          className="w-full"
          disabled={!selected || submitting}
          onClick={handleConfirm}
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Invio in corso...
            </>
          ) : (
            <>
              <CalendarCheck className="mr-2 h-4 w-4" />
              {selected ? `Conferma per le ${timeLabel(selected)}` : "Seleziona un orario"}
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

function StateCard({ icon, title, message }: { icon: "check" | "x"; title: string; message: string }) {
  const Icon = icon === "check" ? CheckCircle2 : CalendarX
  return (
    <div className="mx-auto max-w-md py-12">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <Icon className={cn("h-12 w-12", icon === "check" ? "text-primary" : "text-muted-foreground")} />
          <h1 className="text-xl font-bold text-balance">{title}</h1>
          <p className="text-pretty text-muted-foreground">{message}</p>
        </CardContent>
      </Card>
    </div>
  )
}
