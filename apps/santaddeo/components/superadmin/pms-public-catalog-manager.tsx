"use client"

import { useState } from "react"
import useSWR from "swr"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Plus, Save, Trash2, ExternalLink } from "lucide-react"
import Link from "next/link"
import { PMS_STATUS_META, type PmsPublicEntry, type PmsPublicStatus } from "@/lib/pms-public-catalog"

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json())

const STATUS_BADGE: Record<PmsPublicStatus, string> = {
  connected: "bg-emerald-100 text-emerald-800 border border-emerald-200",
  certifying: "bg-amber-100 text-amber-800 border border-amber-200",
  upcoming: "bg-gray-100 text-gray-700 border border-gray-200",
}

export function PmsPublicCatalogManager() {
  const { data, isLoading, mutate } = useSWR<{ entries: PmsPublicEntry[] }>(
    "/api/superadmin/pms-public-catalog",
    fetcher,
  )
  const entries = data?.entries ?? []

  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [newStatus, setNewStatus] = useState<PmsPublicStatus>("connected")

  // Stato locale delle modifiche per riga.
  const [edits, setEdits] = useState<Record<string, Partial<PmsPublicEntry>>>({})

  const setEdit = (id: string, patch: Partial<PmsPublicEntry>) =>
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  const valueOf = <K extends keyof PmsPublicEntry>(entry: PmsPublicEntry, key: K): PmsPublicEntry[K] =>
    (edits[entry.id]?.[key] ?? entry[key]) as PmsPublicEntry[K]

  const isDirty = (entry: PmsPublicEntry) => {
    const e = edits[entry.id]
    if (!e) return false
    return Object.keys(e).some((k) => (e as any)[k] !== (entry as any)[k])
  }

  async function saveRow(entry: PmsPublicEntry) {
    setSavingId(entry.id)
    setError(null)
    try {
      const payload = { id: entry.id, ...edits[entry.id] }
      const res = await fetch("/api/superadmin/pms-public-catalog", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Errore di salvataggio")
      setEdits((prev) => {
        const next = { ...prev }
        delete next[entry.id]
        return next
      })
      await mutate()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSavingId(null)
    }
  }

  async function createEntry() {
    if (!newName.trim()) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch("/api/superadmin/pms-public-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), status: newStatus, display_order: 100 }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Errore di creazione")
      setNewName("")
      setNewStatus("connected")
      await mutate()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  async function deleteEntry(id: string) {
    if (!confirm("Eliminare questo gestionale dalla vetrina pubblica?")) return
    setSavingId(id)
    setError(null)
    try {
      const res = await fetch(`/api/superadmin/pms-public-catalog?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Errore di eliminazione")
      await mutate()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSavingId(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Vetrina pubblica gestionali (PMS)</CardTitle>
            <CardDescription>
              Questi dati alimentano la pagina pubblica e la dashboard venditori. Modifica stato, nota, ordine e
              visibilità.
            </CardDescription>
          </div>
          <Link
            href="/integrazioni"
            target="_blank"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            Apri pagina pubblica
            <ExternalLink className="h-4 w-4" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        {/* Form nuova voce */}
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-dashed border-border p-4">
          <div className="flex-1 min-w-48">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Nuovo gestionale</label>
            <Input
              placeholder="Es. Beddy"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createEntry()}
            />
          </div>
          <div className="w-44">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Stato</label>
            <Select value={newStatus} onValueChange={(v) => setNewStatus(v as PmsPublicStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PMS_STATUS_META) as PmsPublicStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {PMS_STATUS_META[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={createEntry} disabled={creating || !newName.trim()}>
            {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Aggiungi
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Gestionale</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead className="w-24">Ordine</TableHead>
                  <TableHead>Nota</TableHead>
                  <TableHead className="w-24 text-center">Pubblico</TableHead>
                  <TableHead className="w-32 text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => {
                  const status = valueOf(entry, "status")
                  return (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <Input
                          className="h-8"
                          value={valueOf(entry, "name") as string}
                          onChange={(e) => setEdit(entry.id, { name: e.target.value })}
                        />
                        <span className="mt-1 block text-xs text-muted-foreground">{entry.slug}</span>
                      </TableCell>
                      <TableCell>
                        <Select value={status} onValueChange={(v) => setEdit(entry.id, { status: v as PmsPublicStatus })}>
                          <SelectTrigger className="h-8 w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(PMS_STATUS_META) as PmsPublicStatus[]).map((s) => (
                              <SelectItem key={s} value={s}>
                                <span className="flex items-center gap-2">
                                  <Badge className={STATUS_BADGE[s]}>{PMS_STATUS_META[s].label}</Badge>
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          className="h-8 w-20"
                          value={String(valueOf(entry, "display_order") ?? 0)}
                          onChange={(e) => setEdit(entry.id, { display_order: Number(e.target.value) })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-8"
                          placeholder="—"
                          value={(valueOf(entry, "note") as string) ?? ""}
                          onChange={(e) => setEdit(entry.id, { note: e.target.value })}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={Boolean(valueOf(entry, "is_public"))}
                          onCheckedChange={(v) => setEdit(entry.id, { is_public: v })}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!isDirty(entry) || savingId === entry.id}
                            onClick={() => saveRow(entry)}
                          >
                            {savingId === entry.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Save className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:text-red-700"
                            disabled={savingId === entry.id}
                            onClick={() => deleteEntry(entry.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
