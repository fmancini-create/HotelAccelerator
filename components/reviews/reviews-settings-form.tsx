"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
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

type BillingState = {
  access: boolean
  profile?: { accommodationCount?: number } | null
  entitlement?: { status?: string; expiresAt?: string | null; active?: boolean } | null
}

const fields: Array<{ key: keyof ReviewConfig; label: string; placeholder: string }> = [
  { key: "booking_com_url", label: "Booking.com", placeholder: "URL pagina struttura su Booking.com" },
  { key: "tripadvisor_url", label: "Tripadvisor", placeholder: "URL pagina struttura su Tripadvisor" },
  { key: "expedia_url", label: "Expedia", placeholder: "URL pagina struttura su Expedia" },
  { key: "vrbo_url", label: "VRBO", placeholder: "URL pagina struttura su VRBO" },
  { key: "airbnb_url", label: "Airbnb", placeholder: "URL pagina struttura su Airbnb" },
]

function euro(cents: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(cents / 100)
}

function prices(count: number) {
  const monthly = Math.max(500, Math.max(1, count) * 50)
  return { monthly, yearly: Math.round(monthly * 12 * 0.8) }
}

export function ReviewsSettingsForm() {
  const searchParams = useSearchParams()
  const [config, setConfig] = useState<ReviewConfig>({})
  const [billing, setBilling] = useState<BillingState | null>(null)
  const [accommodationCount, setAccommodationCount] = useState("")
  const [apifyToken, setApifyToken] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [checkout, setCheckout] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const sessionId = searchParams.get("session_id")
        if (searchParams.get("checkout") === "success" && sessionId) {
          const verify = await fetch("/api/admin/reviews/billing", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "verify", sessionId }),
          })
          const verifyBody = await verify.json().catch(() => ({}))
          if (!verify.ok) throw new Error(verifyBody.error || "Verifica pagamento non riuscita")
          if (!cancelled) setMessage("Pagamento verificato. Recensioni è attivo in tutta la suite 4BID.")
          window.history.replaceState({}, "", window.location.pathname)
        } else if (searchParams.get("checkout") === "cancelled") {
          if (!cancelled) setMessage("Acquisto annullato: non è stato effettuato alcun addebito.")
          window.history.replaceState({}, "", window.location.pathname)
        }

        const billingRes = await fetch("/api/admin/reviews/billing", { cache: "no-store" })
        const billingBody = await billingRes.json()
        if (!billingRes.ok) throw new Error(billingBody.error || "Impossibile caricare lo stato Recensioni")
        if (cancelled) return
        setBilling(billingBody)
        if (billingBody.profile?.accommodationCount) setAccommodationCount(String(billingBody.profile.accommodationCount))

        if (billingBody.access) {
          const configRes = await fetch("/api/admin/reviews/config", { cache: "no-store" })
          const configBody = await configRes.json()
          if (!configRes.ok) throw new Error(configBody.error || "Impossibile caricare la configurazione")
          if (!cancelled) setConfig(configBody.config || {})
        }
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Errore di caricamento")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [searchParams])

  const saveCount = async () => {
    const count = Number(accommodationCount)
    if (!Number.isInteger(count) || count < 1) throw new Error("Inserisci un numero di sistemazioni valido")
    const res = await fetch("/api/admin/reviews/billing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accommodationCount: count }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error || "Salvataggio numero sistemazioni non riuscito")
    setBilling((current) => ({ ...(current || { access: false }), profile: body.profile }))
    return count
  }

  const startCheckout = async (billingCycle: "monthly" | "yearly") => {
    setCheckout(true)
    setMessage(null)
    try {
      await saveCount()
      const res = await fetch("/api/admin/reviews/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "checkout", billingCycle }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.url) throw new Error(body.error || "Checkout non disponibile")
      window.location.assign(body.url)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Checkout non disponibile")
      setCheckout(false)
    }
  }

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

  const count = Number(accommodationCount) || 1
  const quote = prices(count)

  if (!loading && billing && !billing.access) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Attiva Recensioni</CardTitle>
          <CardDescription>
            Add-on condiviso in tutta la suite 4BID. Il prezzo è €0,50 per sistemazione al mese, minimo €5 per struttura. Annuale -20%.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="reviews-accommodations">Numero sistemazioni</Label>
            <Input
              id="reviews-accommodations"
              type="number"
              min={1}
              max={10000}
              value={accommodationCount}
              onChange={(event) => setAccommodationCount(event.target.value)}
              placeholder="Es. 23"
              disabled={checkout}
            />
            <p className="text-xs text-muted-foreground">Il numero viene salvato nel profilo di fatturazione della suite e usato dal server per calcolare il prezzo.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Button type="button" variant="outline" disabled={checkout || !accommodationCount} onClick={() => void startCheckout("monthly")}>
              Mensile · {euro(quote.monthly)}/mese
            </Button>
            <Button type="button" disabled={checkout || !accommodationCount} onClick={() => void startCheckout("yearly")}>
              Annuale · {euro(quote.yearly)}/anno
            </Button>
          </div>
          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Recensioni {billing?.access ? "attivo" : ""}</CardTitle>
          <CardDescription>
            L&apos;accesso è condiviso tra HotelAccelerator, Santaddeo e ManuBot. Non serve acquistarlo di nuovo negli altri prodotti collegati.
          </CardDescription>
        </CardHeader>
        {billing?.profile?.accommodationCount ? (
          <CardContent className="text-sm text-muted-foreground">
            Profilo di fatturazione: {billing.profile.accommodationCount} sistemazioni.
          </CardContent>
        ) : null}
      </Card>

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
    </div>
  )
}
