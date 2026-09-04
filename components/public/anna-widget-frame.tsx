"use client"

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Loader2, Send, X } from "lucide-react"

type ChatMessage = {
  id: string
  content: string
  sender_type: "customer" | "agent" | "system"
  stored_at: string | null
  status?: string | null
}

type ApiPayload = Record<string, unknown> & { error?: string }

async function postWidget(publicKey: string, payload: Record<string, unknown>) {
  const response = await fetch(`/api/public/chat-widget/${encodeURIComponent(publicKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  })
  const data = (await response.json().catch(() => ({}))) as ApiPayload
  if (!response.ok) throw new Error(data.error || "La chat non è disponibile")
  return data
}

export function AnnaWidgetFrame({ publicKey, pageUrl }: { publicKey: string; pageUrl?: string | null }) {
  const storageKey = useMemo(() => `anna-4bid-conversation:${publicKey}`, [publicKey])
  const [conversationId, setConversationId] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [text, setText] = useState("")
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [waitingAi, setWaitingAi] = useState(false)
  const [error, setError] = useState("")
  const listRef = useRef<HTMLDivElement>(null)

  const close = () => {
    window.parent.postMessage({ type: "anna-4bid-close", publicKey }, "*")
  }

  const readMessages = useCallback(
    async (id: string) => {
      const data = await postWidget(publicKey, { action: "messages", conversation_id: id })
      const next = (data.messages || []) as ChatMessage[]
      setMessages(next)
      if (next.some((message) => message.sender_type === "agent")) setWaitingAi(false)
      return next
    },
    [publicKey],
  )

  const startConversation = useCallback(async () => {
    const data = await postWidget(publicKey, {
      action: "start",
      visitor: {
        language: navigator.language?.slice(0, 5) || "it",
        page_url: pageUrl || document.referrer || null,
        user_agent: navigator.userAgent,
      },
    })
    const id = String(data.conversation_id || "")
    if (!id) throw new Error("Conversazione non disponibile")
    localStorage.setItem(storageKey, id)
    setConversationId(id)
    await readMessages(id)
    return id
  }, [pageUrl, publicKey, readMessages, storageKey])

  useEffect(() => {
    let cancelled = false
    const boot = async () => {
      setLoading(true)
      setError("")
      const stored = localStorage.getItem(storageKey) || ""
      try {
        if (stored) {
          setConversationId(stored)
          await readMessages(stored)
        } else {
          await startConversation()
        }
      } catch {
        localStorage.removeItem(storageKey)
        try {
          if (!cancelled) await startConversation()
        } catch (reason) {
          if (!cancelled) setError(reason instanceof Error ? reason.message : "La chat non è disponibile")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void boot()
    return () => {
      cancelled = true
    }
  }, [readMessages, startConversation, storageKey])

  useEffect(() => {
    if (!conversationId) return
    const interval = window.setInterval(() => {
      void readMessages(conversationId).catch(() => {})
    }, waitingAi ? 1200 : 3500)
    return () => window.clearInterval(interval)
  }, [conversationId, readMessages, waitingAi])

  useEffect(() => {
    const node = listRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [messages, waitingAi])

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault()
    const message = text.trim()
    if (!message || sending || !conversationId) return

    setSending(true)
    setError("")
    setText("")
    try {
      const result = await postWidget(publicKey, {
        action: "send",
        conversation_id: conversationId,
        message,
      })
      setWaitingAi(result.ai === "risposta")
      await readMessages(conversationId)
    } catch (reason) {
      setText(message)
      setError(reason instanceof Error ? reason.message : "Invio non riuscito")
    } finally {
      setSending(false)
    }
  }

  return (
    <main className="flex h-dvh w-full flex-col overflow-hidden bg-white text-slate-900">
      <header className="flex shrink-0 items-center gap-3 bg-slate-900 px-4 py-3 text-white">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-lg font-extrabold text-slate-900">A</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">Anna · 4BID</p>
          <p className="truncate text-xs text-slate-300">Assistente virtuale</p>
        </div>
        <button
          type="button"
          onClick={close}
          className="grid h-9 w-9 place-items-center rounded-full text-slate-200 transition hover:bg-white/10 hover:text-white"
          aria-label="Chiudi chat"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 px-3 py-4">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Apertura chat…
          </div>
        ) : null}

        {!loading && messages.map((message) => {
          const mine = message.sender_type === "customer"
          const system = message.sender_type === "system"
          if (system) {
            return (
              <div key={message.id} className="mx-auto max-w-[92%] rounded-xl bg-white px-3 py-2 text-center text-sm text-slate-600 shadow-sm ring-1 ring-slate-200">
                {message.content}
              </div>
            )
          }
          return (
            <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[84%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm leading-5 shadow-sm ${mine ? "rounded-br-md bg-slate-900 text-white" : "rounded-bl-md bg-white text-slate-800 ring-1 ring-slate-200"}`}>
                {message.content}
              </div>
            </div>
          )
        })}

        {waitingAi ? (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
              <Loader2 className="h-4 w-4 animate-spin" /> Anna sta scrivendo…
            </div>
          </div>
        ) : null}
      </div>

      {error ? <div className="shrink-0 border-t border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div> : null}

      <form onSubmit={sendMessage} className="flex shrink-0 items-end gap-2 border-t bg-white p-3">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              event.currentTarget.form?.requestSubmit()
            }
          }}
          rows={1}
          maxLength={4000}
          placeholder="Scrivi un messaggio…"
          disabled={loading || !conversationId}
          className="max-h-28 min-h-11 flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:opacity-60"
          aria-label="Messaggio"
        />
        <button
          type="submit"
          disabled={sending || loading || !conversationId || !text.trim()}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-900 text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Invia messaggio"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>
    </main>
  )
}
