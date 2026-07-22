"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Lock,
  PlayCircle,
  XCircle,
} from "lucide-react"

// Codici connettore con catalogo di test disponibile (allineato a test-catalog.ts).
const SUPPORTED_CONNECTORS = new Set(["scidoo", "brig", "slope"])

interface HotelIntegration {
  pms_name: string | null
  integration_mode: string | null
  is_active?: boolean | null
}

interface Hotel {
  id: string
  name: string | null
  city: string | null
  pms_integrations?: HotelIntegration[]
}

interface EndpointMeta {
  key: string
  method: string
  path: string
  description: string
  readOnly: boolean
}

interface CatalogMeta {
  code: string
  label: string
  note?: string
  endpoints: EndpointMeta[]
}

interface EndpointResult {
  ok: boolean
  status?: number
  latencyMs: number
  summary?: string
  error?: string
}

/** Replica lato client della risoluzione connettore del registry. */
function resolveConnectorCode(integration?: HotelIntegration): string | null {
  if (!integration) return null
  const mode = integration.integration_mode?.toLowerCase().trim()
  if (mode === "gsheets" || mode === "bedzzle_gdocs") return "gsheets"
  return integration.pms_name?.toLowerCase().trim() || null
}

function methodBadgeClass(method: string): string {
  switch (method) {
    case "GET":
      return "bg-primary/10 text-primary border-primary/20"
    case "POST":
      return "bg-accent text-accent-foreground border-transparent"
    default:
      return "bg-muted text-muted-foreground border-transparent"
  }
}

