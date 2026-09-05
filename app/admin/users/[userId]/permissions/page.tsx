"use client"

import { useState, useEffect, use } from "react"
import Link from "next/link"
import { ArrowLeft, Mail, MessageSquare, Send, Phone, Check, Inbox, Bell, Power } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AdminHeader } from "@/components/admin/admin-header"
import { Switch } from "@/components/ui/switch"
import { AreaPermissionsMatrix } from "@/components/admin/area-permissions-matrix"
import { AutoLogoutPicker } from "@/components/admin/auto-logout-picker"
import { CallVisibilityPicker, type CallAccessValue } from "@/components/admin/call-visibility-picker"
import type { GruppoConTempo } from "@/lib/auth/auto-logout"

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

type Choice = { id: string; name?: string | null; email?: string | null }

const DEFAULT_CALL_ACCESS: CallAccessValue = {
  inherit: true,
  visibility_scope: "own",
  can_read_transcripts: true,
  can_listen_recordings: false,
  selected_user_ids: [],
  selected_group_ids: [],
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
  const [areas, setAreas] = useState<string[]>([])
  const [autoLogout, setAutoLogout] = useState<number | null>(null)
  const [gruppiTempo, setGruppiTempo] = useState<GruppoConTempo[]>([])
  const [callAccess, setCallAccess] = useState<CallAccessValue>(DEFAULT_CALL_ACCESS)
  const [callUsers, setCallUsers] = useState<Choice[]>([])
  const [callGroups, setCallGroups] = useState<Choice[]>([])
  const [inheritedCallLabel, setInheritedCallLabel] = useState<string | null>(null)
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
      setAreas(data.areas || [])
      setAutoLogout(data.autoLogout?.valoreUtente ?? null)
      setGruppiTempo(data.autoLogout?.gruppi ?? [])

      const ca = data.callAccess || {}
      const base = ca.explicit || ca.defaults || {}
      setCallAccess({
        inherit: !ca.explicit,
        visibility_scope: base.visibility_scope || "own",
        can_read_transcripts: base.can_read_transcripts !== false,
        can_listen_recordings: base.can_listen_recordings === true,
        selected_user_ids: ca.explicit?.selected_user_ids || [],
        selected_group_ids: ca.explicit?.selected_group_ids || [],
      })
      setCallUsers((ca.users || []).filter((u: Choice) => u.id !== userId))
      setCallGroups(ca.groups || [])
      setInheritedCallLabel(
        ca.inherited
          ? `Regola ereditata: ${ca.inherited.visibility_scope === "all" ? "tutte" : ca.inherited.visibility_scope === "groups" ? "miei gruppi" : "solo mie"}.`
          : null,
      )
    } catch {
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
        if (field === "assigned" && !value) {
          return { ...p, assigned: false, can_receive: false, can_send: false, receives_notifications: false }
        }
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
        body: JSON.stringify({ permissions, areas, autoLogoutMinutes: autoLogout, callAccess }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || "Errore nel salvataggio")
        return
      }
      setSaved(true)
      await loadData()
    } catch {
      setError("Errore nel salvataggio")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-full bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary" />
      </div>
    )
  }

  const displayName = user?.name || user?.email || "Utente"

  return (
    <div className="min-h-full bg-background">
      <div className="container mx-auto px-4 py-8">
        <AdminHeader
          title={`Permessi: ${displayName}`}
          subtitle="Assegna aree, canali e perimetro dei dati visibili a questo utente"
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

        {user?.is_tenant_admin && (
          <div className="mt-6 rounded-lg border border-ha-info-soft bg-ha-info-soft px-4 py-3 text-sm text-ha-info-soft-foreground">
            Questo utente è un amministratore del tenant: vede tutte le chiamate e tutti i dati del tenant.
          </div>
        )}

        {!user?.is_tenant_admin && (
          <>
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
              <CallVisibilityPicker
                value={callAccess}
                users={callUsers}
                groups={callGroups}
                inheritedLabel={inheritedCallLabel}
                disabled={saving}
                onChange={(next) => {
                  setSaved(false)
                  setCallAccess(next)
                }}
              />
            </div>
          </>
        )}

        <div className="mt-6">
          <AutoLogoutPicker
            ambito="utente"
            valore={autoLogout}
            gruppi={gruppiTempo}
            disabled={saving}
            onChange={(v) => {
              setSaved(false)
              setAutoLogout(v)
            }}
          />
        </div>

        <div className="mt-6">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Canali</h2>
        </div>

        <div className="mt-3 space-y-4">
          {permissions.length === 0 && (
            <div className="bg-card rounded-xl border p-8 text-center text-muted-foreground">
              Nessun canale configurato per questa struttura. Aggiungi un canale (Email, WhatsApp, ...) per poterlo assegnare.
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
                          <Inbox className="w-4 h-4 text-ha-info-soft-foreground" />
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
                          <Send className="w-4 h-4 text-ha-success-soft-foreground" />
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
                          <Bell className="w-4 h-4 text-ha-warning-soft-foreground" />
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
