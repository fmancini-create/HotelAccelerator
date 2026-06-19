"use client"

import { useState, useEffect, use } from "react"
import Link from "next/link"
import { ArrowLeft, Mail, MessageSquare, Send, Phone, Check, Inbox, Bell, Power } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AdminHeader } from "@/components/admin/admin-header"
import { Switch } from "@/components/ui/switch"

interface ChannelPermission {
  channel_type: string
  channel_id: string
  channel_name: string
  assigned: boolean
  can_receive: boolean
  can_send: boolean
  receives_notifications: boolean
}

interface TargetUser {
  id: string
  name: string | null
  email: string
  role: string
  is_tenant_admin: boolean
}

const CHANNEL_ICONS: Record<string, typeof Mail> = {
  email: Mail,
  whatsapp: MessageSquare,
  telegram: Send,
  chat: MessageSquare,
  phone: Phone,
}

export default function UserPermissionsPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = use(params)
  const [user, setUser] = useState<TargetUser | null>(null)
  const [permissions, setPermissions] = useState<ChannelPermission[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  async function loadData() {
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`/api/admin/users/${userId}/permissions`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || "Errore nel caricamento dei permessi")
        return
      }
      const data = await res.json()
      setUser(data.user)
      setPermissions(data.permissions || [])
    } catch (e) {
      setError("Errore nel caricamento dei permessi")
    } finally {
      setLoading(false)
    }
  }

  function updatePermission(
    channelId: string,
    channelType: string,
    field: "assigned" | "can_receive" | "can_send" | "receives_notifications",
    value: boolean,
  ) {
    setSaved(false)
    setPermissions((prev) =>
      prev.map((p) => {
        if (p.channel_id !== channelId || p.channel_type !== channelType) return p
        // Disabling the assignment switches everything off.
        if (field === "assigned" && !value) {
          return { ...p, assigned: false, can_receive: false, can_send: false, receives_notifications: false }
        }
        // Turning on any capability implies the channel is assigned.
        if (field !== "assigned" && value) {
          return { ...p, assigned: true, [field]: true }
        }
        return { ...p, [field]: value }
      }),
    )
  }

  async function savePermissions() {
    setSaving(true)
    setSaved(false)
    setError("")
    try {
      const res = await fetch(`/api/admin/users/${userId}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || "Errore nel salvataggio")
        return
      }
      setSaved(true)
    } catch (e) {
      setError("Errore nel salvataggio")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary" />
      </div>
    )
  }

  const displayName = user?.name || user?.email || "Utente"

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <AdminHeader
          title={`Permessi: ${displayName}`}
          subtitle="Assegna i canali e i permessi specifici di questo utente"
          actions={
            <div className="flex gap-2">
              <Link href="/admin/users">
                <Button variant="outline">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Indietro
                </Button>
              </Link>
              <Button onClick={savePermissions} disabled={saving}>
                <Check className="h-4 w-4 mr-2" />
                {saving ? "Salvataggio..." : "Salva Permessi"}
              </Button>
            </div>
          }
        />

        {error && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {saved && !error && (
          <div className="mt-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            Permessi salvati correttamente.
          </div>
        )}

        {user?.is_tenant_admin && (
          <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            Questo utente è un amministratore del tenant e ha accesso completo a tutti i canali, a
            prescindere dalle assegnazioni qui sotto.
          </div>
        )}

        <div className="mt-6 space-y-4">
          {permissions.length === 0 && (
            <div className="bg-card rounded-xl border p-8 text-center text-muted-foreground">
              Nessun canale configurato per questa struttura. Aggiungi un canale (Email, WhatsApp, ...) per
              poterlo assegnare.
            </div>
          )}

          {permissions.map((p) => {
            const Icon = CHANNEL_ICONS[p.channel_type] || MessageSquare
            return (
              <div key={`${p.channel_type}:${p.channel_id}`} className="bg-card rounded-xl shadow-sm border p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-muted">
                    <Icon className="w-6 h-6 text-foreground" />
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-lg">{p.channel_name}</h3>
                        <p className="text-sm text-muted-foreground capitalize">{p.channel_type}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Power className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Assegnato</span>
                        <Switch
                          checked={p.assigned}
                          onCheckedChange={(v) => updatePermission(p.channel_id, p.channel_type, "assigned", v)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                      <div className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-2">
                          <Inbox className="w-4 h-4 text-blue-500" />
                          <span className="text-sm font-medium">Ricezione</span>
                        </div>
                        <Switch
                          checked={p.can_receive}
                          disabled={!p.assigned}
                          onCheckedChange={(v) => updatePermission(p.channel_id, p.channel_type, "can_receive", v)}
                        />
                      </div>

                      <div className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-2">
                          <Send className="w-4 h-4 text-green-500" />
                          <span className="text-sm font-medium">Invio</span>
                        </div>
                        <Switch
                          checked={p.can_send}
                          disabled={!p.assigned}
                          onCheckedChange={(v) => updatePermission(p.channel_id, p.channel_type, "can_send", v)}
                        />
                      </div>

                      <div className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-2">
                          <Bell className="w-4 h-4 text-amber-500" />
                          <span className="text-sm font-medium">Notifiche</span>
                        </div>
                        <Switch
                          checked={p.receives_notifications}
                          disabled={!p.assigned}
                          onCheckedChange={(v) =>
                            updatePermission(p.channel_id, p.channel_type, "receives_notifications", v)
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
