"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  CheckCircle2,
  ChevronRight,
  Circle,
  Facebook,
  Instagram,
  Linkedin,
  Mail,
  MessageCircle,
  MessagesSquare,
  Phone,
  Send,
  Settings2,
  Twitter,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { AdminHeader } from "@/components/admin/admin-header"
import { ChannelKnowledgeAssignment } from "@/components/admin/channels/channel-knowledge-assignment"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"

type ChannelId =
  | "email"
  | "chat"
  | "whatsapp"
  | "telegram"
  | "facebook"
  | "instagram"
  | "twitter"
  | "linkedin"
  | "phone"

type ChannelDefinition = {
  id: ChannelId
  name: string
  description: string
  icon: typeof Mail
  color: string
  configPath: string
}

type ChannelCategory = {
  id: "messaging" | "social" | "voice"
  name: string
  description: string
  channels: readonly ChannelDefinition[]
}

const CHANNEL_CATEGORIES: readonly ChannelCategory[] = [
  {
    id: "messaging",
    name: "Messaggistica",
    description: "Canali di comunicazione diretta",
    channels: [
      { id: "email", name: "Email", description: "Ricevi e rispondi alle email dei clienti", icon: Mail, color: "bg-blue-500", configPath: "/admin/channels/email" },
      { id: "chat", name: "Chat Widget", description: "Chat in tempo reale sul tuo sito web", icon: MessageCircle, color: "bg-green-500", configPath: "/admin/channels/chat" },
      { id: "whatsapp", name: "WhatsApp", description: "Messaggi WhatsApp Business (API Meta Cloud)", icon: MessagesSquare, color: "bg-emerald-500", configPath: "/admin/channels/whatsapp" },
      { id: "telegram", name: "Telegram", description: "Bot Telegram per assistenza", icon: Send, color: "bg-sky-500", configPath: "/admin/channels/telegram" },
    ],
  },
  {
    id: "social",
    name: "Social Media",
    description: "OAuth ufficiale e funzioni disponibili per ciascun provider",
    channels: [
      { id: "facebook", name: "Facebook", description: "Messenger e commenti della Pagina nella Inbox", icon: Facebook, color: "bg-[#1877F2]", configPath: "/admin/channels/facebook" },
      { id: "instagram", name: "Instagram Business", description: "DM, menzioni e commenti nella Inbox", icon: Instagram, color: "bg-gradient-to-br from-[#833AB4] via-[#FD1D1D] to-[#F77737]", configPath: "/admin/channels/instagram" },
      { id: "twitter", name: "X", description: "Menzioni; DM solo se piano API e scope li abilitano", icon: Twitter, color: "bg-black", configPath: "/admin/channels/twitter" },
      { id: "linkedin", name: "LinkedIn", description: "Pagina aziendale, post, commenti e reazioni; nessun DM simulato", icon: Linkedin, color: "bg-[#0A66C2]", configPath: "/admin/channels/linkedin" },
    ],
  },
  {
    id: "voice",
    name: "Voce",
    description: "Centralino collegato al CRM",
    channels: [
      { id: "phone", name: "Telefono IP (3CX)", description: "Chiamate dal CRM e riconoscimento del chiamante", icon: Phone, color: "bg-purple-500", configPath: "/admin/channels/phone" },
    ],
  },
]

const ALL_CHANNELS: readonly ChannelDefinition[] = CHANNEL_CATEGORIES.flatMap((category) => category.channels)

interface ChannelStatus {
  id: ChannelId
  enabled: boolean
  configured: boolean
  activeConnections: number
}

function statusFromRows(id: ChannelId, rows: Array<{ is_active?: boolean }> | null | undefined): ChannelStatus {
  const all = rows || []
  const active = all.filter((row) => row.is_active !== false)
  return { id, configured: all.length > 0, enabled: active.length > 0, activeConnections: active.length }
}

