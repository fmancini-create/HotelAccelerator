"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AlertCircle, ChevronLeft, ChevronRight, Loader2, RefreshCw, Search, Send } from "lucide-react"
import { format } from "date-fns"
import { it } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Mailbox = {
  id: string
  email: string | null
  name: string | null
  reconnectRequired?: boolean
}

type GmailThread = {
  id: string
  subject: string
  snippet: string
  from: { name: string; email: string }
  internalDate: number
  date: string
  messagesCount: number
}

type GmailMessage = {
  id: string
  subject: string
  from: { name: string; email: string }
  to: string
  content: string
  content_type: string
  snippet: string
  sender_type: "customer" | "agent"
  internalDate: number
  gmail_internal_date: string
}

function sanitizeEmailHtml(html: string) {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/\s*on\w+\s*=\s*[^\s>]*/gi, "")
    .replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"')
}

function MessageBody({ message }: { message: GmailMessage }) {
  const content = message.content || message.snippet || ""
  const isHtml = message.content_type === "text/html" || /<[a-z][\s\S]*>/i.test(content)

  if (!content.trim()) {
    return <p className="text-sm italic text-muted-foreground">(Nessun contenuto)</p>
  }

  if (!isHtml) {
    return <div className="whitespace-pre-wrap break-words text-sm leading-6">{content}</div>
  }

  const document = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank"><style>html,body{margin:0;padding:0;background:#fff;color:#202124;font-family:Arial,sans-serif;font-size:14px;line-height:1.5}img{max-width:100%;height:auto}table{max-width:100%}a{color:#1a73e8}</style></head><body>${sanitizeEmailHtml(content)}</body></html>`

  return (
    <iframe
      title={`Contenuto email ${message.id}`}
      srcDoc={document}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      className="h-[420px] w-full border-0 bg-white"
    />
  )
}

function formatThreadDate(value: number) {
  if (!value || Number.isNaN(value)) return ""
  return format(new Date(value), "dd MMM yyyy, HH:mm", { locale: it })
}

