"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Check, Copy, Loader2, Reply, Send, Sparkles } from "lucide-react"
import { toast } from "sonner"

interface ReplyDialogProps {
  reviewId: string
  hotelId: string
  platform: string
  hasPublishedResponse: boolean
  initialDraft: string | null
  onSaved?: (draft: string) => void
  /** Invocata dopo la pubblicazione diretta riuscita sul canale. */
  onPublished?: (text: string) => void
}

/**
 * Assistente alla risposta di una recensione.
 *
 * Le recensioni sono importate via scraping (sola lettura), quindi qui NON si
 * pubblica sull'OTA: si genera una bozza con l'AI, la si rifinisce, la si copia
 * per incollarla nell'extranet del canale e la si salva nella piattaforma.
 */
export function ReviewReplyDialog({
  reviewId,
  hotelId,
  platform,
  hasPublishedResponse,
  initialDraft,
  onSaved,
  onPublished,
}: ReplyDialogProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(initialDraft || "")
  const [instructions, setInstructions] = useState("")
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [publishing, setPublishing] = useState(false)

  // Pubblicazione diretta: oggi solo Google, e solo se l'account è collegato.
  const isGoogle = platform.toLowerCase() === "google"
  const [gbConnected, setGbConnected] = useState<boolean | null>(null)

  useEffect(() => {
    if (!open || !isGoogle) return
    let cancelled = false
    setGbConnected(null)
    fetch(`/api/integrations/google-business?hotelId=${encodeURIComponent(hotelId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (!cancelled) setGbConnected(!!b?.connected)
      })
      .catch(() => {
        if (!cancelled) setGbConnected(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, isGoogle, hotelId])

  const publish = async () => {
    if (!draft.trim()) return
    setPublishing(true)
    try {
      const res = await fetch("/api/reviews/publish-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId, text: draft.trim() }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Errore nella pubblicazione")
      toast.success("Risposta pubblicata su Google")
      onPublished?.(draft.trim())
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nella pubblicazione")
    } finally {
      setPublishing(false)
    }
  }

  const generate = async () => {
    setGenerating(true)
    try {
      const res = await fetch("/api/reviews/reply-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId, instructions: instructions.trim() || undefined }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Errore nella generazione")
      setDraft(body.draft)
      toast.success("Bozza generata")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nella generazione")
    } finally {
      setGenerating(false)
    }
  }

  const save = async (status: "draft" | "copied") => {
    setSaving(true)
    try {
      const res = await fetch("/api/reviews/reply-draft", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId, draft, status }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Errore nel salvataggio")
      onSaved?.(draft)
      if (status === "draft") {
        toast.success("Bozza salvata")
        setOpen(false)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nel salvataggio")
    } finally {
      setSaving(false)
    }
  }

  const copy = async () => {
    if (!draft.trim()) return
    try {
      await navigator.clipboard.writeText(draft)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
      // Salva e marca come "copiata" per tracciare che è stata portata sull'extranet.
      void save("copied")
      toast.success("Risposta copiata negli appunti")
    } catch {
      toast.error("Impossibile copiare")
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5">
          <Reply className="h-3.5 w-3.5" />
          {initialDraft ? "Modifica risposta" : "Rispondi"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Rispondi alla recensione</DialogTitle>
          <DialogDescription>
            Genera una bozza con l&apos;AI, rifiniscila e copiala per pubblicarla nell&apos;extranet di{" "}
            {platform}.
            {hasPublishedResponse && " Una risposta risulta già pubblicata online."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Indicazioni per l&apos;AI (facoltative)
            </label>
            <Input
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Es. menziona la ristrutturazione della SPA, offri uno sconto…"
              className="h-8 text-xs"
            />
          </div>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={generate}
            disabled={generating}
            className="w-full gap-2"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {draft ? "Rigenera bozza" : "Genera bozza con AI"}
          </Button>

          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="La bozza generata apparirà qui. Puoi modificarla liberamente prima di copiarla."
            rows={8}
            className="text-sm leading-relaxed resize-none"
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={copy}
            disabled={!draft.trim()}
            className="gap-1.5"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copiata" : "Copia"}
          </Button>
          <Button
            type="button"
            variant={isGoogle && gbConnected ? "outline" : "default"}
            size="sm"
            onClick={() => save("draft")}
            disabled={saving || !draft.trim()}
            className="gap-1.5"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Salva bozza
          </Button>
          {isGoogle && gbConnected && (
            <Button
              type="button"
              size="sm"
              onClick={publish}
              disabled={publishing || !draft.trim()}
              className="gap-1.5"
            >
              {publishing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Pubblica su Google
            </Button>
          )}
        </DialogFooter>
        {isGoogle && gbConnected === false && (
          <p className="text-xs text-muted-foreground">
            Per pubblicare la risposta direttamente su Google, collega l&apos;account Google Business
            in Impostazioni → Avanzate. Per ora puoi copiare la risposta nell&apos;extranet.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
