"use client"

import type React from "react"
import { createClient } from "@/lib/supabase/client"
import { AdminHeader } from "@/components/admin/admin-header"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Mail,
  Plus,
  Power,
  PowerOff,
  Trash2,
  Edit,
  CheckCircle,
  XCircle,
  RefreshCw,
  Settings,
  FolderSync,
  Tag,
  Inbox,
  Send,
  Star,
  AlertCircle,
  Clock,
  Loader2,
  Shield,
} from "lucide-react"
import { useSearchParams } from "next/navigation"

const GmailIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className || "w-5 h-5"} fill="none">
    <path
      d="M22 6V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18V6C2 4.9 2.9 4 4 4H20C21.1 4 22 4.9 22 6Z"
      fill="#F2F2F2"
      stroke="#E0E0E0"
    />
    <path d="M22 6L12 13L2 6" stroke="#EA4335" strokeWidth="2" strokeLinecap="round" />
    <path d="M2 6L12 13" stroke="#FBBC05" strokeWidth="2" strokeLinecap="round" />
    <path d="M12 13L22 6" stroke="#34A853" strokeWidth="2" strokeLinecap="round" />
    <path d="M2 18V6" stroke="#4285F4" strokeWidth="2" strokeLinecap="round" />
    <path d="M22 18V6" stroke="#EA4335" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

const OutlookIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className || "w-5 h-5"} fill="none">
    <rect x="2" y="4" width="20" height="16" rx="2" fill="#0078D4" />
    <path d="M22 6V18M2 8H22M2 16H22" stroke="#fff" strokeWidth="0.5" opacity="0.3" />
    <ellipse cx="8" cy="12" rx="4" ry="5" fill="#fff" />
    <ellipse cx="8" cy="12" rx="2.5" ry="3.5" fill="#0078D4" />
  </svg>
)

const YahooIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className || "w-5 h-5"} fill="none">
    <circle cx="12" cy="12" r="10" fill="#6001D2" />
    <text x="12" y="16" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">
      Y!
    </text>
  </svg>
)

interface EmailChannel {
  id: string
  email_address: string
  name: string
  display_name: string | null
  provider: string | null
  is_active: boolean
  sync_enabled: boolean
  last_sync_at: string | null
  created_at: string
  property_id: string
  oauth_expires_at?: string | null
  assignments?: { user_id: string }[]
}

interface GmailLabel {
  id: string
  name: string
  type: string
  messagesTotal: number
  messagesUnread: number
  sync_enabled?: boolean
}

interface AdminUser {
  id: string
  name: string
  email: string
}

const GMAIL_SYSTEM_LABELS: Record<string, { name: string; icon: React.ReactNode; color: string }> = {
  INBOX: { name: "Posta in arrivo", icon: <Inbox className="w-4 h-4" />, color: "text-blue-600" },
  SENT: { name: "Posta inviata", icon: <Send className="w-4 h-4" />, color: "text-green-600" },
  STARRED: { name: "Speciali", icon: <Star className="w-4 h-4" />, color: "text-yellow-500" },
  IMPORTANT: { name: "Importanti", icon: <AlertCircle className="w-4 h-4" />, color: "text-orange-500" },
  TRASH: { name: "Cestino", icon: <Trash2 className="w-4 h-4" />, color: "text-red-500" },
  SPAM: { name: "Spam", icon: <Shield className="w-4 h-4" />, color: "text-gray-500" },
  DRAFT: { name: "Bozze", icon: <Edit className="w-4 h-4" />, color: "text-gray-600" },
  UNREAD: { name: "Non letti", icon: <Mail className="w-4 h-4" />, color: "text-blue-500" },
  CATEGORY_PERSONAL: { name: "Personale", icon: <Tag className="w-4 h-4" />, color: "text-purple-500" },
  CATEGORY_SOCIAL: { name: "Social", icon: <Tag className="w-4 h-4" />, color: "text-pink-500" },
  CATEGORY_PROMOTIONS: { name: "Promozioni", icon: <Tag className="w-4 h-4" />, color: "text-green-500" },
  CATEGORY_UPDATES: { name: "Aggiornamenti", icon: <Tag className="w-4 h-4" />, color: "text-blue-500" },
  CATEGORY_FORUMS: { name: "Forum", icon: <Tag className="w-4 h-4" />, color: "text-orange-500" },
}

