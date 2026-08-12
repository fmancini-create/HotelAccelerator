"use client"

import { useCallback, useEffect, useState } from "react"
import { Sparkles, Check, Pencil, X, Loader2, BookText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"

interface StoredDraft {
  id: string
  content: string
  metadata?: { ai_confidence?: number } | null
}

interface AiDraftPanelProps {
  conversationId: string
  /** Load text into the reply composer for manual editing before sending. */
  onUseText: (text: string) => void
  /** Called after a draft is approved and sent, so the thread can refresh. */
  onSent: () => void
}

/**
 * Self-contained AI assistant surface for a conversation. It surfaces a pending
 * draft produced in `on_request` mode (Approve / Edit / Discard) and lets the
 * operator generate a suggestion on demand. Kept isolated so the large inbox
 * page only needs to mount it, not absorb its logic.
 */
export function AiDraftPanel({ conversationId, onUseText, onSent }: AiDraftPanelProps) {
  const { toast } = useToast()
  const [draft, setDraft] = useState<StoredDraft | null>(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [approving, setApproving] = useState(false)

  const loadDraft = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/ai/draft?conversationId=${conversationId}`)
      if (res.ok) {
        const json = await res.json()
        setDraft(json.draft ?? null)
      }
    } catch {
      // silent: the assistant is best-effort
    } finally {
      setLoading(false)
    }
  }, [conversationId])

  useEffect(() => {
    setDraft(null)
    loadDraft()
  }, [loadDraft])

  const discardDraft = async (silent = false) => {
    if (!draft) return
    try {
      await fetch(`/api/admin/ai/draft?draftId=${draft.id}`, { method: "DELETE" })
      setDraft(null)
      if (!silent) toast({ description: "Bozza scartata" })
    } catch {
      if (!silent) toast({ variant: "destructive", description: "Impossibile scartare la bozza" })
    }
  }

  const approveDraft = async () => {
    if (!draft) return
    setApproving(true)
    try {
      const res = await fetch(`/api/inbox/${conversationId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft.content, sender_type: "agent", content_type: "text" }),
      })
      if (!res.ok) throw new Error("send failed")
      await discardDraft(true)
      toast({ description: "Risposta inviata" })
      onSent()
    } catch {
      toast({ variant: "destructive", description: "Invio non riuscito" })
    } finally {
      setApproving(false)
    }
  }

  const editDraft = async () => {
    if (!draft) return
    onUseText(draft.content)
    await discardDraft(true)
  }

  const generate = async () => {
    setGenerating(true)
    try {
      const res = await fetch("/api/admin/ai/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "generation failed")
      if (!json.text) {
        toast({
          description:
            "L'assistente non ha trovato informazioni sufficienti nella knowledge base per rispondere.",
        })
        return
      }
      onUseText(json.text)
      toast({ description: "Bozza generata: rivedila e invia." })
    } catch (e) {
      toast({ variant: "destructive", description: e instanceof Error ? e.message : "Generazione non riuscita" })
    } finally {
      setGenerating(false)
    }
  }

  // Pending draft (from on_request mode): show the review card.
  if (draft) {
    const confidence = draft.metadata?.ai_confidence
    return (
      <div className="mb-3 rounded-lg border border-ha-info-soft bg-ha-info-soft/40 p-3">
        <div className="mb-2 flex items-center gap-2 text-ha-info-soft-foreground">
          <Sparkles className="h-4 w-4" />
          <span className="text-sm font-medium">Risposta suggerita dall&apos;IA</span>
          {typeof confidence === "number" && (
            <span className="ml-auto text-xs opacity-70">Affidabilità {Math.round(confidence * 100)}%</span>
          )}
        </div>
        <p className="mb-3 whitespace-pre-wrap text-sm text-foreground">{draft.content}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={approveDraft} disabled={approving}>
            {approving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}
            Approva e invia
          </Button>
          <Button size="sm" variant="outline" onClick={editDraft} disabled={approving}>
            <Pencil className="mr-1 h-3.5 w-3.5" />
            Modifica
          </Button>
          <Button size="sm" variant="ghost" onClick={() => discardDraft()} disabled={approving}>
            <X className="mr-1 h-3.5 w-3.5" />
            Scarta
          </Button>
        </div>
      </div>
    )
  }

  // No pending draft: offer on-demand generation.
  return (
    <div className="mb-2 flex items-center gap-2">
      <Button size="sm" variant="outline" onClick={generate} disabled={generating || loading}>
        {generating ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
        Genera con IA
      </Button>
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <BookText className="h-3 w-3" />
        Usa la knowledge base della struttura
      </span>
    </div>
  )
}
