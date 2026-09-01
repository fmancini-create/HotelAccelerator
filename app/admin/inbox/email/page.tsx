"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertCircle,
  Archive,
  ChevronLeft,
  ChevronRight,
  FileText,
  Inbox,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  Send,
  Star,
  Tag,
  Trash2,
} from "lucide-react"
import { format } from "date-fns"
import { it } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

type Mailbox = {
  id: string
  email: string | null
  name: string | null
  reconnectRequired?: boolean
  lastSyncError?: string | null
}

type GmailLabel = {
  id: string
  name: string
  type: "system" | "user" | string
  messagesTotal: number
  messagesUnread: number
  threadsTotal: number
  threadsUnread: number
  color?: string | null
}

type GmailThread = {
  id: string
  subject: string
  snippet: string
  from: { name: string; email: string }
  labels: string[]
  isUnread: boolean
  isStarred: boolean
  internalDate: number
  date: string
  messagesCount: number
}

type GmailMessage = {
  id: string
  gmail_labels: string[]
  gmail_internal_date: string
  subject: string
  from: { name: string; email: string }
  to: string
  content: string
  content_type: string
  snippet: string
  sender_type: "customer" | "agent"
}

type FolderDefinition = {
  id: string
  label: string
  icon: typeof Inbox
}

const PRIMARY_FOLDERS: FolderDefinition[] = [
  { id: "INBOX", label: "Posta in arrivo", icon: Inbox },
  { id: "STARRED", label: "Speciali", icon: Star },
  { id: "SENT", label: "Posta inviata", icon: Send },
  { id: "DRAFT", label: "Bozze", icon: FileText },
  { id: "ALL", label: "Tutta la posta", icon: Mail },
  { id: "SPAM", label: "Spam", icon: AlertCircle },
  { id: "TRASH", label: "Cestino", icon: Trash2 },
]

const PRIMARY_IDS = new Set(PRIMARY_FOLDERS.filter((folder) => folder.id !== "ALL").map((folder) => folder.id))

const SYSTEM_LABEL_NAMES: Record<string, string> = {
  IMPORTANT: "Importanti",
  CHAT: "Chat",
  CATEGORY_PERSONAL: "Personale",
  CATEGORY_SOCIAL: "Social",
  CATEGORY_PROMOTIONS: "Promozioni",
  CATEGORY_UPDATES: "Aggiornamenti",
  CATEGORY_FORUMS: "Forum",
}

function safeHtml(html: string) {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/\s*on\w+\s*=\s*[^\s>]*/gi, "")
    .replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"')
}

function MessageBody({ message }: { message: GmailMessage }) {
  const isHtml = message.content_type === "text/html" || /<[a-z][\s\S]*>/i.test(message.content || "")
  if (!message.content?.trim()) return <p className="text-sm italic text-muted-foreground">(Nessun contenuto)</p>
  if (!isHtml) return <div className="whitespace-pre-wrap break-words text-sm leading-6">{message.content}</div>

  const document = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank"><style>html,body{margin:0;padding:0;background:#fff;color:#202124;font-family:Arial,sans-serif;font-size:14px;line-height:1.5}img{max-width:100%;height:auto}table{max-width:100%}a{color:#1a73e8}</style></head><body>${safeHtml(message.content)}</body></html>`
  return (
    <iframe
      title={`Contenuto email ${message.id}`}
      srcDoc={document}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      className="h-[420px] w-full border-0 bg-white"
    />
  )
}

function labelDisplayName(label: GmailLabel) {
  return SYSTEM_LABEL_NAMES[label.id] || label.name || label.id
}