export default function ChannelsPage() {
  const router = useRouter()
  const [statuses, setStatuses] = useState<Record<string, ChannelStatus>>({})
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/platform/me", { credentials: "include" })
        if (!res.ok) return
        const me = await res.json()
        if (!cancelled && me?.isAdmin === false) router.replace("/admin/channels/email")
      } catch {}
    })()
    return () => { cancelled = true }
  }, [router])

  const fetchStatuses = async () => {
    try {
      const next: Record<string, ChannelStatus> = {}
      for (const channel of ALL_CHANNELS) next[channel.id] = { id: channel.id, enabled: false, configured: false, activeConnections: 0 }

      const meResponse = await fetch("/api/platform/me", { credentials: "include", cache: "no-store" })
      if (!meResponse.ok) return
      const me = (await meResponse.json()) as { activePropertyId?: string | null }
      if (!me.activePropertyId) return
      const propertyId = me.activePropertyId
      const supabase = createClient()

      const [emailResult, chatResult, waResult, tgResult, facebook, instagram, x, linkedin, phone] = await Promise.all([
        supabase.from("email_channels").select("id, is_active").eq("property_id", propertyId),
        supabase.from("embed_scripts").select("id, status").eq("property_id", propertyId),
        supabase.from("messaging_channels").select("id, is_active, config").eq("property_id", propertyId).eq("channel_type", "whatsapp"),
        supabase.from("messaging_channels").select("id, is_active, config").eq("property_id", propertyId).eq("channel_type", "telegram"),
        fetch("/api/channels/social/facebook", { cache: "no-store" }).then((r) => r.ok ? r.json() : null),
        fetch("/api/channels/social/instagram", { cache: "no-store" }).then((r) => r.ok ? r.json() : null),
        fetch("/api/channels/social/x", { cache: "no-store" }).then((r) => r.ok ? r.json() : null),
        fetch("/api/channels/social/linkedin", { cache: "no-store" }).then((r) => r.ok ? r.json() : null),
        fetch("/api/telephony/3cx", { cache: "no-store" }).then((r) => r.ok ? r.json() : null),
      ])

      next.email = statusFromRows("email", emailResult.data)
      next.chat = {
        id: "chat",
        configured: (chatResult.data?.length || 0) > 0,
        enabled: chatResult.data?.some((row: any) => row.status === "active") || false,
        activeConnections: chatResult.data?.filter((row: any) => row.status === "active").length || 0,
      }
      const waRows = (waResult.data || []).filter((row: any) => row.config?.phone_number_id)
      next.whatsapp = statusFromRows("whatsapp", waRows)
      const tgRows = (tgResult.data || []).filter((row: any) => row.config?.bot_id)
      next.telegram = statusFromRows("telegram", tgRows)
      next.facebook = statusFromRows("facebook", facebook?.accounts)
      next.instagram = statusFromRows("instagram", instagram?.accounts)
      next.twitter = statusFromRows("twitter", x?.accounts)
      next.linkedin = statusFromRows("linkedin", linkedin?.accounts)

      const integration = phone?.integration
      const phoneConfigured = Boolean(integration?.base_url && integration?.has_credentials?.client_secret)
      const phoneActive = phoneConfigured && integration?.is_active !== false && integration?.last_check_status === "ok"
      next.phone = { id: "phone", configured: phoneConfigured, enabled: phoneActive, activeConnections: phoneActive ? 1 : 0 }

      setStatuses(next)
    } catch (error) {
      console.error("Error fetching channel statuses:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void fetchStatuses() }, [])

  const toggle = async (channelId: ChannelId, enabled: boolean) => {
    const previous = statuses[channelId]
    if (!previous?.configured || toggling) return
    setToggling(channelId)
    setStatuses((current) => ({ ...current, [channelId]: { ...previous, enabled, activeConnections: enabled ? Math.max(1, previous.activeConnections) : 0 } }))
    try {
      const response = await fetch("/api/channels/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: channelId, enabled }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || "Modifica non riuscita")
      toast.success(enabled ? "Canale attivato" : "Canale disattivato")
      await fetchStatuses()
    } catch (error) {
      setStatuses((current) => ({ ...current, [channelId]: previous }))
      toast.error(error instanceof Error ? error.message : "Modifica non riuscita")
    } finally {
      setToggling(null)
    }
  }

  if (loading) {
    return <div className="min-h-full bg-muted flex items-center justify-center"><div className="animate-pulse text-ha-brand-soft-foreground">Caricamento canali...</div></div>
  }

  const activeCount = Object.values(statuses).filter((status) => status.enabled).length
  const totalConnections = Object.values(statuses).reduce((sum, status) => sum + status.activeConnections, 0)

  return (
    <div className="min-h-full bg-muted">
      <AdminHeader title="Canali di Comunicazione" subtitle="Configura i canali per ricevere e gestire le conversazioni" />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-2 gap-4 mb-8">
          <Card><CardContent className="p-4 text-center"><div className="text-3xl font-bold">{activeCount}</div><div className="text-sm text-muted-foreground">Canali Attivi</div></CardContent></Card>
          <Card><CardContent className="p-4 text-center"><div className="text-3xl font-bold">{totalConnections}</div><div className="text-sm text-muted-foreground">Connessioni Totali</div></CardContent></Card>
        </div>

        {CHANNEL_CATEGORIES.map((category) => (
          <div key={category.id} className="mb-8">
            <div className="mb-4"><h2 className="text-xl font-medium">{category.name}</h2><p className="text-sm text-muted-foreground">{category.description}</p></div>
            <div className="space-y-3">
              {category.channels.map((channel) => {
                const Icon = channel.icon
                const status = statuses[channel.id]
                return (
                  <Card key={channel.id} className="bg-card border-border transition-all hover:shadow-md hover:border-ha-brand/40">
                    <CardContent className="p-0">
                      <div className="flex items-center p-4">
                        <div className={`${channel.color} w-12 h-12 rounded-xl flex items-center justify-center mr-4 shadow-sm`}><Icon className="w-6 h-6 text-white" /></div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <h3 className="text-base font-medium">{channel.name}</h3>
                            {!status?.configured ? (
                              <Badge variant="outline"><Circle className="w-3 h-3 mr-1" />Non configurato</Badge>
                            ) : status.enabled ? (
                              <Badge variant="outline" className="bg-ha-success-soft text-ha-success-soft-foreground"><CheckCircle2 className="w-3 h-3 mr-1" />Attivo ({status.activeConnections})</Badge>
                            ) : (
                              <Badge variant="outline">Disattivato</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{channel.description}</p>
                        </div>
                        <div className="flex items-center gap-3 ml-4">
                          {status?.configured && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">{status.enabled ? "Attivo" : "Spento"}</span>
                              <Switch checked={status.enabled} disabled={toggling === channel.id} onCheckedChange={(next) => void toggle(channel.id, next)} />
                            </div>
                          )}
                          <Link href={channel.configPath}>
                            <Button variant="outline" size="sm">
                              {status?.configured ? <><Settings2 className="w-4 h-4 mr-2" />Configura</> : <>Attiva<ChevronRight className="w-4 h-4 ml-1" /></>}
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            {category.id === "messaging" && (
              <section id="basi-conoscenza" className="mt-6 scroll-mt-24">
                <div className="mb-4"><h2 className="text-xl font-medium">Assistente IA</h2><p className="text-sm text-muted-foreground">Associa ogni account Email, numero WhatsApp o bot Telegram alla base di conoscenza che deve usare.</p></div>
                <ChannelKnowledgeAssignment />
              </section>
            )}
          </div>
        ))}

        <Card className="bg-gradient-to-r from-primary to-ha-brand border-0">
          <CardContent className="p-6 text-white flex items-start gap-4">
            <div className="bg-white/20 rounded-lg p-3"><MessageCircle className="w-6 h-6" /></div>
            <div><h3 className="font-medium text-lg mb-1">Hai bisogno di aiuto?</h3><p className="text-white/80 text-sm">Configura le credenziali e le approvazioni dei provider per portare nella Inbox solo le funzioni ufficialmente disponibili.</p></div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
