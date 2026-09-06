"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Languages, Loader2, RotateCcw } from "lucide-react"
import { toast } from "sonner"

type InboxMessage = {
  id?: string
  content?: string | null
  content_type?: string | null
  sender_type?: string | null
}

type TranslationTarget =
  | { kind: "conversation"; key: string }
  | { kind: "gmail_thread"; key: string }

const UUID_DETAIL = /^\/api\/inbox\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i
const GMAIL_DETAIL = /^\/api\/gmail\/threads\/([^/]+)$/

function pathFromFetch(input: RequestInfo | URL): string {
  try {
    if (typeof input === "string") return new URL(input, window.location.origin).pathname
    if (input instanceof URL) return input.pathname
    return new URL(input.url, window.location.origin).pathname
  } catch {
    return ""
  }
}

function methodFromFetch(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase()
  if (typeof Request !== "undefined" && input instanceof Request) return input.method.toUpperCase()
  return "GET"
}

function messageToPlainText(message: InboxMessage | null): string {
  const raw = typeof message?.content === "string" ? message.content.trim() : ""
  if (!raw) return ""

  const contentType = String(message?.content_type || "").toLowerCase()
  const looksHtml = contentType.includes("html") || /<[a-z][\s\S]*>/i.test(raw)
  if (!looksHtml || typeof DOMParser === "undefined") return raw

  try {
    const doc = new DOMParser().parseFromString(raw, "text/html")
    return (doc.body.textContent || "").replace(/\n{3,}/g, "\n\n").trim()
  } catch {
    return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  }
}

function latestCustomerMessage(messages: InboxMessage[]): InboxMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.sender_type === "customer" && messageToPlainText(messages[index])) return messages[index]
  }
  return null
}

function findReplyTextarea(): HTMLTextAreaElement | null {
  return Array.from(document.querySelectorAll<HTMLTextAreaElement>("textarea")).find((element) => {
    const placeholder = element.placeholder.toLowerCase()
    return (
      placeholder.includes("scrivi una risposta") ||
      placeholder.includes("aggiungi un messaggio e inoltra") ||
      placeholder.includes("rispondi")
    )
  }) ?? null
}

function replaceReactTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
  if (setter) setter.call(textarea, value)
  else textarea.value = value
  textarea.dispatchEvent(new Event("input", { bubbles: true }))
  textarea.dispatchEvent(new Event("change", { bubbles: true }))
  textarea.focus()
}

async function translate(payload: {
  mode: "incoming" | "reply"
  text: string
  customerMessage?: string
}): Promise<string> {
  const response = await fetch("/api/inbox/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || typeof body.translation !== "string") {
    throw new Error(body.error || "Traduzione non disponibile")
  }
  return body.translation.trim()
}

/**
 * Barra leggera sopra il composer della Inbox.
 *
 * Non modifica mai il messaggio originale salvato. Per la risposta tradotta
 * aggiorna soltanto la bozza visibile del textarea; l'operatore puo' quindi
 * rileggerla prima dell'invio e ripristinare l'originale con un click.
 */
