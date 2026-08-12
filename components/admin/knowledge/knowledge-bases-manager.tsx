"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { toast } from "@/components/ui/use-toast"
import { AiSettingsCard, type KnowledgeBaseBehavior } from "./ai-settings-card"
import { KnowledgeSources } from "./knowledge-sources"
import { ChannelBasesAssignment, type ChannelRow } from "./channel-bases-assignment"
import { Database, Plus, Loader2, Ban, Hand, Bot, Trash2 } from "lucide-react"

export interface KnowledgeBaseSummary extends KnowledgeBaseBehavior {
  source_count: number
}

const MODE_META: Record<KnowledgeBaseBehavior["mode"], { label: string; icon: typeof Ban }> = {
  disabled: { label: "Disabilitato", icon: Ban },
  on_request: { label: "Su richiesta", icon: Hand },
  autopilot: { label: "Autopilota", icon: Bot },
}

export function KnowledgeBasesManager({
  initialBases,
  initialChannels,
}: {
  initialBases: KnowledgeBaseSummary[]
  initialChannels: ChannelRow[]
}) {
  const [bases, setBases] = useState<KnowledgeBaseSummary[]>(initialBases)
  const [selectedId, setSelectedId] = useState<string | null>(initialBases[0]?.id ?? null)
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const selected = useMemo(() => bases.find((b) => b.id === selectedId) ?? null, [bases, selectedId])
  const baseOptions = useMemo(() => bases.map((b) => ({ id: b.id, name: b.name })), [bases])

  const createBase = async () => {
    setCreating(true)
    try {
      const res = await fetch("/api/admin/ai/knowledge-bases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: `Nuova base ${bases.length + 1}`, mode: "disabled" }),
      })
      if (!res.ok) throw new Error((await res.json()).error || "Errore")
      const { base } = await res.json()
      const summary: KnowledgeBaseSummary = { ...base, source_count: 0 }
      setBases((prev) => [...prev, summary])
      setSelectedId(summary.id)
      toast({ title: "Base creata", description: "Configura il comportamento e aggiungi le fonti." })
    } catch (err) {
      toast({
        title: "Errore",
        description: err instanceof Error ? err.message : "Impossibile creare la base",
        variant: "destructive",
      })
    } finally {
      setCreating(false)
    }
  }

  const deleteBase = async (id: string) => {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/admin/ai/knowledge-bases/${id}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (!res.ok) throw new Error((await res.json()).error || "Errore")
      const remaining = bases.filter((b) => b.id !== id)
      setBases(remaining)
      if (selectedId === id) setSelectedId(remaining[0]?.id ?? null)
      toast({ title: "Base eliminata", description: "La base e le sue fonti sono state rimosse." })
    } catch (err) {
      toast({
        title: "Errore",
        description: err instanceof Error ? err.message : "Impossibile eliminare la base",
        variant: "destructive",
      })
    } finally {
      setDeletingId(null)
    }
  }

  const onBaseSaved = (updated: KnowledgeBaseBehavior) =>
    setBases((prev) => prev.map((b) => (b.id === updated.id ? { ...b, ...updated } : b)))

  return (
    <div className="flex flex-col gap-6">
      {/* Bases list */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-foreground">Basi di conoscenza</CardTitle>
            <CardDescription>
              Crea più basi (es. Reception, Ristorante, SPA) e collegale ai canali giusti.
            </CardDescription>
          </div>
          <Button onClick={createBase} disabled={creating} className="bg-primary text-primary-foreground shrink-0">
            {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Nuova base
          </Button>
        </CardHeader>
        <CardContent>
          {bases.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessuna base ancora. Crea la prima per iniziare.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {bases.map((b) => {
                const mode = MODE_META[b.mode]
                const ModeIcon = mode.icon
                const active = b.id === selectedId
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setSelectedId(b.id)}
                    aria-pressed={active}
                    className={`flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors ${
                      active
                        ? "border-primary bg-ha-brand-soft ring-1 ring-primary"
                        : "border-border bg-card hover:border-primary/40"
                    }`}
                  >
                    <span className="flex w-full items-center gap-2">
                      <Database className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-medium text-foreground truncate flex-1">{b.name}</span>
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
                        <ModeIcon className="mr-1 h-3 w-3" />
                        {mode.label}
                      </Badge>
                      <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
                        {b.source_count} font{b.source_count === 1 ? "e" : "i"}
                      </Badge>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected base panel */}
      {selected && (
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-foreground text-balance">
              Base selezionata: {selected.name}
            </h2>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="bg-transparent text-ha-danger-soft-foreground">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Elimina base
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Eliminare questa base?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Verranno rimosse la base &quot;{selected.name}&quot;, tutte le sue fonti indicizzate e i suoi
                    collegamenti ai canali. L&apos;azione non è reversibile.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteBase(selected.id)}
                    disabled={deletingId === selected.id}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deletingId === selected.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Elimina
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          <AiSettingsCard base={selected} onSaved={onBaseSaved} />
          <KnowledgeSources key={selected.id} knowledgeBaseId={selected.id} />
        </div>
      )}

      {/* Channel assignment */}
      <ChannelBasesAssignment channels={initialChannels} bases={baseOptions} />
    </div>
  )
}
