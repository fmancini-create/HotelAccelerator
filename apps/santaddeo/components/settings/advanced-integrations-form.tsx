"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { WebTrafficTool } from "@/components/settings/web-traffic-tool"
import { GoogleBusinessReplyCard } from "@/components/settings/google-business-reply-card"
import { Badge } from "@/components/ui/badge"
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  BarChart3,
  Building,
  Star,
  ExternalLink,
  Info,
  Unlink,
  Lightbulb,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { HotelMatcher } from "./hotel-matcher"
import { BookingKpiTab } from "./booking-kpi-tab"
import { ExpediaKpiTab } from "./expedia-kpi-tab"
import { CustomVariableRequestTab } from "./custom-variable-request-tab"

interface AdvancedIntegrationsFormProps {
  hotel: any
}

type IntegrationConfig = {
  google_analytics_id: string
  google_analytics_api_key: string
  google_analytics_property_id: string
  apify_api_token: string
  google_places_api_key: string
  google_maps_place_id: string
  google_maps_place_name: string
  google_maps_place_address: string
  google_maps_url: string
  apify_last_sync_at: string | null
  // Multi-platform review URLs
  booking_com_url: string
  tripadvisor_url: string
  expedia_url: string
  vrbo_url: string
  airbnb_url: string
  booking_com_last_sync_at: string | null
  tripadvisor_last_sync_at: string | null
  expedia_last_sync_at: string | null
  vrbo_last_sync_at: string | null
  airbnb_last_sync_at: string | null
}

const emptyConfig: IntegrationConfig = {
  google_analytics_id: "",
  google_analytics_api_key: "",
  google_analytics_property_id: "",
  apify_api_token: "",
  google_places_api_key: "",
  google_maps_place_id: "",
  google_maps_place_name: "",
  google_maps_place_address: "",
  google_maps_url: "",
  apify_last_sync_at: null,
  booking_com_url: "",
  tripadvisor_url: "",
  expedia_url: "",
  vrbo_url: "",
  airbnb_url: "",
  booking_com_last_sync_at: null,
  tripadvisor_last_sync_at: null,
  expedia_last_sync_at: null,
  vrbo_last_sync_at: null,
  airbnb_last_sync_at: null,
}

