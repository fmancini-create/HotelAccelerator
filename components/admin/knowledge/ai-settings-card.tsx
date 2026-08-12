"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { toast } from "@/components/ui/use-toast"
import { Ban, Hand, Bot, Loader2, AlertCircle } from "lucide-react"

export type AiMode = "disabled" | "on_request" | "autopilot"

export interface KnowledgeBaseBehavior {
  id: string
  name: string
  description: string | null
  mode: AiMode
  persona: string | null
  language: string
  confidence_threshold: number
  fallback_message: string | null
}

const MODES: { id: AiMode; title: string; description: string; icon: typeof Ban }[] = [
  {
    id: "disabled",
    title: "Disabilitato",
    description: "L'IA non interviene sulle conversazioni dei canali che usano questa base.",
    icon: Ban,
  },
  {
    id: "on_request",
    title: "Su richiesta",
    description: "L'IA prepara una bozza di risposta; l'operatore la approva prima dell'invio.",
    icon: Hand,
  },
  {
    id: "autopilot",
    title: "Autopilota",
    description: "L'IA risponde automaticamente ai clienti quando è sicura della risposta.",
    icon: Bot,
  },
]

export function AiSettingsCard({
  base,
  onSaved,
}: {
  base: KnowledgeBaseBehavior
  onSaved?: (base: KnowledgeBaseBehavior) => void
}) {
  const [form, setForm] = useState<KnowledgeBaseBehavior>(base)
  const [saved, setSaved] = useState<KnowledgeBaseBehavior>(base)
  const [saving, setSaving] = useState(false)

  // Reset the editor when the selected base changes.
  useEffect(() => {
    setForm(base)
    setSaved(base)
  }, [base])

  const dirty = JSON.stringify(form) !== JSON.stringify(saved)

  const update = <K extends keyof KnowledgeBaseBehavior>(key: K, value: KnowledgeBaseBehavior[K]) =>
    setForm((s) => ({ ...s, [key]: value }))

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/ai/knowledge-bases/${form.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          mode: form.mode,
          persona: form.persona,
          language: form.language,
          confidence_threshold: form.confidence_threshold,
          fallback_message: form.fallback_message,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || "Errore di salvataggio")
      const data = await res.json().catch(() => null)
      const persisted = (data?.base as KnowledgeBaseBehavior | undefined) ?? form
      setForm(persisted)
      setSaved(persisted)
      onSaved?.(persisted)
      toast({ title: "Base aggiornata", description: "Il comportamento della base è stato salvato." })
    } catch (err) {
      toast({
        title: "Errore",
        description: err instanceof Error ? err.message : "Impossibile salvare",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const confidencePct = Math.round(form.confidence_threshold * 100)

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-foreground">Comportamento della base</CardTitle>
        <CardDescription>
          Nome, tono e modalità di questa base. I canali collegati a questa base come primaria erediteranno queste
          impostazioni.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {/* Name + description */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="base-name" className="text-foreground">
              Nome della base
            </Label>
            <Input
              id="base-name"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="Es. Reception, Ristorante, SPA"
              maxLength={200}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="base-desc" className="text-foreground">
              Descrizione (opzionale)
            </Label>
            <Input
              id="base-desc"
              value={form.description ?? ""}
              onChange={(e) => update("description", e.target.value)}
              placeholder="A cosa serve questa base"
              maxLength={1000}
            />
          </div>
        </div>

        {form.mode !== saved.mode && (
          <div className="flex items-center gap-2 rounded-lg border border-ha-warning/40 bg-ha-warning/10 px-3 py-2 text-sm text-foreground">
            <AlertCircle className="h-4 w-4 shrink-0 text-ha-warning" />
            <span>
              Hai selezionato una nuova modalità ma non è ancora attiva. Premi <strong>Salva</strong> per applicarla.
            </span>
          </div>
        )}

        {/* Mode selector */}
        <div className="grid gap-3 sm:grid-cols-3">
          {MODES.map((mode) => {
            const Icon = mode.icon
            const active = form.mode === mode.id
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => update("mode", mode.id)}
                aria-pressed={active}
                className={`flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors ${
                  active
                    ? "border-primary bg-ha-brand-soft ring-1 ring-primary"
                    : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                    active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="font-medium text-foreground">{mode.title}</span>
                <span className="text-xs text-muted-foreground leading-relaxed">{mode.description}</span>
              </button>
            )
          })}
        </div>

        {/* Persona */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="persona" className="text-foreground">
            Tono e personalità (opzionale)
          </Label>
          <Textarea
            id="persona"
            value={form.persona ?? ""}
            onChange={(e) => update("persona", e.target.value)}
            placeholder="Es. Sei l'assistente cordiale dell'Hotel Belvedere. Rispondi con tono caloroso e professionale, dando del Lei."
            rows={3}
            className="resize-none"
          />
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          {/* Language */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="language" className="text-foreground">
              Lingua predefinita
            </Label>
            <Input
              id="language"
              value={form.language}
              onChange={(e) => update("language", e.target.value)}
              placeholder="it"
              maxLength={10}
            />
            <p className="text-xs text-muted-foreground">
              L&apos;IA risponde comunque nella lingua del cliente quando la riconosce.
            </p>
          </div>

          {/* Confidence threshold */}
          <div className="flex flex-col gap-2">
            <Label className="text-foreground">
              Soglia di confidenza: <span className="font-mono">{confidencePct}%</span>
            </Label>
            <Slider
              value={[confidencePct]}
              min={0}
              max={95}
              step={5}
              onValueChange={([v]) => update("confidence_threshold", v / 100)}
              className="py-2"
            />
            <p className="text-xs text-muted-foreground">
              Sotto questa soglia l&apos;IA non risponde e lascia la conversazione all&apos;operatore.
            </p>
          </div>
        </div>

        {/* Fallback */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="fallback" className="text-foreground">
            Messaggio di fallback (opzionale)
          </Label>
          <Textarea
            id="fallback"
            value={form.fallback_message ?? ""}
            onChange={(e) => update("fallback_message", e.target.value)}
            placeholder="Es. Grazie per il messaggio! Un membro del nostro staff ti risponderà a breve."
            rows={2}
            className="resize-none"
          />
        </div>

        <div className="flex items-center justify-end gap-3">
          {dirty && (
            <span className="flex items-center gap-1.5 text-sm text-ha-warning">
              <AlertCircle className="h-4 w-4" />
              Modifiche non salvate
            </span>
          )}
          <Button
            onClick={save}
            disabled={saving || !dirty}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {dirty ? "Salva" : "Salvato"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
