"use client"

import { useEffect, useState, useCallback } from "react"
import { Plus, Edit3, Trash2, Star, Check, X, Mail, Users, User, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SignatureEditor } from "@/components/admin/signature-editor"

interface Assignment {
  id?: string
  target_type: "user" | "group"
  target_id: string
  channel_id?: string | null
}

interface Signature {
  id: string
  name: string
  html: string
  channel_id: string | null
  is_default: boolean
  assignments: Assignment[]
}

interface UserOption {
  id: string
  name?: string
  email: string
}
interface GroupOption {
  id: string
  name: string
  color?: string
}
interface ChannelOption {
  id: string
  email_address?: string
  display_name?: string
  name?: string
}

const emptyDraft = (): Signature => ({
  id: "",
  name: "",
  html: "",
  channel_id: null,
  is_default: false,
  assignments: [],
})

export function SignaturesManager() {
  const [signatures, setSignatures] = useState<Signature[]>([])
  const [users, setUsers] = useState<UserOption[]>([])
  const [groups, setGroups] = useState<GroupOption[]>([])
  const [channels, setChannels] = useState<ChannelOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [editing, setEditing] = useState<Signature | null>(null)
  const [isNew, setIsNew] = useState(false)

  const channelLabel = useCallback(
    (id?: string | null) => {
      if (!id) return null
      const c = channels.find((c) => c.id === id)
      return c ? c.display_name || c.email_address || c.name || "Casella" : null
    },
    [channels],
  )

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [sigRes, usersRes, groupsRes, chRes] = await Promise.all([
        fetch("/api/admin/signatures"),
        fetch("/api/admin/users"),
        fetch("/api/admin/groups"),
        fetch("/api/channels/email"),
      ])
      if (sigRes.ok) setSignatures((await sigRes.json()).signatures || [])
      if (usersRes.ok) setUsers((await usersRes.json()).users || [])
      if (groupsRes.ok) setGroups((await groupsRes.json()).groups || [])
      if (chRes.ok) setChannels((await chRes.json()).channels || [])
    } catch (e) {
      console.error("[v0] loadAll signatures error:", e)
      setError("Errore nel caricamento delle firme.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const startNew = () => {
    setEditing(emptyDraft())
    setIsNew(true)
    setError("")
  }
  const startEdit = (sig: Signature) => {
    setEditing({ ...sig, assignments: [...sig.assignments] })
    setIsNew(false)
    setError("")
  }
  const cancelEdit = () => {
    setEditing(null)
    setIsNew(false)
  }

  async function saveSignature() {
    if (!editing) return
    if (!editing.name.trim()) {
      setError("Il nome della firma è obbligatorio.")
      return
    }
    setSaving(true)
    setError("")
    try {
      // 1. Create or update the signature itself.
      const payload = {
        name: editing.name.trim(),
        html: editing.html,
        channel_id: editing.channel_id,
        is_default: editing.is_default,
      }
      const res = await fetch(isNew ? "/api/admin/signatures" : `/api/admin/signatures/${editing.id}`, {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Errore nel salvataggio")
      const signatureId = data.signature.id

      // 2. Persist assignments.
      const aRes = await fetch(`/api/admin/signatures/${signatureId}/assignments`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignments: editing.assignments }),
      })
      if (!aRes.ok) {
        const aData = await aRes.json()
        throw new Error(aData.error || "Errore nel salvataggio delle assegnazioni")
      }

      await loadAll()
      cancelEdit()
    } catch (e: any) {
      console.error("[v0] saveSignature error:", e)
      setError(e.message || "Errore nel salvataggio.")
    } finally {
      setSaving(false)
    }
  }

  async function deleteSignature(id: string) {
    if (!confirm("Eliminare questa firma? Verrà rimossa da tutti gli utenti e gruppi a cui è assegnata.")) return
    try {
      const res = await fetch(`/api/admin/signatures/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Errore nell'eliminazione")
      await loadAll()
    } catch (e: any) {
      setError(e.message || "Errore nell'eliminazione.")
    }
  }

  // --- assignment helpers (operate on the editing draft) ---
  const isAssigned = (type: "user" | "group", id: string) =>
    editing?.assignments.some((a) => a.target_type === type && a.target_id === id) ?? false

  const toggleAssignment = (type: "user" | "group", id: string) => {
    if (!editing) return
    const exists = isAssigned(type, id)
    setEditing({
      ...editing,
      assignments: exists
        ? editing.assignments.filter((a) => !(a.target_type === type && a.target_id === id))
        : [...editing.assignments, { target_type: type, target_id: id, channel_id: editing.channel_id }],
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // ---------- EDIT / CREATE VIEW ----------
  if (editing) {
    return (
      <div className="max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-serif text-foreground">
            {isNew ? "Nuova firma" : "Modifica firma"}
          </h2>
          <Button variant="ghost" size="sm" onClick={cancelEdit}>
            <X className="w-4 h-4 mr-1" /> Annulla
          </Button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-destructive/10 text-destructive px-4 py-3 text-sm">{error}</div>
        )}

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Nome firma</label>
            <Input
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder="es. Firma Reception, Firma Direzione…"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Nome interno per riconoscere la firma. Non appare nelle email.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Contenuto</label>
            <SignatureEditor
              value={editing.html}
              onChange={(html) => setEditing({ ...editing, html })}
              placeholder="Scrivi o incolla la firma (testo, immagini, link)…"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Casella email (opzionale)</label>
              <select
                value={editing.channel_id ?? ""}
                onChange={(e) => setEditing({ ...editing, channel_id: e.target.value || null })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Tutte le caselle</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.display_name || c.email_address || c.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                Limita questa firma a una specifica casella in uscita.
              </p>
            </div>

            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer select-none py-2">
                <input
                  type="checkbox"
                  checked={editing.is_default}
                  onChange={(e) => setEditing({ ...editing, is_default: e.target.checked })}
                  className="h-4 w-4 rounded border-input"
                />
                <span className="text-sm text-foreground inline-flex items-center gap-1">
                  <Star className="w-3.5 h-3.5" /> Firma predefinita del tenant
                </span>
              </label>
            </div>
          </div>

          {/* Assignments */}
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-medium text-foreground mb-2 inline-flex items-center gap-1.5">
                <Users className="w-4 h-4" /> Gruppi
              </h3>
              <div className="space-y-1.5 max-h-56 overflow-auto rounded-lg border border-border p-2">
                {groups.length === 0 && <p className="text-xs text-muted-foreground p-2">Nessun gruppo.</p>}
                {groups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => toggleAssignment("group", g.id)}
                    className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                      isAssigned("group", g.id)
                        ? "bg-primary/10 text-foreground"
                        : "hover:bg-muted text-muted-foreground"
                    }`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: g.color || "#6b7280" }}
                      />
                      {g.name}
                    </span>
                    {isAssigned("group", g.id) && <Check className="w-4 h-4 text-primary" />}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-foreground mb-2 inline-flex items-center gap-1.5">
                <User className="w-4 h-4" /> Utenti
              </h3>
              <div className="space-y-1.5 max-h-56 overflow-auto rounded-lg border border-border p-2">
                {users.length === 0 && <p className="text-xs text-muted-foreground p-2">Nessun utente.</p>}
                {users.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleAssignment("user", u.id)}
                    className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                      isAssigned("user", u.id)
                        ? "bg-primary/10 text-foreground"
                        : "hover:bg-muted text-muted-foreground"
                    }`}
                  >
                    <span className="truncate">{u.name || u.email}</span>
                    {isAssigned("user", u.id) && <Check className="w-4 h-4 text-primary shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Priorità in uscita: firma assegnata all&apos;utente &gt; firma del gruppo &gt; firma predefinita del tenant.
          </p>

          <div className="flex gap-2 pt-2">
            <Button onClick={saveSignature} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
              Salva firma
            </Button>
            <Button variant="outline" onClick={cancelEdit} disabled={saving}>
              Annulla
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ---------- LIST VIEW ----------
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-serif text-foreground">Libreria firme</h2>
          <p className="text-sm text-muted-foreground">
            Crea firme riutilizzabili e assegnale a utenti e gruppi.
          </p>
        </div>
        <Button onClick={startNew}>
          <Plus className="w-4 h-4 mr-1" /> Nuova firma
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-destructive/10 text-destructive px-4 py-3 text-sm">{error}</div>
      )}

      {signatures.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <Mail className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-foreground font-medium mb-1">Nessuna firma ancora</p>
          <p className="text-sm text-muted-foreground mb-4">
            Crea la prima firma e assegnala ai tuoi operatori o gruppi.
          </p>
          <Button onClick={startNew}>
            <Plus className="w-4 h-4 mr-1" /> Crea firma
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {signatures.map((sig) => {
            const groupCount = sig.assignments.filter((a) => a.target_type === "group").length
            const userCount = sig.assignments.filter((a) => a.target_type === "user").length
            return (
              <div key={sig.id} className="rounded-xl border border-border bg-card p-4 flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-foreground truncate">{sig.name}</h3>
                      {sig.is_default && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5">
                          <Star className="w-3 h-3" /> Default
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                      {channelLabel(sig.channel_id) && (
                        <span className="inline-flex items-center gap-1">
                          <Mail className="w-3 h-3" /> {channelLabel(sig.channel_id)}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <Users className="w-3 h-3" /> {groupCount} gruppi
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <User className="w-3 h-3" /> {userCount} utenti
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => startEdit(sig)} aria-label="Modifica firma">
                      <Edit3 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteSignature(sig.id)}
                      aria-label="Elimina firma"
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <div
                  className="rounded-lg border border-border bg-background p-3 text-sm text-foreground overflow-hidden max-h-32 [&_img]:max-h-16 [&_img]:w-auto"
                  // Preview only; content is sanitized server-side on save.
                  dangerouslySetInnerHTML={{ __html: sig.html || "<span class='text-muted-foreground'>(vuota)</span>" }}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
