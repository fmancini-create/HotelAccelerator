"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Sparkles, Loader2, Check } from "lucide-react"
import {
  DEFAULT_REPLY_SETTINGS,
  SUPPORTED_FIXED_LANGUAGES,
  type ReviewReplySettings,
  type LengthPref,
  type LanguageMode,
} from "@/lib/reviews/reply-settings"

const LENGTH_OPTIONS: { value: LengthPref; label: string; hint: string }[] = [
  { value: "short", label: "Breve", hint: "2-3 frasi" },
  { value: "medium", label: "Media", hint: "4-6 frasi" },
  { value: "long", label: "Lunga", hint: "6-9 frasi" },
]

/**
 * Customizer delle risposte AI alle recensioni (hotel-scoped).
 * Carica le impostazioni alla prima apertura, salva via PUT /api/reviews/reply-settings.
 * Le impostazioni vengono poi applicate automaticamente dal generatore di bozze.
 */
export function ReviewReplySettingsDialog({ hotelId }: { hotelId: string }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [s, setS] = useState<ReviewReplySettings>(DEFAULT_REPLY_SETTINGS)

  useEffect(() => {
    if (!open || loaded) return
    setLoading(true)
    fetch(`/api/reviews/reply-settings?hotelId=${encodeURIComponent(hotelId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.settings) setS(d.settings)
        setLoaded(true)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open, loaded, hotelId])

  function update<K extends keyof ReviewReplySettings>(key: K, value: ReviewReplySettings[K]) {
    setS((prev) => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch("/api/reviews/reply-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId, settings: s }),
      })
      const d = await res.json()
      if (d.settings) setS(d.settings)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-2">
          <Sparkles className="h-4 w-4" />
          Impostazioni risposte AI
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-teal-600" />
            Impostazioni risposte AI
          </DialogTitle>
          <DialogDescription>
            Personalizza come l&apos;assistente AI scrive le bozze di risposta alle recensioni della
            tua struttura. Queste preferenze vengono applicate automaticamente a ogni nuova bozza.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Carico le impostazioni…
          </div>
        ) : (
          <div className="space-y-6 py-2">
            {/* Firma */}
            <div className="space-y-2">
              <Label htmlFor="rr-signature">Firma</Label>
              <Input
                id="rr-signature"
                placeholder="Es. Lo staff di Villa I Barronci"
                value={s.signature}
                onChange={(e) => update("signature", e.target.value)}
                maxLength={200}
              />
              <p className="text-xs text-muted-foreground">
                Come firmare le risposte. Lascia vuoto per una firma generica a nome della direzione.
              </p>
            </div>

            {/* Tono / stile */}
            <div className="space-y-2">
              <Label htmlFor="rr-tone">Tono e stile</Label>
              <Textarea
                id="rr-tone"
                placeholder="Es. caloroso e familiare, con un tocco di ironia gentile; dai del tu agli ospiti italiani."
                value={s.toneInstructions}
                onChange={(e) => update("toneInstructions", e.target.value)}
                maxLength={600}
                rows={3}
              />
            </div>

            {/* Tono base per rating */}
            <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="rr-keeptone">Adatta il tono alla valutazione</Label>
                <p className="text-xs text-muted-foreground">
                  Parte da un tono caloroso per le recensioni positive ed empatico per quelle
                  negative, poi applica le tue indicazioni sopra.
                </p>
              </div>
              <Switch
                id="rr-keeptone"
                checked={s.keepRatingTone}
                onCheckedChange={(v) => update("keepRatingTone", v)}
              />
            </div>

            {/* Lunghezza */}
            <div className="space-y-2">
              <Label>Lunghezza della risposta</Label>
              <div className="flex gap-2">
                {LENGTH_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    type="button"
                    size="sm"
                    variant={s.lengthPref === opt.value ? "default" : "outline"}
                    onClick={() => update("lengthPref", opt.value)}
                    className="flex-1 flex-col h-auto py-2"
                  >
                    <span>{opt.label}</span>
                    <span className="text-[10px] font-normal opacity-70">{opt.hint}</span>
                  </Button>
                ))}
              </div>
            </div>

            {/* Lingua */}
            <div className="space-y-2">
              <Label>Lingua della risposta</Label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Select
                  value={s.languageMode}
                  onValueChange={(v) => update("languageMode", v as LanguageMode)}
                >
                  <SelectTrigger className="sm:flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="guest">Stessa lingua dell&apos;ospite</SelectItem>
                    <SelectItem value="fixed">Lingua fissa</SelectItem>
                  </SelectContent>
                </Select>
                {s.languageMode === "fixed" && (
                  <Select value={s.fixedLanguage} onValueChange={(v) => update("fixedLanguage", v)}>
                    <SelectTrigger className="sm:w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_FIXED_LANGUAGES.map((l) => (
                        <SelectItem key={l.code} value={l.code}>
                          {l.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Di norma conviene rispondere nella lingua dell&apos;ospite. Imposta una lingua fissa
                solo se preferisci rispondere sempre allo stesso modo.
              </p>
            </div>

            {/* Emoji */}
            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="rr-emoji">Consenti emoji</Label>
                <p className="text-xs text-muted-foreground">
                  Se attivo, l&apos;AI può usare emoji con parsimonia.
                </p>
              </div>
              <Switch
                id="rr-emoji"
                checked={s.allowEmoji}
                onCheckedChange={(v) => update("allowEmoji", v)}
              />
            </div>

            {/* Linee guida libere */}
            <div className="space-y-2">
              <Label htmlFor="rr-guidelines">Linee guida sempre applicate</Label>
              <Textarea
                id="rr-guidelines"
                placeholder="Es. ringrazia per il soggiorno; invita a tornare; non offrire mai sconti; ricorda la posizione vicino al centro; non promettere interventi non confermati."
                value={s.guidelines}
                onChange={(e) => update("guidelines", e.target.value)}
                maxLength={1500}
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                Regole o messaggi che vuoi siano sempre rispettati in ogni risposta.
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
            Chiudi
          </Button>
          <Button onClick={save} disabled={saving || loading} className="gap-2">
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : saved ? (
              <Check className="h-4 w-4" />
            ) : null}
            {saved ? "Salvato" : "Salva impostazioni"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
