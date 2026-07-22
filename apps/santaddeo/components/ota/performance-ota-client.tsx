"use client"

import useSWR from "swr"
import Link from "next/link"
import { useHotel } from "@/lib/contexts/hotel-context"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle, Upload, Zap } from "lucide-react"
import { OtaKpiCards } from "./ota-kpi-cards"
import { OtaTrendChart } from "./ota-trend-chart"
import { OtaChannelMix } from "./ota-channel-mix"
import { OtaKWeightsSuggestion } from "./ota-k-weights-suggestion"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function PerformanceOtaClient() {
  const { selectedHotel } = useHotel()
  const hotelId = selectedHotel?.id

  const { data, isLoading, error } = useSWR(
    hotelId ? `/api/ota/stats?hotelId=${hotelId}` : null,
    fetcher,
    { revalidateOnFocus: false },
  )

  if (!hotelId) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Seleziona una struttura</AlertTitle>
        <AlertDescription>
          Scegli un hotel dal menu in alto per visualizzare le performance OTA.
        </AlertDescription>
      </Alert>
    )
  }

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Errore</AlertTitle>
        <AlertDescription>Impossibile caricare le statistiche OTA.</AlertDescription>
      </Alert>
    )
  }

  const snapshotsCount: number = data?.snapshots?.length ?? 0
  const channelMix = data?.channelMix ?? null
  const snapshots = data?.snapshots ?? []
  const latest = snapshots[0] ?? null
  const suggestedWeights = data?.suggestedWeights ?? null

  // Onboarding state: no manual KPI yet
  if (snapshotsCount === 0) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <CardTitle>Nessun KPI Booking ancora registrato</CardTitle>
                <CardDescription className="max-w-2xl mt-1">
                  Questa pagina si attiva quando inserisci i primi dati dall&apos;Extranet
                  Booking.com. Bastano 3 numeri (Visualizzazioni ricerca, Visualizzazioni
                  struttura, Prenotazioni) e puoi opzionalmente caricare il PDF del Report.
                </CardDescription>
              </div>
              <Button asChild>
                <Link href="/settings/advanced?tab=booking">
                  <Upload className="h-4 w-4 mr-2" />
                  Inserisci i primi KPI
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Dopo 2&ndash;3 inserimenti mensili potrai confrontare l&apos;andamento nel tempo
              e la piattaforma ti suggerir&agrave; automaticamente il peso giusto da assegnare
              alle variabili K collegate a Booking.com, in base alla reale quota del canale
              sul fatturato.
            </p>

            {channelMix && channelMix.totalRevenue > 0 && (
              <div className="border rounded-lg p-4 bg-muted/30">
                <p className="text-sm font-medium mb-2">
                  Dal tuo PMS sappiamo gi&agrave; questo:
                </p>
                <OtaChannelMix mix={channelMix} compact />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <OtaKpiCards latest={latest} previous={snapshots[1] ?? null} />

      {/* Trend + Channel mix */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Andamento KPI Booking</CardTitle>
            <CardDescription>
              Visualizzazioni e prenotazioni manuali inserite dall&apos;Extranet
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OtaTrendChart snapshots={snapshots} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mix canali</CardTitle>
            <CardDescription>Fonte: prenotazioni PMS ultimi 90 giorni</CardDescription>
          </CardHeader>
          <CardContent>
            {channelMix ? (
              <OtaChannelMix mix={channelMix} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Dati PMS non disponibili.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Insights */}
      {snapshotsCount < 3 && (
        <Alert>
          <Zap className="h-4 w-4" />
          <AlertTitle>Ancora pochi dati</AlertTitle>
          <AlertDescription>
            Dopo {3 - snapshotsCount} inserimento{snapshotsCount === 2 ? "" : "i"} in pi&ugrave;,
            potremo analizzare il trend e suggerire i pesi K ottimali.
          </AlertDescription>
        </Alert>
      )}

      {/* Suggested K weights */}
      {suggestedWeights && (
        <OtaKWeightsSuggestion
          weights={suggestedWeights}
          snapshotsCount={snapshotsCount}
          hotelId={hotelId}
        />
      )}
    </div>
  )
}
