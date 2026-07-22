"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  Plus, Trash2, Save, Bell, GripVertical, Loader2,
  CheckCircle2, Clock, Code2, TestTube, Globe, ChevronDown, ChevronUp,
} from "lucide-react"

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  da_fare: { label: "Da fare", color: "bg-muted text-muted-foreground", icon: Clock },
  in_corso: { label: "In corso", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300", icon: Code2 },
  fatto: { label: "Fatto", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300", icon: CheckCircle2 },
  testato: { label: "Testato", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300", icon: TestTube },
  online: { label: "Online", color: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300", icon: Globe },
}

interface Feature {
  id: string
  title: string
  description: string | null
  status: string
  sort_order: number
  published_at: string | null
  release_note_title: string | null
  release_note_body: string | null
  created_at: string
  updated_at: string
}

export function FeatureTracker() {
  const [features, setFeatures] = useState<Feature[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  // New feature form
  const [newTitle, setNewTitle] = useState("")
  const [newDesc, setNewDesc] = useState("")
  const [addingNew, setAddingNew] = useState(false)

  // Expanded feature for editing
  const [expanded, setExpanded] = useState<string | null>(null)

  // Notification dialog
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifFeatureId, setNotifFeatureId] = useState<string | null>(null)
  const [notifTitle, setNotifTitle] = useState("")
  const [notifBody, setNotifBody] = useState("")
  const [notifType, setNotifType] = useState<string>("release")
  const [notifPopup, setNotifPopup] = useState(false)
  const [sendingNotif, setSendingNotif] = useState(false)

  const fetchFeatures = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/features")
      if (res.ok) {
        const data = await res.json()
        setFeatures(data.features || [])
      }
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchFeatures() }, [fetchFeatures])

  const handleAdd = async () => {
    if (!newTitle.trim()) return
    setAddingNew(true)
    try {
      const res = await fetch("/api/admin/features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle, description: newDesc }),
      })
      if (res.ok) {
        setNewTitle("")
        setNewDesc("")
        fetchFeatures()
      }
    } finally { setAddingNew(false) }
  }

  const handleUpdate = async (id: string, updates: Partial<Feature>) => {
    setSaving(id)
    try {
      await fetch(`/api/admin/features/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      })
      fetchFeatures()
    } finally { setSaving(null) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Eliminare questa feature?")) return
    await fetch(`/api/admin/features/${id}`, { method: "DELETE" })
    fetchFeatures()
  }

  const handlePublish = (feature: Feature) => {
    setNotifFeatureId(feature.id)
    setNotifTitle(feature.release_note_title || `Nuova funzionalita: ${feature.title}`)
    setNotifBody(feature.release_note_body || feature.description || "")
    setNotifType("release")
    setNotifPopup(true)
    setNotifOpen(true)
  }

  const handleSendNotification = async () => {
    if (!notifTitle.trim() || !notifBody.trim()) {
      alert("Compila titolo e corpo della notifica")
      return
    }
    setSendingNotif(true)
    try {
      // Note: feature_id is NOT passed because platform_notifications.feature_id
      // references feature_development, not feature_announcements. 
      // The notification is standalone but we track the association via release_note fields.
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: notifType,
          title: notifTitle,
          body: notifBody,
          show_popup: notifPopup,
        }),
      })
      if (res.ok) {
        // Mark feature as online + published
        if (notifFeatureId) {
          await handleUpdate(notifFeatureId, {
            status: "online",
            published_at: new Date().toISOString(),
            release_note_title: notifTitle,
            release_note_body: notifBody,
          } as any)
        }
        setNotifOpen(false)
        alert("Notifica inviata con successo!")
      } else {
        const errorData = await res.json().catch(() => ({}))
        console.error("[v0] Notification API error:", res.status, errorData)
        alert(`Errore invio notifica: ${errorData.error || res.statusText || "Errore sconosciuto"}`)
      }
    } catch (err) {
      console.error("[v0] Notification fetch error:", err)
      alert(`Errore di rete: ${err instanceof Error ? err.message : "Errore sconosciuto"}`)
    } finally { setSendingNotif(false) }
  }

  // Group by status
  const grouped = Object.keys(STATUS_CONFIG).map(status => ({
    status,
    ...STATUS_CONFIG[status],
    items: features.filter(f => f.status === status),
  }))

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats bar */}
      <div className="flex items-center gap-3 flex-wrap">
        {grouped.map(g => (
          <Badge key={g.status} variant="outline" className={`${g.color} text-[11px] gap-1 py-0.5`}>
            <g.icon className="h-3 w-3" />
            {g.label}: {g.items.length}
          </Badge>
        ))}
        <Badge variant="outline" className="text-[11px] py-0.5">
          Totale: {features.length}
        </Badge>
      </div>

      {/* Add new feature */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <div className="flex-1 space-y-2">
              <Input
                placeholder="Titolo nuova funzionalita..."
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAdd()}
              />
              <Textarea
                placeholder="Descrizione (opzionale)..."
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                rows={2}
                className="resize-none text-sm"
              />
            </div>
            <Button onClick={handleAdd} disabled={!newTitle.trim() || addingNew} size="sm" className="mt-0.5">
              {addingNew ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Aggiungi
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Feature list grouped by status */}
      {grouped.map(group => {
        if (group.items.length === 0) return null
        return (
          <div key={group.status}>
            <div className="flex items-center gap-2 mb-2">
              <group.icon className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">{group.label}</h3>
              <span className="text-xs text-muted-foreground">({group.items.length})</span>
            </div>
            <div className="space-y-2">
              {group.items.map(feature => {
                const isExpanded = expanded === feature.id
                return (
                  <Card key={feature.id} className="transition-shadow hover:shadow-sm">
                    <CardContent className="py-3 px-4">
                      {/* Row */}
                      <div className="flex items-center gap-3">
                        <GripVertical className="h-4 w-4 text-muted-foreground/40 flex-shrink-0 cursor-grab" />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-foreground truncate">{feature.title}</span>
                            {feature.published_at && (
                              <Badge variant="outline" className="text-[9px] py-0 px-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200">
                                Pubblicata
                              </Badge>
                            )}
                          </div>
                          {feature.description && !isExpanded && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">{feature.description}</p>
                          )}
                        </div>

                        {/* Status select */}
                        <Select
                          value={feature.status}
                          onValueChange={val => handleUpdate(feature.id, { status: val })}
                        >
                          <SelectTrigger className="w-[120px] h-7 text-[11px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                              <SelectItem key={key} value={key} className="text-xs">
                                {cfg.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {/* Publish/notify button */}
                        {(feature.status === "testato" || feature.status === "online") && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[11px] gap-1"
                            onClick={() => handlePublish(feature)}
                          >
                            <Bell className="h-3 w-3" />
                            Notifica
                          </Button>
                        )}

                        {/* Expand/collapse */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => setExpanded(isExpanded ? null : feature.id)}
                        >
                          {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </Button>

                        {/* Delete */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(feature.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      {/* Expanded edit form */}
                      {isExpanded && (
                        <FeatureEditForm
                          feature={feature}
                          onSave={updates => handleUpdate(feature.id, updates)}
                          saving={saving === feature.id}
                        />
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Notification dialog */}
      <Dialog open={notifOpen} onOpenChange={setNotifOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Invia notifica a tutti gli utenti</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-medium mb-1 block">Tipo</Label>
              <Select value={notifType} onValueChange={setNotifType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="release">Nuova funzionalita</SelectItem>
                  <SelectItem value="coming_soon">In arrivo</SelectItem>
                  <SelectItem value="announcement">Annuncio</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-medium mb-1 block">Titolo</Label>
              <Input value={notifTitle} onChange={e => setNotifTitle(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs font-medium mb-1 block">Corpo</Label>
              <Textarea value={notifBody} onChange={e => setNotifBody(e.target.value)} rows={4} className="resize-none" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={notifPopup} onCheckedChange={setNotifPopup} id="popup" />
              <Label htmlFor="popup" className="text-sm">Mostra come popup (non solo campanella)</Label>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Annulla</Button>
            </DialogClose>
            <Button onClick={handleSendNotification} disabled={!notifTitle.trim() || !notifBody.trim() || sendingNotif}>
              {sendingNotif ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Bell className="h-4 w-4 mr-1" />}
              Invia notifica
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Inline edit form for expanded features */
function FeatureEditForm({
  feature,
  onSave,
  saving,
}: {
  feature: Feature
  onSave: (updates: Partial<Feature>) => void
  saving: boolean
}) {
  const [title, setTitle] = useState(feature.title)
  const [description, setDescription] = useState(feature.description || "")
  const [releaseTitle, setReleaseTitle] = useState(feature.release_note_title || "")
  const [releaseBody, setReleaseBody] = useState(feature.release_note_body || "")

  return (
    <div className="mt-3 pt-3 border-t border-border space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-[10px] text-muted-foreground">Titolo</Label>
          <Input value={title} onChange={e => setTitle(e.target.value)} className="h-8 text-sm" />
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">Descrizione</Label>
          <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={1} className="resize-none text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-[10px] text-muted-foreground">Titolo release note</Label>
          <Input value={releaseTitle} onChange={e => setReleaseTitle(e.target.value)} className="h-8 text-sm" placeholder="Titolo per la notifica..." />
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">Corpo release note</Label>
          <Textarea value={releaseBody} onChange={e => setReleaseBody(e.target.value)} rows={2} className="resize-none text-sm" placeholder="Descrizione per la notifica..." />
        </div>
      </div>
      <div className="flex justify-end">
        <Button
          size="sm"
          className="h-7 text-[11px] gap-1"
          disabled={saving}
          onClick={() => onSave({
            title,
            description: description || null,
            release_note_title: releaseTitle || null,
            release_note_body: releaseBody || null,
          } as any)}
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          Salva
        </Button>
      </div>
      <div className="text-[9px] text-muted-foreground">
        Creata: {new Date(feature.created_at).toLocaleDateString("it-IT")}
        {feature.published_at && ` | Pubblicata: ${new Date(feature.published_at).toLocaleDateString("it-IT")}`}
      </div>
    </div>
  )
}
