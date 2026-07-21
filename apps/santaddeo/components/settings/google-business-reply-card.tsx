"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CheckCircle2, Loader2, MapPin, MessageSquareReply, Unlink } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface GoogleBusinessStatus {
  connected: boolean
  email: string | null
  hasLocation: boolean
  connectedAt: string | null
}

interface LocationOption {
  accountId: string
  locationId: string
  label: string
  address: string | null
}

/**
 * Card self-service per collegare l'account Google Business e pubblicare le
 * risposte alle recensioni Google direttamente da Santaddeo.
 *
 * Mostra lo stato reale del collegamento (token presente, email, sede
 * abbinata). La pubblicazione vera richiede anche che l'accesso all'API My
 * Business sia approvato lato Google Cloud: lo segnaliamo onestamente.
 */
export function GoogleBusinessReplyCard({ hotelId }: { hotelId: string }) {
  const { toast } = useToast()
  const [status, setStatus] = useState<GoogleBusinessStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState(false)
  const [locations, setLocations] = useState<LocationOption[] | null>(null)
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null)
  const [loadingLocations, setLoadingLocations] = useState(false)
  const [savingLocation, setSavingLocation] = useState(false)
  const [locationsError, setLocationsError] = useState<string | null>(null)

  const load = async () => {
    try {
      const res = await fetch(`/api/integrations/google-business?hotelId=${encodeURIComponent(hotelId)}`)
      if (res.ok) setStatus(await res.json())
    } catch {
      // stato non disponibile: lasciamo null → mostra "non collegato"
    } finally {
      setLoading(false)
    }
  }

  const loadLocations = async () => {
    setLoadingLocations(true)
    setLocationsError(null)
    try {
      const res = await fetch(
        `/api/integrations/google-business/locations?hotelId=${encodeURIComponent(hotelId)}`,
      )
      const json = await res.json()
      if (!res.ok) {
        // Quota non approvata o sessione scaduta: messaggio onesto, niente lista finta.
        setLocationsError(json.message ?? "Impossibile recuperare le sedi.")
        setLocations(null)
        return
      }
      setLocations(json.locations ?? [])
      setSelectedLocation(json.selected ?? null)
    } catch {
      setLocationsError("Impossibile recuperare le sedi.")
      setLocations(null)
    } finally {
      setLoadingLocations(false)
    }
  }

  const saveLocation = async (locationId: string) => {
    const loc = locations?.find((l) => l.locationId === locationId)
    if (!loc) return
    setSavingLocation(true)
    try {
      const res = await fetch(
        `/api/integrations/google-business/locations?hotelId=${encodeURIComponent(hotelId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId: loc.accountId, locationId: loc.locationId }),
        },
      )
      if (!res.ok) throw new Error()
      setSelectedLocation(locationId)
      await load()
      toast({ title: "Sede Google Business salvata", description: loc.label })
    } catch {
      toast({ title: "Errore nel salvataggio della sede", variant: "destructive" })
    } finally {
      setSavingLocation(false)
    }
  }

  useEffect(() => {
    void load()
    // Se torniamo dal callback OAuth, mostra un toast in base all'esito.
    const params = new URLSearchParams(window.location.search)
    const outcome = params.get("google_business")
    if (outcome) {
      const map: Record<string, { title: string; variant?: "destructive" }> = {
        connected: { title: "Account Google Business collegato" },
        denied: { title: "Collegamento annullato", variant: "destructive" },
        invalid: { title: "Richiesta non valida, riprova", variant: "destructive" },
        no_refresh_token: { title: "Google non ha restituito il consenso offline, riprova", variant: "destructive" },
        save_error: { title: "Errore nel salvataggio del collegamento", variant: "destructive" },
        error: { title: "Errore durante il collegamento", variant: "destructive" },
      }
      const m = map[outcome]
      if (m) toast({ title: m.title, variant: m.variant })
      // pulisci il query param
      params.delete("google_business")
      const qs = params.toString()
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelId])

  // Quando l'account risulta collegato, carica le sedi disponibili per la scelta.
  useEffect(() => {
    if (status?.connected && locations === null && !loadingLocations) {
      void loadLocations()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.connected])

  const connect = () => {
    window.location.href = `/api/integrations/google-business/connect?hotelId=${encodeURIComponent(hotelId)}`
  }

  const disconnect = async () => {
    if (!confirm("Scollegare l'account Google Business? Non potrai più pubblicare le risposte da qui.")) return
    setDisconnecting(true)
    try {
      const res = await fetch(`/api/integrations/google-business?hotelId=${encodeURIComponent(hotelId)}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error()
      await load()
      toast({ title: "Account Google Business scollegato" })
    } catch {
      toast({ title: "Errore durante lo scollegamento", variant: "destructive" })
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquareReply className="h-5 w-5" />
          Rispondi alle recensioni Google
        </CardTitle>
        <CardDescription>
          Collega l&apos;account Google Business della struttura per pubblicare le risposte alle
          recensioni Google direttamente da qui, senza passare dall&apos;extranet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Caricamento stato…
          </div>
        ) : status?.connected ? (
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-900 space-y-2">
              <div>
                <strong>Account collegato</strong>
                {status.email ? `: ${status.email}` : ""}
              </div>

              {/* Selettore della sede: l'OAuth concede l'accesso all'intero
                  account Google; se l'utente ha più schede deve scegliere qui
                  quale collegare alla struttura. */}
              <div className="space-y-2 rounded-md border border-green-200 bg-background/60 p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-green-900">
                  <MapPin className="h-4 w-4" />
                  Sede Google Business
                </div>
                {loadingLocations ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Recupero delle sedi…
                  </div>
                ) : locationsError ? (
                  <p className="text-sm text-muted-foreground">{locationsError}</p>
                ) : locations && locations.length > 0 ? (
                  <>
                    <Select
                      value={selectedLocation ?? undefined}
                      onValueChange={saveLocation}
                      disabled={savingLocation}
                    >
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder="Scegli la sede da collegare…" />
                      </SelectTrigger>
                      <SelectContent>
                        {locations.map((loc) => (
                          <SelectItem key={loc.locationId} value={loc.locationId}>
                            {loc.label}
                            {loc.address ? ` — ${loc.address}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {savingLocation && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Salvataggio…
                      </div>
                    )}
                    {!selectedLocation && (
                      <p className="text-xs text-muted-foreground">
                        Hai più sedi: seleziona quella corretta per pubblicare le risposte sulla
                        scheda giusta.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Nessuna sede trovata su questo account Google.
                  </p>
                )}
              </div>

              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={disconnect}
                disabled={disconnecting}
                className="mt-1 bg-transparent"
              >
                {disconnecting ? (
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                ) : (
                  <Unlink className="mr-2 h-3 w-3" />
                )}
                Scollega
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Autorizza Santaddeo a gestire le risposte del tuo profilo Google Business. Userai il
              tuo account Google: il collegamento si può revocare in qualsiasi momento.
            </p>
            <Button type="button" onClick={connect} className="gap-2">
              <MessageSquareReply className="h-4 w-4" />
              Collega Google Business
            </Button>
          </div>
        )}

        <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground leading-relaxed">
          <strong>Nota:</strong> la pubblicazione diretta richiede che l&apos;accesso all&apos;API
          Google Business sia approvato per la piattaforma. Finché l&apos;approvazione di Google è in
          corso, puoi comunque generare e copiare le risposte. La risposta diretta è disponibile solo
          per Google: per Booking e TripAdvisor continua a usare la funzione &ldquo;Copia&rdquo;.
        </div>
      </CardContent>
    </Card>
  )
}
