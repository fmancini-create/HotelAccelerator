"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Copy, Check, MessageCircle, Palette, Code, Bot, Sparkles, Eye, Globe, Zap, Mail } from "lucide-react"
import { AdminHeader } from "@/components/admin/admin-header"

interface ChatWidgetConfig {
  id?: string
  property_id: string
  name: string
  is_active: boolean
  config: {
    primaryColor: string
    position: "bottom-right" | "bottom-left"
    welcomeMessage: string
    placeholder: string
    aiEnabled: boolean
    aiGreeting: string
    offlineMessage: string
    collectEmail: boolean
  }
}

const DEFAULT_CONFIG: ChatWidgetConfig["config"] = {
  primaryColor: "#8b7355",
  position: "bottom-right",
  welcomeMessage: "Ciao! Come possiamo aiutarti?",
  placeholder: "Scrivi un messaggio...",
  aiEnabled: false,
  aiGreeting: "Sono l'assistente virtuale. Posso aiutarti con informazioni su camere, disponibilità e servizi.",
  offlineMessage: "Siamo offline. Lascia un messaggio e ti risponderemo presto.",
  collectEmail: true,
}

export default function ChatChannelPage() {
  const [config, setConfig] = useState<ChatWidgetConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [propertyId, setPropertyId] = useState<string | null>(null)
  const [hasCMS, setHasCMS] = useState(false)

  useEffect(() => {
    fetchConfig()
  }, [])

  const fetchConfig = async () => {
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data: adminUser } = await supabase.from("admin_users").select("property_id").eq("id", user.id).single()

      if (!adminUser?.property_id) return
      setPropertyId(adminUser.property_id)

      const { data: cmsPages } = await supabase
        .from("cms_pages")
        .select("id")
        .eq("property_id", adminUser.property_id)
        .limit(1)

      setHasCMS((cmsPages?.length || 0) > 0)

      const { data: existingWidget } = await supabase
        .from("embed_scripts")
        .select("*")
        .eq("property_id", adminUser.property_id)
        .eq("script_type", "chat")
        .single()

      if (existingWidget) {
        setConfig({
          id: existingWidget.id,
          property_id: existingWidget.property_id,
          name: existingWidget.name,
          is_active: existingWidget.is_active,
          config: existingWidget.config || DEFAULT_CONFIG,
        })
      } else {
        setConfig({
          property_id: adminUser.property_id,
          name: "Chat Widget",
          is_active: false,
          config: DEFAULT_CONFIG,
        })
      }
    } catch (error) {
      console.error("Error fetching config:", error)
    } finally {
      setLoading(false)
    }
  }

  const saveConfig = async () => {
    if (!config || !propertyId) return
    setSaving(true)

    try {
      const supabase = createClient()

      if (config.id) {
        await supabase
          .from("embed_scripts")
          .update({
            name: config.name,
            is_active: config.is_active,
            config: config.config,
            updated_at: new Date().toISOString(),
          })
          .eq("id", config.id)
      } else {
        const { data } = await supabase
          .from("embed_scripts")
          .insert({
            property_id: propertyId,
            script_type: "chat",
            name: config.name,
            is_active: config.is_active,
            config: config.config,
          })
          .select()
          .single()

        if (data) {
          setConfig({ ...config, id: data.id })
        }
      }
    } catch (error) {
      console.error("Error saving config:", error)
    } finally {
      setSaving(false)
    }
  }

  const copySnippet = () => {
    const snippet = `<!-- Chat Widget - Villa I Barronci -->
<script 
  src="${typeof window !== "undefined" ? window.location.origin : ""}/widget/chat.js" 
  data-property-id="${propertyId}"
  async>
</script>

<!-- Nota: Incolla questo codice prima della chiusura del tag </body> -->`
    navigator.clipboard.writeText(snippet)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const updateConfig = (key: keyof ChatWidgetConfig["config"], value: any) => {
    if (!config) return
    setConfig({
      ...config,
      config: { ...config.config, [key]: value },
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#faf9f7] flex items-center justify-center">
        <div className="animate-pulse text-[#8b7355]">Caricamento...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#faf9f7]">
      <AdminHeader
        title="Chat Widget"
        subtitle="Configura la chat in tempo reale per il tuo sito web"
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-[#8b7355]">{config?.is_active ? "Attivo" : "Disattivato"}</span>
              <Switch
                checked={config?.is_active || false}
                onCheckedChange={(checked) => setConfig(config ? { ...config, is_active: checked } : null)}
                className="data-[state=checked]:bg-green-500"
              />
            </div>
            <Button onClick={saveConfig} disabled={saving} className="bg-[#8b7355] hover:bg-[#5c4a3a]">
              {saving ? "Salvataggio..." : "Salva"}
            </Button>
          </div>
        }
      />

      <div className="max-w-4xl mx-auto p-6">
        <Tabs defaultValue="aspetto" className="space-y-6">
          <TabsList className="bg-white border border-[#e8e0d8]">
            <TabsTrigger value="aspetto" className="data-[state=active]:bg-[#f5f0eb]">
              <Palette className="w-4 h-4 mr-2" />
              Aspetto
            </TabsTrigger>
            <TabsTrigger value="messaggi" className="data-[state=active]:bg-[#f5f0eb]">
              <MessageCircle className="w-4 h-4 mr-2" />
              Messaggi
            </TabsTrigger>
            <TabsTrigger value="ai" className="data-[state=active]:bg-[#f5f0eb]">
              <Bot className="w-4 h-4 mr-2" />
              AI
            </TabsTrigger>
            <TabsTrigger value="installa" className="data-[state=active]:bg-[#f5f0eb]">
              <Code className="w-4 h-4 mr-2" />
              Installa
            </TabsTrigger>
          </TabsList>

          {/* Aspetto Tab - same as before */}
          <TabsContent value="aspetto">
            <div className="grid grid-cols-2 gap-6">
              <Card className="bg-white border-[#e8e0d8]">
                <CardHeader>
                  <CardTitle className="text-[#5c4a3a] text-lg">Personalizzazione</CardTitle>
                  <CardDescription>Adatta il widget al tuo brand</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-[#5c4a3a]">Colore principale</Label>
                    <div className="flex gap-3">
                      <Input
                        type="color"
                        value={config?.config.primaryColor || "#8b7355"}
                        onChange={(e) => updateConfig("primaryColor", e.target.value)}
                        className="w-14 h-10 p-1 cursor-pointer"
                      />
                      <Input
                        value={config?.config.primaryColor || "#8b7355"}
                        onChange={(e) => updateConfig("primaryColor", e.target.value)}
                        className="flex-1 border-[#e8e0d8]"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[#5c4a3a]">Posizione</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant={config?.config.position === "bottom-right" ? "default" : "outline"}
                        onClick={() => updateConfig("position", "bottom-right")}
                        className={config?.config.position === "bottom-right" ? "bg-[#8b7355]" : "border-[#e8e0d8]"}
                      >
                        Destra
                      </Button>
                      <Button
                        variant={config?.config.position === "bottom-left" ? "default" : "outline"}
                        onClick={() => updateConfig("position", "bottom-left")}
                        className={config?.config.position === "bottom-left" ? "bg-[#8b7355]" : "border-[#e8e0d8]"}
                      >
                        Sinistra
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <div>
                      <Label className="text-[#5c4a3a]">Richiedi email</Label>
                      <p className="text-xs text-[#8b7355]">Prima di iniziare la chat</p>
                    </div>
                    <Switch
                      checked={config?.config.collectEmail || false}
                      onCheckedChange={(checked) => updateConfig("collectEmail", checked)}
                      className="data-[state=checked]:bg-[#8b7355]"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Preview */}
              <Card className="bg-white border-[#e8e0d8]">
                <CardHeader>
                  <CardTitle className="text-[#5c4a3a] text-lg flex items-center gap-2">
                    <Eye className="w-4 h-4" />
                    Anteprima
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="relative h-80 bg-gray-100 rounded-lg overflow-hidden">
                    <div
                      className={`absolute bottom-4 ${
                        config?.config.position === "bottom-right" ? "right-4" : "left-4"
                      }`}
                    >
                      <div
                        className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg cursor-pointer"
                        style={{ backgroundColor: config?.config.primaryColor || "#8b7355" }}
                      >
                        <MessageCircle className="w-6 h-6 text-white" />
                      </div>
                    </div>

                    <div
                      className={`absolute bottom-20 ${
                        config?.config.position === "bottom-right" ? "right-4" : "left-4"
                      } w-72 bg-white rounded-lg shadow-xl overflow-hidden`}
                    >
                      <div
                        className="p-4 text-white"
                        style={{ backgroundColor: config?.config.primaryColor || "#8b7355" }}
                      >
                        <h4 className="font-medium">Chat</h4>
                      </div>
                      <div className="p-4 h-32 bg-gray-50">
                        <div className="bg-white p-2 rounded-lg shadow-sm text-sm text-gray-600">
                          {config?.config.welcomeMessage}
                        </div>
                      </div>
                      <div className="p-3 border-t">
                        <Input placeholder={config?.config.placeholder} disabled className="text-sm" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Messaggi Tab */}
          <TabsContent value="messaggi">
            <Card className="bg-white border-[#e8e0d8]">
              <CardHeader>
                <CardTitle className="text-[#5c4a3a] text-lg">Messaggi predefiniti</CardTitle>
                <CardDescription>Personalizza i testi visualizzati nella chat</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-[#5c4a3a]">Messaggio di benvenuto</Label>
                  <Input
                    value={config?.config.welcomeMessage || ""}
                    onChange={(e) => updateConfig("welcomeMessage", e.target.value)}
                    className="border-[#e8e0d8]"
                    placeholder="Es: Ciao! Come possiamo aiutarti?"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-[#5c4a3a]">Placeholder input</Label>
                  <Input
                    value={config?.config.placeholder || ""}
                    onChange={(e) => updateConfig("placeholder", e.target.value)}
                    className="border-[#e8e0d8]"
                    placeholder="Es: Scrivi un messaggio..."
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-[#5c4a3a]">Messaggio offline</Label>
                  <Input
                    value={config?.config.offlineMessage || ""}
                    onChange={(e) => updateConfig("offlineMessage", e.target.value)}
                    className="border-[#e8e0d8]"
                    placeholder="Es: Siamo offline. Lascia un messaggio..."
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* AI Tab */}
          <TabsContent value="ai">
            <Card className="bg-white border-[#e8e0d8]">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-[#5c4a3a] text-lg flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-amber-500" />
                      Assistente AI
                    </CardTitle>
                    <CardDescription>Risposte automatiche intelligenti per i tuoi clienti</CardDescription>
                  </div>
                  <Switch
                    checked={config?.config.aiEnabled || false}
                    onCheckedChange={(checked) => updateConfig("aiEnabled", checked)}
                    className="data-[state=checked]:bg-amber-500"
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {config?.config.aiEnabled ? (
                  <>
                    <div className="space-y-2">
                      <Label className="text-[#5c4a3a]">Messaggio di presentazione AI</Label>
                      <Input
                        value={config?.config.aiGreeting || ""}
                        onChange={(e) => updateConfig("aiGreeting", e.target.value)}
                        className="border-[#e8e0d8]"
                        placeholder="Es: Sono l'assistente virtuale..."
                      />
                    </div>

                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                      <h4 className="font-medium text-amber-800 mb-2">L'AI puo rispondere a domande su:</h4>
                      <ul className="text-sm text-amber-700 space-y-1">
                        <li>Disponibilita camere e prezzi</li>
                        <li>Servizi della struttura</li>
                        <li>Come raggiungere l'hotel</li>
                        <li>Informazioni generali</li>
                      </ul>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8 text-[#8b7355]">
                    <Bot className="w-12 h-12 mx-auto mb-4 opacity-30" />
                    <p>Attiva l'AI per rispondere automaticamente ai clienti</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="installa">
            {hasCMS ? (
              /* CMS User - Simple activation */
              <Card className="bg-white border-[#e8e0d8]">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
                      <Zap className="w-6 h-6 text-green-600" />
                    </div>
                    <div>
                      <CardTitle className="text-[#5c4a3a] text-lg">Attivazione Automatica</CardTitle>
                      <CardDescription>Il tuo sito usa il nostro CMS, l'attivazione e automatica!</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
                    <Globe className="w-16 h-16 text-green-500 mx-auto mb-4" />
                    <h3 className="text-xl font-medium text-green-800 mb-2">Nessun codice da copiare!</h3>
                    <p className="text-green-700 mb-6">
                      Il widget chat sara automaticamente visibile su tutte le pagine del tuo sito appena lo attivi.
                    </p>

                    <div className="flex items-center justify-center gap-4">
                      <span className="text-lg text-[#5c4a3a]">Widget Chat</span>
                      <Switch
                        checked={config?.is_active || false}
                        onCheckedChange={(checked) => {
                          setConfig(config ? { ...config, is_active: checked } : null)
                        }}
                        className="data-[state=checked]:bg-green-500 scale-125"
                      />
                      <span className={`text-lg font-medium ${config?.is_active ? "text-green-600" : "text-gray-400"}`}>
                        {config?.is_active ? "ATTIVO" : "SPENTO"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-6 flex items-start gap-3 text-sm text-[#8b7355]">
                    <div className="w-6 h-6 rounded-full bg-[#f5f0eb] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-medium">i</span>
                    </div>
                    <p>
                      Ricorda di salvare la configurazione dopo aver modificato le impostazioni. Le modifiche saranno
                      visibili immediatamente sul tuo sito.
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              /* External Site - Code snippet */
              <Card className="bg-white border-[#e8e0d8]">
                <CardHeader>
                  <CardTitle className="text-[#5c4a3a] text-lg">Installa sul tuo sito</CardTitle>
                  <CardDescription>
                    Copia questo codice e incollalo nel tuo sito web. Puoi mandarlo al tuo webmaster con le istruzioni.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Step by step */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-4 bg-[#faf9f7] rounded-lg">
                      <div className="w-10 h-10 rounded-full bg-[#8b7355] text-white flex items-center justify-center mx-auto mb-3 text-lg font-medium">
                        1
                      </div>
                      <h4 className="font-medium text-[#5c4a3a] mb-1">Copia il codice</h4>
                      <p className="text-xs text-[#8b7355]">Clicca sul pulsante qui sotto</p>
                    </div>
                    <div className="text-center p-4 bg-[#faf9f7] rounded-lg">
                      <div className="w-10 h-10 rounded-full bg-[#8b7355] text-white flex items-center justify-center mx-auto mb-3 text-lg font-medium">
                        2
                      </div>
                      <h4 className="font-medium text-[#5c4a3a] mb-1">Incolla nel sito</h4>
                      <p className="text-xs text-[#8b7355]">Prima di &lt;/body&gt;</p>
                    </div>
                    <div className="text-center p-4 bg-[#faf9f7] rounded-lg">
                      <div className="w-10 h-10 rounded-full bg-[#8b7355] text-white flex items-center justify-center mx-auto mb-3 text-lg font-medium">
                        3
                      </div>
                      <h4 className="font-medium text-[#5c4a3a] mb-1">Pubblica</h4>
                      <p className="text-xs text-[#8b7355]">Il widget apparira</p>
                    </div>
                  </div>

                  {/* Code snippet */}
                  <div className="relative">
                    <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-sm overflow-x-auto">
                      {`<!-- Chat Widget -->
<script 
  src="${typeof window !== "undefined" ? window.location.origin : ""}/widget/chat.js" 
  data-property-id="${propertyId}"
  async>
</script>`}
                    </pre>
                    <Button size="sm" variant="secondary" className="absolute top-2 right-2" onClick={copySnippet}>
                      {copied ? (
                        <>
                          <Check className="w-4 h-4 mr-1" />
                          Copiato!
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 mr-1" />
                          Copia codice
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Email to webmaster */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-medium text-blue-800 mb-2">Vuoi mandarlo al tuo webmaster?</h4>
                    <p className="text-sm text-blue-700 mb-3">
                      Abbiamo preparato un'email con tutte le istruzioni che puoi inoltrare direttamente.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-blue-300 text-blue-700 hover:bg-blue-100 bg-transparent"
                      onClick={() => {
                        const subject = encodeURIComponent("Installazione Chat Widget")
                        const body = encodeURIComponent(`Ciao,

Per favore installa questo widget chat sul nostro sito web.

ISTRUZIONI:
1. Copia il codice qui sotto
2. Incollalo nel file HTML del sito, prima della chiusura del tag </body>
3. Salva e pubblica

CODICE:
<!-- Chat Widget -->
<script 
  src="${typeof window !== "undefined" ? window.location.origin : ""}/widget/chat.js" 
  data-property-id="${propertyId}"
  async>
</script>

Se hai domande, contattami.

Grazie!`)
                        window.open(`mailto:?subject=${subject}&body=${body}`)
                      }}
                    >
                      <Mail className="w-4 h-4 mr-2" />
                      Prepara email per webmaster
                    </Button>
                  </div>

                  {!config?.is_active && (
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                      <p className="text-sm text-orange-700">
                        <strong>Nota:</strong> Il widget è attualmente disattivato. Attivalo usando lo switch in alto
                        per renderlo visibile sul tuo sito.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
