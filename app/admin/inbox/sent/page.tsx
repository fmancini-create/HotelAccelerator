"use client"

import { useCallback, useEffect, useState } from "react"
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Mail,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
} from "lucide-react"
import { format } from "date-fns"
import { it } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const PAGE_SIZE = 50

const CHANNELS = [
  { value: "all", label: "Tutti i canali" },
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "telegram", label: "Telegram" },
  { value: "chat", label: "Chat" },
  { value: "messenger", label: "Messenger" },
  { value: "instagram", label: "Instagram" },
  { value: "x", label: "X" },
  { value: "linkedin", label: "LinkedIn" },
] as const

type SentItem = {
  id: string
  conversationId: string
  channel: string
  subject: string | null
  recipientName: string | null
  recipientDetail: string | null
  content: string
  preview: string
  contentType: string
  sentAt: string
  senderName: string | null
  status: string | null
}

function channelLabel(channel: string) {
  return CHANNELS.find((item) => item.value === channel)?.label || channel
}

function ChannelIcon({ channel, className = "h-4 w-4" }: { channel: string; className?: string }) {
  if (channel === "email") return <Mail className={className} aria-hidden />
  if (channel === "telegram") return <Send className={className} aria-hidden />
  return <MessageCircle className={className} aria-hidden />
}

function formatSentDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return format(date, "dd MMM yyyy, HH:mm", { locale: it })
}

function sanitizeHtml(html: string) {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/\s*on\w+\s*=\s*[^\s>]*/gi, "")
    .replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"')
}

function SentBody({ item }: { item: SentItem }) {
  const isHtml = item.contentType === "html" || item.contentType === "text/html" || /<[a-z][\s\S]*>/i.test(item.content)

  if (!item.content.trim()) return <p className="text-sm italic text-muted-foreground">(Nessun contenuto)</p>
  if (!isHtml) return <div className="whitespace-pre-wrap break-words text-sm leading-6">{item.content}</div>

  const document = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank"><style>html,body{margin:0;padding:0;background:#fff;color:#202124;font-family:Arial,sans-serif;font-size:14px;line-height:1.5}img{max-width:100%;height:auto}table{max-width:100%}a{color:#1a73e8}</style></head><body>${sanitizeHtml(item.content)}</body></html>`
  return (
    <iframe
      title={`Messaggio inviato ${item.id}`}
      srcDoc={document}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      className="h-[420px] w-full border-0 bg-white"
    />
  )
}

