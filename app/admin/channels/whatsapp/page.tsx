"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  MessageCircle,
  CheckCircle2,
  Copy,
  Loader2,
  Send,
  AlertCircle,
  ShieldCheck,
  Zap,
  ChevronDown,
  Trash2,
  Star,
  Plus,
  Phone,
} from "lucide-react"
import { AdminHeader } from "@/components/admin/admin-header"
import { ChannelUserAssignment } from "@/components/admin/channel-user-assignment"

interface WhatsAppChannel {
  id: string
  display_name: string | null
  config: {
    phone_number_id: string
    waba_id: string
    display_phone_number: string
    graph_version: string
  }
  credentials_preview: { access_token: string; app_secret: string; verify_token: string }
  has_credentials: { access_token: boolean; app_secret: boolean; verify_token: boolean }
  is_active: boolean
  is_default: boolean
  last_inbound_at: string | null
  last_outbound_at: string | null
  last_error: string | null
}

interface Quota {
  limit: number
  used: number
  remaining: number
  includedNumbers: number
  extraNumbers: number
  canAddNumber: boolean
}

interface PublicConfig {
  appId: string
  configId: string
  graphVersion: string
  configured: boolean
}

interface SessionInfo {
  phone_number_id?: string
  waba_id?: string
}

declare global {
  interface Window {
    FB?: any
    fbAsyncInit?: () => void
  }
}

