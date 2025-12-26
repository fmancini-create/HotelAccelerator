"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { MessageCircle, Bot, Clock, CheckCircle2, Copy, ExternalLink, Smartphone } from "lucide-react"
import { AdminHeader } from "@/components/admin/admin-header"

export default function WhatsAppChannelPage() {
  const [isConnected, setIsConnected] = useState(false)
  const [aiEnabled, setAiEnabled] = useState(true)
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(true)
  const [phoneNumber, setPhoneNumber] = useState("")
  const [businessName, setBusinessName] = useState("")

  const [welcomeMessage, setWelcomeMessage] = useState("Ciao! Grazie per averci contattato. Come possiamo aiutarti?")
  const [awayMessage, setAwayMessage] = useState(
    "Grazie per il messaggio! Al momento non siamo disponibili, ti risponderemo appena possibile.",
  )

  const [workingHours, setWorkingHours] = useState({
    start: "09:00",
    end: "18:00",
    days: ["lun", "mar", "mer", "gio", "ven"],
  })

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminHeader
        title="WhatsApp Business"
        subtitle="Gestisci il canale WhatsApp"
        breadcrumbs={[{ label: "Canali", href: "/admin/channels" }, { label: "WhatsApp" }]}
      >
        <Badge variant={isConnected ? "default" : "secondary"} className={isConnected ? "bg-green-500" : ""}>
          {isConnected ? "Connesso" : "Non connesso"}
        </Badge>
        <Button>Salva modifiche</Button>
      </AdminHeader>

      <div className="container py-6">
        <Tabs defaultValue="connection" className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-4">
            <TabsTrigger value="connection">Connessione</TabsTrigger>
            <TabsTrigger value="messages">Messaggi</TabsTrigger>
            <TabsTrigger value="hours">Orari</TabsTrigger>
            <TabsTrigger value="ai">AI</TabsTrigger>
          </TabsList>

          {/* Tab Connessione */}
          <TabsContent value="connection" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5" />
                  Connetti WhatsApp Business
                </CardTitle>
                <CardDescription>
                  Collega il tuo account WhatsApp Business per ricevere e rispondere ai messaggi
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {!isConnected ? (
                  <>
                    <div className="space-y-4">
                      <div className="flex items-start gap-4 p-4 rounded-lg bg-muted/50">
                        <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                          1
                        </div>
                        <div>
                          <h4 className="font-medium">Crea un account Meta Business</h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            Se non hai già un account, creane uno su business.facebook.com
                          </p>
                          <Button variant="link" className="px-0 h-auto mt-2" asChild>
                            <a href="https://business.facebook.com" target="_blank" rel="noopener noreferrer">
                              Vai a Meta Business <ExternalLink className="h-3 w-3 ml-1" />
                            </a>
                          </Button>
                        </div>
                      </div>

                      <div className="flex items-start gap-4 p-4 rounded-lg bg-muted/50">
                        <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                          2
                        </div>
                        <div>
                          <h4 className="font-medium">Configura WhatsApp Business API</h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            Dalla dashboard Meta, attiva WhatsApp Business API per la tua azienda
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-4 p-4 rounded-lg bg-muted/50">
                        <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                          3
                        </div>
                        <div>
                          <h4 className="font-medium">Inserisci le credenziali</h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            Copia il Phone Number ID e il Token di accesso dalla dashboard Meta
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="border-t pt-6 space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="phone-id">Phone Number ID</Label>
                          <Input id="phone-id" placeholder="Es: 123456789012345" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="business-id">Business Account ID</Label>
                          <Input id="business-id" placeholder="Es: 123456789012345" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="access-token">Access Token</Label>
                        <Input id="access-token" type="password" placeholder="Il tuo token di accesso permanente" />
                      </div>
                      <Button className="w-full bg-green-500 hover:bg-green-600" onClick={() => setIsConnected(true)}>
                        <MessageCircle className="h-4 w-4 mr-2" />
                        Connetti WhatsApp
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-center gap-4 p-4 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
                      <CheckCircle2 className="h-8 w-8 text-green-500" />
                      <div>
                        <h4 className="font-medium text-green-700 dark:text-green-300">
                          WhatsApp connesso correttamente
                        </h4>
                        <p className="text-sm text-green-600 dark:text-green-400">
                          I messaggi verranno ricevuti nella tua inbox
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="phone">Numero WhatsApp</Label>
                        <Input
                          id="phone"
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          placeholder="+39 123 456 7890"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="biz-name">Nome Business</Label>
                        <Input
                          id="biz-name"
                          value={businessName}
                          onChange={(e) => setBusinessName(e.target.value)}
                          placeholder="Hotel Villa I Barronci"
                        />
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      <Button variant="destructive" size="sm" onClick={() => setIsConnected(false)}>
                        Disconnetti WhatsApp
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {isConnected && (
              <Card>
                <CardHeader>
                  <CardTitle>Webhook URL</CardTitle>
                  <CardDescription>Configura questo URL nella dashboard Meta per ricevere i messaggi</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Input
                      value="https://tuodominio.com/api/webhooks/whatsapp"
                      readOnly
                      className="font-mono text-sm"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyToClipboard("https://tuodominio.com/api/webhooks/whatsapp")}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Tab Messaggi */}
          <TabsContent value="messages" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Messaggi Automatici</CardTitle>
                <CardDescription>Configura i messaggi che verranno inviati automaticamente</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="welcome">Messaggio di benvenuto</Label>
                  <Textarea
                    id="welcome"
                    value={welcomeMessage}
                    onChange={(e) => setWelcomeMessage(e.target.value)}
                    placeholder="Il messaggio inviato quando un cliente scrive per la prima volta"
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="away">Messaggio fuori orario</Label>
                    <Switch checked={autoReplyEnabled} onCheckedChange={setAutoReplyEnabled} />
                  </div>
                  <Textarea
                    id="away"
                    value={awayMessage}
                    onChange={(e) => setAwayMessage(e.target.value)}
                    placeholder="Il messaggio inviato fuori dall'orario di lavoro"
                    rows={3}
                    disabled={!autoReplyEnabled}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab Orari */}
          <TabsContent value="hours" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Orari di Attività
                </CardTitle>
                <CardDescription>Imposta quando sei disponibile per rispondere ai messaggi</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Apertura</Label>
                    <Input
                      type="time"
                      value={workingHours.start}
                      onChange={(e) => setWorkingHours({ ...workingHours, start: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Chiusura</Label>
                    <Input
                      type="time"
                      value={workingHours.end}
                      onChange={(e) => setWorkingHours({ ...workingHours, end: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Giorni attivi</Label>
                  <div className="flex flex-wrap gap-2">
                    {["lun", "mar", "mer", "gio", "ven", "sab", "dom"].map((day) => (
                      <Button
                        key={day}
                        variant={workingHours.days.includes(day) ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          setWorkingHours({
                            ...workingHours,
                            days: workingHours.days.includes(day)
                              ? workingHours.days.filter((d) => d !== day)
                              : [...workingHours.days, day],
                          })
                        }}
                      >
                        {day.charAt(0).toUpperCase() + day.slice(1)}
                      </Button>
                    ))}
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
                <CardDescription>Configura l'intelligenza artificiale per rispondere automaticamente</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between p-4 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center ${aiEnabled ? "bg-primary" : "bg-muted"}`}
                    >
                      <Bot className={`h-5 w-5 ${aiEnabled ? "text-primary-foreground" : "text-muted-foreground"}`} />
                    </div>
                    <div>
                      <h4 className="font-medium">AI Attiva su WhatsApp</h4>
                      <p className="text-sm text-muted-foreground">L'AI risponderà ai messaggi quando attivata</p>
                    </div>
                  </div>
                  <Switch checked={aiEnabled} onCheckedChange={setAiEnabled} />
                </div>

                {aiEnabled && (
                  <div className="space-y-4">
                    <h4 className="font-medium">Comportamento AI</h4>
                    <div className="space-y-3">
                      {[
                        { label: "Risponde sempre", desc: "L'AI risponde a tutti i messaggi automaticamente" },
                        { label: "Solo fuori orario", desc: "L'AI risponde solo quando non sei disponibile" },
                        {
                          label: "Suggerisce risposte",
                          desc: "L'AI prepara le risposte ma aspetta la tua approvazione",
                        },
                      ].map((opt, i) => (
                        <label
                          key={i}
                          className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50"
                        >
                          <input type="radio" name="ai-mode" className="mt-1" defaultChecked={i === 2} />
                          <div>
                            <p className="font-medium">{opt.label}</p>
                            <p className="text-sm text-muted-foreground">{opt.desc}</p>
                          </div>
                        </label>
                      ))}
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
