"use client"

import { useState, useEffect, use } from "react"
import Link from "next/link"
import { ArrowLeft, Mail, MessageSquare, Phone, Send, Check, Eye, Edit3, Shield } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AdminHeader } from "@/components/admin/admin-header"
import { Switch } from "@/components/ui/switch"

interface ChannelPermission {
  id?: string
  channel_type: string
  channel_id: string | null
  channel_name?: string
  can_read: boolean
  can_write: boolean
  can_manage: boolean
}

const CHANNEL_TYPES = [
  { type: "email", label: "Email", icon: Mail, description: "Canali email collegati" },
  { type: "whatsapp", label: "WhatsApp", icon: MessageSquare, description: "WhatsApp Business" },
  { type: "telegram", label: "Telegram", icon: Send, description: "Bot Telegram" },
  { type: "chat", label: "Chat Widget", icon: MessageSquare, description: "Chat sul sito web" },
  { type: "phone", label: "Telefono", icon: Phone, description: "Chiamate VoIP" },
]

export default function GroupPermissionsPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = use(params)
  const [group, setGroup] = useState<{ id: string; name: string; color: string } | null>(null)
  const [permissions, setPermissions] = useState<ChannelPermission[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadData()
  }, [groupId])

  async function loadData() {
    try {
      const [groupRes, permissionsRes] = await Promise.all([
        fetch(`/api/admin/groups/${groupId}`),
        fetch(`/api/admin/groups/${groupId}/permissions`),
      ])

      if (groupRes.ok) {
        const data = await groupRes.json()
        setGroup(data.group)
      }
      if (permissionsRes.ok) {
        const data = await permissionsRes.json()
        // Merge with defaults
        const existingPermissions = data.permissions || []
        const mergedPermissions = CHANNEL_TYPES.map((ct) => {
          const existing = existingPermissions.find(
            (p: ChannelPermission) => p.channel_type === ct.type && !p.channel_id,
          )
          return (
            existing || {
              channel_type: ct.type,
              channel_id: null,
              can_read: false,
              can_write: false,
              can_manage: false,
            }
          )
        })
        setPermissions(mergedPermissions)
      }
    } catch (e) {
      console.error("Error loading data:", e)
    } finally {
      setLoading(false)
    }
  }

  async function savePermissions() {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/groups/${groupId}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions }),
      })
      if (res.ok) {
        // Show success
      }
    } catch (e) {
      console.error("Error saving permissions:", e)
    } finally {
      setSaving(false)
    }
  }

  function updatePermission(channelType: string, field: "can_read" | "can_write" | "can_manage", value: boolean) {
    setPermissions((prev) =>
      prev.map((p) => {
        if (p.channel_type === channelType && !p.channel_id) {
          // If disabling read, disable write and manage too
          if (field === "can_read" && !value) {
            return { ...p, can_read: false, can_write: false, can_manage: false }
          }
          // If enabling write or manage, enable read too
          if ((field === "can_write" || field === "can_manage") && value) {
            return { ...p, [field]: value, can_read: true }
          }
          return { ...p, [field]: value }
        }
        return p
      }),
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <AdminHeader
          title={`Permessi: ${group?.name || ""}`}
          subtitle="Configura i permessi sui canali di comunicazione"
          breadcrumbs={[
            { label: "Team", href: "/admin/users" },
            { label: "Gruppi", href: "/admin/users?tab=groups" },
            { label: group?.name || "", href: `/admin/users/groups/${groupId}/permissions` },
          ]}
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

        <div className="mt-6 space-y-4">
          {CHANNEL_TYPES.map((ct) => {
            const permission = permissions.find((p) => p.channel_type === ct.type && !p.channel_id)
            const IconComponent = ct.icon

            return (
              <div key={ct.type} className="bg-card rounded-xl shadow-sm border p-6">
                <div className="flex items-start gap-4">
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: group?.color + "20" }}
                  >
                    <IconComponent className="w-6 h-6" style={{ color: group?.color }} />
                  </div>

                  <div className="flex-1">
                    <h3 className="font-medium text-lg">{ct.label}</h3>
                    <p className="text-sm text-muted-foreground mb-4">{ct.description}</p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Lettura */}
                      <div className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-2">
                          <Eye className="w-4 h-4 text-blue-500" />
                          <span className="text-sm font-medium">Lettura</span>
                        </div>
                        <Switch
                          checked={permission?.can_read || false}
                          onCheckedChange={(checked) => updatePermission(ct.type, "can_read", checked)}
                        />
                      </div>

                      {/* Scrittura */}
                      <div className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-2">
                          <Edit3 className="w-4 h-4 text-green-500" />
                          <span className="text-sm font-medium">Scrittura</span>
                        </div>
                        <Switch
                          checked={permission?.can_write || false}
                          onCheckedChange={(checked) => updatePermission(ct.type, "can_write", checked)}
                          disabled={!permission?.can_read}
                        />
                      </div>

                      {/* Gestione */}
                      <div className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-2">
                          <Shield className="w-4 h-4 text-purple-500" />
                          <span className="text-sm font-medium">Gestione</span>
                        </div>
                        <Switch
                          checked={permission?.can_manage || false}
                          onCheckedChange={(checked) => updatePermission(ct.type, "can_manage", checked)}
                          disabled={!permission?.can_read}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Legenda */}
        <div className="mt-6 bg-muted/50 rounded-xl p-6">
          <h3 className="font-medium mb-4">Legenda Permessi</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="flex items-start gap-2">
              <Eye className="w-4 h-4 text-blue-500 mt-0.5" />
              <div>
                <p className="font-medium">Lettura</p>
                <p className="text-muted-foreground">Può visualizzare messaggi e conversazioni</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Edit3 className="w-4 h-4 text-green-500 mt-0.5" />
              <div>
                <p className="font-medium">Scrittura</p>
                <p className="text-muted-foreground">Può rispondere e inviare messaggi</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Shield className="w-4 h-4 text-purple-500 mt-0.5" />
              <div>
                <p className="font-medium">Gestione</p>
                <p className="text-muted-foreground">Può configurare il canale e le impostazioni</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
