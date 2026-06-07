"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { MessageCircle, CheckCircle2, Copy, ExternalLink, Loader2, Send, AlertCircle } from "lucide-react"
import { AdminHeader } from "@/components/admin/admin-header"

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
  last_inbound_at: string | null
  last_outbound_at: string | null
  last_error: string | null
}

export default function WhatsAppChannelPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [channel, setChannel] = useState<WhatsAppChannel | null>(null)
  const [webhookUrl, setWebhookUrl] = useState("")
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null)

  // Form state
  const [displayName, setDisplayName] = useState("WhatsApp")
  const [phoneNumberId, setPhoneNumberId] = useState("")
  const [wabaId, setWabaId] = useState("")
  const [displayPhone, setDisplayPhone] = useState("")
  const [accessToken, setAccessToken] = useState("")
  const [appSecret, setAppSecret] = useState("")
  const [verifyToken, setVerifyToken] = useState("")

  // Test send
  const [testNumber, setTestNumber] = useState("")
  const [testing, setTesting] = useState(false)

  const isConnected = Boolean(channel?.config?.phone_number_id)

  const loadChannel = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/channels/whatsapp")
      const data = await res.json()
      const ch: WhatsAppChannel | undefined = data.channels?.[0]
      if (ch) {
        setChannel(ch)
        setDisplayName(ch.display_name || "WhatsApp")
        setPhoneNumberId(ch.config.phone_number_id || "")
        setWabaId(ch.config.waba_id || "")
        setDisplayPhone(ch.config.display_phone_number || "")
      }
    } catch {
      setFeedback({ type: "error", text: "Impossibile caricare la configurazione" })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setWebhookUrl(`${window.location.origin}/api/channels/whatsapp/webhook`)
    loadChannel()
  }, [loadChannel])

  const handleSave = async () => {
    setSaving(true)
    setFeedback(null)
    try {
      const res = await fetch("/api/channels/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: channel?.id,
          display_name: displayName,
          phone_number_id: phoneNumberId,
          waba_id: wabaId,
          display_phone_number: displayPhone,
          // Only send secrets when the user typed a new value; blank keeps existing.
          access_token: accessToken,
          app_secret: appSecret,
          verify_token: verifyToken,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Errore salvataggio")
      setChannel(data.channel)
      setAccessToken("")
      setAppSecret("")
      setVerifyToken("")
      setFeedback({ type: "success", text: "Configurazione salvata correttamente" })
    } catch (e) {
      setFeedback({ type: "error", text: e instanceof Error ? e.message : "Errore" })
    } finally {
      setSaving(false)
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

  return (
    <div className="min-h-screen bg-background">
      <AdminHeader
        title="WhatsApp Business"
        subtitle="Collega WhatsApp tramite le API Meta Cloud"
        actions={
          <Badge variant={isConnected ? "default" : "secondary"} className={isConnected ? "bg-emerald-600" : ""}>
            {isConnected ? "Configurato" : "Non configurato"}
          </Badge>
        }
      />

      <div className="mx-auto max-w-3xl px-4 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Caricamento configurazione...
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

            {channel?.last_error && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                Ultimo errore: {channel.last_error}
              </div>
            )}

            {/* Setup guide */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="h-5 w-5" />
                  Come collegare WhatsApp
                </CardTitle>
                <CardDescription>
                  Crea un&apos;app su Meta for Developers, aggiungi il prodotto WhatsApp e recupera le credenziali dalla
                  dashboard.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="link" className="h-auto px-0" asChild>
                  <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer">
                    Apri Meta for Developers <ExternalLink className="ml-1 h-3 w-3" />
                  </a>
                </Button>
              </CardContent>
            </Card>

            {/* Webhook config */}
            <Card>
              <CardHeader>
                <CardTitle>Webhook</CardTitle>
                <CardDescription>
                  Inserisci questi valori nella configurazione Webhooks dell&apos;app Meta (campo{" "}
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
                    placeholder={
                      channel?.has_credentials.verify_token
                        ? channel.credentials_preview.verify_token
                        : "Scegli una stringa segreta da usare anche su Meta"
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Usa la stessa stringa qui e nel campo &quot;Verify token&quot; di Meta. Lascia vuoto per mantenere
                    quello attuale.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Credentials */}
            <Card>
              <CardHeader>
                <CardTitle>Credenziali API</CardTitle>
                <CardDescription>I valori segreti vengono mostrati mascherati e non sono mai esposti.</CardDescription>
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
                    placeholder={
                      channel?.has_credentials.access_token
                        ? channel.credentials_preview.access_token
                        : "Token permanente / system user"
                    }
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="app-secret">App Secret</Label>
                  <Input
                    id="app-secret"
                    type="password"
                    value={appSecret}
                    onChange={(e) => setAppSecret(e.target.value)}
                    placeholder={
                      channel?.has_credentials.app_secret
                        ? channel.credentials_preview.app_secret
                        : "Per verificare la firma dei webhook"
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Consigliato: senza App Secret le firme dei webhook non vengono verificate.
                  </p>
                </div>
                <div>
                  <Button onClick={handleSave} disabled={saving || !phoneNumberId.trim()}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Salva configurazione
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Test */}
            {isConnected && (
              <Card>
                <CardHeader>
                  <CardTitle>Invia messaggio di test</CardTitle>
                  <CardDescription>
                    Funziona solo se il destinatario ha scritto al numero negli ultimi 24h (finestra di assistenza).
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
          </div>
        )}
      </div>
    </div>
  )
}