export function InboxTranslationEnhancer() {
  const [target, setTarget] = useState<TranslationTarget | null>(null)
  const [messages, setMessages] = useState<InboxMessage[]>([])
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)
  const [incomingTranslation, setIncomingTranslation] = useState<string | null>(null)
  const [incomingLoading, setIncomingLoading] = useState(false)
  const [replyLoading, setReplyLoading] = useState(false)
  const [originalReply, setOriginalReply] = useState<string | null>(null)
  const targetRef = useRef<TranslationTarget | null>(null)

  const resetForTarget = useCallback((next: TranslationTarget, nextMessages: InboxMessage[]) => {
    targetRef.current = next
    setTarget(next)
    setMessages(nextMessages)
    setIncomingTranslation(null)
    setOriginalReply(null)
  }, [])

  useEffect(() => {
    const nativeFetch = window.fetch.bind(window)
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = pathFromFetch(input)
      const method = methodFromFetch(input, init)
      const conversationMatch = method === "GET" ? path.match(UUID_DETAIL) : null
      const gmailMatch = method === "GET" ? path.match(GMAIL_DETAIL) : null
      const response = await nativeFetch(input, init)

      if ((conversationMatch || gmailMatch) && response.ok) {
        const clone = response.clone()
        void clone.json().then((body) => {
          const nextMessages = Array.isArray(body?.messages) ? (body.messages as InboxMessage[]) : []
          if (conversationMatch) {
            resetForTarget({ kind: "conversation", key: decodeURIComponent(conversationMatch[1]) }, nextMessages)
          } else if (gmailMatch) {
            resetForTarget({ kind: "gmail_thread", key: decodeURIComponent(gmailMatch[1]) }, nextMessages)
          }
        }).catch(() => undefined)
      }

      return response
    }

    return () => {
      window.fetch = nativeFetch
    }
  }, [resetForTarget])

  useEffect(() => {
    targetRef.current = target
  }, [target])

  useEffect(() => {
    const locate = () => {
      const textarea = findReplyTextarea()
      if (!textarea?.parentElement) {
        setPortalTarget(null)
        return
      }
      const host = textarea.parentElement
      let marker = host.querySelector<HTMLElement>("[data-inbox-translation-target]")
      if (!marker) {
        marker = document.createElement("div")
        marker.dataset.inboxTranslationTarget = "true"
        host.insertBefore(marker, textarea)
      }
      setPortalTarget(marker)
    }

    locate()
    const observer = new MutationObserver(locate)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  const latestCustomer = useMemo(() => latestCustomerMessage(messages), [messages])
  const latestCustomerText = useMemo(() => messageToPlainText(latestCustomer), [latestCustomer])

  const translateIncoming = async () => {
    if (!latestCustomerText) {
      toast.error("Non trovo un messaggio del cliente da tradurre")
      return
    }
    setIncomingLoading(true)
    try {
      const translated = await translate({ mode: "incoming", text: latestCustomerText })
      setIncomingTranslation(translated)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Traduzione non disponibile")
    } finally {
      setIncomingLoading(false)
    }
  }

  const translateReply = async () => {
    const textarea = findReplyTextarea()
    const reply = textarea?.value.trim() || ""
    if (!textarea || !reply) {
      toast.error("Scrivi prima la risposta da tradurre")
      return
    }
    if (!latestCustomerText) {
      toast.error("Non trovo il messaggio del cliente da cui capire la lingua")
      return
    }

    setReplyLoading(true)
    try {
      const translated = await translate({
        mode: "reply",
        text: reply,
        customerMessage: latestCustomerText,
      })
      if (originalReply === null) setOriginalReply(textarea.value)
      replaceReactTextareaValue(textarea, translated)
      toast.success("Risposta tradotta nella lingua del cliente")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Traduzione non disponibile")
    } finally {
      setReplyLoading(false)
    }
  }

  const restoreReply = () => {
    const textarea = findReplyTextarea()
    if (!textarea || originalReply === null) return
    replaceReactTextareaValue(textarea, originalReply)
    setOriginalReply(null)
    toast.success("Risposta originale ripristinata")
  }

  if (!portalTarget || !target) return null

  return createPortal(
    <div className="mb-2 space-y-2" data-inbox-translation-ui>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void translateIncoming()}
          disabled={incomingLoading || !latestCustomerText}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          title="Traduce in italiano l'ultimo messaggio ricevuto dal cliente"
        >
          {incomingLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />}
          Traduci messaggio
        </button>

        <button
          type="button"
          onClick={() => void translateReply()}
          disabled={replyLoading || !latestCustomerText}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          title="Traduce la tua bozza nella lingua usata dal cliente"
        >
          {replyLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />}
          Traduci risposta
        </button>

        {originalReply !== null ? (
          <button
            type="button"
            onClick={restoreReply}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Ripristina originale
          </button>
        ) : null}
      </div>

      {incomingTranslation ? (
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Languages className="h-3.5 w-3.5" />
            Traduzione in italiano
          </div>
          <div className="whitespace-pre-wrap leading-relaxed">{incomingTranslation}</div>
        </div>
      ) : null}
    </div>,
    portalTarget,
  )
}
