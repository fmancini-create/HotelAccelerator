"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Mail,
  MessageCircle,
  Phone,
  Send,
  MessagesSquare,
  ChevronRight,
  CheckCircle2,
  Circle,
  Settings2,
  Sparkles,
  Facebook,
  Instagram,
  Twitter,
  Linkedin,
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { AdminHeader } from "@/components/admin/admin-header"
import { ChannelKnowledgeAssignment } from "@/components/admin/channels/channel-knowledge-assignment"

const CHANNEL_CATEGORIES = [
  {
    id: "messaging",
    name: "Messaggistica",
    description: "Canali di comunicazione diretta",
    channels: [
      {
        id: "email",
        name: "Email",
        description: "Ricevi e rispondi alle email dei clienti",
        icon: Mail,
        color: "bg-blue-500",
        configPath: "/admin/channels/email",
        available: true,
        comingSoon: false,
      },
      {
        id: "chat",
        name: "Chat Widget",
        description: "Chat in tempo reale sul tuo sito web",
        icon: MessageCircle,
        color: "bg-green-500",
        configPath: "/admin/channels/chat",
        available: true,
        comingSoon: false,
      },
      {
        id: "whatsapp",
        name: "WhatsApp",
        description: "Messaggi WhatsApp Business (API Meta Cloud)",
        icon: MessagesSquare,
        color: "bg-emerald-500",
        configPath: "/admin/channels/whatsapp",
        available: true,
        comingSoon: false,
      },
      {
        id: "telegram",
        name: "Telegram",
        description: "Bot Telegram per assistenza",
        icon: Send,
        color: "bg-sky-500",
        configPath: "/admin/channels/telegram",
        available: true,
        comingSoon: false,
      },
    ],
  },
  {
    id: "social",
    name: "Social Media",
    description: "Connetti i tuoi profili social",
    channels: [
      {
        id: "facebook",
        name: "Facebook",
        description: "Messaggi e commenti dalla tua pagina",
        icon: Facebook,
        color: "bg-[#1877F2]",
        configPath: "/admin/channels/facebook",
        available: true,
        comingSoon: true,
      },
      {
        id: "instagram",
        name: "Instagram",
        description: "DM e commenti dal tuo profilo business",
        icon: Instagram,
        color: "bg-gradient-to-br from-[#833AB4] via-[#FD1D1D] to-[#F77737]",
        configPath: "/admin/channels/instagram",
        available: true,
        comingSoon: true,
      },
      {
        id: "twitter",
        name: "X (Twitter)",
        description: "Messaggi diretti e menzioni",
        icon: Twitter,
        color: "bg-black",
        configPath: "/admin/channels/twitter",
        available: true,
        comingSoon: true,
      },
      {
        id: "linkedin",
        name: "LinkedIn",
        description: "Messaggi dalla pagina aziendale",
        icon: Linkedin,
        color: "bg-[#0A66C2]",
        configPath: "/admin/channels/linkedin",
        available: true,
        comingSoon: true,
      },
    ],
  },
  {
    id: "voice",
    name: "Voce",
    // Non prometto "trascrizione AI": richiede l'audio della chiamata, che
    // passa da un bridge esterno e in questo progetto non esiste.
    description: "Centralino collegato al CRM",
    channels: [
      {
        id: "phone",
        name: "Telefono IP (3CX)",
        // La vecchia descrizione promise "trascrizione AI", che NON esiste:
        // trascrivere richiede l'audio, che passa dal bridge e qui non c'e'.
        // Descrivo cio' che la pagina fa davvero.
        description: "Chiamate dal CRM e riconoscimento del chiamante",
        icon: Phone,
        color: "bg-purple-500",
        configPath: "/admin/channels/phone",
        available: true,
        // Il centralino ORA e' collegabile: la pagina di configurazione esiste
        // e le rotte 3CX sono attive. Lasciando comingSoon:true la scheda
        // mostrava un pulsante "Notificami" SPENTO invece del collegamento
        // (riga ~394), quindi la pagina era irraggiungibile dal menu': avevo
        // rifatto la stanza lasciando la porta chiusa a chiave.
        comingSoon: false,
      },
    ],
  },
]

// Flatten channels for status lookup
const ALL_CHANNELS = CHANNEL_CATEGORIES.flatMap((cat) => cat.channels)

interface ChannelStatus {
  id: string
  enabled: boolean
  configured: boolean
  activeConnections: number
}

