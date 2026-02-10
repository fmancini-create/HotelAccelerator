"use client"

import { useState, useEffect, useCallback } from "react"
import { useAdminAuth } from "@/lib/admin-hooks"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Send, Bot, CheckCircle2, Copy, ExternalLink, AlertCircle, Loader2, Save } from "lucide-react"
import { AdminHeader } from "@/components/admin/admin-header"

interface TelegramSettings {
  bot_token: string
  bot_username: string
  welcome_message: string
  ai_enabled: boolean
  ai_personality: string
  commands: Array<{ command: string; description: string }>
}

const DEFAULT_SETTINGS: TelegramSettings = {
  bot_token: "",
  bot_username: "",
  welcome_message: "Benvenuto! Sono l'assistente della struttura. Come posso aiutarti?",
  ai_enabled: false,
  ai_personality: "",
  commands: [
    { command: "/start", description: "Messaggio di benvenuto" },
    { command: "/prenota", description: "Avvia procedura prenotazione" },
    { command: "/info", description: "Informazioni sulla struttura" },
    { command: "/contatti", description: "Mostra i contatti" },
  ],
}

export default function TelegramChannelPage() {
  const { adminUser, isLoading: authLoading } = useAdminAuth()
  const [settings, setSettings] = useState<TelegramSettings>(DEFAULT_SETTINGS)
  const [isEnabled, setIsEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isConnected = !!(settings.bot_token && isEnabled)

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/channel-settings?channel=telegram")
      if (!res.ok) return

      const data = await res.json()
      if (data.settings) {
        setIsEnabled(data.settings.is_enabled || false)
        setSettings({ ...DEFAULT_SETTINGS, ...(data.settings.settings || {}) })
      }
    } catch (err) {
      setError("Errore nel caricamento delle impostazioni")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!authLoading && adminUser) {
      loadSettings()
    }
  }, [authLoading, adminUser, loadSettings])

  const saveSettings = async () => {
    setSaving(true)
    setError(null)
    setSaveSuccess(false)

    try {
      const res = await fetch("/api/admin/channel-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: "telegram",
          is_enabled: isEnabled,
          settings,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || "Errore nel salvataggio")
        return
      }

      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      setError("Errore di rete nel salvataggio")
    } finally {
      setSaving(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminHeader
        title="Telegram Bot"
        subtitle="Gestisci il canale Telegram"
        breadcrumbs={[{ label: "Canali", href: "/admin/channels" }, { label: "Telegram" }]}
      >
        <Badge variant={isConnected ? "default" : "secondary"} className={isConnected ? "bg-blue-500" : ""}>
          {isConnected ? "Connesso" : "Non connesso"}
        </Badge>
        <Button onClick={saveSettings} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : saveSuccess ? (
            <CheckCircle2 className="h-4 w-4 mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          {saving ? "Salvataggio..." : saveSuccess ? "Salvato!" : "Salva modifiche"}
        </Button>
      </AdminHeader>

      {error && (
        <div className="container pt-4">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
        </div>
      )}

      <div className="container py-6">
        <Tabs defaultValue="connection" className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="connection">Connessione</TabsTrigger>
            <TabsTrigger value="messages">Messaggi</TabsTrigger>
            <TabsTrigger value="ai">AI</TabsTrigger>
          </TabsList>

          {/* Tab Connessione */}
          <TabsContent value="connection" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Send className="h-5 w-5" />
                  Connetti il tuo Bot Telegram
                </CardTitle>
                <CardDescription>Crea un bot Telegram e collegalo alla piattaforma in 3 semplici passi</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {!isConnected ? (
                  <>
                    <div className="space-y-4">
                      <div className="flex items-start gap-4 p-4 rounded-lg bg-muted/50">
                        <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium shrink-0">1</div>
                        <div>
                          <h4 className="font-medium">Apri Telegram e cerca @BotFather</h4>
                          <p className="text-sm text-muted-foreground mt-1">BotFather e il bot ufficiale di Telegram per creare nuovi bot</p>
                          <Button variant="link" className="px-0 h-auto mt-2" asChild>
                            <a href="https://t.me/botfather" target="_blank" rel="noopener noreferrer">
                              Apri BotFather <ExternalLink className="h-3 w-3 ml-1" />
                            </a>
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-start gap-4 p-4 rounded-lg bg-muted/50">
                        <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium shrink-0">2</div>
                        <div>
                          <h4 className="font-medium">Crea un nuovo bot con /newbot</h4>
                          <p className="text-sm text-muted-foreground mt-1">Scrivi <code className="bg-muted px-1 rounded">/newbot</code> e segui le istruzioni</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-4 p-4 rounded-lg bg-muted/50">
                        <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium shrink-0">3</div>
                        <div>
                          <h4 className="font-medium">Copia il Token del bot</h4>
                          <p className="text-sm text-muted-foreground mt-1">BotFather ti dara un token. Copialo qui sotto</p>
                        </div>
                      </div>
                    </div>

                    <div className="border-t pt-6 space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="bot-token">Token del Bot</Label>
                        <Input
                          id="bot-token"
                          type="password"
                          value={settings.bot_token}
                          onChange={(e) => setSettings({ ...settings, bot_token: e.target.value })}
                          placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="bot-username">Username del Bot (opzionale)</Label>
                        <Input
                          id="bot-username"
                          value={settings.bot_username}
                          onChange={(e) => setSettings({ ...settings, bot_username: e.target.value })}
                          placeholder="@NomeDelTuoBot"
                        />
                      </div>
                      <Button
                        className="w-full bg-blue-500 hover:bg-blue-600"
                        onClick={() => {
                          if (settings.bot_token) {
                            setIsEnabled(true)
                            saveSettings()
                          }
                        }}
                        disabled={!settings.bot_token}
                      >
                        <Send className="h-4 w-4 mr-2" />
                        Connetti Bot
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-center gap-4 p-4 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                      <CheckCircle2 className="h-8 w-8 text-blue-500" />
                      <div>
                        <h4 className="font-medium text-blue-700 dark:text-blue-300">Bot Telegram connesso!</h4>
                        <p className="text-sm text-blue-600 dark:text-blue-400">I messaggi verranno ricevuti nella tua inbox</p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Username del Bot</Label>
                        <div className="flex gap-2">
                          <Input value={settings.bot_username || "Non configurato"} readOnly className="font-mono" />
                          {settings.bot_username && (
                            <Button variant="outline" asChild>
                              <a href={`https://t.me/${settings.bot_username.replace("@", "")}`} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                        </div>
                      </div>
                      {settings.bot_username && (
                        <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                          <h4 className="font-medium text-sm">Link diretto al bot</h4>
                          <div className="flex gap-2">
                            <Input
                              value={`https://t.me/${settings.bot_username.replace("@", "")}`}
                              readOnly
                              className="font-mono text-sm"
                            />
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => copyToClipboard(`https://t.me/${settings.bot_username.replace("@", "")}`)}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="border-t pt-4">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          setIsEnabled(false)
                          setSettings({ ...settings, bot_token: "" })
                        }}
                      >
                        Disconnetti Bot
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {isConnected && (
              <Card>
                <CardHeader>
                  <CardTitle>Stato Webhook</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <span className="text-sm text-green-700 dark:text-green-300">
                      Webhook configurato automaticamente e attivo
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Tab Messaggi */}
          <TabsContent value="messages" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Comandi del Bot</CardTitle>
                <CardDescription>Configura i comandi disponibili per gli utenti</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {settings.commands.map((cmd, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg border">
                      <code className="bg-muted px-2 py-1 rounded text-sm font-mono">{cmd.command}</code>
                      <Input
                        value={cmd.description}
                        onChange={(e) => {
                          const newCommands = [...settings.commands]
                          newCommands[i] = { ...newCommands[i], description: e.target.value }
                          setSettings({ ...settings, commands: newCommands })
                        }}
                        className="flex-1 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Messaggio di Benvenuto</CardTitle>
                <CardDescription>Inviato quando un utente scrive /start</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={settings.welcome_message}
                  onChange={(e) => setSettings({ ...settings, welcome_message: e.target.value })}
                  rows={4}
                />
                <div className="p-4 rounded-lg border bg-muted/30">
                  <p className="text-xs text-muted-foreground mb-2">Anteprima:</p>
                  <div className="bg-blue-500 text-white p-3 rounded-lg rounded-bl-none max-w-xs text-sm">
                    {settings.welcome_message}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab AI */}
          <TabsContent value="ai" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  Assistente AI
                </CardTitle>
                <CardDescription>{"L'AI risponde automaticamente ai messaggi Telegram"}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between p-4 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${settings.ai_enabled ? "bg-blue-500" : "bg-muted"}`}>
                      <Bot className={`h-5 w-5 ${settings.ai_enabled ? "text-white" : "text-muted-foreground"}`} />
                    </div>
                    <div>
                      <h4 className="font-medium">AI Attiva su Telegram</h4>
                      <p className="text-sm text-muted-foreground">Risposte automatiche intelligenti</p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.ai_enabled}
                    onCheckedChange={(checked) => setSettings({ ...settings, ai_enabled: checked })}
                  />
                </div>

                {settings.ai_enabled && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Personalita del Bot</Label>
                      <Textarea
                        value={settings.ai_personality}
                        onChange={(e) => setSettings({ ...settings, ai_personality: e.target.value })}
                        placeholder="Es: Sei un assistente cordiale e professionale della struttura..."
                        rows={4}
                      />
                    </div>
                    <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
                      <div className="flex gap-2">
                        <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
                        <div>
                          <h4 className="font-medium text-amber-700 dark:text-amber-300 text-sm">Consiglio</h4>
                          <p className="text-sm text-amber-600 dark:text-amber-400">
                            {"Su Telegram l'AI puo rispondere istantaneamente. Configurala per passare la conversazione a un operatore per richieste complesse."}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
