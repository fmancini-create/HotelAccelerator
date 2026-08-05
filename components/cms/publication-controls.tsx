"use client"

import { useEffect, useState } from "react"
import { ExternalLink, History, Loader2, Rocket, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

type Publication = { id: string; version: number; source_version_id: string | null; published_at: string }

export function CMSPublicationControls() {
  const [items, setItems] = useState<Publication[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [publicUrl, setPublicUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function load() {
    const response = await fetch("/api/cms/publications", { cache: "no-store" })
    const data = await response.json()
    if (response.ok) {
      setItems(data.publications)
      setActiveId(data.activeId)
      setPublicUrl(data.publicUrl)
    }
  }
  useEffect(() => { void load() }, [])

  async function publish(rollbackTo?: string) {
    if (!rollbackTo && !window.confirm("Pubblicare la bozza corrente sul sito pubblico?")) return
    if (rollbackTo && !window.confirm("Ripristinare questa versione come nuova pubblicazione?")) return
    setBusy(true); setMessage(null)
    try {
      const response = await fetch("/api/cms/publications", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rollbackTo ? { rollback_to: rollbackTo } : {}),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Pubblicazione non riuscita")
      setMessage(`Versione ${data.publication.version} pubblicata`)
      await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : "Errore") }
    finally { setBusy(false) }
  }

  return <div className="space-y-3 rounded-lg border bg-background p-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="font-medium">Pubblicazione</p><p className="text-xs text-muted-foreground">Versioni immutabili con rollback tracciato</p></div>
      <div className="flex flex-wrap gap-2">
        {publicUrl && <Button variant="outline" asChild><a href={publicUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Visualizza sito pubblico</a></Button>}
        <Button onClick={() => publish()} disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}Pubblica</Button>
      </div>
    </div>
    {message && <p className="text-sm">{message}</p>}
    {items.length > 0 && !publicUrl && <p className="text-sm text-amber-700">Versione pubblicata, ma il sito pubblico non è ancora disponibile: attiva il frontend e configura un sottodominio o un dominio.</p>}
    {items.length > 0 && <details><summary className="flex cursor-pointer items-center gap-2 text-sm"><History className="h-4 w-4" />Storico ({items.length})</summary>
      <div className="mt-2 space-y-2">{items.map((item) => <div key={item.id} className="flex items-center justify-between rounded border p-2 text-sm"><span>v{item.version} · {new Date(item.published_at).toLocaleString("it-IT")} {item.id === activeId && <Badge className="ml-2">Attiva</Badge>}</span>{item.id !== activeId && <Button size="sm" variant="outline" disabled={busy} onClick={() => publish(item.id)}><RotateCcw className="mr-1 h-3 w-3" />Ripristina</Button>}</div>)}</div>
    </details>}
  </div>
}