export default function WhatsAppChannelPage() {
  const [loading, setLoading] = useState(true)
  const [channels, setChannels] = useState<WhatsAppChannel[]>([])
  const [quota, setQuota] = useState<Quota | null>(null)
  const [publicConfig, setPublicConfig] = useState<PublicConfig | null>(null)
  const [sdkReady, setSdkReady] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [buyingExtra, setBuyingExtra] = useState(false)

  const sessionInfoRef = useRef<SessionInfo>({})

  // Manual/add form state
  const [saving, setSaving] = useState(false)
  const [displayName, setDisplayName] = useState("WhatsApp")
  const [phoneNumberId, setPhoneNumberId] = useState("")
  const [wabaId, setWabaId] = useState("")
  const [displayPhone, setDisplayPhone] = useState("")
  const [accessToken, setAccessToken] = useState("")
  const [appSecret, setAppSecret] = useState("")
  const [verifyToken, setVerifyToken] = useState("")
  const [webhookUrl, setWebhookUrl] = useState("")

  // Test send (per number)
  const [testNumber, setTestNumber] = useState("")
  const [testing, setTesting] = useState(false)

  const hasNumbers = channels.length > 0

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [cfgRes, chRes] = await Promise.all([
        fetch("/api/channels/whatsapp/embedded-signup"),
        fetch("/api/channels/whatsapp"),
      ])
      const cfg = await cfgRes.json()
      if (cfgRes.ok) setPublicConfig(cfg)

      const data = await chRes.json()
      setChannels(data.channels ?? [])
      setQuota(data.quota ?? null)
    } catch {
      setFeedback({ type: "error", text: "Impossibile caricare la configurazione" })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setWebhookUrl(`${window.location.origin}/api/channels/whatsapp/webhook`)
    loadAll()
  }, [loadAll])

  // Handle the return from the Stripe extra-number checkout.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const extra = params.get("extra_number")
    if (!extra) return
    if (extra === "success") {
      setFeedback({
        type: "success",
        text: "Pagamento ricevuto! Il numero aggiuntivo è stato sbloccato: ora puoi collegarlo qui sotto.",
      })
    } else if (extra === "canceled") {
      setFeedback({ type: "error", text: "Pagamento annullato." })
    }
    // Clean the URL so a refresh doesn't repeat the message.
    params.delete("extra_number")
    const qs = params.toString()
    window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`)
  }, [])

  // Load + init the Facebook JS SDK once we know the platform App ID.
  useEffect(() => {
    if (!publicConfig?.configured || !publicConfig.appId) return
    if (window.FB) {
      setSdkReady(true)
      return
    }

    window.fbAsyncInit = () => {
      window.FB.init({
        appId: publicConfig.appId,
        autoLogAppEvents: true,
        xfbml: true,
        version: publicConfig.graphVersion || "v21.0",
      })
      setSdkReady(true)
    }

    const id = "facebook-jssdk"
    if (!document.getElementById(id)) {
      const js = document.createElement("script")
      js.id = id
      js.src = "https://connect.facebook.net/en_US/sdk.js"
      js.async = true
      js.defer = true
      js.crossOrigin = "anonymous"
      document.body.appendChild(js)
    }
  }, [publicConfig])

  // Capture the session info (phone_number_id + waba_id) Meta posts during signup.
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (!event.origin.endsWith("facebook.com")) return
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data
        if (data?.type === "WA_EMBEDDED_SIGNUP" && data?.event === "FINISH") {
          sessionInfoRef.current = {
            phone_number_id: data.data?.phone_number_id,
            waba_id: data.data?.waba_id,
          }
        }
      } catch {
        // non-JSON messages are unrelated
      }
    }
    window.addEventListener("message", handler)
    return () => window.removeEventListener("message", handler)
  }, [])

  const launchSignup = () => {
    if (!window.FB || !publicConfig?.configId) return
    setFeedback(null)
    sessionInfoRef.current = {}

    window.FB.login(
      (response: any) => {
        const code = response?.authResponse?.code
        if (!code) {
          setFeedback({ type: "error", text: "Collegamento annullato." })
          return
        }
        finishSignup(code)
      },
      {
        config_id: publicConfig.configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, featureType: "", sessionInfoVersion: "3" },
      },
    )
  }

  const finishSignup = async (code: string) => {
    setConnecting(true)
    setFeedback(null)
    try {
      const res = await fetch("/api/channels/whatsapp/embedded-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          phone_number_id: sessionInfoRef.current.phone_number_id,
          waba_id: sessionInfoRef.current.waba_id,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Errore durante il collegamento")
      setFeedback({ type: "success", text: "Numero WhatsApp collegato con successo!" })
      await loadAll()
    } catch (e) {
      setFeedback({ type: "error", text: e instanceof Error ? e.message : "Errore" })
    } finally {
      setConnecting(false)
    }
  }

  const handleSaveManual = async () => {
    setSaving(true)
    setFeedback(null)
    try {
      const res = await fetch("/api/channels/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName,
          phone_number_id: phoneNumberId,
          waba_id: wabaId,
          display_phone_number: displayPhone,
          access_token: accessToken,
          app_secret: appSecret,
          verify_token: verifyToken,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Errore salvataggio")
      setAccessToken("")
      setAppSecret("")
      setVerifyToken("")
      setPhoneNumberId("")
      setWabaId("")
      setDisplayPhone("")
      setDisplayName("WhatsApp")
      setFeedback({ type: "success", text: "Numero salvato correttamente" })
      await loadAll()
    } catch (e) {
      setFeedback({ type: "error", text: e instanceof Error ? e.message : "Errore" })
    } finally {
      setSaving(false)
    }
  }

  const handleSetDefault = async (id: string) => {
    setBusyId(id)
    setFeedback(null)
    try {
      const res = await fetch("/api/channels/whatsapp", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "set_default" }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Errore")
      }
      await loadAll()
    } catch (e) {
      setFeedback({ type: "error", text: e instanceof Error ? e.message : "Errore" })
    } finally {
      setBusyId(null)
    }
  }

  const handleDisconnect = async (id: string) => {
    if (!window.confirm("Scollegare questo numero WhatsApp?")) return
    setBusyId(id)
    setFeedback(null)
    try {
      const res = await fetch(`/api/channels/whatsapp?id=${id}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Errore disconnessione")
      }
      setFeedback({ type: "success", text: "Numero scollegato." })
      await loadAll()
    } catch (e) {
      setFeedback({ type: "error", text: e instanceof Error ? e.message : "Errore" })
    } finally {
      setBusyId(null)
    }
  }

  const handleBuyExtra = async () => {
    setBuyingExtra(true)
    setFeedback(null)
    try {
      const res = await fetch("/api/channels/whatsapp/extra-number/checkout", { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Checkout non disponibile")
      if (data.url) {
        window.location.href = data.url
        return
      }
      throw new Error("URL di pagamento mancante")
    } catch (e) {
      setFeedback({ type: "error", text: e instanceof Error ? e.message : "Errore" })
    } finally {
      setBuyingExtra(false)
    }
  }

  const handleTest = async () => {
    if (!testNumber.trim()) return
    setTesting(true)
    setFeedback(null)
    try {
      const res = await fetch("/api/channels/whatsapp/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testNumber }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Errore invio test")
      setFeedback({ type: "success", text: "Messaggio di test inviato con successo" })
    } catch (e) {
      setFeedback({ type: "error", text: e instanceof Error ? e.message : "Errore" })
    } finally {
      setTesting(false)
    }
  }

  const copyToClipboard = (text: string) => navigator.clipboard.writeText(text)

  const platformReady = Boolean(publicConfig?.configured)
  const canAdd = quota?.canAddNumber ?? true

  return (
    <div className="min-h-screen bg-background">
      <AdminHeader
        title="WhatsApp Business"
        subtitle="Collega uno o più numeri WhatsApp della tua struttura"
        actions={
          <Badge variant={hasNumbers ? "default" : "secondary"} className={hasNumbers ? "bg-emerald-600" : ""}>
            {hasNumbers ? `${channels.length} numero${channels.length > 1 ? "i" : ""}` : "Non collegato"}
          </Badge>
        }
      />

      <div className="mx-auto max-w-3xl px-4 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Caricamento...
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {feedback && (
              <div
                className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${
                  feedback.type === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
                role="status"
              >
                {feedback.type === "success" ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0" />
                )}
                {feedback.text}
              </div>
            )}

            {/* Quota summary */}
            {quota && (
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
                  <div className="text-sm">
                    <div className="font-medium">
                      Numeri collegati: {quota.used} / {quota.limit}
                    </div>
                    <div className="text-muted-foreground">
                      {quota.includedNumbers} incluso nel piano
                      {quota.extraNumbers > 0 ? ` + ${quota.extraNumbers} aggiuntivo${quota.extraNumbers > 1 ? "i" : ""}` : ""}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleBuyExtra} disabled={buyingExtra}>
                    {buyingExtra ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                    Aggiungi numero extra
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Connected numbers list */}
            {channels.map((ch) => (
              <Card key={ch.id} className={ch.is_default ? "border-emerald-200" : ""}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Phone className="h-5 w-5 text-emerald-600" />
                    {ch.config.display_phone_number || ch.display_name || "WhatsApp"}
                    {ch.is_default && (
                      <Badge variant="secondary" className="ml-1 gap-1">
                        <Star className="h-3 w-3 fill-current" /> Predefinito
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>{ch.display_name || "WhatsApp"}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {ch.last_error && (
                    <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>Ultimo errore: {ch.last_error}</span>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {!ch.is_default && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSetDefault(ch.id)}
                        disabled={busyId === ch.id}
                      >
                        {busyId === ch.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Star className="mr-2 h-4 w-4" />
                        )}
                        Imposta predefinito
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDisconnect(ch.id)}
                      disabled={busyId === ch.id}
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Scollega
                    </Button>
                  </div>

                  <div className="border-t pt-4">
                    <ChannelUserAssignment channelType="whatsapp" channelId={ch.id} />
                    <p className="mt-2 text-xs text-muted-foreground">
                      Gli utenti assegnati vedranno le conversazioni di questo numero nella Posta in arrivo.
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* Add a number (1-click) */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="h-5 w-5 text-emerald-600" />
                  {hasNumbers ? "Collega un altro numero" : "Collega WhatsApp in un clic"}
                </CardTitle>
                <CardDescription>
                  Accedi con Facebook, scegli il numero WhatsApp della tua struttura e il gioco è fatto. Nessun codice da
                  copiare.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-emerald-600" /> Configurazione guidata da Meta
                  </li>
                  <li className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" /> Le credenziali restano sulla piattaforma, al
                    sicuro
                  </li>
                </ul>

                {!canAdd ? (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Hai raggiunto il limite di numeri del tuo piano ({quota?.limit}). Acquista un numero aggiuntivo per
                      collegarne un altro.
                    </span>
                  </div>
                ) : !platformReady ? (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Il collegamento rapido non è ancora abilitato dall&apos;amministratore della piattaforma. Puoi
                      usare la configurazione manuale qui sotto, oppure contattare il supporto.
                    </span>
                  </div>
                ) : (
                  <Button
                    onClick={launchSignup}
                    disabled={!sdkReady || connecting}
                    className="w-fit bg-[#1877F2] text-white hover:bg-[#1877F2]/90"
                  >
                    {connecting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <MessageCircle className="mr-2 h-4 w-4" />
                    )}
                    {sdkReady ? "Collega con Facebook" : "Caricamento..."}
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Test send (when at least one number connected) */}
            {hasNumbers && (
              <Card>
                <CardHeader>
                  <CardTitle>Invia messaggio di test</CardTitle>
                  <CardDescription>
                    Inviato dal numero predefinito. Funziona solo se il destinatario ha scritto al numero negli ultimi
                    24h (finestra di assistenza).
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex flex-1 flex-col gap-2">
                    <Label htmlFor="test-number">Numero destinatario</Label>
                    <Input
                      id="test-number"
                      value={testNumber}
                      onChange={(e) => setTestNumber(e.target.value)}
                      placeholder="+39 333 1234567"
                    />
                  </div>
                  <Button onClick={handleTest} disabled={testing || !testNumber.trim()} variant="outline">
                    {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    Invia test
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Advanced / manual configuration (power users / fallback) */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                aria-expanded={showAdvanced}
              >
                <ChevronDown className={`h-4 w-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
                Aggiungi numero manualmente (avanzato)
              </button>

              {showAdvanced && (
                <div className="mt-4 flex flex-col gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Webhook</CardTitle>
                      <CardDescription>
                        Solo per la configurazione manuale. Inserisci questi valori nell&apos;app Meta (campo{" "}
                        <span className="font-mono">messages</span>).
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                      <div className="flex flex-col gap-2">
                        <Label>Callback URL</Label>
                        <div className="flex gap-2">
                          <Input value={webhookUrl} readOnly className="font-mono text-sm" />
                          <Button variant="outline" size="icon" onClick={() => copyToClipboard(webhookUrl)}>
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="verify-token">Verify Token</Label>
                        <Input
                          id="verify-token"
                          value={verifyToken}
                          onChange={(e) => setVerifyToken(e.target.value)}
                          placeholder="Stringa segreta da usare anche su Meta"
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Credenziali API del nuovo numero</CardTitle>
                      <CardDescription>I valori segreti vengono salvati cifrati lato piattaforma.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="display-name">Nome canale</Label>
                        <Input id="display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="phone-id">Phone Number ID *</Label>
                          <Input
                            id="phone-id"
                            value={phoneNumberId}
                            onChange={(e) => setPhoneNumberId(e.target.value)}
                            placeholder="Es: 123456789012345"
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="waba-id">WhatsApp Business Account ID</Label>
                          <Input
                            id="waba-id"
                            value={wabaId}
                            onChange={(e) => setWabaId(e.target.value)}
                            placeholder="Opzionale"
                          />
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="display-phone">Numero visualizzato</Label>
                        <Input
                          id="display-phone"
                          value={displayPhone}
                          onChange={(e) => setDisplayPhone(e.target.value)}
                          placeholder="+39 055 1234567"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="access-token">Access Token *</Label>
                        <Input
                          id="access-token"
                          type="password"
                          value={accessToken}
                          onChange={(e) => setAccessToken(e.target.value)}
                          placeholder="Token permanente / system user"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="app-secret">App Secret</Label>
                        <Input
                          id="app-secret"
                          type="password"
                          value={appSecret}
                          onChange={(e) => setAppSecret(e.target.value)}
                          placeholder="Per verificare la firma dei webhook"
                        />
                      </div>
                      <div>
                        <Button onClick={handleSaveManual} disabled={saving || !phoneNumberId.trim() || !canAdd}>
                          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Aggiungi numero
                        </Button>
                        {!canAdd && (
                          <p className="mt-2 text-xs text-amber-700">
                            Limite numeri raggiunto. Acquista un numero aggiuntivo per aggiungerne un altro.
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
