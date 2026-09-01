"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Phone,
  Plus,
  Send,
  ShieldCheck,
  Star,
  Trash2,
  Zap,
} from "lucide-react"
import { AdminHeader } from "@/components/admin/admin-header"
import { ChannelUserAssignment } from "@/components/admin/channel-user-assignment"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { quotaExceededMessage } from "@/lib/whatsapp/quota"

interface WhatsAppChannel {
  id: string
  display_name: string | null
  config: {
    phone_number_id: string
    waba_id: string
    display_phone_number: string
    graph_version: string
  }
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
  testNumbers?: { id: string; displayPhoneNumber: string }[]
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
  signup_event?: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING"
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
  const [busyId, setBusyId] = useState<string | null>(null)
  const [buyingExtra, setBuyingExtra] = useState(false)
  const [testNumber, setTestNumber] = useState("")
  const [testing, setTesting] = useState(false)
  const sessionInfoRef = useRef<SessionInfo>({})

  const hasNumbers = channels.length > 0

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [cfgRes, chRes] = await Promise.all([
        fetch("/api/channels/whatsapp/embedded-signup", { cache: "no-store" }),
        fetch("/api/channels/whatsapp", { cache: "no-store" }),
      ])
      const cfg = await cfgRes.json().catch(() => ({}))
      if (cfgRes.ok) setPublicConfig(cfg)

