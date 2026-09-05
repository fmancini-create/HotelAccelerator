"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertCircle, CheckCircle2, Download, Headphones, Loader2, Music2, PhoneCall, RefreshCw } from "lucide-react"
import { AdminHeader } from "@/components/admin/admin-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type AudioStatus = {
  queue_number?: string
  connection_source?: "direct" | "shared" | "none"
  xapi?: {
    ok: boolean
    pbx_version?: string | null
    scope?: "system" | "department"
    system_moh_access?: boolean
    error?: string
  }
  queue?: { id: number; number: string; name: string | null; onHoldFile: string | null } | null
  system_music_on_hold?: string | null
  transfer_music?: { status: string; configured_file?: string | null; candidate_file?: string | null }
  ringback?: { target: string; status: string; download_url: string; note: string }
  background_music?: { target: string; status: string; note: string }
}

export default function PhoneAudioExperiencePage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<AudioStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/telephony/3cx/audio", { cache: "no-store" })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        setError(data?.error || "Impossibile leggere la configurazione audio 3CX.")
        return
      }
      setStatus(data)
    } catch {
      setError("Impossibile contattare il servizio audio 3CX.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function configureTransferMusic() {
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const response = await fetch("/api/telephony/3cx/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "configure_transfer_moh" }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        setError(data?.error || "Configurazione Music on Hold non riuscita.")
        return
      }
      setMessage(`Musica di attesa applicata alla coda ${data?.queue?.number || "820"}.`)
      await load()
    } catch {
      setError("Impossibile aggiornare la musica di attesa 3CX.")
    } finally {
      setSaving(false)
    }
  }

  const transferConfigured = status?.transfer_music?.status === "configured"
  const xapiReady = status?.xapi?.ok === true
  const departmentScope = status?.xapi?.scope === "department"

  return (
    <div className="min-h-full bg-background">
      <AdminHeader title="Esperienza audio 3CX" subtitle="Squilli, musica di attesa e audio dell'assistente 4BID" />
      <div className="container py-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Configurazione non completata</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {message ? (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Fatto</AlertTitle>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          ) : null}

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle>Collegamento amministrativo 3CX</CardTitle>
                  <CardDescription>Serve la Configuration API per applicare in automatico le impostazioni del PBX.</CardDescription>
                </div>
                <Badge variant={xapiReady ? "default" : "secondary"}>
                  {loading ? "Verifica…" : xapiReady ? (departmentScope ? "XAPI pronta · 4BID" : "XAPI pronta") : "XAPI da verificare"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {loading ? (
                <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Lettura centralino…</div>
              ) : xapiReady ? (
                <>
                  <p>
                    PBX rilevato{status?.xapi?.pbx_version ? ` · versione ${status.xapi.pbx_version}` : ""}. Connessione: {status?.connection_source === "shared" ? "PBX condiviso" : "diretta"}. Scope: {departmentScope ? "dipartimento 4BID" : "sistema"}.
                  </p>
                  {departmentScope && status?.xapi?.system_moh_access === false ? (
                    <p className="text-muted-foreground">
                      Il Service Principal è correttamente limitato a 4BID: può lavorare sulla coda del reparto anche se 3CX nasconde le impostazioni Music on Hold globali.
                    </p>
                  ) : null}
                  <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Aggiorna verifica</Button>
                </>
              ) : (
                <>
                  <p className="font-medium">Controlla i permessi del Service Principal:</p>
                  <p className="text-muted-foreground">
                    In 3CX → Integrations → API abilita <strong>3CX Configuration API Access</strong>. Per limitarlo a 4BID usa <strong>Dipartimento 4BID + Proprietario</strong> e assicurati che la coda <strong>820</strong> appartenga allo stesso dipartimento. Usa <strong>System Owner</strong> solo se vuoi accesso globale al PBX.
                  </p>
                  {status?.xapi?.error ? <p className="text-destructive">{status.xapi.error}</p> : null}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-start gap-3">
                <PhoneCall className="mt-0.5 h-5 w-5" />
                <div>
                  <CardTitle>1. Due squilli prima dell'AI</CardTitle>
                  <CardDescription>Il DID non deve sembrare risposto istantaneamente.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p>Ho predisposto un prompt con <strong>due squilli</strong> nel formato corretto per 3CX: WAV PCM, 8 kHz, 16 bit, mono.</p>
              <Button asChild variant="outline">
                <a href="/api/telephony/3cx/audio/ringback"><Download className="mr-2 h-4 w-4" />Scarica “due squilli”</a>
              </Button>
              <div className="rounded-lg border p-4 text-muted-foreground">
                In 3CX crea un brevissimo Digital Receptionist davanti all'AI Agent, usa questo WAV come prompt e allo scadere inoltra automaticamente alla destinazione AI. In questo modo il chiamante sente esattamente due squilli controllati dal PBX prima del saluto.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Headphones className="mt-0.5 h-5 w-5" />
                  <div>
                    <CardTitle>2. Musica durante il trasferimento</CardTitle>
                    <CardDescription>Coda operatore 4BID: {status?.queue_number || "820"}.</CardDescription>
                  </div>
                </div>
                <Badge variant={transferConfigured ? "default" : "secondary"}>{transferConfigured ? "Configurata" : "Da configurare"}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {status?.queue ? <p>Coda rilevata: <strong>{status.queue.name || status.queue.number}</strong>. File attuale: {status.queue.onHoldFile || "nessuno"}.</p> : <p className="text-muted-foreground">La coda verrà verificata appena la Configuration API sarà disponibile.</p>}
              {status?.system_music_on_hold ? <p>Musica disponibile nel PBX: <strong>{status.system_music_on_hold}</strong>.</p> : null}
              {!status?.system_music_on_hold && status?.transfer_music?.candidate_file ? (
                <p className="text-muted-foreground">File candidato per la coda: <strong>{status.transfer_music.candidate_file}</strong>.</p>
              ) : null}
              <Button onClick={() => void configureTransferMusic()} disabled={!xapiReady || saving || transferConfigured}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Headphones className="mr-2 h-4 w-4" />}
                {transferConfigured ? "Musica già applicata" : "Configura musica di attesa sulla 820"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-start gap-3">
                <Music2 className="mt-0.5 h-5 w-5" />
                <div>
                  <CardTitle>3. Musica bassa sotto la voce dell'AI</CardTitle>
                  <CardDescription>Questo è un requisito diverso dalla Music on Hold.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>Il 3CX AI Agent standard non espone un mixer per mantenere una traccia musicale sotto la conversazione realtime. Per non fingere che sia risolto, questo punto resta separato.</p>
              <p className="text-muted-foreground">La soluzione corretta è una <strong>Programmable Extension / call script</strong> che controlli direttamente il media stream, misceli la musica a volume basso e continui a usare HotelAccelerator per knowledge base, licenze e CRM. La Music on Hold della coda 820 resta comunque indipendente e viene gestita dal punto 2.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
