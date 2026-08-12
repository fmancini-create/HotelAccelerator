"use client"

import { useState } from "react"
import { BookPlus, Check, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"

interface AddToKnowledgeButtonProps {
  content: string
  /** Optional context used to build a readable source title. */
  contextTitle?: string
}

/**
 * Marks a message (typically an operator's own reply) as knowledge, feeding it
 * back into the tenant's AI knowledge base for future answers. Self-contained
 * so the large inbox page only needs to render it.
 */
export function AddToKnowledgeButton({ content, contextTitle }: AddToKnowledgeButtonProps) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  const add = async () => {
    const text = content?.trim()
    if (!text) return
    setSaving(true)
    try {
      const res = await fetch("/api/admin/ai/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "conversation",
          title: contextTitle ? `Da conversazione: ${contextTitle}` : "Da conversazione",
          content: text,
        }),
      })
      if (!res.ok) throw new Error()
      setDone(true)
      toast({ description: "Aggiunto alla knowledge base" })
    } catch {
      toast({ variant: "destructive", description: "Impossibile aggiungere alla knowledge" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 flex-shrink-0"
      title={done ? "Aggiunto alla knowledge" : "Aggiungi alla knowledge base"}
      onClick={add}
      disabled={saving || done}
    >
      {saving ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : done ? (
        <Check className="h-4 w-4 text-ha-success-soft-foreground" />
      ) : (
        <BookPlus className="h-4 w-4 text-muted-foreground" />
      )}
    </Button>
  )
}