      const data = await chRes.json().catch(() => ({}))
      if (!chRes.ok) throw new Error(data.error || "Impossibile caricare WhatsApp")
      setChannels(data.channels ?? [])
      setQuota(data.quota ?? null)
    } catch (error) {
      setFeedback({ type: "error", text: error instanceof Error ? error.message : "Impossibile caricare la configurazione" })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const extra = params.get("extra_number")
    if (!extra) return
    setFeedback(
      extra === "success"
        ? { type: "success", text: "Pagamento ricevuto. Ora puoi collegare il numero aggiuntivo." }
        : { type: "error", text: "Pagamento annullato." },
    )
    params.delete("extra_number")
    const qs = params.toString()
    window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`)
  }, [])

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
      const script = document.createElement("script")
      script.id = id
      script.src = "https://connect.facebook.net/en_US/sdk.js"
      script.async = true
      script.defer = true
      script.crossOrigin = "anonymous"
      document.body.appendChild(script)
    }
  }, [publicConfig])

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (!event.origin.endsWith("facebook.com")) return
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data
        if (data?.type === "WA_EMBEDDED_SIGNUP" && data?.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING") {
          sessionInfoRef.current = {
            phone_number_id: data.data?.phone_number_id,
            waba_id: data.data?.waba_id,
            signup_event: data.event,
          }
        }
      } catch {
        // Ignore unrelated SDK messages.
      }
    }
    window.addEventListener("message", handler)
    return () => window.removeEventListener("message", handler)
  }, [])

  const finishSignup = async (code: string) => {
    setConnecting(true)
    setFeedback(null)
    try {
      const response = await fetch("/api/channels/whatsapp/embedded-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          phone_number_id: sessionInfoRef.current.phone_number_id,
          waba_id: sessionInfoRef.current.waba_id,
          signup_event: sessionInfoRef.current.signup_event,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "Errore durante il collegamento")
      setFeedback({
        type: "success",
        text: "Numero collegato. HotelAccelerator gestisce automaticamente configurazione, template e fatturazione WhatsApp: non devi entrare in Meta.",
      })
      await loadAll()
    } catch (error) {
      setFeedback({ type: "error", text: error instanceof Error ? error.message : "Errore" })
    } finally {
      setConnecting(false)
    }
  }

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
        void finishSignup(code)
      },
      {
        config_id: publicConfig.configId,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: "whatsapp_business_app_onboarding",
          sessionInfoVersion: "3",
        },
      },
    )
  }

  const handleSetDefault = async (id: string) => {
    setBusyId(id)
    setFeedback(null)
    try {
      const response = await fetch("/api/channels/whatsapp", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "set_default" }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "Errore")
      await loadAll()
    } catch (error) {
      setFeedback({ type: "error", text: error instanceof Error ? error.message : "Errore" })
    } finally {
      setBusyId(null)
    }
  }

  const handleDisconnect = async (id: string) => {
    if (!window.confirm("Scollegare questo numero WhatsApp?")) return
    setBusyId(id)
    setFeedback(null)
    try {
      const response = await fetch(`/api/channels/whatsapp?id=${id}`, { method: "DELETE" })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "Errore disconnessione")
      setFeedback({ type: "success", text: "Numero scollegato." })
      await loadAll()
    } catch (error) {
      setFeedback({ type: "error", text: error instanceof Error ? error.message : "Errore" })
    } finally {
      setBusyId(null)
    }
  }

  const handleBuyExtra = async () => {
    setBuyingExtra(true)
    setFeedback(null)
    try {
      const response = await fetch("/api/channels/whatsapp/extra-number/checkout", { method: "POST" })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "Checkout non disponibile")
      if (!data.url) throw new Error("URL di pagamento mancante")
      window.location.href = data.url
    } catch (error) {
      setFeedback({ type: "error", text: error instanceof Error ? error.message : "Errore" })
      setBuyingExtra(false)
    }
  }

  const handleTest = async () => {
    if (!testNumber.trim()) return
    setTesting(true)
    setFeedback(null)
    try {
      const response = await fetch("/api/channels/whatsapp/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testNumber }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "Errore invio test")
      setFeedback({ type: "success", text: "Messaggio di test inviato con successo" })
    } catch (error) {
      setFeedback({ type: "error", text: error instanceof Error ? error.message : "Errore" })
    } finally {
      setTesting(false)
    }
  }

  const platformReady = Boolean(publicConfig?.configured)
  const canAdd = quota?.canAddNumber ?? true
  const limitMessage = quotaExceededMessage({ limit: quota?.limit ?? 0, testNumbers: quota?.testNumbers ?? [] })

  return (
    <div className="min-h-full bg-background">
      <AdminHeader
        title="WhatsApp Business"
        subtitle="Collega i numeri WhatsApp della struttura. Configurazione e fatturazione sono gestite da HotelAccelerator."
        actions={
          <Badge variant={hasNumbers ? "default" : "secondary"} className={hasNumbers ? "bg-ha-success" : ""}>
            {hasNumbers ? `${channels.length} numero${channels.length > 1 ? "i" : ""}` : "Non collegato"}
          </Badge>
        }
      />

      <div className="mx-auto max-w-3xl px-4 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Caricamento...
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {feedback && (
              <div
                className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
                  feedback.type === "success"
                    ? "border-ha-success-soft bg-ha-success-soft text-ha-success-soft-foreground"
                    : "border-ha-error-soft bg-ha-error-soft text-ha-error-soft-foreground"
                }`}
                role="status"
              >
                {feedback.type === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                <span>{feedback.text}</span>
              </div>
            )}

            <Card>
              <CardContent className="py-4">
                <div className="flex items-start gap-3 text-sm">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-ha-success-soft-foreground" />
                  <div>
                    <div className="font-medium">Gestione completamente HotelAccelerator</div>
                    <div className="mt-1 text-muted-foreground">
                      Il tenant non deve configurare Meta Business, token, webhook, template, valuta o metodi di pagamento. Il collegamento usa solo il flusso autorizzativo incorporato richiesto da WhatsApp.
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {quota && (
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
                  <div className="text-sm">
                    <div className="font-medium">Numeri collegati: {quota.used} / {quota.limit}</div>
                    <div className="text-muted-foreground">
                      {quota.includedNumbers} incluso nel piano{quota.extraNumbers > 0 ? ` + ${quota.extraNumbers} aggiuntivo${quota.extraNumbers > 1 ? "i" : ""}` : ""}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleBuyExtra} disabled={buyingExtra}>
                    {buyingExtra ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />} Aggiungi numero extra
                  </Button>
                </CardContent>
              </Card>
            )}

            {channels.map((channel) => (
              <Card key={channel.id} className={channel.is_default ? "border-ha-success-soft" : ""}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Phone className="h-5 w-5 text-ha-success-soft-foreground" />
                    {channel.config.display_phone_number || channel.display_name || "WhatsApp"}
                    {channel.is_default && <Badge variant="secondary" className="ml-1 gap-1"><Star className="h-3 w-3 fill-current" /> Predefinito</Badge>}
                  </CardTitle>
                  <CardDescription>{channel.display_name || "WhatsApp"}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {channel.last_error && (
                    <div className="flex items-start gap-2 rounded-md border border-ha-warning-soft bg-ha-warning-soft p-2 text-xs text-ha-warning-soft-foreground">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>HotelAccelerator sta gestendo un problema del canale. Non è richiesta alcuna configurazione Meta da parte tua.</span>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {!channel.is_default && (
                      <Button variant="outline" size="sm" onClick={() => handleSetDefault(channel.id)} disabled={busyId === channel.id}>
                        {busyId === channel.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Star className="mr-2 h-4 w-4" />} Imposta predefinito
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => handleDisconnect(channel.id)} disabled={busyId === channel.id}>
                      <Trash2 className="mr-2 h-4 w-4" /> Scollega
                    </Button>
                  </div>
                  <div className="border-t pt-4">
                    <ChannelUserAssignment channelType="whatsapp" channelId={channel.id} />
                    <p className="mt-2 text-xs text-muted-foreground">Gli utenti assegnati vedranno le conversazioni di questo numero nella Posta in arrivo.</p>
                  </div>
                </CardContent>
              </Card>
            ))}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><MessageCircle className="h-5 w-5 text-ha-success-soft-foreground" /> {hasNumbers ? "Collega un altro numero" : "Collega WhatsApp"}</CardTitle>
                <CardDescription>
                  Autorizza il numero nel flusso WhatsApp incorporato. Al termine torni qui: HotelAccelerator gestisce automaticamente tutto il resto.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2"><Zap className="h-4 w-4 text-emerald-600" /> Collegamento guidato del numero</li>
                  <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-ha-success-soft-foreground" /> Nessun token, WABA, webhook, template o pagamento da configurare</li>
                </ul>

                {!canAdd ? (
                  <div className="flex items-start gap-2 rounded-lg border border-ha-warning-soft bg-ha-warning-soft p-3 text-sm text-ha-warning-soft-foreground">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{limitMessage}</span>
                  </div>
                ) : !platformReady ? (
                  <div className="flex items-start gap-2 rounded-lg border border-ha-warning-soft bg-ha-warning-soft p-3 text-sm text-ha-warning-soft-foreground">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>Il collegamento WhatsApp è temporaneamente in attivazione lato HotelAccelerator. Non devi configurare nulla su Meta.</span>
                  </div>
                ) : (
                  <Button onClick={launchSignup} disabled={!sdkReady || connecting} className="w-fit bg-[#1877F2] text-white hover:bg-[#1877F2]/90">
                    {connecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-2 h-4 w-4" />} {sdkReady ? "Collega WhatsApp" : "Caricamento..."}
                  </Button>
                )}
              </CardContent>
            </Card>

            {hasNumbers && (
              <Card>
                <CardHeader>
                  <CardTitle>Invia messaggio di test</CardTitle>
                  <CardDescription>Inviato dal numero predefinito. Se WhatsApp richiede un template, HotelAccelerator lo gestisce automaticamente.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex flex-1 flex-col gap-2">
                    <Label htmlFor="test-number">Numero destinatario</Label>
                    <Input id="test-number" value={testNumber} onChange={(event) => setTestNumber(event.target.value)} placeholder="+39 333 1234567" />
                  </div>
                  <Button onClick={handleTest} disabled={testing || !testNumber.trim()} variant="outline">
                    {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Invia test
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
