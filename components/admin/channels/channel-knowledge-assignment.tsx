"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertCircle, Database, Loader2, RefreshCw } from "lucide-react"

import {
  ChannelBasesAssignment,
  type BaseOption,
  type ChannelRow,
} from "@/components/admin/knowledge/channel-bases-assignment"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

interface ChannelsResponse {
  channels?: ChannelRow[]
  error?: string
}

interface BasesResponse {
  bases?: Array<{ id: string; name: string }>
  error?: string
}

/**
 * Riporta l'associazione base-canale nella pagina in cui l'utente si aspetta
 * di trovarla. Le due letture sono indipendenti e partono insieme; il cleanup
 * impedisce a una risposta del tenant precedente di aggiornare la schermata.
 */
export function ChannelKnowledgeAssignment() {
  const [channels, setChannels] = useState<ChannelRow[]>([])
  const [bases, setBases] = useState<BaseOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setError(null)

      try {
        const [channelsResponse, basesResponse] = await Promise.all([
          fetch("/api/admin/ai/channels", { credentials: "include", cache: "no-store" }),
          fetch("/api/admin/ai/knowledge-bases", { credentials: "include", cache: "no-store" }),
        ])
        const [channelsData, basesData] = (await Promise.all([
          channelsResponse.json(),
          basesResponse.json(),
        ])) as [ChannelsResponse, BasesResponse]

        if (!channelsResponse.ok) throw new Error(channelsData.error || "Canali non caricati")
        if (!basesResponse.ok) throw new Error(basesData.error || "Basi di conoscenza non caricate")
        if (cancelled) return

        setChannels(channelsData.channels ?? [])
        setBases((basesData.bases ?? []).map(({ id, name }) => ({ id, name })))
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Associazioni non caricate")
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  if (isLoading) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Caricamento delle basi associate ai canali...
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium text-foreground">Associazioni non disponibili</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setReloadKey((current) => current + 1)}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Riprova
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (bases.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="flex flex-col items-start gap-3 p-6">
          <Database className="h-6 w-6 text-muted-foreground" />
          <div>
            <p className="font-medium text-foreground">Nessuna base di conoscenza disponibile</p>
            <p className="text-sm text-muted-foreground">
              Crea prima una base e poi torna qui per associarla a Email, WhatsApp o Telegram.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/knowledge">Crea una base di conoscenza</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <ChannelBasesAssignment
      channels={channels}
      bases={bases}
      title="Basi di conoscenza per canale"
      description={
        <>
          Associa qui le basi a Email, WhatsApp e Telegram. Per Chat e Telefono la base si sceglie nella
          configurazione del singolo widget o agente.
        </>
      }
    />
  )
}
