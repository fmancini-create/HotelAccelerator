"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { toast } from "@/components/ui/use-toast"
import {
  FileText,
  Globe,
  FileUp,
  MessagesSquare,
  Trash2,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
} from "lucide-react"

interface KnowledgeSource {
  id: string
  type: "text" | "pdf" | "url" | "conversation"
  title: string | null
  url: string | null
  file_url: string | null
  status: "pending" | "processing" | "ready" | "error"
  error: string | null
  chunk_count: number
  last_indexed_at: string | null
  created_at: string
}

const TYPE_META: Record<KnowledgeSource["type"], { label: string; icon: typeof FileText }> = {
  text: { label: "Testo", icon: FileText },
  url: { label: "Sito web", icon: Globe },
  pdf: { label: "PDF", icon: FileUp },
  conversation: { label: "Conversazione", icon: MessagesSquare },
}

function StatusBadge({ status }: { status: KnowledgeSource["status"] }) {
  if (status === "ready")
    return (
      <Badge variant="outline" className="bg-ha-success-soft text-ha-success-soft-foreground border-ha-success-soft">
        <CheckCircle2 className="mr-1 h-3 w-3" /> Indicizzato
      </Badge>
    )
  if (status === "error")
    return (
      <Badge variant="outline" className="bg-ha-danger-soft text-ha-danger-soft-foreground border-ha-danger-soft">
        <AlertCircle className="mr-1 h-3 w-3" /> Errore
      </Badge>
    )
  if (status === "processing")
    return (
      <Badge variant="outline" className="bg-ha-brand-soft text-ha-brand-soft-foreground border-ha-brand-soft">
        <Loader2 className="mr-1 h-3 w-3 animate-spin" /> In elaborazione
      </Badge>
    )
  return (
    <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
      <Clock className="mr-1 h-3 w-3" /> In coda
    </Badge>
  )
}

