"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { toast } from "@/components/ui/use-toast"
import { Ban, Hand, Bot, Send, MessagesSquare, Mail, Loader2 } from "lucide-react"

export type AiMode = "disabled" | "on_request" | "autopilot"
export interface AiSettings {
  mode: AiMode
  channels: { telegram: boolean; whatsapp: boolean; email: boolean }
  persona: string | null
  language: string
  confidence_threshold: number
  fallback_message: string | null
}

const MODES: { id: AiMode; title: string; description: string; icon: typeof Ban }[] = [
  {
    id: "disabled",
    title: "Disabilitato",
    description: "L'IA non interviene sulle conversazioni.",
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

const CHANNELS: { id: keyof AiSettings["channels"]; label: string; icon: typeof Send }[] = [
  { id: "telegram", label: "Telegram", icon: Send },
  { id: "whatsapp", label: "WhatsApp", icon: MessagesSquare },
  { id: "email", label: "Email", icon: Mail },
]

export function AiSettingsCard({ initial }: { initial: AiSettings }) {
  const [settings, setSettings] = useState<AiSettings>(initial)
  const [saving, setSaving] = useState(false)

  const update = <K extends keyof AiSettings>(key: K, value: AiSettings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }))

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/admin/ai/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(settings),
      })
      if (!res.ok) throw new Error((await res.json()).error || "Errore di salvataggio")
      toast({ title: "Impostazioni salvate", description: "La configurazione dell'assistente IA è stata aggiornata." })
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

  const confidencePct = Math.round(settings.confidence_threshold * 100)

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-foreground">Comportamento dell&apos;assistente</CardTitle>
        <CardDescription>Scegli come l&apos;IA deve gestire le conversazioni in arrivo.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {/* Mode selector */}
        <div className="grid gap-3 sm:grid-cols-3">
          {MODES.map((mode) => {
            const Icon = mode.icon
            const active = settings.mode === mode.id
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

        {/* Channels */}
        <div className="flex flex-col gap-3">
          <Label className="text-foreground">Canali attivi</Label>
          <p className="text-sm text-muted-foreground -mt-1">
            Su quali canali l&apos;IA può rispondere (usando la stessa base di conoscenza).
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
            {CHANNELS.map((ch) => {
              const Icon = ch.icon
              return (
                <div key={ch.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 sm:flex-1">
                  <span className="flex items-center gap-2 text-sm text-foreground">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {ch.label}
                  </span>
                  <Switch
                    checked={settings.channels[ch.id]}
                    onCheckedChange={(v) => update("channels", { ...settings.channels, [ch.id]: v })}
                    disabled={settings.mode === "disabled"}
                    className="data-[state=checked]:bg-ha-success"
                  />
                </div>
              )
            })}
          </div>
        </div>

        {/* Persona */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="persona" className="text-foreground">
            Tono e personalità (opzionale)
          </Label>
          <Textarea
            id="persona"
            value={settings.persona ?? ""}
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
              value={settings.language}
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
            value={settings.fallback_message ?? ""}
            onChange={(e) => update("fallback_message", e.target.value)}
            placeholder="Es. Grazie per il messaggio! Un membro del nostro staff ti risponderà a breve."
            rows={2}
            className="resize-none"
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salva impostazioni
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
