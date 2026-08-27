"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertCircle, Bot, CheckCircle2, Copy, KeyRound, Loader2, Phone, Save, Settings2 } from "lucide-react"
import { AdminHeader } from "@/components/admin/admin-header"
import { TelephonyExtensionsCard } from "@/components/admin/telephony-extensions-card"
import { VoiceIvrRoutingCard } from "@/components/admin/voice-ivr-routing-card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type Integration = {
  base_url: string
  client_id: string
  default_extension: string
  credentials_preview: { client_secret: string }
  has_credentials: { client_secret: boolean; inbound_secret: boolean; voice_inbound_secret: boolean }
  last_check_at: string | null
  last_check_status: string | null
  last_check_error: string | null
}

type VoiceAgentLink = {
  key: string
  label: string
  fallback_extension: string
  status: "ready" | "empty"
  knowledge_base: { id: string; name: string; source_count: number }
  query_url: string
}

type SetupMode = "loading" | "4bid_advanced" | "tenant_easy"

export default function PhoneChannelPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [integration, setIntegration] = useState<Integration | null>(null)
  const [baseUrl, setBaseUrl] = useState("")
  const [clientId, setClientId] = useState("")
  const [clientSecret, setClientSecret] = useState("")
  const [extension, setExtension] = useState("")
  const [result, setResult] = useState<{ ok: boolean; message: string; extensions?: string[] } | null>(null)
  const [apiKey, setApiKey] = useState("")
  const [preparingCrm, setPreparingCrm] = useState(false)
  const [mode, setMode] = useState<SetupMode>("loading")

  const [voicePreparing, setVoicePreparing] = useState(false)
  const [voiceRotating, setVoiceRotating] = useState(false)
  const [voiceApiKey, setVoiceApiKey] = useState("")
  const [voiceCredentialMessage, setVoiceCredentialMessage] = useState<string | null>(null)
  const [voiceAgents, setVoiceAgents] = useState<VoiceAgentLink[]>([])
  const [selectedVoiceAgentKey, setSelectedVoiceAgentKey] = useState("")
  const [copied, setCopied] = useState<string | null>(null)

  const detectMode = useCallback(async () => {
    try {
      const response = await fetch("/api/telephony/3cx/voice/routes", { cache: "no-store" })
      setMode(response.ok ? "4bid_advanced" : "tenant_easy")
    } catch {
      setMode("tenant_easy")
    }
  }, [])

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/telephony/3cx", { cache: "no-store" })
      if (!res.ok) return
      const data = await res.json()
      const row = data.integration as Integration | null
      if (row) {
        setIntegration(row)
        setBaseUrl(row.base_url)
        setClientId(row.client_id)
        setExtension(row.default_extension)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void Promise.all([load(), detectMode()])
  }, [load, detectMode])

  const connected = integration?.last_check_status === "ok"
  const readyVoiceAgents = useMemo(() => voiceAgents.filter((agent) => agent.status === "ready"), [voiceAgents])
  const selectedVoiceAgent = readyVoiceAgents.find((agent) => agent.key === selectedVoiceAgentKey) ?? readyVoiceAgents[0] ?? null

  async function save() {
    setSaving(true)
    setResult(null)
    try {
      const res = await fetch("/api/telephony/3cx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base_url: baseUrl,
          client_id: clientId,
          client_secret: clientSecret,
          default_extension: extension,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setResult({ ok: false, message: data?.error || "Salvataggio non riuscito." })
        return
      }
      setIntegration(data.integration)
      setClientSecret("")
      if (data.verified) {
        const list = Array.isArray(data.extensions)
          ? (data.extensions as Array<{ dn: string }>).map((item) => item.dn)
          : []
        setResult({ ok: true, message: "Connessione 3CX verificata.", extensions: list })
        void prepareCrmLink()
      } else {
        setResult({ ok: false, message: `Dati salvati, ma la verifica 3CX non riesce: ${data.error || "errore sconosciuto"}` })
      }
    } catch {
      setResult({ ok: false, message: "Impossibile contattare il servizio." })
    } finally {
      setSaving(false)
    }
  }

  async function prepareCrmLink() {
    setPreparingCrm(true)
    try {
      const response = await fetch("/api/telephony/3cx/crm-link", { method: "POST" })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.api_key) {
        setResult({ ok: false, message: data?.error || "Non è stato possibile preparare il collegamento CRM." })
        return
      }
      setApiKey(String(data.api_key))
      await load()
    } finally {
      setPreparingCrm(false)
    }
  }

  async function loadVoiceAgents() {
    const response = await fetch("/api/telephony/3cx/inbound-urls", { cache: "no-store" })
    const data = await response.json().catch(() => null)
    if (!response.ok || !Array.isArray(data?.voice_agents)) {
      setResult({ ok: false, message: data?.error || "Non è stato possibile leggere gli assistenti vocali." })
      return false
    }
    const agents = data.voice_agents as VoiceAgentLink[]
    setVoiceAgents(agents)
    const firstReady = agents.find((agent) => agent.status === "ready")
    setSelectedVoiceAgentKey((current) => current || firstReady?.key || "")
    if (data.configuration_mode === "4bid_advanced") setMode("4bid_advanced")
    return true
  }

  async function prepareVoiceAgents() {
    setVoicePreparing(true)
    setResult(null)
    try {
      const secretResponse = await fetch("/api/telephony/3cx/voice-link", { method: "POST" })
      const secretData = await secretResponse.json().catch(() => null)
      if (!secretResponse.ok) {
        setResult({ ok: false, message: secretData?.error || "Non è stato possibile predisporre l'assistente vocale." })
        return
      }
      if (!(await loadVoiceAgents())) return
      if (typeof secretData?.api_key === "string" && secretData.api_key) {
        setVoiceApiKey(secretData.api_key)
        setVoiceCredentialMessage("Credenziale vocale creata. Copiala adesso in 3CX: verrà mostrata una sola volta.")
      } else {
        setVoiceCredentialMessage("La credenziale vocale è già configurata. Se devi recuperarla, ruotala e aggiorna 3CX.")
      }
      await load()
    } catch {
      setResult({ ok: false, message: "Impossibile preparare l'assistente vocale." })
    } finally {
      setVoicePreparing(false)
    }
  }

  async function rotateVoiceCredential() {
    if (!window.confirm("La credenziale precedente smetterà subito di funzionare. Vuoi crearne una nuova?")) return
    setVoiceRotating(true)
    try {
      const response = await fetch("/api/telephony/3cx/voice-link", { method: "PUT" })
      const data = await response.json().catch(() => null)
      if (!response.ok || typeof data?.api_key !== "string" || !data.api_key) {
        setResult({ ok: false, message: data?.error || "Rotazione della credenziale non riuscita." })
        return
      }
      setVoiceApiKey(data.api_key)
      setVoiceCredentialMessage("Credenziale ruotata. Aggiorna subito il parametro protetto in 3CX.")
      await loadVoiceAgents()
    } finally {
      setVoiceRotating(false)
    }
  }

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(label)
      window.setTimeout(() => setCopied(null), 1800)
    } catch {
      setCopied(null)
    }
  }

  return (
    <div className="min-h-full bg-background">
      <AdminHeader
        title="Telefono IP"
        subtitle={mode === "4bid_advanced" ? "Centralino e assistente vocale 4BID" : "Collega il centralino e attiva l'assistente vocale"}
      />

      <div className="container py-6">
        <div className="mx-auto max-w-3xl space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ha-brand-soft">
                    <Phone className="h-5 w-5 text-ha-brand-soft-foreground" aria-hidden="true" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">Centralino 3CX</CardTitle>
                    <CardDescription>Collega una sola volta il centralino del tenant a HotelAccelerator.</CardDescription>
                  </div>
                </div>
                {!loading ? <Badge variant={connected ? "default" : "secondary"}>{connected ? "Collegato" : "Da collegare"}</Badge> : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="base-url">Indirizzo 3CX</Label>
                  <Input id="base-url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://azienda.my3cx.it" autoComplete="off" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="client-id">Client ID applicazione</Label>
                  <Input id="client-id" value={clientId} onChange={(event) => setClientId(event.target.value)} placeholder="900" autoComplete="off" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="extension">Interno operatore</Label>
                  <Input id="extension" value={extension} onChange={(event) => setExtension(event.target.value)} placeholder="200" autoComplete="off" />
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="client-secret">API key 3CX</Label>
                  <Input
                    id="client-secret"
                    type="password"
                    value={clientSecret}
                    onChange={(event) => setClientSecret(event.target.value)}
                    placeholder={integration?.has_credentials.client_secret ? `Già salvata (${integration.credentials_preview.client_secret})` : "Incolla la API key 3CX"}
                    autoComplete="new-password"
                  />
                  <p className="text-xs text-muted-foreground">Se è già salvata, lascia il campo vuoto per non modificarla.</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => void save()} disabled={saving || loading}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Salva e verifica
                </Button>
                {integration?.last_check_at ? <span className="text-xs text-muted-foreground">Ultima verifica: {new Date(integration.last_check_at).toLocaleString("it-IT")}</span> : null}
              </div>
              {result ? (
                <Alert variant={result.ok ? "default" : "destructive"}>
                  {result.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                  <AlertTitle>{result.ok ? "Operazione riuscita" : "Controlla la configurazione"}</AlertTitle>
                  <AlertDescription>{result.message}</AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>

          {mode === "4bid_advanced" ? (
            <>
              <Alert>
                <Settings2 className="h-4 w-4" />
                <AlertTitle>Modalità 4BID superadmin</AlertTitle>
                <AlertDescription>
                  Qui sono disponibili routing per quattro prodotti, distinzione prospect/clienti, licenza cliente e fallback. Questi controlli non vengono mostrati ai tenant normali.
                </AlertDescription>
              </Alert>
              <VoiceIvrRoutingCard />
            </>
          ) : mode === "tenant_easy" ? (
            <Card>
              <CardHeader>
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ha-brand-soft">
                    <Bot className="h-5 w-5 text-ha-brand-soft-foreground" aria-hidden="true" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Assistente vocale AI</CardTitle>
                    <CardDescription>Configurazione semplice: scegli cosa deve conoscere e collega l'agente a 3CX.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {voiceAgents.length === 0 ? (
                  <div className="rounded-lg border p-4">
                    <p className="font-medium">1. Prepara l'assistente</p>
                    <p className="mt-1 text-sm text-muted-foreground">HotelAccelerator crea la credenziale protetta e legge le basi di conoscenza già disponibili nel tenant.</p>
                    <Button className="mt-3" onClick={() => void prepareVoiceAgents()} disabled={voicePreparing || !connected}>
                      {voicePreparing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}
                      Prepara assistente vocale
                    </Button>
                    {!connected ? <p className="mt-2 text-xs text-muted-foreground">Prima collega e verifica 3CX.</p> : null}
                  </div>
                ) : (
                  <div className="grid gap-2">
                    <Label>Base di conoscenza dell'assistente</Label>
                    <Select value={selectedVoiceAgent?.key ?? ""} onValueChange={setSelectedVoiceAgentKey}>
                      <SelectTrigger><SelectValue placeholder="Scegli la base" /></SelectTrigger>
                      <SelectContent>
                        {readyVoiceAgents.map((agent) => (
                          <SelectItem key={agent.key} value={agent.key}>{agent.label} · {agent.knowledge_base.source_count} fonti</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {readyVoiceAgents.length === 0 ? <p className="text-sm text-destructive">Non ci sono basi con fonti pronte. Aggiungi prima contenuti nella Knowledge Base.</p> : null}
                  </div>
                )}

                {voiceCredentialMessage ? <p className="text-sm text-muted-foreground">{voiceCredentialMessage}</p> : null}

                {voiceApiKey ? (
                  <div className="rounded-lg border p-4">
                    <div className="flex items-center gap-2 font-medium"><KeyRound className="h-4 w-4" /> Credenziale da copiare in 3CX</div>
                    <div className="mt-2 flex gap-2">
                      <Input type="password" readOnly value={voiceApiKey} />
                      <Button variant="outline" onClick={() => void copy("voice-key", voiceApiKey)}><Copy className="mr-2 h-4 w-4" />{copied === "voice-key" ? "Copiata" : "Copia"}</Button>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">Salvala nel parametro protetto HOTELACCELERATOR_VOICE_KEY. Non verrà mostrata di nuovo.</p>
                  </div>
                ) : null}

                {selectedVoiceAgent ? (
                  <div className="rounded-lg border p-4">
                    <p className="font-medium">2. URL dell'assistente</p>
                    <p className="mt-1 text-xs text-muted-foreground">Questo URL è già limitato alla base selezionata e al tenant corrente.</p>
                    <div className="mt-2 flex gap-2">
                      <Input readOnly value={selectedVoiceAgent.query_url} />
                      <Button variant="outline" onClick={() => void copy("voice-url", selectedVoiceAgent.query_url)}><Copy className="mr-2 h-4 w-4" />{copied === "voice-url" ? "Copiato" : "Copia"}</Button>
                    </div>
                  </div>
                ) : null}

                {integration?.has_credentials.voice_inbound_secret ? (
                  <Button variant="outline" onClick={() => void rotateVoiceCredential()} disabled={voiceRotating}>
                    {voiceRotating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                    Ruota credenziale vocale
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Collegamento CRM</CardTitle>
              <CardDescription>Serve a riconoscere le chiamate e collegarle al CRM HotelAccelerator.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!apiKey ? (
                <Button variant="outline" onClick={() => void prepareCrmLink()} disabled={preparingCrm || !connected}>
                  {preparingCrm ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                  Prepara collegamento CRM
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Input type="password" readOnly value={apiKey} />
                  <Button variant="outline" onClick={() => void copy("crm-key", apiKey)}><Copy className="mr-2 h-4 w-4" />{copied === "crm-key" ? "Copiata" : "Copia"}</Button>
                </div>
              )}
            </CardContent>
          </Card>

          <TelephonyExtensionsCard />
        </div>
      </div>
    </div>
  )
}
