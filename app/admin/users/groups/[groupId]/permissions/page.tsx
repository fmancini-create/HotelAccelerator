"use client"

import { useState, useEffect, use } from "react"
import Link from "next/link"
import { ArrowLeft, Mail, MessageSquare, Phone, Send, Check, Eye, Edit3, Shield } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AdminHeader } from "@/components/admin/admin-header"
import { Switch } from "@/components/ui/switch"
import { AreaPermissionsMatrix } from "@/components/admin/area-permissions-matrix"
import { AutoLogoutPicker } from "@/components/admin/auto-logout-picker"

interface ChannelPermission {
  id?: string
  channel_type: string
  channel_id: string
  channel_name: string
  can_read: boolean
  can_write: boolean
  can_manage: boolean
}

interface ChannelDescriptor {
  channel_type: string
  channel_id: string
  channel_name: string
}

const CHANNEL_ICONS: Record<string, typeof Mail> = {
  email: Mail,
  whatsapp: MessageSquare,
  telegram: Send,
  chat: MessageSquare,
  phone: Phone,
}

export default function GroupPermissionsPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = use(params)
  const [group, setGroup] = useState<{ id: string; name: string; color: string } | null>(null)
  const [permissions, setPermissions] = useState<ChannelPermission[]>([])
  const [areas, setAreas] = useState<string[]>([])
  const [autoLogout, setAutoLogout] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        const existing = (data.permissions || []) as Array<{
          channel_type: string
          channel_id: string | null
          can_read: boolean
          can_write: boolean
          can_manage: boolean
        }>
        const channels = (data.channels || []) as ChannelDescriptor[]

        const merged = channels.map((channel) => {
          const exact = existing.find(
            (p) => p.channel_type === channel.channel_type && p.channel_id === channel.channel_id,
          )
          const legacyWildcard = existing.find(
            (p) => p.channel_type === channel.channel_type && p.channel_id == null,
          )
          const source = exact || legacyWildcard
          return {
            ...channel,
            can_read: source?.can_read === true,
            can_write: source?.can_write === true,
            can_manage: source?.can_manage === true,
          }
        })

        setPermissions(merged)
        setAreas(data.areas || [])
        setAutoLogout(data.autoLogoutMinutes ?? null)
      }
    } catch (e) {
      console.error("Error loading data:", e)
      setError("Errore nel caricamento dei permessi")
    } finally {
      setLoading(false)
    }
  }

  async function savePermissions() {
    setSaving(true)
    setSaved(false)
    setError("")
    try {
      const res = await fetch(`/api/admin/groups/${groupId}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions, areas, autoLogoutMinutes: autoLogout }),
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

  function updatePermission(
    channelId: string,
    channelType: string,
    field: "can_read" | "can_write" | "can_manage",
    value: boolean,
  ) {
    setSaved(false)
    setPermissions((prev) =>
      prev.map((p) => {
        if (p.channel_id !== channelId || p.channel_type !== channelType) return p
        if (field === "can_read" && !value) {
          return { ...p, can_read: false, can_write: false, can_manage: false }
        }
        if ((field === "can_write" || field === "can_manage") && value) {
          return { ...p, [field]: true, can_read: true }
        }
        return { ...p, [field]: value }
      }),
    )
  }

  if (loading) {
    return (
      <div className="min-h-full bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-full bg-background">
      <div className="container mx-auto px-4 py-8">
        <AdminHeader
          title={`Permessi: ${group?.name || ""}`}
          subtitle="Configura aree e singoli canali ereditati dai membri del gruppo"
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
          <div className="mt-6 rounded-lg border border-ha-error-soft bg-ha-error-soft px-4 py-3 text-sm text-ha-error-soft-foreground">
            {error}
          </div>
        )}
        {saved && !error && (
          <div className="mt-6 rounded-lg border border-ha-success-soft bg-ha-success-soft px-4 py-3 text-sm text-ha-success-soft-foreground">
            Permessi salvati correttamente.
          </div>
        )}

        <div className="mt-6">
          <AreaPermissionsMatrix
            value={areas}
            onChange={(next) => {
              setSaved(false)
              setAreas(next)
            }}
            disabled={saving}
          />
        </div>

        <div className="mt-6">
          <AutoLogoutPicker
            ambito="gruppo"
            valore={autoLogout}
            disabled={saving}
            onChange={(v) => {
              setSaved(false)
              setAutoLogout(v)
            }}
          />
        </div>

        <div className="mt-6">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Canali</h2>
          <p className="text-sm text-muted-foreground mt-1">
            I permessi valgono sulla singola casella o canale. In questo modo un gruppo può usare, ad esempio,
            clienti@4bid.it senza vedere la posta personale della Direzione.
          </p>
        </div>

        <div className="mt-3 space-y-4">
          {permissions.length === 0 && (
            <div className="bg-card rounded-xl border p-8 text-center text-muted-foreground">
              Nessun canale configurato per questo tenant.
            </div>
          )}

          {permissions.map((permission) => {
            const Icon = CHANNEL_ICONS[permission.channel_type] || MessageSquare
            return (
              <div
                key={`${permission.channel_type}:${permission.channel_id}`}
                className="bg-card rounded-xl shadow-sm border p-6"
              >
                <div className="flex items-start gap-4">
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: group?.color ? `${group.color}20` : undefined }}
                  >
                    <Icon className="w-6 h-6" style={{ color: group?.color }} />
                  </div>

                  <div className="flex-1">
                    <div className="mb-4">
                      <h3 className="font-medium text-lg">{permission.channel_name}</h3>
                      <p className="text-sm text-muted-foreground capitalize">{permission.channel_type}</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-2">
                          <Eye className="w-4 h-4 text-ha-info-soft-foreground" />
                          <span className="text-sm font-medium">Lettura</span>
                        </div>
                        <Switch
                          checked={permission.can_read}
                          onCheckedChange={(checked) =>
                            updatePermission(permission.channel_id, permission.channel_type, "can_read", checked)
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-2">
                          <Edit3 className="w-4 h-4 text-ha-success-soft-foreground" />
                          <span className="text-sm font-medium">Scrittura</span>
                        </div>
                        <Switch
                          checked={permission.can_write}
                          onCheckedChange={(checked) =>
                            updatePermission(permission.channel_id, permission.channel_type, "can_write", checked)
                          }
                          disabled={!permission.can_read}
                        />
                      </div>

                      <div className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-2">
                          <Shield className="w-4 h-4 text-purple-500" />
                          <span className="text-sm font-medium">Gestione</span>
                        </div>
                        <Switch
                          checked={permission.can_manage}
                          onCheckedChange={(checked) =>
                            updatePermission(permission.channel_id, permission.channel_type, "can_manage", checked)
                          }
                          disabled={!permission.can_read}
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
