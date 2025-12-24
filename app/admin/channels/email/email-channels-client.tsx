"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Mail,
  Plus,
  ArrowLeft,
  Power,
  PowerOff,
  Trash2,
  Edit,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  ExternalLink,
} from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { DEFAULT_PROPERTY_ID } from "@/lib/tenant"

const GmailIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
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

const OutlookIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
    <rect x="2" y="4" width="20" height="16" rx="2" fill="#0078D4" />
    <path d="M22 6V18M2 8H22M2 16H22" stroke="#fff" strokeWidth="0.5" opacity="0.3" />
    <ellipse cx="8" cy="12" rx="4" ry="5" fill="#fff" />
    <ellipse cx="8" cy="12" rx="2.5" ry="3.5" fill="#0078D4" />
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
  oauth_access_token: string | null
  oauth_expiry: string | null
  created_at: string
  assignments?: { user_id: string; user_name?: string }[]
}

interface AdminUser {
  id: string
  name: string
  email: string
  role: string
}

export default function EmailChannelsClient() {
  const [channels, setChannels] = useState<EmailChannel[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingChannel, setEditingChannel] = useState<EmailChannel | null>(null)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [connectingOAuth, setConnectingOAuth] = useState<string | null>(null)

  const searchParams = useSearchParams()
  const successParam = searchParams.get("success")
  const errorParam = searchParams.get("error")

  const [formData, setFormData] = useState({
    email: "",
    display_name: "",
    is_active: true,
    assigned_users: [] as string[],
  })

  const supabase = createClient()

  useEffect(() => {
    fetchChannels()
    fetchUsers()
  }, [])

  const fetchChannels = async () => {
    setLoading(true)
    try {
      const { data: channelsData, error: channelsError } = await supabase
        .from("email_channels")
        .select("*")
        .eq("property_id", DEFAULT_PROPERTY_ID)
        .order("created_at", { ascending: false })

      if (channelsError) throw channelsError

      const channelsWithAssignments = await Promise.all(
        (channelsData || []).map(async (channel) => {
          const { data: assignments } = await supabase
            .from("email_channel_assignments")
            .select("user_id")
            .eq("channel_id", channel.id)

          return { ...channel, assignments: assignments || [] }
        }),
      )

      setChannels(channelsWithAssignments)
    } catch (error) {
      console.error("Error fetching channels:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from("admin_users")
        .select("id, name, email, role")
        .eq("property_id", DEFAULT_PROPERTY_ID)
        .order("name")

      if (error) throw error
      setUsers(data || [])
    } catch (error) {
      console.error("Error fetching users:", error)
    }
  }

  const handleOAuthConnect = async (provider: "gmail" | "outlook") => {
    setConnectingOAuth(provider)
    try {
      const response = await fetch("/api/channels/email/oauth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, property_id: DEFAULT_PROPERTY_ID }),
      })

      const data = await response.json()

      if (data.authUrl) {
        window.location.href = data.authUrl
      } else {
        alert(data.error || "Errore durante la connessione OAuth")
        setConnectingOAuth(null)
      }
    } catch (error) {
      console.error("OAuth error:", error)
      alert("Errore durante la connessione")
      setConnectingOAuth(null)
    }
  }

  const handleSync = async (channelId: string) => {
    setSyncing(channelId)
    try {
      const response = await fetch("/api/channels/email/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: channelId, property_id: DEFAULT_PROPERTY_ID }),
      })

      const data = await response.json()

      if (data.success) {
        alert(`Sincronizzazione completata: ${data.imported} nuove email importate`)
        fetchChannels()
      } else {
        alert(data.error || "Errore durante la sincronizzazione")
      }
    } catch (error) {
      console.error("Sync error:", error)
      alert("Errore durante la sincronizzazione")
    } finally {
      setSyncing(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      if (editingChannel) {
        const { error: updateError } = await supabase
          .from("email_channels")
          .update({
            email_address: formData.email,
            name: formData.display_name || formData.email.split("@")[0],
            display_name: formData.display_name,
            is_active: formData.is_active,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingChannel.id)

        if (updateError) throw updateError

        await supabase.from("email_channel_assignments").delete().eq("channel_id", editingChannel.id)

        if (formData.assigned_users.length > 0) {
          const assignments = formData.assigned_users.map((userId, index) => ({
            property_id: DEFAULT_PROPERTY_ID,
            channel_id: editingChannel.id,
            user_id: userId,
            assignment_type: index === 0 ? "owner" : "member",
          }))

          await supabase.from("email_channel_assignments").insert(assignments)
        }
      } else {
        const { data: newChannel, error: insertError } = await supabase
          .from("email_channels")
          .insert({
            property_id: DEFAULT_PROPERTY_ID,
            email_address: formData.email,
            name: formData.display_name || formData.email.split("@")[0],
            display_name: formData.display_name,
            is_active: formData.is_active,
          })
          .select("id")
          .single()

        if (insertError) throw insertError

        if (formData.assigned_users.length > 0 && newChannel) {
          const assignments = formData.assigned_users.map((userId, index) => ({
            property_id: DEFAULT_PROPERTY_ID,
            channel_id: newChannel.id,
            user_id: userId,
            assignment_type: index === 0 ? "owner" : "member",
          }))

          await supabase.from("email_channel_assignments").insert(assignments)
        }
      }

      setShowAddForm(false)
      setEditingChannel(null)
      resetForm()
      fetchChannels()
    } catch (error: any) {
      console.error("Error saving channel:", error)
      alert(`Errore: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Sei sicuro di voler eliminare questo canale email?")) return

    try {
      await supabase.from("email_channel_assignments").delete().eq("channel_id", id)
      const { error } = await supabase.from("email_channels").delete().eq("id", id)
      if (error) throw error
      fetchChannels()
    } catch (error) {
      console.error("Error deleting channel:", error)
    }
  }

  const handleEdit = (channel: EmailChannel) => {
    setEditingChannel(channel)
    setFormData({
      email: channel.email_address,
      display_name: channel.display_name || "",
      is_active: channel.is_active,
      assigned_users: channel.assignments?.map((a) => a.user_id) || [],
    })
    setShowAddForm(true)
  }

  const resetForm = () => {
    setFormData({ email: "", display_name: "", is_active: true, assigned_users: [] })
    setEditingChannel(null)
  }

  const toggleChannelStatus = async (channel: EmailChannel) => {
    try {
      const { error } = await supabase
        .from("email_channels")
        .update({ is_active: !channel.is_active, updated_at: new Date().toISOString() })
        .eq("id", channel.id)

      if (error) throw error
      fetchChannels()
    } catch (error) {
      console.error("Error toggling status:", error)
    }
  }

  const getProviderBadge = (channel: EmailChannel) => {
    if (channel.provider === "gmail") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-red-50 text-red-700 rounded-full text-xs font-medium">
          <GmailIcon />
          Gmail
        </span>
      )
    }
    if (channel.provider === "outlook") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
          <OutlookIcon />
          Outlook
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs">
        <Mail className="w-3.5 h-3.5" />
        Manuale
      </span>
    )
  }

  return (
    <div className="min-h-screen bg-[#faf9f7]">
      {/* Header */}
      <header className="bg-white border-b border-[#e5e5e5] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin/dashboard" className="p-2 hover:bg-[#f8f5f0] rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5 text-[#5c5c5c]" />
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-[#2c2c2c]">Canali Email</h1>
              <p className="text-sm text-[#8b8b8b]">HotelAccelerator - Gestione caselle email</p>
            </div>
          </div>
        </div>
      </header>

      {/* Success/Error Messages */}
      {successParam === "connected" && (
        <div className="mx-6 mt-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <p className="text-green-800">Account email collegato con successo!</p>
        </div>
      )}
      {errorParam && (
        <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <XCircle className="w-5 h-5 text-red-600" />
          <p className="text-red-800">Errore durante la connessione: {errorParam}</p>
        </div>
      )}

      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Channel List */}
          <div className="lg:col-span-2 space-y-4">
            {/* OAuth Connect Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="border-2 border-dashed border-[#e5e5e5] hover:border-red-300 transition-colors">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-red-50 rounded-xl">
                      <GmailIcon />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-medium text-[#2c2c2c]">Collega Gmail</h3>
                      <p className="text-sm text-[#8b8b8b]">Sincronizza automaticamente</p>
                    </div>
                    <Button
                      onClick={() => handleOAuthConnect("gmail")}
                      disabled={connectingOAuth === "gmail"}
                      size="sm"
                      className="bg-red-500 hover:bg-red-600"
                    >
                      {connectingOAuth === "gmail" ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <ExternalLink className="w-4 h-4 mr-1" />
                          Collega
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-2 border-dashed border-[#e5e5e5] hover:border-blue-300 transition-colors">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-50 rounded-xl">
                      <OutlookIcon />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-medium text-[#2c2c2c]">Collega Outlook</h3>
                      <p className="text-sm text-[#8b8b8b]">Microsoft 365 / Outlook.com</p>
                    </div>
                    <Button
                      onClick={() => handleOAuthConnect("outlook")}
                      disabled={connectingOAuth === "outlook"}
                      size="sm"
                      className="bg-blue-500 hover:bg-blue-600"
                    >
                      {connectingOAuth === "outlook" ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <ExternalLink className="w-4 h-4 mr-1" />
                          Collega
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Channels Table */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Caselle Email Collegate</CardTitle>
                  <CardDescription>Gestisci le caselle email per la ricezione e invio messaggi</CardDescription>
                </div>
                <Button
                  onClick={() => {
                    resetForm()
                    setShowAddForm(true)
                  }}
                  size="sm"
                  variant="outline"
                  className="border-[#8b7355] text-[#8b7355] hover:bg-[#f8f5f0]"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Aggiungi Manuale
                </Button>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="w-6 h-6 text-[#8b7355] animate-spin" />
                  </div>
                ) : channels.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-[#f8f5f0] rounded-full flex items-center justify-center mx-auto mb-4">
                      <Mail className="w-8 h-8 text-[#8b7355]" />
                    </div>
                    <h3 className="text-lg font-medium text-[#2c2c2c] mb-2">Nessuna email collegata</h3>
                    <p className="text-sm text-[#8b8b8b] mb-4">
                      Collega Gmail o Outlook per iniziare a ricevere messaggi
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {channels.map((channel) => (
                      <div key={channel.id} className="flex items-center justify-between p-4 bg-[#f8f5f0] rounded-lg">
                        <div className="flex items-center gap-4">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-[#2c2c2c]">
                                {channel.display_name || channel.email_address}
                              </span>
                              {getProviderBadge(channel)}
                            </div>
                            <span className="text-sm text-[#8b8b8b]">{channel.email_address}</span>
                            {channel.last_sync_at && (
                              <span className="text-xs text-[#8b8b8b]">
                                Ultima sync: {new Date(channel.last_sync_at).toLocaleString("it-IT")}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                              channel.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {channel.is_active ? "Attivo" : "Disattivo"}
                          </span>

                          {channel.oauth_access_token && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSync(channel.id)}
                              disabled={syncing === channel.id}
                              title="Sincronizza email"
                            >
                              <RefreshCw className={`w-4 h-4 ${syncing === channel.id ? "animate-spin" : ""}`} />
                            </Button>
                          )}

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleChannelStatus(channel)}
                            title={channel.is_active ? "Disattiva" : "Attiva"}
                          >
                            {channel.is_active ? (
                              <PowerOff className="w-4 h-4 text-gray-500" />
                            ) : (
                              <Power className="w-4 h-4 text-green-500" />
                            )}
                          </Button>

                          <Button variant="ghost" size="sm" onClick={() => handleEdit(channel)} title="Modifica">
                            <Edit className="w-4 h-4 text-[#8b7355]" />
                          </Button>

                          <Button variant="ghost" size="sm" onClick={() => handleDelete(channel.id)} title="Elimina">
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right: Add/Edit Form or Info */}
          <div>
            {showAddForm ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    {editingChannel ? "Modifica Canale" : "Aggiungi Email Manuale"}
                  </CardTitle>
                  <CardDescription>
                    {editingChannel
                      ? "Modifica le impostazioni del canale email"
                      : "Aggiungi una casella email senza OAuth"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-[#5c5c5c]">
                        Indirizzo Email <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="info@tuastruttura.com"
                        value={formData.email}
                        onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                        required
                        disabled={!!editingChannel?.provider}
                        className="border-[#e5e5e5] focus:border-[#8b7355] focus:ring-[#8b7355]"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="display_name" className="text-[#5c5c5c]">
                        Nome Visualizzato
                      </Label>
                      <Input
                        id="display_name"
                        type="text"
                        placeholder="es. Prenotazioni, Info Generale..."
                        value={formData.display_name}
                        onChange={(e) => setFormData((prev) => ({ ...prev, display_name: e.target.value }))}
                        className="border-[#e5e5e5] focus:border-[#8b7355] focus:ring-[#8b7355]"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[#5c5c5c]">Stato</Label>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, is_active: true }))}
                          className={`flex-1 py-2.5 px-4 rounded-lg border-2 transition-all flex items-center justify-center gap-2 ${
                            formData.is_active
                              ? "border-green-500 bg-green-50 text-green-700"
                              : "border-[#e5e5e5] text-[#8b8b8b] hover:border-[#8b7355]"
                          }`}
                        >
                          <Power className="w-4 h-4" />
                          Attivo
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, is_active: false }))}
                          className={`flex-1 py-2.5 px-4 rounded-lg border-2 transition-all flex items-center justify-center gap-2 ${
                            !formData.is_active
                              ? "border-gray-500 bg-gray-50 text-gray-700"
                              : "border-[#e5e5e5] text-[#8b8b8b] hover:border-[#8b7355]"
                          }`}
                        >
                          <PowerOff className="w-4 h-4" />
                          Disattivo
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[#5c5c5c]">Assegna Operatori</Label>
                      <div className="border border-[#e5e5e5] rounded-lg max-h-40 overflow-y-auto">
                        {users.length === 0 ? (
                          <div className="p-3 text-sm text-[#8b8b8b] text-center">Nessun operatore disponibile</div>
                        ) : (
                          users.map((user) => (
                            <label
                              key={user.id}
                              className="flex items-center gap-3 p-3 hover:bg-[#f8f5f0] cursor-pointer border-b border-[#e5e5e5] last:border-b-0"
                            >
                              <input
                                type="checkbox"
                                checked={formData.assigned_users.includes(user.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setFormData((prev) => ({
                                      ...prev,
                                      assigned_users: [...prev.assigned_users, user.id],
                                    }))
                                  } else {
                                    setFormData((prev) => ({
                                      ...prev,
                                      assigned_users: prev.assigned_users.filter((id) => id !== user.id),
                                    }))
                                  }
                                }}
                                className="rounded border-[#e5e5e5] text-[#8b7355] focus:ring-[#8b7355]"
                              />
                              <div className="flex-1">
                                <div className="text-sm font-medium text-[#5c5c5c]">{user.name}</div>
                                <div className="text-xs text-[#8b8b8b]">{user.email}</div>
                              </div>
                            </label>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setShowAddForm(false)
                          resetForm()
                        }}
                        className="flex-1"
                      >
                        Annulla
                      </Button>
                      <Button
                        type="submit"
                        disabled={saving}
                        className="flex-1 bg-[#8b7355] hover:bg-[#6d5a43] text-white"
                      >
                        {saving ? "Salvataggio..." : editingChannel ? "Salva Modifiche" : "Aggiungi Canale"}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-[#8b7355]" />
                    Come funziona
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-[#5c5c5c]">
                  <div className="flex gap-3">
                    <div className="w-6 h-6 bg-[#8b7355] text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                      1
                    </div>
                    <div>
                      <p className="font-medium">Collega l'account</p>
                      <p className="text-[#8b8b8b]">
                        Clicca su Gmail o Outlook per collegare automaticamente la casella
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-6 h-6 bg-[#8b7355] text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                      2
                    </div>
                    <div>
                      <p className="font-medium">Sincronizza</p>
                      <p className="text-[#8b8b8b]">Le email vengono importate automaticamente nella inbox</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-6 h-6 bg-[#8b7355] text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                      3
                    </div>
                    <div>
                      <p className="font-medium">Rispondi</p>
                      <p className="text-[#8b8b8b]">
                        Rispondi direttamente dalla inbox, le email partono dal tuo account
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
