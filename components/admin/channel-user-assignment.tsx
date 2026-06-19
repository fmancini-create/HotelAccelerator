"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Loader2, Users, Check } from "lucide-react"

interface AdminUser {
  id: string
  name: string | null
  email: string
}

interface ChannelUserAssignmentProps {
  /** 'email' | 'whatsapp' | 'telegram' | 'chat' | ... */
  channelType: string
  channelId: string
  /** Optional label override. */
  label?: string
}

/**
 * Reusable per-channel user assignment control. Loads the tenant users and the
 * channel's current assignments from the generic /api/channels/assignments
 * endpoint, lets the admin toggle which users can operate the channel, and
 * persists the selection. Works for any channel type.
 */
export function ChannelUserAssignment({ channelType, channelId, label = "Assegna utenti" }: ChannelUserAssignmentProps) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/channels/assignments?channel_type=${encodeURIComponent(channelType)}&channel_id=${encodeURIComponent(channelId)}`,
        { credentials: "include" },
      )
      const data = await res.json()
      if (res.ok) {
        setUsers(data.users ?? [])
        setSelected(data.userIds ?? [])
        setDirty(false)
      } else {
        setFeedback({ type: "error", text: data.error || "Errore nel caricamento" })
      }
    } catch {
      setFeedback({ type: "error", text: "Errore di rete" })
    } finally {
      setLoading(false)
    }
  }, [channelType, channelId])

  useEffect(() => {
    load()
  }, [load])

  const toggle = (userId: string) => {
    setDirty(true)
    setFeedback(null)
    setSelected((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]))
  }

  const save = async () => {
    setSaving(true)
    setFeedback(null)
    try {
      const res = await fetch("/api/channels/assignments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ channel_type: channelType, channel_id: channelId, user_ids: selected }),
      })
      const data = await res.json()
      if (res.ok) {
        setDirty(false)
        setFeedback({ type: "success", text: "Assegnazioni salvate" })
      } else {
        setFeedback({ type: "error", text: data.error || "Errore nel salvataggio" })
      }
    } catch {
      setFeedback({ type: "error", text: "Errore di rete" })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Caricamento utenti...
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <Label className="text-sm font-medium">{label}</Label>
      </div>

      {users.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nessun utente disponibile. Aggiungi prima gli utenti della struttura.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {users.map((user) => {
            const isOn = selected.includes(user.id)
            return (
              <Button
                key={user.id}
                type="button"
                variant={isOn ? "default" : "outline"}
                size="sm"
                onClick={() => toggle(user.id)}
              >
                {isOn ? <Check className="mr-1 h-3.5 w-3.5" /> : null}
                {user.name || user.email}
              </Button>
            )
          })}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="button" size="sm" onClick={save} disabled={!dirty || saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Salva assegnazioni
        </Button>
        {feedback ? (
          <span className={`text-sm ${feedback.type === "success" ? "text-emerald-600" : "text-destructive"}`}>
            {feedback.text}
          </span>
        ) : null}
      </div>
    </div>
  )
}