export default function SentInboxPage() {
  const [items, setItems] = useState<SentItem[]>([])
  const [selected, setSelected] = useState<SentItem | null>(null)
  const [channel, setChannel] = useState("all")
  const [search, setSearch] = useState("")
  const [appliedSearch, setAppliedSearch] = useState("")
  const [offset, setOffset] = useState(0)
  const [count, setCount] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const loadSent = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset), channel })
      if (appliedSearch) params.set("search", appliedSearch)
      const response = await fetch(`/api/inbox/sent?${params}`, { cache: "no-store" })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "Impossibile leggere i messaggi inviati")

      const next = (data.items || []) as SentItem[]
      setItems(next)
      setCount(Number(data.count || 0))
      setHasMore(Boolean(data.hasMore))
      setSelected((current) => current && next.some((item) => item.id === current.id) ? current : null)
    } catch (reason) {
      setItems([])
      setCount(0)
      setHasMore(false)
      setSelected(null)
      setError(reason instanceof Error ? reason.message : "Impossibile leggere i messaggi inviati")
    } finally {
      setLoading(false)
    }
  }, [appliedSearch, channel, offset])

  useEffect(() => {
    void loadSent()
  }, [loadSent])

  const applySearch = () => {
    setOffset(0)
    setSelected(null)
    setAppliedSearch(search.trim())
  }

  const changeChannel = (value: string) => {
    setChannel(value)
    setOffset(0)
    setSelected(null)
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex flex-wrap items-center gap-3 border-b px-3 py-3 sm:px-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" aria-hidden />
            <h1 className="text-lg font-semibold">Inviati</h1>
          </div>
          <p className="hidden text-xs text-muted-foreground md:block">
            Tutti i messaggi inviati da HotelAccelerator, riuniti in un’unica vista indipendentemente dal canale.
          </p>
        </div>

        <label className="ml-auto flex min-w-0 items-center gap-2 text-sm">
          <span className="hidden text-muted-foreground sm:inline">Canale</span>
          <select
            value={channel}
            onChange={(event) => changeChannel(event.target.value)}
            className="h-9 max-w-[220px] rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            aria-label="Filtra per canale"
          >
            {CHANNELS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>

        <Button variant="ghost" size="icon" onClick={() => void loadSent()} aria-label="Aggiorna messaggi inviati" title="Aggiorna">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

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
            onKeyDown={(event) => event.key === "Enter" && applySearch()}
            placeholder="Cerca nei messaggi inviati"
            className="pl-9"
          />
        </div>
        <Button variant="secondary" onClick={applySearch}>Cerca</Button>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <section className={`${selected ? "hidden md:flex" : "flex"} min-w-0 flex-1 flex-col border-r md:max-w-[520px]`}>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {loading ? (
              <div className="flex flex-1 items-center justify-center p-8 text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Caricamento inviati…
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
                <Send className="h-8 w-8" aria-hidden />
                <p className="font-medium">Nessun messaggio inviato</p>
                <p className="text-sm">Non risultano invii HotelAccelerator con i filtri selezionati.</p>
              </div>
            ) : items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelected(item)}
                className={`border-b px-4 py-3 text-left transition-colors hover:bg-muted/60 ${selected?.id === item.id ? "bg-primary/5" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 rounded-md bg-muted p-1.5 text-muted-foreground">
                    <ChannelIcon channel={item.channel} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="truncate text-sm font-semibold">
                        {item.recipientName || item.recipientDetail || "Destinatario"}
                      </p>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{formatSentDate(item.sentAt)}</span>
                    </div>
                    <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                      <span className="shrink-0 rounded-full border px-2 py-0.5">{channelLabel(item.channel)}</span>
                      {item.subject ? <span className="truncate">{item.subject}</span> : null}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.preview || "Nessuna anteprima"}</p>
                    {item.senderName ? <p className="mt-1 text-xs text-muted-foreground">Inviato da {item.senderName}</p> : null}
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="flex shrink-0 items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setOffset(Math.max(0, offset - PAGE_SIZE)); setSelected(null) }}
              disabled={offset === 0 || loading}
            >
              <ChevronLeft className="mr-1 h-4 w-4" /> Precedenti
            </Button>
            <span>{count > 0 ? `${offset + 1}-${Math.min(offset + items.length, count)} di ${count}` : "0 messaggi"}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setOffset(offset + PAGE_SIZE); setSelected(null) }}
              disabled={!hasMore || loading}
            >
              Successivi <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </section>

        <section className={`${selected ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col overflow-hidden`}>
          {!selected ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
              <Send className="h-8 w-8" aria-hidden />
              <p className="font-medium">Seleziona un messaggio inviato</p>
            </div>
          ) : (
            <>
              <div className="flex shrink-0 items-center gap-3 border-b px-4 py-3">
                <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSelected(null)} aria-label="Torna alla lista">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="rounded-md bg-muted p-2 text-muted-foreground"><ChannelIcon channel={selected.channel} /></span>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-semibold">{selected.subject || selected.recipientName || "Messaggio inviato"}</h2>
                  <p className="truncate text-xs text-muted-foreground">
                    A: {selected.recipientName || selected.recipientDetail || "destinatario"}
                    {selected.recipientName && selected.recipientDetail ? ` · ${selected.recipientDetail}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right text-xs text-muted-foreground">
                  <p>{channelLabel(selected.channel)}</p>
                  <p>{formatSentDate(selected.sentAt)}</p>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <div className="mx-auto max-w-4xl rounded-lg border bg-background p-4 shadow-sm">
                  {selected.senderName ? <p className="mb-3 text-xs text-muted-foreground">Inviato da {selected.senderName}</p> : null}
                  <SentBody item={selected} />
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
