"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react"

type Template = {
  id: string
  title: string
  description: string | null
  category: string | null
  default_order: number
  is_active: boolean
}

const CATEGORY_OPTIONS = ["documenti", "tecnico", "marketing", "strategia", "altro"]

export function OnboardingTemplatesManager() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Partial<Template> | null>(null)
  const [saving, setSaving] = useState(false)

  async function reload() {
    setLoading(true)
    const res = await fetch("/api/superadmin/onboarding-templates", { cache: "no-store" })
    const data = await res.json().catch(() => ({}))
    if (res.ok) setTemplates(data.templates || [])
    setLoading(false)
  }
  useEffect(() => {
    reload()
  }, [])

  async function save() {
    if (!editing?.title) return
    setSaving(true)
    try {
      const isUpdate = !!editing.id
      const res = await fetch(
        isUpdate
          ? `/api/superadmin/onboarding-templates/${editing.id}`
          : "/api/superadmin/onboarding-templates",
        {
          method: isUpdate ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: editing.title,
            description: editing.description ?? null,
            category: editing.category ?? null,
            default_order: editing.default_order ?? 0,
            is_active: editing.is_active ?? true,
          }),
        }
      )
      if (!res.ok) {
        alert("Errore salvataggio")
      } else {
        setEditing(null)
        await reload()
      }
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (!confirm("Eliminare questo template?")) return
    const res = await fetch(`/api/superadmin/onboarding-templates/${id}`, { method: "DELETE" })
    if (res.ok) await reload()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Libreria Attivit&agrave; Onboarding</h2>
          <p className="text-sm text-muted-foreground">
            Template predefiniti riutilizzabili per la checklist post-firma. Sono il punto di
            partenza quando il SuperAdmin crea la checklist per una nuova subscription a commissione.
          </p>
        </div>
        <Button onClick={() => setEditing({ default_order: 0, is_active: true })}>
          <Plus className="h-4 w-4 mr-2" /> Nuovo template
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Caricamento...
        </div>
      ) : (
        <div className="grid gap-3">
          {templates.map((t) => (
            <Card key={t.id} className={!t.is_active ? "opacity-60" : ""}>
              <CardContent className="py-4 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{t.title}</span>
                    {t.category && <Badge variant="secondary">{t.category}</Badge>}
                    <span className="text-xs text-muted-foreground">ord: {t.default_order}</span>
                    {!t.is_active && <Badge variant="outline">disattivato</Badge>}
                  </div>
                  {t.description && (
                    <p className="text-sm text-muted-foreground mt-1">{t.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => setEditing(t)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(t.id)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {templates.length === 0 && (
            <p className="text-sm text-muted-foreground">Nessun template ancora creato.</p>
          )}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(open) => !open && !saving && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Modifica template" : "Nuovo template"}</DialogTitle>
            <DialogDescription>
              Template riutilizzabile per la checklist di onboarding post-firma.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Titolo</Label>
                <Input
                  value={editing.title ?? ""}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  placeholder="Es. Inviare listino ufficiale"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label>Descrizione</Label>
                <Textarea
                  value={editing.description ?? ""}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Categoria</Label>
                  <select
                    className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                    value={editing.category ?? ""}
                    onChange={(e) => setEditing({ ...editing, category: e.target.value || null })}
                  >
                    <option value="">(nessuna)</option>
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Ordine di default</Label>
                  <Input
                    type="number"
                    value={editing.default_order ?? 0}
                    onChange={(e) =>
                      setEditing({ ...editing, default_order: Number(e.target.value) || 0 })
                    }
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="is-active"
                  type="checkbox"
                  checked={editing.is_active ?? true}
                  onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })}
                />
                <Label htmlFor="is-active">Attivo</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              Annulla
            </Button>
            <Button onClick={save} disabled={saving || !editing?.title}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salva"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
