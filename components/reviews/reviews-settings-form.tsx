"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface ReviewConfig {
  booking_com_url?: string | null
  tripadvisor_url?: string | null
  expedia_url?: string | null
  vrbo_url?: string | null
  airbnb_url?: string | null
  has_apify_api_token?: boolean
}

const fields: Array<{ key: keyof ReviewConfig; label: string; placeholder: string }> = [
  { key: "booking_com_url", label: "Booking.com", placeholder: "URL pagina struttura su Booking.com" },
  { key: "tripadvisor_url", label: "Tripadvisor", placeholder: "URL pagina struttura su Tripadvisor" },
  { key: "expedia_url", label: "Expedia", placeholder: "URL pagina struttura su Expedia" },
  { key: "vrbo_url", label: "VRBO", placeholder: "URL pagina struttura su VRBO" },
  { key: "airbnb_url", label: "Airbnb", placeholder: "URL pagina struttura su Airbnb" },
]

export function ReviewsSettingsForm() {
  const [config, setConfig] = useState<ReviewConfig>({})
  const [apifyToken, setApifyToken] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/admin/reviews/config", { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json()
        if (!res.ok) throw new Error(body.error || "Impossibile caricare la configurazione")
        setConfig(body.config || {})
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "Errore di caricamento"))
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const payload: Record<string, unknown> = {}
      for (const field of fields) payload[field.key] = config[field.key] || null
      if (apifyToken.trim()) payload.apify_api_token = apifyToken.trim()

      const res = await fetch("/api/admin/reviews/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Salvataggio non riuscito")
      setApifyToken("")
      setConfig((current) => ({ ...current, has_apify_api_token: current.has_apify_api_token || Boolean(payload.apify_api_token) }))
      setMessage("Configurazione Recensioni salvata.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Salvataggio non riuscito")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fonti recensioni</CardTitle>
        <CardDescription>
          Questa configurazione è condivisa nella suite 4BID. I dati vengono salvati nel motore Recensioni centrale di Santaddeo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {fields.map((field) => (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={String(field.key)}>{field.label}</Label>
            <Input
              id={String(field.key)}
              disabled={loading || saving}
              placeholder={field.placeholder}
              value={String(config[field.key] || "")}
              onChange={(event) => setConfig((current) => ({ ...current, [field.key]: event.target.value }))}
            />
          </div>
        ))}

        <div className="space-y-2 border-t pt-5">
          <Label htmlFor="apify-token">Token Apify</Label>
          <Input
            id="apify-token"
            type="password"
            autoComplete="off"
            disabled={loading || saving}
            value={apifyToken}
            onChange={(event) => setApifyToken(event.target.value)}
            placeholder={config.has_apify_api_token ? "Token già configurato · lascia vuoto per mantenerlo" : "Inserisci token Apify"}
          />
          <p className="text-xs text-muted-foreground">Il token non viene mai restituito al browser dopo il salvataggio.</p>
        </div>

        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
        <Button type="button" onClick={save} disabled={loading || saving}>
          {saving ? "Salvataggio…" : "Salva configurazione"}
        </Button>
      </CardContent>
    </Card>
  )
}
