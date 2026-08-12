"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import {
  Send,
  Bot,
  CheckCircle2,
  Copy,
  ExternalLink,
  AlertCircle,
  Loader2,
  Trash2,
} from "lucide-react"
import { AdminHeader } from "@/components/admin/admin-header"
import { ChannelUserAssignment } from "@/components/admin/channel-user-assignment"

interface TelegramChannel {
  id: string
  display_name: string | null
  config: { bot_id: string; bot_username: string; autopilot_enabled: boolean }
  credentials_preview: { bot_token: string }
  has_credentials: { bot_token: boolean }
  is_active: boolean
  is_default: boolean
  last_inbound_at: string | null
  last_outbound_at: string | null
  last_error: string | null
}

export default function TelegramChannelPage() {
  const [loading, setLoading] = useState(true)
  const [channels, setChannels] = useState<TelegramChannel[]>([])
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null)

  // Connect form
  const [displayName, setDisplayName] = useState("Telegram")
  const [botToken, setBotToken] = useState("")
  const [connecting, setConnecting] = useState(false)

  // Per-channel busy + test
  const [busyId, setBusyId] = useState<string | null>(null)
  const [testChatId, setTestChatId] = useState("")
  const [testing, setTesting] = useState(false)

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/channels/telegram")
      const data = await res.json()
      if (res.ok) setChannels(data.channels ?? [])
      else setFeedback({ type: "error", text: data.error || "Impossibile caricare la configurazione" })
    } catch {
      setFeedback({ type: "error", text: "Impossibile caricare la configurazione" })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const connectBot = async () => {
    if (!botToken.trim()) return
    setConnecting(true)
    setFeedback(null)
    try {
      const res = await fetch("/api/channels/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: displayName.trim() || "Telegram", bot_token: botToken.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFeedback({ type: "error", text: data.error || "Connessione non riuscita" })
        return
      }
      setBotToken("")
      if (data.warning) {
        setFeedback({ type: "error", text: data.warning })
      } else {
        setFeedback({ type: "success", text: "Bot Telegram connesso e webhook attivo." })
      }
      await loadAll()
    } catch {
      setFeedback({ type: "error", text: "Errore di rete durante la connessione" })
    } finally {
      setConnecting(false)
    }
  }

  const toggleAutopilot = async (channel: TelegramChannel, enabled: boolean) => {
    setBusyId(channel.id)
    setFeedback(null)
    try {
      const res = await fetch("/api/channels/telegram", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: channel.id, action: "toggle_autopilot", autopilot_enabled: enabled }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFeedback({ type: "error", text: data.error || "Aggiornamento non riuscito" })
        return
      }
      setChannels((prev) => prev.map((c) => (c.id === channel.id ? data.channel : c)))
    } catch {
      setFeedback({ type: "error", text: "Errore di rete" })
    } finally {
      setBusyId(null)
    }
  }

  const disconnectBot = async (channel: TelegramChannel) => {
    setBusyId(channel.id)
    setFeedback(null)
    try {
      const res = await fetch(`/api/channels/telegram?id=${encodeURIComponent(channel.id)}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) {
        setFeedback({ type: "error", text: data.error || "Disconnessione non riuscita" })
        return
      }
      setFeedback({ type: "success", text: "Bot disconnesso." })
      await loadAll()
    } catch {
      setFeedback({ type: "error", text: "Errore di rete" })
    } finally {
      setBusyId(null)
    }
  }

  const sendTest = async (channel: TelegramChannel) => {
    if (!testChatId.trim()) {
      setFeedback({ type: "error", text: "Inserisci il Chat ID di prova" })
      return
    }
    setTesting(true)
    setFeedback(null)
    try {
      const res = await fetch("/api/channels/telegram/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testChatId.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFeedback({ type: "error", text: data.error || "Invio test non riuscito" })
        return
      }
      setFeedback({ type: "success", text: "Messaggio di test inviato." })
      await loadAll()
    } catch {
      setFeedback({ type: "error", text: "Errore di rete" })
    } finally {
      setTesting(false)
    }
  }

  const copyToClipboard = (text: string) => navigator.clipboard.writeText(text)

  return (
    <div className="min-h-full bg-background">
      <AdminHeader title="Telegram Bot" subtitle="Gestisci il canale Telegram" />

      <div className="container py-6 space-y-6">
        {feedback && (
          <div
            role="alert"
            className={`flex items-center gap-2 p-3 rounded-lg border text-sm ${
              feedback.type === "success"
                ? "bg-ha-success-soft text-ha-success-soft-foreground border-ha-success-soft"
                : "bg-ha-error-soft text-ha-error-soft-foreground border-ha-error-soft"
            }`}
          >
            {feedback.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Caricamento…
          </div>
        ) : (
          <>
            {/* Connect a new bot */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Send className="h-5 w-5" />
                  Connetti un Bot Telegram
                </CardTitle>
                <CardDescription>Crea un bot con @BotFather e incolla qui il token per collegarlo.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
                    <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium shrink-0">
                      1
                    </div>
                    <div>
                      <h4 className="font-medium text-sm">Apri @BotFather</h4>
                      <Button variant="link" className="px-0 h-auto mt-1 text-xs" asChild>
                        <a href="https://t.me/botfather" target="_blank" rel="noopener noreferrer">
                          Apri BotFather <ExternalLink className="h-3 w-3 ml-1" />
                        </a>
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
                    <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium shrink-0">
                      2
                    </div>
                    <div>
                      <h4 className="font-medium text-sm">Usa /newbot</h4>
                      <p className="text-xs text-muted-foreground mt-1">Segui le istruzioni per creare il bot.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
                    <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium shrink-0">
                      3
                    </div>
                    <div>
                      <h4 className="font-medium text-sm">Copia il token</h4>
                      <p className="text-xs text-muted-foreground mt-1">Incollalo qui sotto.</p>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-6 grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="tg-name">Nome visualizzato</Label>
                    <Input
                      id="tg-name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Telegram"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tg-token">Token del Bot</Label>
                    <Input
                      id="tg-token"
                      type="password"
                      value={botToken}
                      onChange={(e) => setBotToken(e.target.value)}
                      placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                    />
                  </div>
                </div>
                <Button
                  className="w-full sm:w-auto bg-ha-info hover:bg-ha-info"
                  onClick={connectBot}
                  disabled={!botToken.trim() || connecting}
                >
                  {connecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                  Connetti Bot
                </Button>
              </CardContent>
            </Card>

            {/* Connected bots */}
            {channels.map((channel) => (
              <Card key={channel.id}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Bot className="h-5 w-5" />
                      {channel.display_name || "Telegram"}
                      {channel.is_default && <Badge variant="secondary">Predefinito</Badge>}
                    </CardTitle>
                    <Badge
                      className={
                        channel.is_active
                          ? "bg-ha-success-soft text-ha-success-soft-foreground"
                          : "bg-muted text-muted-foreground"
                      }
                    >
                      {channel.is_active ? "Attivo" : "Inattivo"}
                    </Badge>
                  </div>
                  {channel.config.bot_username && (
                    <CardDescription className="flex items-center gap-2 pt-1">
                      <span className="font-mono">@{channel.config.bot_username}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => copyToClipboard(`https://t.me/${channel.config.bot_username}`)}
                        aria-label="Copia link bot"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" asChild>
                        <a
                          href={`https://t.me/${channel.config.bot_username}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Apri bot su Telegram"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </Button>
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-5">
                  {channel.last_error && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-ha-error-soft text-ha-error-soft-foreground text-sm">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>{channel.last_error}</span>
                    </div>
                  )}

                  {/* Autopilot */}
                  <div className="flex items-center justify-between p-4 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          channel.config.autopilot_enabled ? "bg-ha-info" : "bg-muted"
                        }`}
                      >
                        <Bot
                          className={`h-5 w-5 ${
                            channel.config.autopilot_enabled ? "text-white" : "text-muted-foreground"
                          }`}
                        />
                      </div>
                      <div>
                        <h4 className="font-medium">Autopilot</h4>
                        <p className="text-sm text-muted-foreground">
                          Risponde ai comandi (/start, /help). Il resto va in inbox.
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={channel.config.autopilot_enabled}
                      disabled={busyId === channel.id}
                      onCheckedChange={(v) => toggleAutopilot(channel, v)}
                    />
                  </div>

                  {/* Test send */}
                  <div className="space-y-2">
                    <Label htmlFor={`test-${channel.id}`}>Invia messaggio di prova (Chat ID)</Label>
                    <div className="flex gap-2">
                      <Input
                        id={`test-${channel.id}`}
                        value={testChatId}
                        onChange={(e) => setTestChatId(e.target.value)}
                        placeholder="es. 123456789"
                        className="font-mono"
                      />
                      <Button variant="outline" onClick={() => sendTest(channel)} disabled={testing}>
                        {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        <span className="ml-2 hidden sm:inline">Invia test</span>
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Il destinatario deve aver avviato il bot almeno una volta.
                    </p>
                  </div>

                  {/* Operator assignment (parity with WhatsApp/email) */}
                  <ChannelUserAssignment channelType="telegram" channelId={channel.id} />

                  <div className="border-t pt-4">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => disconnectBot(channel)}
                      disabled={busyId === channel.id}
                    >
                      {busyId === channel.id ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 mr-2" />
                      )}
                      Disconnetti Bot
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}

            {channels.length === 0 && (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  <Bot className="h-8 w-8 mx-auto mb-3 opacity-50" />
                  <p>Nessun bot Telegram collegato. Connettine uno qui sopra per iniziare.</p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  )
}