export function AdvancedIntegrationsForm({ hotel }: AdvancedIntegrationsFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [config, setConfig] = useState<IntegrationConfig>(emptyConfig)
  const [initialLoading, setInitialLoading] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [isTesting, setIsTesting] = useState<string | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showHotelMatcher, setShowHotelMatcher] = useState(false)

  // Load current integration config from the canonical endpoint on mount.
  // Never read integration fields directly from `hotel` anymore: that prop
  // is the `hotels` row, which may be missing most of the config.
  useEffect(() => {
    let aborted = false
    const load = async () => {
      try {
        const res = await fetch(`/api/hotels/${hotel.id}/integrations`)
        const json = await res.json()
        if (!aborted) {
          setConfig({ ...emptyConfig, ...(json.data ?? {}) })
        }
      } catch (err) {
        console.error("[v0] Failed to load integrations:", err)
      } finally {
        if (!aborted) setInitialLoading(false)
      }
    }
    load()
    return () => {
      aborted = true
    }
  }, [hotel.id])

  const connectedSummary = useMemo(() => {
    const items: string[] = []
    // Analytics non è più attivabile in UI: la feature è stata sostituita
    // dal teaser Hotel Accelerator. Non mostriamo nessun chip "Analytics"
    // nella lista integrazioni attive finché l'integrazione con la
    // piattaforma partner non sarà disponibile.

    if (config.apify_api_token) items.push("Recensioni")
    return items
  }, [config])

  const update = <K extends keyof IntegrationConfig>(key: K, val: IntegrationConfig[K]) =>
    setConfig((c) => ({ ...c, [key]: val }))

  const handleSave = async () => {
    setIsLoading(true)
    setError(null)
    setSuccess(null)
    try {
      // Exclude read-only fields from the payload
      const { 
        apify_last_sync_at, 
        google_maps_place_id, 
        google_maps_place_name, 
        google_maps_place_address, 
        google_maps_url,
        booking_com_last_sync_at,
        tripadvisor_last_sync_at,
        expedia_last_sync_at,
        ...payload 
      } = config
      const response = await fetch(`/api/hotels/${hotel.id}/integrations`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error("Errore durante il salvataggio")
      // Reload fresh state from DB so the UI always reflects what's actually saved
      const refreshed = await fetch(`/api/hotels/${hotel.id}/integrations`)
      const json = await refreshed.json()
      setConfig({ ...emptyConfig, ...(json.data ?? {}) })
      setSuccess("Configurazione salvata con successo.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante il salvataggio")
    } finally {
      setIsLoading(false)
    }
  }

  const handleTestReviews = async () => {
    // No local token required: the server will use the shared env-var token
    // unless the user explicitly overrode it with a per-tenant one.
    setIsTesting("reviews")
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch(`/api/integrations/reviews/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Send the tenant token only if set; server falls back to env var
        body: JSON.stringify(
          config.apify_api_token ? { apiToken: config.apify_api_token } : {}
        ),
      })
      const data = await response.json()
      if (!data.success) throw new Error(data.message)
      setSuccess("Connessione ad Apify riuscita. Puoi sincronizzare le recensioni.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "API Token non valido")
    } finally {
      setIsTesting(null)
    }
  }

  const handleSyncReviews = async () => {
    // Check if at least one platform is configured.
    // The Apify token is no longer required per-tenant: the shared
    // APIFY_API_TOKEN env var is used by default. If missing, the server
    // will return a clear error message.
    const hasAnyPlatform = config.google_maps_place_id || config.booking_com_url || config.tripadvisor_url || config.expedia_url
    if (!hasAnyPlatform) {
      toast({
        title: "Nessuna piattaforma configurata",
        description: "Collega almeno una piattaforma: Google Maps, Booking.com, TripAdvisor o Expedia",
        variant: "destructive",
      })
      return
    }
    setIsSyncing(true)
    try {
      const response = await fetch(`/api/integrations/reviews/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId: hotel.id }),
      })
      const data = await response.json()
      if (!data.success) throw new Error(data.error || data.message)
      toast({
        title: "Sincronizzazione completata",
        description: `${data.syncedCount ?? 0} recensioni totali • ${data.newReviews ?? 0} nuove`,
      })
      // Reload to see new last_sync timestamp
      const refreshed = await fetch(`/api/hotels/${hotel.id}/integrations`)
      const json = await refreshed.json()
      setConfig({ ...emptyConfig, ...(json.data ?? {}) })
    } catch (err) {
      toast({
        title: "Errore",
        description: err instanceof Error ? err.message : "Errore durante la sincronizzazione",
        variant: "destructive",
      })
    } finally {
      setIsSyncing(false)
    }
  }

  const handleDisconnectGoogleMaps = async () => {
    if (!confirm("Scollegare l'hotel da Google Maps? Dovrai rifare la ricerca.")) return
    setIsLoading(true)
    try {
      // Direct write to the canonical table via the same PATCH, but we pass
      // the Maps fields so they get cleared. Because PATCH normally ignores
      // Maps fields we use a dedicated disconnect payload via upsert below.
      await fetch(`/api/integrations/reviews/connect-hotel`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId: hotel.id }),
      })
      const refreshed = await fetch(`/api/hotels/${hotel.id}/integrations`)
      const json = await refreshed.json()
      setConfig({ ...emptyConfig, ...(json.data ?? {}) })
      toast({ title: "Hotel scollegato da Google Maps" })
    } catch {
      toast({ title: "Errore", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  if (initialLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Caricamento configurazione…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Intro panel: tells the user these are independent, opt-in integrations */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="space-y-2">
          <div className="font-medium">Integrazioni opzionali e indipendenti</div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Configura solo le integrazioni che ti servono — non è obbligatorio attivarle tutte.
            Ogni integrazione sblocca funzionalità specifiche nella piattaforma e può essere
            aggiunta o rimossa in qualsiasi momento.
          </p>
          {connectedSummary.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs text-muted-foreground">Attive:</span>
              {connectedSummary.map((s) => (
                <Badge key={s} variant="secondary" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" /> {s}
                </Badge>
              ))}
            </div>
          )}
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="reviews" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="reviews">
            <Star className="h-4 w-4 mr-2" />
            Recensioni
          </TabsTrigger>
          <TabsTrigger value="analytics">
            <BarChart3 className="h-4 w-4 mr-2" />
            Traffico Web
          </TabsTrigger>
          <TabsTrigger value="booking">
            <Building className="h-4 w-4 mr-2" />
            KPI Booking
          </TabsTrigger>
          <TabsTrigger value="expedia">
            <Building className="h-4 w-4 mr-2" />
            KPI Expedia
          </TabsTrigger>
          <TabsTrigger value="custom-vars">
            <Lightbulb className="h-4 w-4 mr-2" />
            Variabili custom
          </TabsTrigger>
        </TabsList>

        {/* === REVIEWS === */}
        <TabsContent value="reviews" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Recensioni multi-canale</CardTitle>
              <CardDescription>
                Aggrega automaticamente le recensioni da Google, Tripadvisor, Booking.com,
                Expedia, Hotels.com e altri portali in un&apos;unica dashboard.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <WhatYouGet
                bullets={[
                  "Dashboard recensioni aggregate con rating medio, volumi e trend",
                  "Insights AI: punti di forza, aree di miglioramento, topic ricorrenti",
                  "Punteggio reputazione 0–10 utilizzabile nell'algoritmo K-driven di pricing",
                  "Sincronizzazione automatica due volte al giorno",
                ]}
              />

              {/* Step 1 — Google Places API Key */}
              <Step
                number={1}
                title="Google Places API Key"
                description="Serve per cercare il tuo hotel su Google Maps e ottenere il Place ID."
              >
                <div className="space-y-2">
                  <Label htmlFor="google_places_key">Google Places API Key</Label>
                  <Input
                    id="google_places_key"
                    type="password"
                    autoComplete="off"
                    placeholder="AIzaSy..."
                    value={config.google_places_api_key}
                    onChange={(e) => update("google_places_api_key", e.target.value)}
                  />
                  <HelpLink
                    label="Come ottenere la Google Places API Key"
                    href="https://console.cloud.google.com/apis/credentials"
                  >
                    <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground">
                      <li>Apri Google Cloud Console → APIs &amp; Services → Credentials</li>
                      <li>Crea un nuovo progetto (o seleziona uno esistente)</li>
                      <li>
                        Abilita l&apos;API &ldquo;Places API (New)&rdquo; dalla sezione
                        &ldquo;Library&rdquo;
                      </li>
                      <li>Clicca &ldquo;Create credentials&rdquo; → &ldquo;API key&rdquo;</li>
                      <li>Copia la chiave e incollala qui sopra. Ricordati di salvare.</li>
                    </ol>
                  </HelpLink>
                </div>
              </Step>

              {/* Step 2 — link hotel */}
              <Step
                number={2}
                title="Collega il tuo hotel"
                description="Cerca il tuo hotel su Google Maps e collegalo. Salva la Places API Key prima di procedere."
              >
                {config.google_maps_place_id ? (
                  <Alert className="border-green-200 bg-green-50">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-900 space-y-2">
                      <div>
                        <strong>Hotel collegato:</strong>{" "}
                        {config.google_maps_place_name || hotel.name}
                      </div>
                      {config.google_maps_place_address && (
                        <div className="text-sm">{config.google_maps_place_address}</div>
                      )}
                      <div className="text-xs font-mono opacity-70">
                        Place ID: {config.google_maps_place_id}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleDisconnectGoogleMaps}
                        className="mt-2 bg-transparent"
                      >
                        <Unlink className="mr-2 h-3 w-3" />
                        Scollega
                      </Button>
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowHotelMatcher((v) => !v)}
                      disabled={!config.google_places_api_key}
                    >
                      {showHotelMatcher ? "Nascondi" : "Cerca su Google Maps"}
                    </Button>
                    {!config.google_places_api_key && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Inserisci prima la Google Places API Key e salva.
                      </p>
                    )}
                    {showHotelMatcher && config.google_places_api_key && (
                      <Card className="mt-3 border-2 border-primary/20">
                        <CardContent className="pt-6">
                          <HotelMatcher
                            hotelId={hotel.id}
                            hotelName={hotel.name}
                            hotelAddress={hotel.address}
                            googleApiKey={config.google_places_api_key}
                            onConnected={async () => {
                              setShowHotelMatcher(false)
                              const refreshed = await fetch(
                                `/api/hotels/${hotel.id}/integrations`,
                              )
                              const json = await refreshed.json()
                              setConfig({ ...emptyConfig, ...(json.data ?? {}) })
                              toast({
                                title: "Hotel collegato",
                                description:
                                  "Ora puoi configurare Apify e sincronizzare le recensioni",
                              })
                            }}
                          />
                        </CardContent>
                      </Card>
                    )}
                  </>
                )}
              </Step>

              {/* Step 3 — Apify token (optional override) */}
              <Step
                number={3}
                title="Motore di scraping"
                description="Le recensioni vengono scaricate tramite un motore condiviso: non serve alcuna configurazione."
              >
                <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                  Di default usiamo il nostro account Apify condiviso a tutti gli hotel. Puoi
                  comunque impostare un token personale qui sotto per usare la tua quota.
                </div>

                <div className="space-y-2">
                  <Label htmlFor="apify_token">
                    Apify API Token <span className="text-muted-foreground">(opzionale)</span>
                  </Label>
                  <Input
                    id="apify_token"
                    type="password"
                    autoComplete="off"
                    placeholder="apify_api_... (lascia vuoto per usare il motore condiviso)"
                    value={config.apify_api_token}
                    onChange={(e) => update("apify_api_token", e.target.value)}
                  />
                  <HelpLink
                    label="Quando serve un token personale?"
                    href="https://console.apify.com/account/integrations"
                  >
                    <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground">
                      <li>Se vuoi usare la tua quota Apify invece di quella condivisa</li>
                      <li>
                        Crea un account su{" "}
                        <a
                          href="https://apify.com"
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          apify.com
                        </a>
                      </li>
                      <li>Vai in Settings → Integrations</li>
                      <li>Copia il &ldquo;Personal API token&rdquo;</li>
                    </ol>
                  </HelpLink>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleTestReviews}
                    disabled={isTesting === "reviews"}
                  >
                    {isTesting === "reviews" ? (
                      <>
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        Test…
                      </>
                    ) : (
                      "Testa connessione"
                    )}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSyncReviews}
                    disabled={
                      isSyncing ||
                      !(
                        config.google_maps_place_id ||
                        config.booking_com_url ||
                        config.tripadvisor_url ||
                        config.expedia_url ||
                        config.vrbo_url ||
                        config.airbnb_url
                      )
                    }
                  >
                    {isSyncing ? (
                      <>
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        Sincronizzazione…
                      </>
                    ) : (
                      "Sincronizza ora"
                    )}
                  </Button>
                </div>

                {config.apify_last_sync_at && (
                  <p className="text-xs text-muted-foreground">
                    Ultima sincronizzazione:{" "}
                    {new Date(config.apify_last_sync_at).toLocaleString("it-IT")}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  La piattaforma sincronizza automaticamente tutti i giorni alle 07:00 e alle 19:00.
                </p>
              </Step>

              {/* Step 4 — Other platforms */}
              <Step
                number={4}
                title="Altre piattaforme (opzionale)"
                description="Aggiungi gli URL delle pagine del tuo hotel su Booking.com, TripAdvisor ed Expedia per scaricare anche quelle recensioni. Il sistema sincronizza automaticamente 2 volte al giorno."
              >
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="booking_url" className="flex items-center gap-2">
                      <span className="inline-block w-5 h-5 bg-[#003580] rounded text-white text-xs flex items-center justify-center font-bold">B</span>
                      Booking.com
                    </Label>
                    <Input
                      id="booking_url"
                      type="url"
                      placeholder="https://www.booking.com/hotel/it/villa-i-barronci.it.html"
                      value={config.booking_com_url}
                      onChange={(e) => update("booking_com_url", e.target.value)}
                    />
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p><strong>Come trovarlo:</strong></p>
                      <ol className="list-decimal list-inside space-y-0.5 ml-2">
                        <li>Vai su <a href="https://www.booking.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">booking.com</a></li>
                        <li>Cerca il nome del tuo hotel</li>
                        <li>Clicca sulla pagina del tuo hotel</li>
                        <li>Copia l&apos;URL dalla barra degli indirizzi (es. booking.com/hotel/it/nome-hotel.html)</li>
                      </ol>
                    </div>
                    {config.booking_com_last_sync_at && (
                      <p className="text-xs text-green-600">
                        Ultimo sync: {new Date(config.booking_com_last_sync_at).toLocaleString("it-IT")}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="tripadvisor_url" className="flex items-center gap-2">
                      <span className="inline-block w-5 h-5 bg-[#00aa6c] rounded-full text-white text-xs flex items-center justify-center font-bold">T</span>
                      TripAdvisor
                    </Label>
                    <Input
                      id="tripadvisor_url"
                      type="url"
                      placeholder="https://www.tripadvisor.it/Hotel_Review-g187895-d1234567-Reviews-Villa_I_Barronci.html"
                      value={config.tripadvisor_url}
                      onChange={(e) => update("tripadvisor_url", e.target.value)}
                    />
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p><strong>Come trovarlo:</strong></p>
                      <ol className="list-decimal list-inside space-y-0.5 ml-2">
                        <li>Vai su <a href="https://www.tripadvisor.it" target="_blank" rel="noopener noreferrer" className="text-primary underline">tripadvisor.it</a></li>
                        <li>Cerca il nome del tuo hotel</li>
                        <li>Clicca sul risultato del tuo hotel</li>
                        <li>Copia l&apos;URL (contiene &quot;Hotel_Review&quot; e il nome)</li>
                      </ol>
                    </div>
                    {config.tripadvisor_last_sync_at && (
                      <p className="text-xs text-green-600">
                        Ultimo sync: {new Date(config.tripadvisor_last_sync_at).toLocaleString("it-IT")}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="expedia_url" className="flex items-center gap-2">
                      <span className="inline-block w-5 h-5 bg-[#ffcc00] rounded text-black text-xs flex items-center justify-center font-bold">E</span>
                      Expedia
                    </Label>
                    <Input
                      id="expedia_url"
                      type="url"
                      placeholder="https://www.expedia.it/Firenze-Hotel-Villa-I-Barronci.h12345.Informazioni-Hotel"
                      value={config.expedia_url}
                      onChange={(e) => update("expedia_url", e.target.value)}
                    />
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p><strong>Come trovarlo:</strong></p>
                      <ol className="list-decimal list-inside space-y-0.5 ml-2">
                        <li>Vai su <a href="https://www.expedia.it" target="_blank" rel="noopener noreferrer" className="text-primary underline">expedia.it</a></li>
                        <li>Cerca il nome del tuo hotel</li>
                        <li>Clicca sulla pagina del tuo hotel</li>
                        <li>Copia l&apos;URL (contiene &quot;.h&quot; seguito da numeri)</li>
                      </ol>
                    </div>
                    {config.expedia_last_sync_at && (
                      <p className="text-xs text-green-600">
                        Ultimo sync: {new Date(config.expedia_last_sync_at).toLocaleString("it-IT")}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="vrbo_url" className="flex items-center gap-2">
                      <span className="inline-block w-5 h-5 bg-[#245abc] rounded text-white text-xs flex items-center justify-center font-bold">V</span>
                      VRBO
                    </Label>
                    <Input
                      id="vrbo_url"
                      type="url"
                      placeholder="https://www.vrbo.com/1234567"
                      value={config.vrbo_url}
                      onChange={(e) => update("vrbo_url", e.target.value)}
                    />
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p><strong>Come trovarlo:</strong></p>
                      <ol className="list-decimal list-inside space-y-0.5 ml-2">
                        <li>Vai su <a href="https://www.vrbo.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">vrbo.com</a></li>
                        <li>Cerca il tuo annuncio (città + nome struttura)</li>
                        <li>Apri la pagina del tuo annuncio</li>
                        <li>Copia l&apos;URL completo dalla barra degli indirizzi</li>
                      </ol>
                    </div>
                    {config.vrbo_last_sync_at && (
                      <p className="text-xs text-green-600">
                        Ultimo sync: {new Date(config.vrbo_last_sync_at).toLocaleString("it-IT")}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="airbnb_url" className="flex items-center gap-2">
                      <span className="inline-block w-5 h-5 bg-[#ff385c] rounded-full text-white text-xs flex items-center justify-center font-bold">A</span>
                      Airbnb
                    </Label>
                    <Input
                      id="airbnb_url"
                      type="url"
                      placeholder="https://www.airbnb.it/rooms/12345678"
                      value={config.airbnb_url}
                      onChange={(e) => update("airbnb_url", e.target.value)}
                    />
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p><strong>Come trovarlo:</strong></p>
                      <ol className="list-decimal list-inside space-y-0.5 ml-2">
                        <li>Vai su <a href="https://www.airbnb.it" target="_blank" rel="noopener noreferrer" className="text-primary underline">airbnb.it</a></li>
                        <li>Apri l&apos;annuncio della tua struttura</li>
                        <li>Copia l&apos;URL della pagina (contiene <code>/rooms/</code> seguito dall&apos;ID)</li>
                        <li>
                          Se hai più annunci (es. camere separate), per ora è
                          possibile collegarne uno solo: scegli il principale.
                        </li>
                      </ol>
                    </div>
                    {config.airbnb_last_sync_at && (
                      <p className="text-xs text-green-600">
                        Ultimo sync: {new Date(config.airbnb_last_sync_at).toLocaleString("it-IT")}
                      </p>
                    )}
                  </div>
                </div>
              </Step>
            </CardContent>
          </Card>

          {/* Pubblicazione diretta delle risposte su Google Business */}
          {hotel?.id && <GoogleBusinessReplyCard hotelId={hotel.id} />}
        </TabsContent>

        {/* === TRAFFICO WEB (teaser Hotel Accelerator) === */}
        <TabsContent value="analytics" className="space-y-4 mt-4">
          <WebTrafficTool hotelId={hotel?.id} />
        </TabsContent>

        {/* === BOOKING KPI === */}
        <TabsContent value="booking" className="space-y-4 mt-4">
          <BookingKpiTab hotelId={hotel.id} />
        </TabsContent>

        {/* === EXPEDIA KPI === */}
        <TabsContent value="expedia" className="space-y-4 mt-4">
          <ExpediaKpiTab hotelId={hotel.id} />
        </TabsContent>

        {/* === CUSTOM K VARIABLES (FASE 7) === */}
        <TabsContent value="custom-vars" className="space-y-4 mt-4">
          <CustomVariableRequestTab hotelId={hotel.id} />
        </TabsContent>
      </Tabs>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-green-200 bg-green-50 text-green-900">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => router.back()} disabled={isLoading}>
          Annulla
        </Button>
        <Button onClick={handleSave} disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Salvataggio…
            </>
          ) : (
            "Salva configurazione"
          )}
        </Button>
      </div>
    </div>
  )
}

/* ----------------------------- sub-components ---------------------------- */

function WhatYouGet({ bullets }: { bullets: string[] }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-3 text-sm">
      <div className="font-medium mb-2">Cosa sblocchi con questa integrazione</div>
      <ul className="space-y-1 list-disc list-inside text-muted-foreground">
        {bullets.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
    </div>
  )
}

function Step({
  number,
  title,
  description,
  children,
}: {
  number: number
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-3 border-l-2 border-border pl-4">
      <div>
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
            {number}
          </span>
          <h4 className="font-semibold">{title}</h4>
        </div>
        {description && (
          <p className="text-sm text-muted-foreground mt-1 ml-8">{description}</p>
        )}
      </div>
      <div className="ml-8 space-y-3">{children}</div>
    </div>
  )
}

function HelpLink({
  label,
  href,
  children,
}: {
  label: string
  href: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="underline text-muted-foreground hover:text-foreground"
        >
          {open ? "Nascondi guida" : label}
        </button>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="h-3 w-3" />
          Apri
        </a>
      </div>
      {open && <div className="rounded-md bg-muted/50 p-3">{children}</div>}
    </div>
  )
}