export function KnowledgeSources({ initial }: { initial: KnowledgeSource[] }) {
  const [sources, setSources] = useState<KnowledgeSource[]>(initial)
  const [submitting, setSubmitting] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/ai/knowledge", { credentials: "include" })
      if (!res.ok) return
      const { sources: fresh } = await res.json()
      setSources(fresh)
    } catch {
      // silent; polling will retry
    }
  }, [])

  // Poll while any source is still pending/processing.
  useEffect(() => {
    const busy = sources.some((s) => s.status === "pending" || s.status === "processing")
    if (busy && !pollRef.current) {
      pollRef.current = setInterval(refresh, 3000)
    } else if (!busy && pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    return () => {
      if (pollRef.current && !busy) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [sources, refresh])

  const createSource = async (payload: Record<string, unknown>) => {
    setSubmitting(true)
    try {
      const res = await fetch("/api/admin/ai/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json()).error || "Errore")
      toast({ title: "Fonte aggiunta", description: "Indicizzazione avviata." })
      await refresh()
      return true
    } catch (err) {
      toast({
        title: "Errore",
        description: err instanceof Error ? err.message : "Impossibile aggiungere la fonte",
        variant: "destructive",
      })
      return false
    } finally {
      setSubmitting(false)
    }
  }

  const reindex = async (id: string) => {
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, status: "pending", error: null } : s)))
    try {
      const res = await fetch(`/api/admin/ai/knowledge/${id}/reindex`, { method: "POST", credentials: "include" })
      if (!res.ok) throw new Error((await res.json()).error || "Errore")
    } catch (err) {
      toast({
        title: "Errore",
        description: err instanceof Error ? err.message : "Reindicizzazione fallita",
        variant: "destructive",
      })
    }
  }

  const remove = async (id: string) => {
    const prev = sources
    setSources((s) => s.filter((x) => x.id !== id))
    try {
      const res = await fetch(`/api/admin/ai/knowledge/${id}`, { method: "DELETE", credentials: "include" })
      if (!res.ok) throw new Error()
    } catch {
      setSources(prev)
      toast({ title: "Errore", description: "Eliminazione fallita", variant: "destructive" })
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <AddSourceCard submitting={submitting} onText={createSource} onUrl={createSource} onPdf={createSource} />

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Fonti della conoscenza</CardTitle>
          <CardDescription>
            {sources.length === 0
              ? "Nessuna fonte ancora. Aggiungi testo, un sito web o un PDF per iniziare."
              : `${sources.length} font${sources.length === 1 ? "e" : "i"} · ${sources
                  .filter((s) => s.status === "ready")
                  .reduce((a, s) => a + s.chunk_count, 0)} frammenti indicizzati`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {sources.map((source) => {
            const Icon = TYPE_META[source.type].icon
            return (
              <div
                key={source.id}
                className="flex items-start gap-3 rounded-lg border border-border p-4"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground truncate">
                      {source.title || source.url || TYPE_META[source.type].label}
                    </span>
                    <StatusBadge status={source.status} />
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {TYPE_META[source.type].label}
                    {source.status === "ready" && ` · ${source.chunk_count} frammenti`}
                    {source.url && ` · ${source.url}`}
                  </p>
                  {source.status === "error" && source.error && (
                    <p className="mt-1 text-xs text-ha-danger-soft-foreground">{source.error}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => reindex(source.id)}
                    disabled={source.status === "processing" || source.status === "pending"}
                    title="Reindicizza"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(source.id)}
                    title="Elimina"
                    className="text-ha-danger-soft-foreground hover:text-ha-danger-soft-foreground"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}

function AddSourceCard({
  submitting,
  onText,
  onUrl,
  onPdf,
}: {
  submitting: boolean
  onText: (p: Record<string, unknown>) => Promise<boolean>
  onUrl: (p: Record<string, unknown>) => Promise<boolean>
  onPdf: (p: Record<string, unknown>) => Promise<boolean>
}) {
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [url, setUrl] = useState("")
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const submitText = async () => {
    if (!content.trim()) return
    const ok = await onText({ type: "text", title: title.trim() || null, content })
    if (ok) {
      setTitle("")
      setContent("")
    }
  }

  const submitUrl = async () => {
    if (!url.trim()) return
    const ok = await onUrl({ type: "url", url: url.trim(), title: title.trim() || null })
    if (ok) {
      setUrl("")
      setTitle("")
    }
  }

  const submitPdf = async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const up = await fetch("/api/admin/ai/knowledge/upload", { method: "POST", credentials: "include", body: fd })
      if (!up.ok) throw new Error((await up.json()).error || "Upload fallito")
      const { fileUrl, filename } = await up.json()
      await onPdf({ type: "pdf", file_url: fileUrl, title: filename })
    } catch (err) {
      toast({
        title: "Errore",
        description: err instanceof Error ? err.message : "Upload PDF fallito",
        variant: "destructive",
      })
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-foreground">Aggiungi conoscenza</CardTitle>
        <CardDescription>Alimenta l&apos;IA con le informazioni della tua struttura.</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="text">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="text">
              <FileText className="mr-2 h-4 w-4" /> Testo
            </TabsTrigger>
            <TabsTrigger value="url">
              <Globe className="mr-2 h-4 w-4" /> Sito web
            </TabsTrigger>
            <TabsTrigger value="pdf">
              <FileUp className="mr-2 h-4 w-4" /> PDF
            </TabsTrigger>
          </TabsList>

          <TabsContent value="text" className="mt-4 flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="text-title" className="text-foreground">
                Titolo (opzionale)
              </Label>
              <Input
                id="text-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Es. Orari check-in / check-out"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="text-content" className="text-foreground">
                Contenuto
              </Label>
              <Textarea
                id="text-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Inserisci FAQ, policy, descrizioni dei servizi, orari..."
                rows={6}
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={submitText} disabled={submitting || !content.trim()}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Aggiungi testo
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="url" className="mt-4 flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="url-input" className="text-foreground">
                URL della pagina
              </Label>
              <Input
                id="url-input"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.tuohotel.it/servizi"
                type="url"
              />
              <p className="text-xs text-muted-foreground">
                Leggeremo il testo della pagina e lo aggiungeremo alla conoscenza.
              </p>
            </div>
            <div className="flex justify-end">
              <Button onClick={submitUrl} disabled={submitting || !url.trim()}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Aggiungi pagina
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="pdf" className="mt-4 flex flex-col gap-3">
            <div
              className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-8 text-center"
            >
              <FileUp className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-foreground">Carica un PDF (listini, brochure, regolamenti)</p>
              <p className="text-xs text-muted-foreground">Massimo 20 MB</p>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) submitPdf(file)
                }}
              />
              <Button
                variant="outline"
                className="mt-2 bg-transparent"
                onClick={() => fileRef.current?.click()}
                disabled={uploading || submitting}
              >
                {(uploading || submitting) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Scegli file PDF
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