export function ConnectorEndpointTester() {
  const [hotels, setHotels] = useState<Hotel[]>([])
  const [loadingHotels, setLoadingHotels] = useState(true)
  const [hotelsError, setHotelsError] = useState<string | null>(null)
  const [selectedHotelId, setSelectedHotelId] = useState<string>("")

  const [catalog, setCatalog] = useState<CatalogMeta | null>(null)
  const [loadingCatalog, setLoadingCatalog] = useState(false)
  const [catalogError, setCatalogError] = useState<string | null>(null)

  const [results, setResults] = useState<Record<string, EndpointResult>>({})
  const [running, setRunning] = useState<Record<string, boolean>>({})
  const [runningAll, setRunningAll] = useState(false)

  // Solo hotel con un connettore testabile (scidoo/brig/slope).
  const testableHotels = useMemo(
    () =>
      hotels
        .map((h) => ({ hotel: h, code: resolveConnectorCode(h.pms_integrations?.[0]) }))
        .filter((x) => x.code && SUPPORTED_CONNECTORS.has(x.code)),
    [hotels],
  )

  const selected = testableHotels.find((x) => x.hotel.id === selectedHotelId)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoadingHotels(true)
      setHotelsError(null)
      try {
        const res = await fetch("/api/superadmin/hotels")
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!cancelled) setHotels(Array.isArray(data.hotels) ? data.hotels : [])
      } catch (err) {
        if (!cancelled) setHotelsError(err instanceof Error ? err.message : "Errore caricamento hotel")
      } finally {
        if (!cancelled) setLoadingHotels(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Al cambio hotel: reset risultati e carica il catalogo del connettore.
  useEffect(() => {
    if (!selected?.code) {
      setCatalog(null)
      return
    }
    let cancelled = false
    ;(async () => {
      setLoadingCatalog(true)
      setCatalogError(null)
      setResults({})
      try {
        const res = await fetch(`/api/superadmin/connectors/test-endpoint?connector=${selected.code}`)
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `HTTP ${res.status}`)
        }
        const data = await res.json()
        if (!cancelled) setCatalog(data.catalog as CatalogMeta)
      } catch (err) {
        if (!cancelled) setCatalogError(err instanceof Error ? err.message : "Errore caricamento catalogo")
      } finally {
        if (!cancelled) setLoadingCatalog(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selected?.code, selectedHotelId])

  async function runEndpoint(endpointKey: string): Promise<void> {
    if (!selectedHotelId) return
    setRunning((prev) => ({ ...prev, [endpointKey]: true }))
    try {
      const res = await fetch("/api/superadmin/connectors/test-endpoint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId: selectedHotelId, endpointKey }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setResults((prev) => ({
          ...prev,
          [endpointKey]: { ok: false, latencyMs: 0, error: data.error || `HTTP ${res.status}` },
        }))
      } else {
        setResults((prev) => ({ ...prev, [endpointKey]: data.result as EndpointResult }))
      }
    } catch (err) {
      setResults((prev) => ({
        ...prev,
        [endpointKey]: {
          ok: false,
          latencyMs: 0,
          error: err instanceof Error ? err.message : "Errore di rete",
        },
      }))
    } finally {
      setRunning((prev) => ({ ...prev, [endpointKey]: false }))
    }
  }

  async function runAll(): Promise<void> {
    if (!catalog) return
    setRunningAll(true)
    try {
      for (const ep of catalog.endpoints.filter((e) => e.readOnly)) {
        await runEndpoint(ep.key)
        // piccola pausa per non saturare i rate limit per-minuto
        await new Promise((r) => setTimeout(r, 350))
      }
    } finally {
      setRunningAll(false)
    }
  }

  const readOnlyCount = catalog?.endpoints.filter((e) => e.readOnly).length ?? 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Test endpoint connettore</CardTitle>
        <CardDescription>
          Seleziona una struttura per vedere tutti gli endpoint del suo connettore e verificarne il
          funzionamento con chiamate reali. Gli endpoint di scrittura sono elencati ma non eseguibili.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Selettore hotel */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-md">
            <Select
              value={selectedHotelId}
              onValueChange={setSelectedHotelId}
              disabled={loadingHotels || testableHotels.length === 0}
            >
              <SelectTrigger aria-label="Seleziona struttura">
                <SelectValue
                  placeholder={loadingHotels ? "Caricamento strutture..." : "Seleziona una struttura"}
                />
              </SelectTrigger>
              <SelectContent>
                {testableHotels.map(({ hotel, code }) => (
                  <SelectItem key={hotel.id} value={hotel.id}>
                    {hotel.name || "Senza nome"}
                    {hotel.city ? ` — ${hotel.city}` : ""} ({code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {catalog && readOnlyCount > 0 && (
            <Button variant="outline" size="sm" onClick={runAll} disabled={runningAll}>
              {runningAll ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <PlayCircle className="mr-2 h-4 w-4" />
              )}
              Verifica tutti ({readOnlyCount})
            </Button>
          )}
        </div>

        {hotelsError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>Errore caricamento strutture: {hotelsError}</AlertDescription>
          </Alert>
        )}

        {!loadingHotels && testableHotels.length === 0 && !hotelsError && (
          <p className="text-sm text-muted-foreground">
            Nessuna struttura con un connettore testabile (Scidoo, BRiG o Slope).
          </p>
        )}

        {loadingCatalog && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Caricamento endpoint...
          </div>
        )}

        {catalogError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{catalogError}</AlertDescription>
          </Alert>
        )}

        {catalog?.note && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{catalog.note}</AlertDescription>
          </Alert>
        )}

        {/* Lista endpoint */}
        {catalog && (
          <div className="divide-y rounded-lg border">
            {catalog.endpoints.map((ep) => {
              const result = results[ep.key]
              const isRunning = running[ep.key]
              return (
                <div key={ep.key} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={methodBadgeClass(ep.method)}>
                        {ep.method}
                      </Badge>
                      <code className="truncate font-mono text-sm text-foreground">{ep.path}</code>
                      {!ep.readOnly && (
                        <Badge variant="secondary" className="gap-1">
                          <Lock className="h-3 w-3" /> Scrittura — non testabile
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{ep.description}</p>
                    {result && (
                      <div className="flex flex-wrap items-center gap-2 pt-1 text-sm">
                        {result.ok ? (
                          <span className="inline-flex items-center gap-1 text-primary">
                            <CheckCircle2 className="h-4 w-4" /> OK
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-destructive">
                            <XCircle className="h-4 w-4" /> Errore
                          </span>
                        )}
                        {typeof result.status === "number" && (
                          <Badge variant="outline">HTTP {result.status}</Badge>
                        )}
                        {result.latencyMs > 0 && (
                          <span className="text-muted-foreground">{result.latencyMs} ms</span>
                        )}
                        <span className={result.ok ? "text-muted-foreground" : "text-destructive"}>
                          {result.ok ? result.summary : result.error}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="shrink-0">
                    {ep.readOnly ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => runEndpoint(ep.key)}
                        disabled={isRunning || runningAll}
                      >
                        {isRunning ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <PlayCircle className="mr-2 h-4 w-4" />
                        )}
                        Verifica
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" disabled>
                        <Lock className="mr-2 h-4 w-4" /> Non eseguibile
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