export default function SentInboxPage() {
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([])
  const [mailboxId, setMailboxId] = useState("")
  const [threads, setThreads] = useState<GmailThread[]>([])
  const [selectedThread, setSelectedThread] = useState<GmailThread | null>(null)
  const [messages, setMessages] = useState<GmailMessage[]>([])
  const [search, setSearch] = useState("")
  const [appliedSearch, setAppliedSearch] = useState("")
  const [pageToken, setPageToken] = useState<string | null>(null)
  const [previousTokens, setPreviousTokens] = useState<Array<string | null>>([])
  const [nextPageToken, setNextPageToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [threadLoading, setThreadLoading] = useState(false)
  const [error, setError] = useState("")
  const requestRef = useRef(0)

  const currentMailbox = mailboxes.find((mailbox) => mailbox.id === mailboxId) || null

  const loadMailboxes = useCallback(async () => {
    try {
      const response = await fetch("/api/gmail/channels", { cache: "no-store" })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "Impossibile leggere le caselle email")

      const next = (data.channels || []) as Mailbox[]
      setMailboxes(next)
      setMailboxId((current) => (current && next.some((mailbox) => mailbox.id === current) ? current : next[0]?.id || ""))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Impossibile leggere le caselle email")
      setLoading(false)
    }
  }, [])

  const loadThreads = useCallback(async () => {
    if (!mailboxId) {
      setThreads([])
      setLoading(false)
      return
    }

    const requestId = ++requestRef.current
    setLoading(true)
    setError("")

    try {
      const params = new URLSearchParams({ channelId: mailboxId, labelId: "SENT" })
      if (pageToken) params.set("pageToken", pageToken)
      if (appliedSearch.trim()) params.set("q", appliedSearch.trim())

      const response = await fetch(`/api/gmail/threads?${params}`, { cache: "no-store" })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "Impossibile leggere la posta inviata")
      if (requestId !== requestRef.current) return

      setThreads(data.threads || [])
      setNextPageToken(data.nextPageToken || null)
    } catch (reason) {
      if (requestId !== requestRef.current) return
      setThreads([])
      setNextPageToken(null)
      setError(reason instanceof Error ? reason.message : "Impossibile leggere la posta inviata")
    } finally {
      if (requestId === requestRef.current) setLoading(false)
    }
  }, [mailboxId, pageToken, appliedSearch])

  const openThread = useCallback(
    async (thread: GmailThread) => {
      if (!mailboxId) return
      setSelectedThread(thread)
      setMessages([])
      setThreadLoading(true)
      setError("")

      try {
        const response = await fetch(
          `/api/gmail/threads/${encodeURIComponent(thread.id)}?channelId=${encodeURIComponent(mailboxId)}`,
          { cache: "no-store" },
        )
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || "Impossibile aprire il messaggio inviato")
        setMessages(data.messages || [])
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Impossibile aprire il messaggio inviato")
      } finally {
        setThreadLoading(false)
      }
    },
    [mailboxId],
  )

  useEffect(() => {
    void loadMailboxes()
  }, [loadMailboxes])

  useEffect(() => {
    setPageToken(null)
    setPreviousTokens([])
    setSelectedThread(null)
    setMessages([])
  }, [mailboxId])

  useEffect(() => {
    void loadThreads()
  }, [loadThreads])

  useEffect(() => {
    const interval = window.setInterval(() => void loadThreads(), 30_000)
    return () => window.clearInterval(interval)
  }, [loadThreads])

  const applySearch = () => {
    setPageToken(null)
    setPreviousTokens([])
    setSelectedThread(null)
    setMessages([])
    setAppliedSearch(search)
  }

  const nextPage = () => {
    if (!nextPageToken) return
    setPreviousTokens((current) => [...current, pageToken])
    setPageToken(nextPageToken)
    setSelectedThread(null)
    setMessages([])
  }

  const previousPage = () => {
    if (!previousTokens.length) return
    const copy = [...previousTokens]
    const previous = copy.pop() ?? null
    setPreviousTokens(copy)
    setPageToken(previous)
    setSelectedThread(null)
    setMessages([])
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex flex-wrap items-center gap-3 border-b px-3 py-3 sm:px-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" aria-hidden />
            <h1 className="text-lg font-semibold">Posta inviata</h1>
          </div>
          <p className="hidden text-xs text-muted-foreground md:block">
            Messaggi inviati dalla casella collegata. Non vengono conteggiati come messaggi cliente nella Inbox operativa.
          </p>
        </div>

        <label className="ml-auto flex min-w-0 items-center gap-2 text-sm">
          <span className="hidden text-muted-foreground sm:inline">Account</span>
          <select
            value={mailboxId}
            onChange={(event) => setMailboxId(event.target.value)}
            className="h-9 max-w-[300px] rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            aria-label="Seleziona account email"
          >
            {mailboxes.length === 0 ? <option value="">Nessuna casella</option> : null}
            {mailboxes.map((mailbox) => (
              <option key={mailbox.id} value={mailbox.id}>
                {mailbox.email || mailbox.name || mailbox.id}
              </option>
            ))}
          </select>
        </label>

        <Button variant="ghost" size="icon" onClick={() => void loadThreads()} aria-label="Aggiorna posta inviata" title="Aggiorna">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {currentMailbox?.reconnectRequired ? (
        <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900" role="alert">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
          Questa casella richiede una nuova autorizzazione dalle impostazioni Email.
        </div>
      ) : null}

      {error ? (
        <div className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive" role="alert">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
          {error}
        </div>
      ) : null}

      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2 sm:px-4">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") applySearch()
            }}
            placeholder="Cerca nella posta inviata"
            className="pl-9"
          />
        </div>
        <Button variant="secondary" onClick={applySearch}>Cerca</Button>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <section className={`${selectedThread ? "hidden md:flex" : "flex"} min-w-0 flex-1 flex-col border-r md:max-w-[470px]`}>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {loading ? (
              <div className="flex flex-1 items-center justify-center p-8 text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Caricamento posta inviata…
              </div>
            ) : threads.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
                <Send className="h-8 w-8" aria-hidden />
                <p className="font-medium">Nessun messaggio inviato</p>
                <p className="text-sm">La cartella mostra i thread con etichetta SENT della casella selezionata.</p>
              </div>
            ) : (
              threads.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => void openThread(thread)}
                  className={`border-b px-4 py-3 text-left transition-colors hover:bg-muted/60 ${selectedThread?.id === thread.id ? "bg-primary/5" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <Send className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="truncate text-sm font-semibold">{thread.subject || "(nessun oggetto)"}</p>
                        <span className="shrink-0 text-[11px] text-muted-foreground">{formatThreadDate(thread.internalDate)}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{thread.snippet || "Nessuna anteprima"}</p>
                      {thread.messagesCount > 1 ? (
                        <p className="mt-1 text-xs text-muted-foreground">{thread.messagesCount} messaggi nel thread</p>
                      ) : null}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="flex shrink-0 items-center justify-between border-t px-3 py-2">
            <Button variant="ghost" size="sm" onClick={previousPage} disabled={!previousTokens.length || loading}>
              <ChevronLeft className="mr-1 h-4 w-4" /> Precedenti
            </Button>
            <Button variant="ghost" size="sm" onClick={nextPage} disabled={!nextPageToken || loading}>
              Successive <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </section>

        <section className={`${selectedThread ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col overflow-hidden`}>
          {!selectedThread ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
              <Send className="h-8 w-8" aria-hidden />
              <p className="font-medium">Seleziona un messaggio inviato</p>
            </div>
          ) : (
            <>
              <div className="flex shrink-0 items-center gap-3 border-b px-4 py-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  onClick={() => {
                    setSelectedThread(null)
                    setMessages([])
                  }}
                  aria-label="Torna alla lista"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="min-w-0">
                  <h2 className="truncate font-semibold">{selectedThread.subject || "(nessun oggetto)"}</h2>
                  <p className="text-xs text-muted-foreground">{formatThreadDate(selectedThread.internalDate)}</p>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {threadLoading ? (
                  <div className="flex items-center justify-center p-10 text-muted-foreground">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Apertura messaggio…
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((message) => (
                      <article key={message.id} className="rounded-lg border bg-background p-4 shadow-sm">
                        <div className="mb-4 border-b pb-3 text-sm">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <p className="font-semibold">{message.from.name || message.from.email || "Mittente"}</p>
                            <span className="text-xs text-muted-foreground">{formatThreadDate(message.internalDate)}</span>
                          </div>
                          <p className="mt-1 break-all text-xs text-muted-foreground">Da: {message.from.email}</p>
                          <p className="mt-1 break-all text-xs text-muted-foreground">A: {message.to || "—"}</p>
                        </div>
                        <MessageBody message={message} />
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