export default function EmailChannelsClient() {
  const [channels, setChannels] = useState<EmailChannel[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingChannel, setEditingChannel] = useState<EmailChannel | null>(null)
  const [propertyId, setPropertyId] = useState<string | null>(null)
  const [selectedChannel, setSelectedChannel] = useState<EmailChannel | null>(null)
  const [labels, setLabels] = useState<GmailLabel[]>([])
  const [loadingLabels, setLoadingLabels] = useState(false)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("accounts")

  const searchParams = useSearchParams()
  const oauthSuccess = searchParams.get("success")
  const oauthError = searchParams.get("error")

  // Form state
  const [formData, setFormData] = useState({
    email_address: "",
    display_name: "",
    is_active: true,
    assigned_users: [] as string[],
  })

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    if (channels.length > 0 && !selectedChannel) {
      const gmailChannel = channels.find((c) => c.provider === "gmail")
      if (gmailChannel) {
        setSelectedChannel(gmailChannel)
        fetchLabels(gmailChannel.id)
      }
    }
  }, [channels])

  const fetchData = async () => {
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

      if (adminUser?.property_id) {
        setPropertyId(adminUser.property_id)

        const channelsRes = await fetch("/api/channels/email")
        if (channelsRes.ok) {
          const channelsData = await channelsRes.json()
          setChannels(channelsData)
        }

        const { data: adminUsers } = await supabase
          .from("admin_users")
          .select("id, name, email")
          .eq("property_id", adminUser.property_id)

        if (adminUsers) {
          setUsers(adminUsers)
        }
      }
    } catch (error) {
      console.error("Error fetching data:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchLabels = async (channelId: string) => {
    setLoadingLabels(true)
    try {
      const res = await fetch(`/api/channels/email/labels?channel_id=${channelId}`)
      if (res.ok) {
        const data = await res.json()
        setLabels(data.labels || [])
      }
    } catch (error) {
      console.error("Error fetching labels:", error)
    } finally {
      setLoadingLabels(false)
    }
  }

  const handleSync = async (channel: EmailChannel) => {
    setSyncing(channel.id)
    try {
      const res = await fetch("/api/channels/email/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel_id: channel.id,
          property_id: propertyId,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        alert(`Sincronizzate ${data.imported} email su ${data.total} totali`)
        await fetchData()
      } else {
        alert(data.error || "Errore durante la sincronizzazione")
      }
    } catch (error) {
      console.error("Error syncing:", error)
      alert("Errore durante la sincronizzazione")
    } finally {
      setSyncing(null)
    }
  }

  const handleOAuthConnect = async (provider: "gmail" | "outlook") => {
    if (!propertyId) return

    try {
      const res = await fetch("/api/channels/email/oauth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, property_id: propertyId }),
      })

      const data = await res.json()
      if (data.authUrl) {
        window.location.href = data.authUrl
      } else {
        alert(data.error || "Errore avvio OAuth")
      }
    } catch (error) {
      console.error("OAuth error:", error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const url = editingChannel ? `/api/channels/email/${editingChannel.id}` : "/api/channels/email"

      const res = await fetch(url, {
        method: editingChannel ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      if (res.ok) {
        await fetchData()
        setShowAddForm(false)
        setEditingChannel(null)
        setFormData({
          email_address: "",
          display_name: "",
          is_active: true,
          assigned_users: [],
        })
      }
    } catch (error) {
      console.error("Error saving channel:", error)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Sei sicuro di voler eliminare questo canale email?")) return
    try {
      const res = await fetch(`/api/channels/email/${id}`, { method: "DELETE" })
      if (res.ok) {
        await fetchData()
        if (selectedChannel?.id === id) {
          setSelectedChannel(null)
        }
      }
    } catch (error) {
      console.error("Error deleting channel:", error)
    }
  }

  const handleToggleActive = async (channel: EmailChannel) => {
    try {
      const res = await fetch(`/api/channels/email/${channel.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...channel,
          is_active: !channel.is_active,
          assigned_users: channel.assignments?.map((a) => a.user_id) || [],
        }),
      })

      if (res.ok) {
        await fetchData()
      }
    } catch (error) {
      console.error("Error toggling channel:", error)
    }
  }

  const startEdit = (channel: EmailChannel) => {
    setEditingChannel(channel)
    setFormData({
      email_address: channel.email_address,
      display_name: channel.display_name || "",
      is_active: channel.is_active,
      assigned_users: channel.assignments?.map((a) => a.user_id) || [],
    })
    setShowAddForm(true)
  }

  const isTokenExpired = (channel: EmailChannel) => {
    if (!channel.oauth_expires_at) return false
    return new Date(channel.oauth_expires_at) < new Date()
  }

  const getProviderBadge = (provider: string | null) => {
    if (provider === "gmail") {
      return (
        <Badge variant="outline" className="gap-1 bg-white">
          <GmailIcon className="w-3 h-3" />
          Gmail
        </Badge>
      )
    }
    if (provider === "outlook") {
      return (
        <Badge variant="outline" className="gap-1 bg-white">
          <OutlookIcon className="w-3 h-3" />
          Outlook
        </Badge>
      )
    }
    return <Badge variant="secondary">Manuale</Badge>
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminHeader
        title="Email"
        subtitle="Configura e sincronizza i tuoi account email"
        breadcrumbs={[{ label: "Canali", href: "/admin/channels" }, { label: "Email" }]}
      />

      <div className="container py-6 space-y-6">
        {/* OAuth Status Messages */}
        {oauthSuccess === "connected" && (
          <div className="flex items-center gap-2 p-4 rounded-lg bg-green-50 border border-green-200">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <span className="text-green-700">Account email collegato con successo! La sincronizzazione è attiva.</span>
          </div>
        )}

        {oauthError && (
          <div className="flex items-center gap-2 p-4 rounded-lg bg-red-50 border border-red-200">
            <XCircle className="h-5 w-5 text-red-500" />
            <span className="text-red-700">
              {oauthError === "token_exchange_failed" && "Errore durante l'autenticazione. Riprova."}
              {oauthError === "config_missing" && "Configurazione OAuth mancante. Contatta il supporto."}
              {oauthError === "state_expired" && "Sessione scaduta. Riprova."}
              {!["token_exchange_failed", "config_missing", "state_expired"].includes(oauthError) &&
                "Errore durante il collegamento"}
            </span>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 max-w-md">
            <TabsTrigger value="accounts">Account</TabsTrigger>
            <TabsTrigger value="folders">Cartelle</TabsTrigger>
            <TabsTrigger value="settings">Impostazioni</TabsTrigger>
          </TabsList>

          {/* ACCOUNTS TAB */}
          <TabsContent value="accounts" className="space-y-6">
            {/* Quick Connect */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Collega Account Email
                </CardTitle>
                <CardDescription>
                  Un click per collegare Gmail o Outlook. Sincronizzazione automatica bidirezionale.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {/* Gmail */}
                  <button
                    onClick={() => handleOAuthConnect("gmail")}
                    className="flex items-center gap-4 p-4 rounded-xl border-2 border-dashed border-muted hover:border-primary hover:bg-muted/50 transition-all group"
                  >
                    <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                      <GmailIcon className="w-8 h-8" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium">Google Gmail</p>
                      <p className="text-sm text-muted-foreground">Sincronizza cartelle e etichette</p>
                    </div>
                  </button>

                  {/* Outlook */}
                  <button
                    onClick={() => handleOAuthConnect("outlook")}
                    className="flex items-center gap-4 p-4 rounded-xl border-2 border-dashed border-muted hover:border-primary hover:bg-muted/50 transition-all group"
                  >
                    <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                      <OutlookIcon className="w-8 h-8" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium">Microsoft Outlook</p>
                      <p className="text-sm text-muted-foreground">Office 365 e Hotmail</p>
                    </div>
                  </button>

                  {/* Manual */}
                  <button
                    onClick={() => setShowAddForm(true)}
                    className="flex items-center gap-4 p-4 rounded-xl border-2 border-dashed border-muted hover:border-primary hover:bg-muted/50 transition-all group"
                  >
                    <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Plus className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium">Altro Provider</p>
                      <p className="text-sm text-muted-foreground">IMAP/SMTP manuale</p>
                    </div>
                  </button>
                </div>
              </CardContent>
            </Card>

            {/* Add/Edit Form */}
            {showAddForm && (
              <Card>
                <CardHeader>
                  <CardTitle>{editingChannel ? "Modifica" : "Aggiungi"} Account Email</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="email">Indirizzo Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.email_address}
                          onChange={(e) => setFormData({ ...formData, email_address: e.target.value })}
                          placeholder="info@tuohotel.com"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="display_name">Nome Visualizzato</Label>
                        <Input
                          id="display_name"
                          value={formData.display_name}
                          onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                          placeholder="Reception Hotel"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Assegna a</Label>
                      <div className="flex flex-wrap gap-2">
                        {users.map((user) => (
                          <Button
                            key={user.id}
                            type="button"
                            variant={formData.assigned_users.includes(user.id) ? "default" : "outline"}
                            size="sm"
                            onClick={() => {
                              setFormData({
                                ...formData,
                                assigned_users: formData.assigned_users.includes(user.id)
                                  ? formData.assigned_users.filter((id) => id !== user.id)
                                  : [...formData.assigned_users, user.id],
                              })
                            }}
                          >
                            {user.name}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button type="submit">{editingChannel ? "Salva" : "Aggiungi"}</Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setShowAddForm(false)
                          setEditingChannel(null)
                        }}
                      >
                        Annulla
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}

            {/* Connected Accounts */}
            <Card>
              <CardHeader>
                <CardTitle>Account Collegati</CardTitle>
                <CardDescription>
                  {channels.length} {channels.length === 1 ? "account" : "account"} email configurati
                </CardDescription>
              </CardHeader>
              <CardContent>
                {channels.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Mail className="h-16 w-16 mx-auto mb-4 opacity-30" />
                    <p className="text-lg font-medium">Nessun account collegato</p>
                    <p className="text-sm">Collega Gmail o Outlook per iniziare</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {channels.map((channel) => (
                      <div
                        key={channel.id}
                        className={`flex items-center justify-between p-4 rounded-xl border bg-card hover:shadow-md transition-all cursor-pointer ${
                          selectedChannel?.id === channel.id ? "ring-2 ring-primary" : ""
                        }`}
                        onClick={() => {
                          setSelectedChannel(channel)
                          if (channel.provider === "gmail") {
                            fetchLabels(channel.id)
                          }
                        }}
                      >
                        <div className="flex items-center gap-4">
                          <div
                            className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                              channel.is_active ? "bg-green-100" : "bg-muted"
                            }`}
                          >
                            {channel.provider === "gmail" ? (
                              <GmailIcon className="w-7 h-7" />
                            ) : channel.provider === "outlook" ? (
                              <OutlookIcon className="w-7 h-7" />
                            ) : (
                              <Mail
                                className={`h-6 w-6 ${channel.is_active ? "text-green-600" : "text-muted-foreground"}`}
                              />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{channel.email_address}</p>
                              {getProviderBadge(channel.provider)}
                              {isTokenExpired(channel) && (
                                <Badge variant="destructive" className="text-xs">
                                  Token scaduto
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-sm text-muted-foreground">
                              <span>{channel.display_name || "Nessun nome"}</span>
                              {channel.last_sync_at && (
                                <>
                                  <span>•</span>
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    Sync:{" "}
                                    {new Date(channel.last_sync_at).toLocaleString("it-IT", {
                                      day: "2-digit",
                                      month: "2-digit",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {channel.provider && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleSync(channel)
                              }}
                              disabled={syncing === channel.id}
                            >
                              {syncing === channel.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4" />
                              )}
                              <span className="ml-2 hidden sm:inline">Sincronizza</span>
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleToggleActive(channel)
                            }}
                          >
                            {channel.is_active ? (
                              <Power className="h-4 w-4 text-green-500" />
                            ) : (
                              <PowerOff className="h-4 w-4 text-muted-foreground" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation()
                              startEdit(channel)
                            }}
                          >
                            <Settings className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDelete(channel.id)
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* FOLDERS TAB */}
          <TabsContent value="folders" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FolderSync className="h-5 w-5" />
                  Cartelle e Etichette Gmail
                </CardTitle>
                <CardDescription>
                  Seleziona quali cartelle sincronizzare. Le email appariranno nella tua Inbox unificata.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!selectedChannel ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FolderSync className="h-12 w-12 mx-auto mb-4 opacity-30" />
                    <p>Seleziona un account Gmail per gestire le cartelle</p>
                  </div>
                ) : selectedChannel.provider !== "gmail" ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FolderSync className="h-12 w-12 mx-auto mb-4 opacity-30" />
                    <p>La sincronizzazione cartelle è disponibile solo per Gmail</p>
                  </div>
                ) : loadingLabels ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* System Labels */}
                    <div>
                      <h4 className="text-sm font-medium mb-3 text-muted-foreground">Cartelle di Sistema</h4>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {labels
                          .filter((l) => l.type === "system" && GMAIL_SYSTEM_LABELS[l.id])
                          .map((label) => {
                            const config = GMAIL_SYSTEM_LABELS[label.id]
                            return (
                              <div
                                key={label.id}
                                className="flex items-center justify-between p-3 rounded-lg border bg-card"
                              >
                                <div className="flex items-center gap-3">
                                  <span className={config.color}>{config.icon}</span>
                                  <div>
                                    <p className="font-medium text-sm">{config.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {label.messagesTotal} email • {label.messagesUnread} non lette
                                    </p>
                                  </div>
                                </div>
                                <Switch defaultChecked />
                              </div>
                            )
                          })}
                      </div>
                    </div>

                    {/* User Labels */}
                    {labels.filter((l) => l.type === "user").length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium mb-3 text-muted-foreground">Etichette Personalizzate</h4>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {labels
                            .filter((l) => l.type === "user")
                            .map((label) => (
                              <div
                                key={label.id}
                                className="flex items-center justify-between p-3 rounded-lg border bg-card"
                              >
                                <div className="flex items-center gap-3">
                                  <Tag className="w-4 h-4 text-blue-500" />
                                  <div>
                                    <p className="font-medium text-sm">{label.name}</p>
                                    <p className="text-xs text-muted-foreground">{label.messagesTotal} email</p>
                                  </div>
                                </div>
                                <Switch defaultChecked={label.sync_enabled !== false} />
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* SETTINGS TAB */}
          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Impostazioni Sincronizzazione</CardTitle>
                <CardDescription>Configura come sincronizzare le email con la tua Inbox</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Sincronizzazione Automatica</p>
                    <p className="text-sm text-muted-foreground">Scarica nuove email ogni 5 minuti</p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Sincronizzazione Bidirezionale</p>
                    <p className="text-sm text-muted-foreground">Le modifiche vengono riflesse anche in Gmail</p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Notifiche Push</p>
                    <p className="text-sm text-muted-foreground">Ricevi notifiche per nuove email</p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Filtra Spam Automaticamente</p>
                    <p className="text-sm text-muted-foreground">Non importare email dalla cartella Spam</p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Archivia Email Risposte</p>
                    <p className="text-sm text-muted-foreground">Archivia automaticamente dopo la risposta</p>
                  </div>
                  <Switch />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Risposta Multi-Canale</CardTitle>
                <CardDescription>
                  Quando rispondi a un messaggio, puoi scegliere su quale canale inviarlo
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Abilita Risposta Multi-Canale</p>
                    <p className="text-sm text-muted-foreground">
                      Mostra opzioni per rispondere via Email, WhatsApp o altri canali
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">
                    <strong>Come funziona:</strong> Quando rispondi a una conversazione, vedrai un menu per scegliere il
                    canale di risposta. Se il contatto ha un numero WhatsApp, potrai rispondere direttamente su WhatsApp
                    invece che via email.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
