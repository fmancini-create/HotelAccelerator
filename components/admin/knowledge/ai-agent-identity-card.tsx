"use client"

import { useEffect, useState } from "react"
import { Bot, Check, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SignatureEditor } from "@/components/admin/signature-editor"

interface AiAgentIdentity {
  virtualUserId: string | null
  knowledgeBaseId: string
  displayName: string
  signatureHtml: string
  signatureText: string
  customSignature: boolean
}

export function AiAgentIdentityCard({
  knowledgeBaseId,
  knowledgeBaseName,
}: {
  knowledgeBaseId: string
  knowledgeBaseName: string
}) {
  const [identity, setIdentity] = useState<AiAgentIdentity | null>(null)
  const [displayName, setDisplayName] = useState("")
  const [signatureHtml, setSignatureHtml] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const automaticName = `Assistente ${knowledgeBaseName}`.slice(0, 80)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      setMessage(null)
      try {
        const response = await fetch(`/api/admin/ai/knowledge-bases/${knowledgeBaseId}/virtual-user`, {
          cache: "no-store",
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "Impossibile leggere l'utente virtuale IA")
        if (cancelled) return
        setIdentity(data)
        setDisplayName(data.displayName)
        setSignatureHtml(data.customSignature ? data.signatureHtml : "")
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Impossibile leggere l'utente virtuale IA")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [knowledgeBaseId])

  async function save() {
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      const response = await fetch(`/api/admin/ai/knowledge-bases/${knowledgeBaseId}/virtual-user`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: displayName, signature_html: signatureHtml }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Salvataggio non riuscito")
      setIdentity(data)
      setDisplayName(data.displayName)
      setSignatureHtml(data.customSignature ? data.signatureHtml : "")
      setMessage("Utente virtuale aggiornato. Le prossime risposte IA useranno questo nome e, nelle email, questa firma.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Salvataggio non riuscito")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-5 flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2">
          <Bot className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="font-semibold">Utente virtuale IA</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            È creato automaticamente insieme alla base <strong>{knowledgeBaseName}</strong>. Si comporta come un
            operatore identificabile nelle conversazioni, ma non ha login e non può acquisire permessi umani.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Caricamento utente virtuale...
        </div>
      ) : (
        <div className="space-y-5">
          <div className="space-y-2">
            <label htmlFor={`ai-agent-name-${knowledgeBaseId}`} className="text-sm font-medium">
              Nome utente virtuale
            </label>
            <Input
              id={`ai-agent-name-${knowledgeBaseId}`}
              value={displayName}
              maxLength={80}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder={automaticName}
            />
            <p className="text-xs text-muted-foreground">
              Il nome identifica questa specifica IA nella Inbox e nelle comunicazioni generate dalla base.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Firma email</label>
            <SignatureEditor
              value={signatureHtml}
              onChange={setSignatureHtml}
              placeholder={`Lascia vuoto per usare la firma automatica:\n${displayName || automaticName}\nAssistente virtuale\nNome struttura`}
            />
            {!signatureHtml.trim() && identity?.signatureHtml ? (
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Anteprima firma automatica</p>
                <div className="text-sm" dangerouslySetInnerHTML={{ __html: identity.signatureHtml }} />
              </div>
            ) : null}
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {message ? (
            <p className="flex items-center gap-2 text-sm text-ha-success-soft-foreground">
              <Check className="h-4 w-4" /> {message}
            </p>
          ) : null}

          <div className="flex justify-end">
            <Button onClick={() => void save()} disabled={saving || !displayName.trim()}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salva utente virtuale
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
