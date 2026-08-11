"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Send, Bot, CheckCircle2, Copy, ExternalLink, AlertCircle } from "lucide-react"
import { AdminHeader } from "@/components/admin/admin-header"

export default function TelegramChannelPage() {
  const [isConnected, setIsConnected] = useState(false)
  const [botToken, setBotToken] = useState("")
  const [aiEnabled, setAiEnabled] = useState(true)

  const [welcomeMessage, setWelcomeMessage] = useState(
    "Benvenuto! Sono l'assistente di Hotel Villa I Barronci. Come posso aiutarti?",
  )

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const testConnection = async () => {
    setIsConnected(true)
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminHeader title="Telegram Bot" subtitle="Gestisci il canale Telegram" />

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
                        <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium shrink-0">
                          1
                        </div>
                        <div>
                          <h4 className="font-medium">Apri Telegram e cerca @BotFather</h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            BotFather è il bot ufficiale di Telegram per creare nuovi bot
                          </p>
                          <Button variant="link" className="px-0 h-auto mt-2" asChild>
                            <a href="https://t.me/botfather" target="_blank" rel="noopener noreferrer">
                              Apri BotFather <ExternalLink className="h-3 w-3 ml-1" />
                            </a>
                          </Button>
                        </div>
                      </div>

                      <div className="flex items-start gap-4 p-4 rounded-lg bg-muted/50">
                        <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium shrink-0">
                          2
                        </div>
                        <div>
                          <h4 className="font-medium">Crea un nuovo bot con /newbot</h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            Scrivi <code className="bg-muted px-1 rounded">/newbot</code> e segui le istruzioni
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-4 p-4 rounded-lg bg-muted/50">
                        <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium shrink-0">
                          3
                        </div>
                        <div>
                          <h4 className="font-medium">Copia il Token del bot</h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            BotFather ti darà un token. Copialo qui sotto
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="border-t pt-6 space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="bot-token">Token del Bot</Label>
                        <Input
                          id="bot-token"
                          type="password"
                          value={botToken}
                          onChange={(e) => setBotToken(e.target.value)}
                          placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                        />
                      </div>

                      <Button
                        className="w-full bg-ha-info hover:bg-ha-info"
                        onClick={testConnection}
                        disabled={!botToken}
                      >
                        <Send className="h-4 w-4 mr-2" />
                        Connetti Bot
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-center gap-4 p-4 rounded-lg bg-ha-info-soft dark:bg-ha-info border border-ha-info-soft dark:border-ha-info">
                      <CheckCircle2 className="h-8 w-8 text-ha-info-soft-foreground" />
                      <div>
                        <h4 className="font-medium text-blue-700 dark:text-blue-300">Bot Telegram connesso!</h4>
                        <p className="text-sm text-ha-info-soft-foreground dark:text-ha-info-soft-foreground">
                          I messaggi verranno ricevuti nella tua inbox
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Username del Bot</Label>
                        <div className="flex gap-2">
                          <Input value="@VillaBarronciBot" readOnly className="font-mono" />
                          <Button variant="outline" asChild>
                            <a href="https://t.me/VillaBarronciBot" target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        </div>
                      </div>

                      <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                        <h4 className="font-medium text-sm">Link diretto al bot</h4>
                        <div className="flex gap-2">
                          <Input value="https://t.me/VillaBarronciBot" readOnly className="font-mono text-sm" />
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => copyToClipboard("https://t.me/VillaBarronciBot")}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      <Button variant="destructive" size="sm" onClick={() => setIsConnected(false)}>
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
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-ha-success-soft dark:bg-ha-success border border-ha-success-soft dark:border-ha-success">
                    <CheckCircle2 className="h-5 w-5 text-ha-success-soft-foreground" />
                    <span className="text-sm text-ha-success-soft-foreground dark:text-ha-success-soft-foreground">
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
                  {[
                    { command: "/start", desc: "Messaggio di benvenuto" },
                    { command: "/prenota", desc: "Avvia procedura prenotazione" },
                    { command: "/info", desc: "Informazioni sull'hotel" },
                    { command: "/contatti", desc: "Mostra i contatti" },
                  ].map((cmd, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg border">
                      <code className="bg-muted px-2 py-1 rounded text-sm font-mono">{cmd.command}</code>
                      <span className="text-sm flex-1">{cmd.desc}</span>
                      <Button variant="ghost" size="sm">
                        Modifica
                      </Button>
                    </div>
                  ))}
                </div>
                <Button variant="outline" className="w-full bg-transparent">
                  + Aggiungi comando
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Messaggio di Benvenuto</CardTitle>
                <CardDescription>Inviato quando un utente scrive /start</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea value={welcomeMessage} onChange={(e) => setWelcomeMessage(e.target.value)} rows={4} />
                <div className="p-4 rounded-lg border bg-muted/30">
                  <p className="text-xs text-muted-foreground mb-2">Anteprima:</p>
                  <div className="bg-ha-info text-white p-3 rounded-lg rounded-bl-none max-w-xs text-sm">
                    {welcomeMessage}
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
                <CardDescription>L'AI risponde automaticamente ai messaggi Telegram</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between p-4 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center ${aiEnabled ? "bg-ha-info" : "bg-muted"}`}
                    >
                      <Bot className={`h-5 w-5 ${aiEnabled ? "text-white" : "text-muted-foreground"}`} />
                    </div>
                    <div>
                      <h4 className="font-medium">AI Attiva su Telegram</h4>
                      <p className="text-sm text-muted-foreground">Risposte automatiche intelligenti</p>
                    </div>
                  </div>
                  <Switch checked={aiEnabled} onCheckedChange={setAiEnabled} />
                </div>

                {aiEnabled && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Personalità del Bot</Label>
                      <Textarea
                        placeholder="Es: Sei un assistente cordiale e professionale dell'Hotel Villa I Barronci..."
                        rows={4}
                      />
                    </div>

                    <div className="p-4 rounded-lg bg-ha-warning-soft dark:bg-ha-warning border border-ha-warning-soft dark:border-ha-warning">
                      <div className="flex gap-2">
                        <AlertCircle className="h-5 w-5 text-ha-warning-soft-foreground shrink-0" />
                        <div>
                          <h4 className="font-medium text-ha-warning-soft-foreground dark:text-ha-warning-soft-foreground text-sm">Consiglio</h4>
                          <p className="text-sm text-ha-warning-soft-foreground dark:text-ha-warning-soft-foreground">
                            Su Telegram l'AI può rispondere istantaneamente. Configurala per passare la conversazione a
                            un operatore per richieste complesse.
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
