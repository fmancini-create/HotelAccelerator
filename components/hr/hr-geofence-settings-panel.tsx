"use client"

import { useCallback, useEffect, useState } from "react"
import {
  HrGeofenceLocationCard,
  type HrGeofenceSettings,
} from "@/components/hr/geofence-location-editor"

const DEFAULT_SETTINGS: HrGeofenceSettings = {
  location_name: "",
  latitude: "",
  longitude: "",
  geofence_radius_m: "200",
  require_geolocation: true,
  allow_outside_geofence: false,
}

type SettingsResponse = {
  settings?: Partial<HrGeofenceSettings> & {
    latitude?: string | number | null
    longitude?: string | number | null
    geofence_radius_m?: string | number | null
  }
  audit_recorded?: boolean
  error?: string
}

function normalizeSettings(source?: SettingsResponse["settings"]): HrGeofenceSettings {
  if (!source) return DEFAULT_SETTINGS
  return {
    location_name: String(source.location_name ?? ""),
    latitude: source.latitude == null ? "" : String(source.latitude),
    longitude: source.longitude == null ? "" : String(source.longitude),
    geofence_radius_m: source.geofence_radius_m == null ? "200" : String(source.geofence_radius_m),
    require_geolocation: source.require_geolocation !== false,
    allow_outside_geofence: source.allow_outside_geofence === true,
  }
}

export function HrGeofenceSettingsPanel() {
  const [settings, setSettings] = useState<HrGeofenceSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const response = await fetch("/api/admin/hr/settings", {
        credentials: "include",
        cache: "no-store",
      })
      const body = (await response.json().catch(() => ({}))) as SettingsResponse
      if (!response.ok) {
        throw new Error(body.error || `Errore ${response.status}`)
      }
      setSettings(normalizeSettings(body.settings))
    } catch {
      setError("Non riesco a caricare le impostazioni della timbratura. Riprova tra poco.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function saveSettings() {
    const latitude = Number(settings.latitude)
    const longitude = Number(settings.longitude)
    const radius = Number(settings.geofence_radius_m)

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      !Number.isFinite(radius) ||
      radius < 25 ||
      radius > 5000
    ) {
      setMessage("")
      setError("Controlla il punto sulla mappa e il raggio di copertura.")
      return
    }

    setBusy(true)
    setMessage("")
    setError("")
    try {
      const response = await fetch("/api/admin/hr/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...settings,
          latitude,
          longitude,
          geofence_radius_m: radius,
        }),
      })
      const body = (await response.json().catch(() => ({}))) as SettingsResponse
      if (!response.ok || !body.settings) {
        throw new Error(body.error || `Errore ${response.status}`)
      }

      // La risposta arriva dal record appena scritto: non mostriamo "salvato"
      // basandoci solo su HTTP 2xx, ma riallineiamo la UI ai dati persistiti.
      setSettings(normalizeSettings(body.settings))
      setMessage(
        body.audit_recorded === false
          ? "Sede e raggio salvati. Il log di audit non è stato registrato: l'amministratore della piattaforma è stato avvisato nei log."
          : "Sede, raggio e regole di timbratura salvati.",
      )
    } catch {
      setError("Impostazioni non salvate. I dati precedenti restano invariati.")
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <div className="animate-pulse text-sm text-muted-foreground">Caricamento impostazioni HR...</div>
  }

  return (
    <div className="space-y-4">
      {error && (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {message && (
        <div role="status" className="rounded-lg border px-4 py-3 text-sm">
          {message}
        </div>
      )}

      <HrGeofenceLocationCard
        settings={settings}
        busy={busy}
        onChange={setSettings}
        onSave={() => void saveSettings()}
      />
    </div>
  )
}