export default function ChannelsPage() {
  const router = useRouter()
  const [channelStatuses, setChannelStatuses] = useState<Record<string, ChannelStatus>>({})
  // Canale in corso di modifica: blocca doppi clic, che manderebbero due
  // richieste opposte e lascerebbero uno stato incerto.
  const [togglingChannel, setTogglingChannel] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [propertyId, setPropertyId] = useState<string | null>(null)

  // The channels overview is admin-only. A non-admin member can only manage
  // their own mailbox, so we send them straight to the email page.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/platform/me", { credentials: "include" })
        if (!res.ok) return
        const me = await res.json()
        if (!cancelled && me?.isAdmin === false) {
          router.replace("/admin/channels/email")
        }
      } catch {
        // ignore; APIs remain access-controlled server-side
      }
    })()
    return () => {
      cancelled = true
    }
  }, [router])

  useEffect(() => {
    fetchChannelStatuses()
  }, [])

  const fetchChannelStatuses = async () => {
    try {
      const supabase = createClient()
      const meResponse = await fetch("/api/platform/me", { credentials: "include", cache: "no-store" })
      if (!meResponse.ok) return
      const me = (await meResponse.json()) as { activePropertyId?: string | null }
      const activePropertyId = me.activePropertyId ?? null
      if (!activePropertyId) return
      setPropertyId(activePropertyId)

      const { data: emailChannels } = (await supabase
        .from("email_channels")
        .select("id, is_active")
        .eq("property_id", activePropertyId)) as {
        data: Array<{ id: string; is_active: boolean }> | null
      }

      // `embed_scripts` NON ha ne' `is_active` ne' `script_type` (verificato
      // sullo schema): la query precedente chiedeva DUE colonne inesistenti,
      // quindi tornava sempre errore e la scheda Chat risultava eternamente
      // "Non configurato". Lo stato reale e' `status`, lo stesso campo che il
      // widget pubblico controlla per decidere se mostrarsi.
      const { data: chatWidgets } = (await supabase
        .from("embed_scripts")
        .select("id, status")
        .eq("property_id", activePropertyId)) as {
        data: Array<{ id: string; status: string }> | null
      }

      const { data: waChannels } = (await supabase
        .from("messaging_channels")
        .select("id, is_active, config")
        .eq("property_id", activePropertyId)
        .eq("channel_type", "whatsapp")) as {
        data: Array<{ id: string; is_active: boolean; config: { phone_number_id?: string } }> | null
      }

      const { data: tgChannels } = (await supabase
        .from("messaging_channels")
        .select("id, is_active, config")
        .eq("property_id", activePropertyId)
        .eq("channel_type", "telegram")) as {
        data: Array<{ id: string; is_active: boolean; config: { bot_id?: string | number } }> | null
      }

      // Initialize all channel statuses
      const statuses: Record<string, ChannelStatus> = {}
      ALL_CHANNELS.forEach((ch) => {
        statuses[ch.id] = { id: ch.id, enabled: false, configured: false, activeConnections: 0 }
      })

      // Update with real data
      statuses.email = {
        id: "email",
        enabled: emailChannels?.some((c) => c.is_active) || false,
        configured: (emailChannels?.length || 0) > 0,
        activeConnections: emailChannels?.filter((c) => c.is_active).length || 0,
      }
      statuses.chat = {
        id: "chat",
        enabled: chatWidgets?.some((c) => c.status === "active") || false,
        configured: (chatWidgets?.length || 0) > 0,
        activeConnections: chatWidgets?.filter((c) => c.status === "active").length || 0,
      }
      const waConfigured = (waChannels || []).filter((c) => c.config?.phone_number_id)
      statuses.whatsapp = {
        id: "whatsapp",
        enabled: waConfigured.some((c) => c.is_active),
        configured: waConfigured.length > 0,
        activeConnections: waConfigured.filter((c) => c.is_active).length,
      }

      const tgConfigured = (tgChannels || []).filter((c) => c.config?.bot_id)
      statuses.telegram = {
        id: "telegram",
        enabled: tgConfigured.some((c) => c.is_active),
        configured: tgConfigured.length > 0,
        activeConnections: tgConfigured.filter((c) => c.is_active).length,
      }

      // Centralino: NON interrogo telephony_integrations dal browser. Quella
      // tabella ha RLS attiva SENZA policy (le credenziali del centralino non
      // devono essere leggibili dal client), quindi una lettura con chiave
      // anonima tornerebbe ZERO RIGHE IN SILENZIO: la scheda direbbe "Non
      // configurato" anche a centralino collegato. Passo dalla rotta server.
      try {
        const phoneRes = await fetch("/api/telephony/3cx", { cache: "no-store" })
        if (phoneRes.ok) {
          // Nomi dei campi PRESI DALLA ROTTA (snake_case), non indovinati:
          // avevo scritto baseUrl/hasClientSecret/isActive e la scheda avrebbe
          // detto "Non configurato" per sempre. Un tipo scritto a mano che
          // mente non viene bocciato da tsc.
          const phoneData = (await phoneRes.json()) as {
            integration?: {
              is_active?: boolean
              base_url?: string | null
              has_credentials?: { client_secret?: boolean }
              last_check_status?: string | null
            } | null
          }
          const integration = phoneData.integration
          // "Configurato" solo con indirizzo E secret presenti: con uno dei due
          // mancanti nessuna chiamata potrebbe partire, quindi dichiararlo
          // configurato sarebbe una risposta sbagliata.
          const configured = Boolean(integration?.base_url && integration?.has_credentials?.client_secret)
          // "Attivo" solo se l'ULTIMA VERIFICA e' andata a buon fine: con
          // credenziali piene ma connessione fallita, dire "Attivo" sarebbe una
          // risposta sbagliata data per valida (la pagina di dettaglio usa lo
          // stesso criterio, last_check_status === "ok").
          const active = configured && integration?.is_active !== false && integration?.last_check_status === "ok"
          statuses.phone = {
            id: "phone",
            enabled: active,
            configured,
            activeConnections: active ? 1 : 0,
          }
        }
      } catch (phoneError) {
        // Rete irraggiungibile: lascio lo stato iniziale (non configurato)
        // invece di inventare un "attivo".
        console.error("[v0] stato centralino non leggibile:", phoneError)
      }

      setChannelStatuses(statuses)
    } catch (error) {
      console.error("Error fetching channel statuses:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const getStatusBadge = (channel: (typeof ALL_CHANNELS)[0]) => {
    if (channel.comingSoon) {
      return (
        <Badge variant="outline" className="bg-ha-warning-soft text-ha-warning-soft-foreground border-ha-warning-soft">
          <Sparkles className="w-3 h-3 mr-1" />
          Prossimamente
        </Badge>
      )
    }

    const status = channelStatuses[channel.id]
    if (!status?.configured) {
      return (
        <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
          <Circle className="w-3 h-3 mr-1" />
          Non configurato
        </Badge>
      )
    }

    if (status.enabled) {
      return (
        <Badge variant="outline" className="bg-ha-success-soft text-ha-success-soft-foreground border-ha-success-soft">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Attivo ({status.activeConnections})
        </Badge>
      )
    }

    return (
      <Badge variant="outline" className="bg-ha-warning-soft text-ha-warning-soft-foreground border-ha-warning-soft">
        <Circle className="w-3 h-3 mr-1" />
        Disattivato
      </Badge>
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-full bg-muted flex items-center justify-center">
        <div className="animate-pulse text-ha-brand-soft-foreground">Caricamento canali...</div>
      </div>
    )
  }

  /**
   * Accende/spegne un canale. Passa dalla rotta server perche' le tabelle dei
   * canali contengono credenziali e sono chiuse al ruolo anonimo: un update dal
   * browser verrebbe scartato dalle policy senza errore e l'interruttore
   * tornerebbe indietro da solo.
   */
  const handleToggleChannel = async (channelId: string, next: boolean) => {
    const status = channelStatuses[channelId]
    if (!status?.configured || togglingChannel) return

    setTogglingChannel(channelId)
    // Stato precedente conservato per poterlo RIPRISTINARE se il server
    // rifiuta: lasciare l'interruttore sulla nuova posizione dopo un errore
    // mostrerebbe "Attivo" per un canale rimasto spento.
    const previous = status
    setChannelStatuses((prev) => ({
      ...prev,
      [channelId]: { ...previous, enabled: next, activeConnections: next ? Math.max(1, previous.activeConnections) : 0 },
    }))

    try {
      const res = await fetch("/api/channels/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: channelId, enabled: next }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; updated?: number }

      if (!res.ok) {
        setChannelStatuses((prev) => ({ ...prev, [channelId]: previous }))
        toast.error(data.error || "Modifica non riuscita")
        return
      }

      // Il numero di connessioni toccate arriva dal server: email puo' averne
      // piu' di una (oggi 2), e l'utente deve sapere che l'interruttore agisce
      // su tutte, non su una sola.
      const n = data.updated ?? 0
      toast.success(
        next
          ? n > 1
            ? `Canale attivato (${n} connessioni)`
            : "Canale attivato"
          : n > 1
            ? `Canale disattivato (${n} connessioni)`
            : "Canale disattivato",
      )
      // Rileggo dal database invece di fidarmi dello stato locale: e' il dato
      // salvato che conta.
      await fetchChannelStatuses()
    } catch {
      setChannelStatuses((prev) => ({ ...prev, [channelId]: previous }))
      toast.error("Rete non raggiungibile: stato invariato")
    } finally {
      setTogglingChannel(null)
    }
  }

  const activeCount = Object.values(channelStatuses).filter((s) => s.enabled).length
  const totalConnections = Object.values(channelStatuses).reduce((acc, s) => acc + s.activeConnections, 0)
  const comingSoonCount = ALL_CHANNELS.filter((c) => c.comingSoon).length

  return (
    <div className="min-h-full bg-muted">
      {/* Admin Header */}
      <AdminHeader
        title="Canali di Comunicazione"
        subtitle="Configura i canali per ricevere e gestire le conversazioni"
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-foreground">{activeCount}</div>
              <div className="text-sm text-muted-foreground">Canali Attivi</div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-foreground">{totalConnections}</div>
              <div className="text-sm text-muted-foreground">Connessioni Totali</div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-foreground">{comingSoonCount}</div>
              <div className="text-sm text-muted-foreground">In Arrivo</div>
            </CardContent>
          </Card>
        </div>

        {/* Channel Categories */}
        {CHANNEL_CATEGORIES.map((category) => (
          <div key={category.id} className="mb-8">
            <div className="mb-4">
              <h2 className="text-xl font-medium text-foreground">{category.name}</h2>
              <p className="text-sm text-muted-foreground">{category.description}</p>
            </div>

            <div className="space-y-3">
              {category.channels.map((channel) => {
                const Icon = channel.icon
                const status = channelStatuses[channel.id]
                const isConfigured = status?.configured || false
                const isEnabled = status?.enabled || false

                return (
                  <Card
                    key={channel.id}
                    className={`bg-card border-border transition-all duration-200 ${
                      channel.comingSoon ? "opacity-60" : "hover:shadow-md hover:border-ha-brand/40"
                    }`}
                  >
                    <CardContent className="p-0">
                      <div className="flex items-center p-4">
                        {/* Icon */}
                        <div
                          className={`${channel.color} w-12 h-12 rounded-xl flex items-center justify-center mr-4 shadow-sm`}
                        >
                          <Icon className="w-6 h-6 text-white" />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <h3 className="text-base font-medium text-foreground">{channel.name}</h3>
                            {getStatusBadge(channel)}
                          </div>
                          <p className="text-sm text-muted-foreground">{channel.description}</p>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-3 ml-4">
                          {!channel.comingSoon && (
                            <>
                              {isConfigured && (
                                // La scheda intera e' cliccabile: senza fermare la
                                // propagazione, premere l'interruttore aprirebbe ANCHE
                                // la pagina di configurazione, facendo perdere di vista
                                // l'esito del comando.
                                <div
                                  className="flex items-center gap-2"
                                  onClick={(e) => e.stopPropagation()}
                                  onKeyDown={(e) => e.stopPropagation()}
                                >
                                  <span className="text-xs text-muted-foreground">{isEnabled ? "Attivo" : "Spento"}</span>
                                  <Switch
                                    checked={isEnabled}
                                    disabled={!isConfigured || togglingChannel === channel.id}
                                    onCheckedChange={(next) => handleToggleChannel(channel.id, next)}
                                    aria-label={`${isEnabled ? "Disattiva" : "Attiva"} il canale ${channel.name}`}
                                    className="data-[state=checked]:bg-ha-success"
                                  />
                                </div>
                              )}
                              <Link href={channel.configPath}>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="border-border text-foreground hover:bg-muted bg-transparent"
                                >
                                  {isConfigured ? (
                                    <>
                                      <Settings2 className="w-4 h-4 mr-2" />
                                      Configura
                                    </>
                                  ) : (
                                    <>
                                      Attiva
                                      <ChevronRight className="w-4 h-4 ml-1" />
                                    </>
                                  )}
                                </Button>
                              </Link>
                            </>
                          )}
                          {channel.comingSoon && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled
                              className="border-border text-muted-foreground bg-transparent"
                            >
                              Notificami
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            {category.id === "messaging" && (
              <section id="basi-conoscenza" className="mt-6 scroll-mt-24">
                <div className="mb-4">
                  <h2 className="text-xl font-medium text-foreground">Assistente IA</h2>
                  <p className="text-sm text-muted-foreground">
                    Associa ogni account Email, numero WhatsApp o bot Telegram alla base di conoscenza che deve usare.
                  </p>
                </div>
                <ChannelKnowledgeAssignment />
              </section>
            )}
          </div>
        ))}

        {/* Help Section */}
        <Card className="bg-gradient-to-r from-primary to-ha-brand border-0">
          <CardContent className="p-6 text-white">
            <div className="flex items-start gap-4">
              <div className="bg-white/20 rounded-lg p-3">
                <MessageCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-medium text-lg mb-1">Hai bisogno di aiuto?</h3>
                <p className="text-white/80 text-sm mb-3">
                  Il nostro team è disponibile per aiutarti a configurare i tuoi canali e ottimizzare la comunicazione
                  con i clienti.
                </p>
                <Button variant="secondary" size="sm" className="bg-white text-foreground hover:bg-white/90">
                  Contatta il supporto
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
