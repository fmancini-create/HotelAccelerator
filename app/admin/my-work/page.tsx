"use client"

import { useCallback, useEffect, useState } from "react"
import { format } from "date-fns"
import { it } from "date-fns/locale"
import { Loader2, MapPin } from "lucide-react"
import { AdminHeader } from "@/components/admin/admin-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type Shift = { id: string; starts_at: string; ends_at: string; location: string | null; response_status: string }
type Leave = { id: string; kind: string; starts_on: string; ends_on: string; status: string }
type TimeEntry = { id: string; clock_in_at: string; clock_out_at: string | null; status: string }
type Document = { id: string; title: string; category: string; period_month: string | null; created_at: string }
type TimeClockSettings = { location_name?: string | null; require_geolocation?: boolean }

const statoRisposta: Record<string, string> = {
  pending: "Da confermare",
  confirmed: "Confermato",
  declined: "Non disponibile",
}

const statoAssenza: Record<string, string> = {
  pending: "In attesa",
  approved: "Approvata",
  rejected: "Rifiutata",
}

export default function Page() {
  const [shifts, setShifts] = useState<Shift[]>([])
  const [leaves, setLeaves] = useState<Leave[]>([])
  const [times, setTimes] = useState<TimeEntry[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [timeClockSettings, setTimeClockSettings] = useState<TimeClockSettings | null>(null)
  const [error, setError] = useState("")
  const [clockStatus, setClockStatus] = useState("")
  const [clockBusy, setClockBusy] = useState(false)
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({ kind: "holiday", starts_on: today, ends_on: today })

  const load = useCallback(async () => {
    const [r, tr, dr] = await Promise.all([
      fetch("/api/hr/me"),
      fetch("/api/hr/time-clock"),
      fetch("/api/hr/documents"),
    ])
    const [d, td, dd] = await Promise.all([
      r.json().catch(() => ({})),
      tr.json().catch(() => ({})),
      dr.json().catch(() => ({})),
    ])
    if (!r.ok) throw new Error(d.error)
    setShifts(d.shifts || [])
    setLeaves(d.leave_requests || [])
    if (tr.ok) {
      setTimes(td.recent || [])
      setTimeClockSettings(td.settings || null)
    }
    if (dr.ok) setDocuments(dd.documents || [])
  }, [])

  useEffect(() => {
    load().catch((e) =>
      setError(
        e.message === "employee_not_linked"
          ? "Il tuo account non è ancora collegato a una scheda dipendente."
          : "Caricamento non riuscito.",
      ),
    )
  }, [load])

  async function post(body: object) {
    const r = await fetch("/api/hr/me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (r.ok) await load()
    else setError("Operazione non riuscita.")
  }

  const timeClockError = (code: string, distance?: number) => {
    switch (code) {
      case "outside_geofence":
        return `Sei fuori dalla sede autorizzata${Number.isFinite(distance) ? ` (${Math.round(distance as number)} m)` : ""}.`
      case "already_clocked_in":
        return "Entrata già registrata."
      case "not_clocked_in":
        return "Non risulta un'entrata aperta da chiudere."
      case "geolocation_required":
        return "Per questa struttura la posizione è obbligatoria per timbrare."
      case "employee_not_linked":
        return "Il tuo account non è collegato a una scheda dipendente attiva."
      default:
        return "Timbratura non riuscita. Riprova."
    }
  }

  async function submitClock(
    action: "clock_in" | "clock_out",
    position?: { latitude: number; longitude: number; accuracy_m: number },
  ) {
    const r = await fetch("/api/hr/time-clock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...position }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(JSON.stringify({ code: d.error, distance_m: d.distance_m }))

    if (d.status === "needs_review") {
      setClockStatus("Timbratura registrata fuori area: è stata segnalata per verifica.")
    } else {
      setClockStatus(action === "clock_in" ? "Entrata registrata." : "Uscita registrata.")
    }
    await load()
  }

  async function clock() {
    if (clockBusy) return
    setError("")
    setClockStatus("")
    setClockBusy(true)

    const action: "clock_in" | "clock_out" = times.some((x) => !x.clock_out_at) ? "clock_out" : "clock_in"

    try {
      // The server supports punches without coordinates when the tenant has
      // explicitly disabled mandatory geolocation. Do not block that valid
      // workflow by asking the browser for a permission that is not required.
      if (timeClockSettings?.require_geolocation === false) {
        await submitClock(action)
        return
      }

      if (!("geolocation" in navigator)) {
        setError("Questo dispositivo non rende disponibile la posizione. Per questa struttura è necessaria per timbrare.")
        return
      }

      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 0,
        })
      })

      await submitClock(action, {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy_m: pos.coords.accuracy,
      })
    } catch (e) {
      // GeolocationPositionError is an interface, not a constructible runtime
      // class in every browser, so use its stable numeric shape instead of
      // instanceof (which breaks on Safari/iOS implementations).
      if (typeof e === "object" && e !== null && "code" in e && typeof (e as { code?: unknown }).code === "number") {
        const geoError = e as GeolocationPositionError
        if (geoError.code === geoError.PERMISSION_DENIED) {
          setError("Posizione non autorizzata. Consenti l'accesso alla posizione nelle impostazioni del browser e riprova.")
        } else if (geoError.code === geoError.TIMEOUT) {
          setError("Non sono riuscito a rilevare la posizione in tempo. Spostati dove il GPS prende meglio e riprova.")
        } else {
          setError("Posizione non disponibile in questo momento. Riprova tra poco.")
        }
        return
      }

      if (e instanceof Error) {
        try {
          const parsed = JSON.parse(e.message)
          setError(timeClockError(parsed.code, parsed.distance_m))
          return
        } catch {
          // Fall through to the generic message below.
        }
      }
      setError("Timbratura non riuscita. Riprova.")
    } finally {
      setClockBusy(false)
    }
  }

  async function download(id: string) {
    const r = await fetch(`/api/hr/documents?id=${id}`)
    const d = await r.json().catch(() => ({}))
    if (r.ok) window.location.assign(d.url)
    else setError("Download non riuscito.")
  }

  const hasOpenPunch = times.some((x) => !x.clock_out_at)

  return (
    <div className="min-h-screen bg-background">
      <AdminHeader title="Il mio lavoro" subtitle="Turni, timbrature, assenze e documenti" />
      <main className="mx-auto grid max-w-5xl gap-4 px-3 py-5 sm:gap-6 sm:px-4 sm:py-8 md:grid-cols-2">
        {error && (
          <div role="alert" className="md:col-span-2 rounded border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {clockStatus && (
          <div role="status" aria-live="polite" className="md:col-span-2 rounded border border-ha-success-soft bg-ha-success-soft p-3 text-sm text-ha-success-soft-foreground">
            {clockStatus}
          </div>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Timbratura</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="min-h-12 w-full text-base" size="lg" onClick={clock} disabled={clockBusy}>
              {clockBusy && <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />}
              {clockBusy ? "Rilevamento posizione…" : hasOpenPunch ? "Registra uscita" : "Registra entrata"}
            </Button>

            <div className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>
                {timeClockSettings?.require_geolocation === false
                  ? "La posizione non è obbligatoria per questa struttura."
                  : `La posizione viene acquisita solo quando premi il pulsante e serve a verificare la presenza${timeClockSettings?.location_name ? ` presso ${timeClockSettings.location_name}` : " in sede"}.`}
              </p>
            </div>

            <div className="space-y-2">
              {times.slice(0, 5).map((t) => (
                <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2.5 text-sm">
                  <span className="min-w-0">
                    {format(new Date(t.clock_in_at), "dd/MM HH:mm")}
                    {t.clock_out_at ? ` – ${format(new Date(t.clock_out_at), "HH:mm")}` : " – in corso"}
                  </span>
                  <Badge variant="outline" className="shrink-0">
                    {t.status === "needs_review" ? "Da verificare" : t.clock_out_at ? "Chiusa" : "In corso"}
                  </Badge>
                </div>
              ))}
              {!times.length && <p className="text-sm text-muted-foreground">Nessuna timbratura recente.</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>I miei documenti</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {documents.map((d) => (
              <button
                key={d.id}
                onClick={() => download(d.id)}
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded border p-3 text-left text-sm"
              >
                <span className="min-w-0 break-words">{d.title}</span>
                <span className="shrink-0 text-muted-foreground">Scarica</span>
              </button>
            ))}
            {!documents.length && <p className="text-sm text-muted-foreground">Nessun documento disponibile.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Prossimi turni</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {shifts.map((s) => (
              <div key={s.id} className="rounded-lg border p-3">
                <div className="font-medium capitalize">{format(new Date(s.starts_at), "EEEE d MMMM", { locale: it })}</div>
                <div className="text-sm">
                  {format(new Date(s.starts_at), "HH:mm")}–{format(new Date(s.ends_at), "HH:mm")} {s.location && `· ${s.location}`}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{statoRisposta[s.response_status] ?? s.response_status}</Badge>
                  {s.response_status === "pending" && (
                    <>
                      <Button size="sm" onClick={() => post({ action: "respond", shift_id: s.id, response: "confirmed" })}>
                        Confermo
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => post({ action: "respond", shift_id: s.id, response: "declined" })}>
                        Non posso
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {!shifts.length && !error && <p className="text-sm text-muted-foreground">Nessun turno pubblicato.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Richiedi assenza</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="holiday">Ferie</SelectItem>
                <SelectItem value="permission">Permesso</SelectItem>
                <SelectItem value="rol">ROL</SelectItem>
                <SelectItem value="sickness">Malattia</SelectItem>
                <SelectItem value="unavailability">Indisponibilità</SelectItem>
              </SelectContent>
            </Select>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input type="date" value={form.starts_on} onChange={(e) => setForm({ ...form, starts_on: e.target.value })} />
              <Input type="date" value={form.ends_on} onChange={(e) => setForm({ ...form, ends_on: e.target.value })} />
            </div>
            <Button className="w-full sm:w-auto" onClick={() => post({ action: "leave", ...form })}>Invia richiesta</Button>
            <div className="space-y-2 pt-3">
              {leaves.map((l) => (
                <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm">
                  <span>{l.starts_on}–{l.ends_on}</span>
                  <Badge variant="outline">{statoAssenza[l.status] ?? l.status}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
