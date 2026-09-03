"use client"

import { useEffect, useState } from "react"
import { Bot, Check, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SignatureEditor } from "@/components/admin/signature-editor"

interface AiAgentIdentity {
  displayName: string
  signatureHtml: string
  signatureText: string
  customSignature: boolean
}

export function AiAgentIdentityCard() {
  const [identity, setIdentity] = useState<AiAgentIdentity | null>(null)
  const [displayName, setDisplayName] = useState("Sofia")
  const [signatureHtml, setSignatureHtml] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/admin/ai-agent", { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Impossibile leggere l'agente IA")
      setIdentity(data)
      setDisplayName(data.displayName)
      setSignatureHtml(data.customSignature ? data.signatureHtml : "")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossibile leggere l'agente IA")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function save() {
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      const response = await fetch("/api/admin/ai-agent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: displayName, signature_html: signatureHtml }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Salvataggio non riuscito")
      setIdentity(data)
      setDisplayName(data.displayName)
      setSignatureHtml(data.customSignature ? data.signatureHtml : "")
      setMessage("Agente IA aggiornato. Le prossime email automatiche useranno questa identita e questa firma.")
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
          <h2 className="font-semibold">Operatore IA</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            E un operatore virtuale del tenant: non ha login e non puo acquisire permessi umani. Il nome e la firma
            vengono usati nelle comunicazioni automatiche.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Caricamento agente IA...
        </div>
      ) : (
        <div className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="ai-agent-name" className="text-sm font-medium">Nome agente</label>
            <Input
              id="ai-agent-name"
              value={displayName}
              maxLength={80}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Sofia"
            />
            <p className="text-xs text-muted-foreground">
              Default: Sofia. Il nome e personalizzabile per ogni struttura.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Firma email</label>
            <SignatureEditor
              value={signatureHtml}
              onChange={setSignatureHtml}
              placeholder={`Lascia vuoto per usare la firma automatica:\n${displayName || "Sofia"}\nAssistente virtuale\nNome struttura`}
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
              Salva agente IA
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
