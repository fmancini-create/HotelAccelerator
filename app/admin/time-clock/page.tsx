"use client"

import { useCallback, useEffect, useState } from "react"
import { CheckCircle2, Loader2, MapPin } from "lucide-react"

import { AdminHeader } from "@/components/admin/admin-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type TimeEntry = {
  id: string
  clock_in_at: string
  clock_out_at: string | null
  status: string
}

type TimeClockSettings = {
  location_name?: string | null
  require_geolocation?: boolean
}

type TimeClockResponse = {
  recent?: TimeEntry[]
  settings?: TimeClockSettings | null
}

function errorMessage(code: string, distance?: number) {
  switch (code) {
    case "outside_geofence":
      return `Sei fuori dalla sede autorizzata${Number.isFinite(distance) ? ` (${Math.round(distance as number)} m)` : ""}.`
    case "already_clocked_in":
      return "L'entrata risulta già registrata."
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

export default function MobileTimeClockPage() {
  const [times, setTimes] = useState<TimeEntry[]>([])
  const [settings, setSettings] = useState<TimeClockSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const load = useCallback(async () => {
    const response = await fetch("/api/hr/time-clock", { cache: "no-store" })
    const body = (await response.json().catch(() => ({}))) as TimeClockResponse & { error?: string }
    if (!response.ok) throw new Error(body.error || "time_clock_load_failed")
    setTimes(Array.isArray(body.recent) ? body.recent : [])
    setSettings(body.settings ?? null)
  }, [])

  useEffect(() => {
    load()
      .catch(() => setError("Non riesco a caricare la timbratura. Puoi comunque accedere alla dashboard."))
      .finally(() => setLoading(false))
  }, [load])

  const hasOpenPunch = times.some((entry) => !entry.clock_out_at)
  const action: "clock_in" | "clock_out" = hasOpenPunch ? "clock_out" : "clock_in"

  async function submit(position?: { latitude: number; longitude: number; accuracy_m: number }) {
    const response = await fetch("/api/hr/time-clock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...position }),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      const failure = new Error(body.error || "time_clock_failed") as Error & { distance_m?: number }
      failure.distance_m = body.distance_m
      throw failure
    }

    setSuccess(action === "clock_in" ? "Entrata registrata." : "Uscita registrata.")
    // Il server ha confermato la scrittura della presenza: soltanto adesso si
    // supera il gate e si entra nella dashboard.
    window.location.replace("/admin/dashboard")
  }

  async function clock() {
    if (busy) return
    setBusy(true)
    setError("")
    setSuccess("")

    try {
      if (settings?.require_geolocation === false) {
        await submit()
        return
      }

      if (!("geolocation" in navigator)) {
        setError("Questo dispositivo non rende disponibile la posizione necessaria per timbrare.")
        return
      }

      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 0,
        })
      })

      await submit({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy_m: position.coords.accuracy,
      })
    } catch (caught) {
      if (
        typeof caught === "object" &&
        caught !== null &&
        "code" in caught &&
        typeof (caught as { code?: unknown }).code === "number"
      ) {
        const geoError = caught as GeolocationPositionError
        if (geoError.code === geoError.PERMISSION_DENIED) {
          setError("Posizione non autorizzata. Consenti l'accesso alla posizione e riprova.")
        } else if (geoError.code === geoError.TIMEOUT) {
          setError("Non sono riuscito a rilevare la posizione in tempo. Riprova dove il GPS prende meglio.")
        } else {
          setError("Posizione non disponibile in questo momento. Riprova.")
        }
        return
      }

      if (caught instanceof Error) {
        setError(errorMessage(caught.message, (caught as Error & { distance_m?: number }).distance_m))
      } else {
        setError("Timbratura non riuscita. Riprova.")
      }
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Caricamento timbratura…
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminHeader title="Timbratura presenza" subtitle="Registra la presenza prima di entrare in HotelAccelerator" />
      <main className="mx-auto flex max-w-lg flex-col gap-4 px-3 py-5 sm:px-4 sm:py-8">
        {error && (
          <div role="alert" className="rounded border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {success && (
          <div role="status" aria-live="polite" className="flex items-center gap-2 rounded border p-3 text-sm">
            <CheckCircle2 className="h-4 w-4" aria-hidden /> {success}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{hasOpenPunch ? "Registra uscita" : "Registra entrata"}</CardTitle>
            <CardDescription>
              {hasOpenPunch
                ? "Hai già un'entrata aperta. Conferma l'uscita quando stai terminando il turno."
                : "Conferma l'entrata per registrare la presenza e accedere alla dashboard."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button className="min-h-14 w-full text-base" size="lg" onClick={clock} disabled={busy}>
              {busy && <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />}
              {busy ? "Rilevamento posizione…" : hasOpenPunch ? "Conferma uscita" : "Conferma entrata"}
            </Button>

            <div className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>
                {settings?.require_geolocation === false
                  ? "La posizione non è obbligatoria per questa struttura."
                  : `La posizione viene acquisita solo al momento della timbratura${settings?.location_name ? ` e verificata rispetto a ${settings.location_name}` : ""}.`}
              </p>
            </div>
          </CardContent>
        </Card>

        {error && (
          <Button variant="ghost" className="w-full" onClick={() => window.location.replace("/admin/dashboard")}>
            Accedi comunque alla dashboard
          </Button>
        )}
      </main>
    </div>
  )
}
