"use client"

import { useState, useEffect } from "react"
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
import { AdminHeader } from "@/components/admin/admin-header"

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
        description: "Messaggi WhatsApp Business",
        icon: MessagesSquare,
        color: "bg-emerald-500",
        configPath: "/admin/channels/whatsapp",
        available: true,
        comingSoon: true,
      },
      {
        id: "telegram",
        name: "Telegram",
        description: "Bot Telegram per assistenza",
        icon: Send,
        color: "bg-sky-500",
        configPath: "/admin/channels/telegram",
        available: true,
        comingSoon: true,
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
    description: "Canali vocali con trascrizione AI",
    channels: [
      {
        id: "phone",
        name: "Telefono IP",
        description: "Chiamate VoIP con trascrizione AI",
        icon: Phone,
        color: "bg-purple-500",
        configPath: "/admin/channels/phone",
        available: true,
        comingSoon: true,
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
  const [channelStatuses, setChannelStatuses] = useState<Record<string, ChannelStatus>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [propertyId, setPropertyId] = useState<string | null>(null)

  useEffect(() => {
    fetchChannelStatuses()
  }, [])

  const fetchChannelStatuses = async () => {
    try {
      const supabase = createClient()

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data: adminUser } = await supabase
        .from("admin_users")
        .select("property_id")
        .eq("user_id", user.id)
        .single()

      if (!adminUser?.property_id) return
      setPropertyId(adminUser.property_id)

      const { data: emailChannels } = await supabase
        .from("email_channels")
        .select("id, is_active")
        .eq("property_id", adminUser.property_id)

      const { data: chatWidgets } = await supabase
        .from("embed_scripts")
        .select("id, is_active")
        .eq("property_id", adminUser.property_id)
        .eq("script_type", "chat")

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
        enabled: chatWidgets?.some((c) => c.is_active) || false,
        configured: (chatWidgets?.length || 0) > 0,
        activeConnections: chatWidgets?.filter((c) => c.is_active).length || 0,
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
        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
          <Sparkles className="w-3 h-3 mr-1" />
          Prossimamente
        </Badge>
      )
    }

    const status = channelStatuses[channel.id]
    if (!status?.configured) {
      return (
        <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200">
          <Circle className="w-3 h-3 mr-1" />
          Non configurato
        </Badge>
      )
    }

    if (status.enabled) {
      return (
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Attivo ({status.activeConnections})
        </Badge>
      )
    }

    return (
      <Badge variant="outline" className="bg-orange-50 text-orange-600 border-orange-200">
        <Circle className="w-3 h-3 mr-1" />
        Disattivato
      </Badge>
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f8f7f4] flex items-center justify-center">
        <div className="animate-pulse text-[#8b7355]">Caricamento canali...</div>
      </div>
    )
  }

  const activeCount = Object.values(channelStatuses).filter((s) => s.enabled).length
  const totalConnections = Object.values(channelStatuses).reduce((acc, s) => acc + s.activeConnections, 0)
  const comingSoonCount = ALL_CHANNELS.filter((c) => c.comingSoon).length

  return (
    <div className="min-h-screen bg-[#f8f7f4]">
      {/* Admin Header */}
      <AdminHeader
        title="Canali di Comunicazione"
        subtitle="Configura i canali per ricevere e gestire le conversazioni"
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <Card className="bg-white border-[#e8e0d8]">
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-[#5c4a3a]">{activeCount}</div>
              <div className="text-sm text-[#8b7355]">Canali Attivi</div>
            </CardContent>
          </Card>
          <Card className="bg-white border-[#e8e0d8]">
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-[#5c4a3a]">{totalConnections}</div>
              <div className="text-sm text-[#8b7355]">Connessioni Totali</div>
            </CardContent>
          </Card>
          <Card className="bg-white border-[#e8e0d8]">
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-[#5c4a3a]">{comingSoonCount}</div>
              <div className="text-sm text-[#8b7355]">In Arrivo</div>
            </CardContent>
          </Card>
        </div>

        {/* Channel Categories */}
        {CHANNEL_CATEGORIES.map((category) => (
          <div key={category.id} className="mb-8">
            <div className="mb-4">
              <h2 className="text-xl font-medium text-[#5c4a3a]">{category.name}</h2>
              <p className="text-sm text-[#8b7355]">{category.description}</p>
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
                    className={`bg-white border-[#e8e0d8] transition-all duration-200 ${
                      channel.comingSoon ? "opacity-60" : "hover:shadow-md hover:border-[#c9b99a]"
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
                            <h3 className="text-base font-medium text-[#5c4a3a]">{channel.name}</h3>
                            {getStatusBadge(channel)}
                          </div>
                          <p className="text-sm text-[#8b7355]">{channel.description}</p>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-3 ml-4">
                          {!channel.comingSoon && (
                            <>
                              {isConfigured && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-[#8b7355]">{isEnabled ? "Attivo" : "Spento"}</span>
                                  <Switch
                                    checked={isEnabled}
                                    disabled={!isConfigured}
                                    className="data-[state=checked]:bg-green-500"
                                  />
                                </div>
                              )}
                              <Link href={channel.configPath}>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="border-[#c9b99a] text-[#5c4a3a] hover:bg-[#f5f0eb] bg-transparent"
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
                              className="border-[#e8e0d8] text-[#b5a48a] bg-transparent"
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
          </div>
        ))}

        {/* Help Section */}
        <Card className="bg-gradient-to-r from-[#5c4a3a] to-[#8b7355] border-0">
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
                <Button variant="secondary" size="sm" className="bg-white text-[#5c4a3a] hover:bg-white/90">
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