export default function EmailMailboxPage() {
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([])
  const [mailboxId, setMailboxId] = useState("")
  const [systemLabels, setSystemLabels] = useState<GmailLabel[]>([])
  const [userLabels, setUserLabels] = useState<GmailLabel[]>([])
  const [folderId, setFolderId] = useState("INBOX")
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

  const currentMailbox = useMemo(() => mailboxes.find((mailbox) => mailbox.id === mailboxId) || null, [mailboxes, mailboxId])
  const extraSystemLabels = useMemo(
    () => systemLabels.filter((label) => !PRIMARY_IDS.has(label.id) && label.id !== "UNREAD"),
    [systemLabels],
  )

  const folderCount = useCallback(
    (id: string) => {
      const label = systemLabels.find((item) => item.id === id) || userLabels.find((item) => item.id === id)
      return label?.threadsUnread || 0
    },
    [systemLabels, userLabels],
  )

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
    }
  }, [])

  const loadLabels = useCallback(async (channelId: string) => {
    if (!channelId) return
    try {
      const response = await fetch(`/api/gmail/labels?channelId=${encodeURIComponent(channelId)}`, { cache: "no-store" })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "Impossibile leggere cartelle ed etichette")
      setSystemLabels(data.systemLabels || [])
      setUserLabels(data.labels || [])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Impossibile leggere cartelle ed etichette")
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
      const params = new URLSearchParams({ channelId: mailboxId, labelId: folderId })
      if (pageToken) params.set("pageToken", pageToken)
      if (appliedSearch.trim()) params.set("q", appliedSearch.trim())
      const response = await fetch(`/api/gmail/threads?${params}`, { cache: "no-store" })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "Impossibile leggere questa cartella")
      if (requestId !== requestRef.current) return
      setThreads(data.threads || [])
      setNextPageToken(data.nextPageToken || null)
    } catch (reason) {
      if (requestId !== requestRef.current) return
      setThreads([])
      setNextPageToken(null)
      setError(reason instanceof Error ? reason.message : "Impossibile leggere questa cartella")
    } finally {
      if (requestId === requestRef.current) setLoading(false)
    }
  }, [mailboxId, folderId, pageToken, appliedSearch])

  const openThread = useCallback(async (thread: GmailThread) => {
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
      if (!response.ok) throw new Error(data.error || "Impossibile aprire il messaggio")
      setMessages(data.messages || [])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Impossibile aprire il messaggio")
    } finally {
      setThreadLoading(false)
    }
  }, [mailboxId])

  useEffect(() => {
    void loadMailboxes()
  }, [loadMailboxes])

  useEffect(() => {
    if (!mailboxId) return
    setFolderId("INBOX")
    setPageToken(null)
    setPreviousTokens([])
    setSelectedThread(null)
    setMessages([])
    void loadLabels(mailboxId)
  }, [mailboxId, loadLabels])

  useEffect(() => {
    void loadThreads()
  }, [loadThreads])

  useEffect(() => {
    const interval = window.setInterval(() => void loadThreads(), 30_000)
    return () => window.clearInterval(interval)
  }, [loadThreads])

  const selectFolder = (id: string) => {
    setFolderId(id)
    setPageToken(null)
    setPreviousTokens([])
    setSelectedThread(null)
    setMessages([])
  }

  const applySearch = () => {
    setPageToken(null)
    setPreviousTokens([])
    setSelectedThread(null)
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

  const folderOptions = [
    ...PRIMARY_FOLDERS.map((folder) => ({ id: folder.id, label: folder.label })),
    ...extraSystemLabels.map((label) => ({ id: label.id, label: labelDisplayName(label) })),
    ...userLabels.map((label) => ({ id: label.id, label: label.name })),
  ]

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex flex-wrap items-center gap-3 border-b px-3 py-3 sm:px-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" aria-hidden />
            <h1 className="text-lg font-semibold">Posta email</h1>
          </div>
          <p className="hidden text-xs text-muted-foreground md:block">Cartelle lette direttamente dalla casella collegata, separate dalla Inbox operativa.</p>
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
              <option key={mailbox.id} value={mailbox.id}>{mailbox.email || mailbox.name || mailbox.id}</option>
            ))}
          </select>
        </label>

        <Button variant="ghost" size="icon" onClick={() => { void loadLabels(mailboxId); void loadThreads() }} aria-label="Aggiorna posta" title="Aggiorna posta">
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

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-64 shrink-0 overflow-y-auto border-r py-3 md:block">
          <p className="px-4 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cartelle</p>
          {PRIMARY_FOLDERS.map((folder) => {
            const Icon = folder.icon
            return (
              <button
                key={folder.id}
                type="button"
                onClick={() => selectFolder(folder.id)}
                className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${folderId === folder.id ? "bg-primary/10 font-semibold text-primary" : "hover:bg-muted"}`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{folder.label}</span>
                {folderCount(folder.id) > 0 ? <span className="text-xs tabular-nums">{folderCount(folder.id)}</span> : null}
              </button>
            )
          })}

          {extraSystemLabels.length > 0 ? (
            <>
              <p className="mt-4 border-t px-4 pb-2 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Altre cartelle</p>
              {extraSystemLabels.map((label) => (
                <button key={label.id} type="button" onClick={() => selectFolder(label.id)} className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${folderId === label.id ? "bg-primary/10 font-semibold text-primary" : "hover:bg-muted"}`}>
                  <Archive className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{labelDisplayName(label)}</span>
                  {label.threadsUnread > 0 ? <span className="text-xs tabular-nums">{label.threadsUnread}</span> : null}
                </button>
              ))}
            </>
          ) : null}

          {userLabels.length > 0 ? (
            <>
              <p className="mt-4 border-t px-4 pb-2 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Etichette</p>
              {userLabels.map((label) => (
                <button key={label.id} type="button" onClick={() => selectFolder(label.id)} className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${folderId === label.id ? "bg-primary/10 font-semibold text-primary" : "hover:bg-muted"}`}>
                  <Tag className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{label.name}</span>
                  {label.threadsUnread > 0 ? <span className="text-xs tabular-nums">{label.threadsUnread}</span> : null}
                </button>
              ))}
            </>
          ) : null}
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b p-2 sm:p-3">
            <select value={folderId} onChange={(event) => selectFolder(event.target.value)} className="h-9 max-w-[220px] rounded-md border bg-background px-2 text-sm md:hidden" aria-label="Seleziona cartella">
              {folderOptions.map((folder) => <option key={folder.id} value={folder.id}>{folder.label}</option>)}
            </select>
            <div className="relative min-w-[180px] flex-1 sm:max-w-lg">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === "Enter" && applySearch()} placeholder="Cerca in questa casella" className="pl-9" />
            </div>
            <Button variant="outline" size="sm" onClick={applySearch}>Cerca</Button>
            {appliedSearch ? <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setAppliedSearch(""); setPageToken(null); setPreviousTokens([]) }}>Azzera</Button> : null}
          </div>

          {selectedThread ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-start gap-3 border-b px-3 py-3 sm:px-5">
                <Button variant="ghost" size="icon" className="shrink-0" onClick={() => { setSelectedThread(null); setMessages([]) }} aria-label="Torna alla cartella">
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-lg font-medium">{selectedThread.subject || "(nessun oggetto)"}</h2>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge variant="secondary">{folderOptions.find((folder) => folder.id === folderId)?.label || folderId}</Badge>
                    {selectedThread.messagesCount > 1 ? <Badge variant="outline">{selectedThread.messagesCount} messaggi</Badge> : null}
                  </div>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
                {threadLoading ? (
                  <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : (
                  <div className="mx-auto max-w-5xl space-y-4">
                    {messages.map((message) => (
                      <article key={message.id} className="overflow-hidden rounded-lg border bg-card">
                        <header className="border-b bg-muted/30 px-4 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">{message.sender_type === "agent" ? "Tu" : message.from.name || message.from.email}</p>
                              <p className="truncate text-xs text-muted-foreground">{message.from.email} → {message.to || "destinatario"}</p>
                            </div>
                            <time className="text-xs text-muted-foreground">{format(new Date(message.gmail_internal_date), "d MMM yyyy, HH:mm", { locale: it })}</time>
                          </div>
                        </header>
                        <div className="p-4"><MessageBody message={message} /></div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : !mailboxId ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground"><Mail className="h-10 w-10" /><p>Nessuna casella email accessibile.</p></div>
              ) : threads.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground"><Inbox className="h-10 w-10" /><p>Nessun messaggio in questa cartella.</p></div>
              ) : (
                threads.map((thread) => (
                  <button key={thread.id} type="button" onClick={() => void openThread(thread)} className={`grid w-full grid-cols-[minmax(110px,180px)_minmax(0,1fr)_auto] items-center gap-3 border-b px-3 py-2 text-left text-sm hover:bg-muted/60 sm:px-4 ${thread.isUnread ? "bg-background font-semibold" : "bg-muted/20"}`}>
                    <span className="truncate">{thread.from.name || thread.from.email || "Sconosciuto"}</span>
                    <span className="min-w-0 truncate"><span>{thread.subject || "(nessun oggetto)"}</span>{thread.snippet ? <span className="font-normal text-muted-foreground"> — {thread.snippet}</span> : null}</span>
                    <span className="whitespace-nowrap text-xs text-muted-foreground">{format(new Date(thread.date), "d MMM", { locale: it })}</span>
                  </button>
                ))
              )}
            </div>
          )}

          {!selectedThread && mailboxId ? (
            <div className="flex items-center justify-end gap-1 border-t p-2">
              <Button variant="ghost" size="sm" onClick={previousPage} disabled={!previousTokens.length || loading}><ChevronLeft className="mr-1 h-4 w-4" />Precedenti</Button>
              <Button variant="ghost" size="sm" onClick={nextPage} disabled={!nextPageToken || loading}>Successivi<ChevronRight className="ml-1 h-4 w-4" /></Button>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  )
}
