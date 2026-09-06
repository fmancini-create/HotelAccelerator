"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
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
  return (
    Array.from(document.querySelectorAll<HTMLTextAreaElement>("textarea")).find((element) => {
      const placeholder = element.placeholder.toLowerCase()
      return (
        placeholder.includes("scrivi una risposta") ||
        placeholder.includes("aggiungi un messaggio e inoltra") ||
        placeholder.includes("rispondi") ||
        placeholder.includes("scrivi il tuo messaggio")
      )
    }) ?? null
  )
}

function findDetailBackButton(): HTMLButtonElement | null {
  const exact = document.querySelector<HTMLButtonElement>("button.h-9.w-9.mr-1")
  if (exact?.querySelector("svg.lucide-chevron-left")) return exact

  return (
    Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((button) => {
      if (!button.querySelector("svg.lucide-chevron-left")) return false
      if (button.title.toLowerCase().includes("pagina precedente")) return false
      return (button.textContent || "").trim() === ""
    }) ?? null
  )
}

function findTranslationSlot(): HTMLElement | null {
  if (!findDetailBackButton()) return null
  return document.querySelector<HTMLElement>("[data-inbox-translation-slot]")
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
 * Translation controls for the open Inbox thread.
 *
 * The controls are rendered in a stable slot supplied by InboxShell, never in
 * the already crowded message action/filter toolbar. This keeps the controls
 * visible while preventing horizontal overflow in the operational toolbar.
 */
export function InboxTranslationEnhancer() {
  const [target, setTarget] = useState<TranslationTarget | null>(null)
  const [messages, setMessages] = useState<InboxMessage[]>([])
  const [toolbarTarget, setToolbarTarget] = useState<HTMLElement | null>(null)
  const [incomingTranslation, setIncomingTranslation] = useState<string | null>(null)
  const [incomingLoading, setIncomingLoading] = useState(false)
  const [replyLoading, setReplyLoading] = useState(false)
  const [originalReply, setOriginalReply] = useState<string | null>(null)

  const resetForTarget = useCallback((next: TranslationTarget, nextMessages: InboxMessage[]) => {
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
        void clone
          .json()
          .then((body) => {
            const nextMessages = Array.isArray(body?.messages) ? (body.messages as InboxMessage[]) : []
            if (conversationMatch) {
              resetForTarget({ kind: "conversation", key: decodeURIComponent(conversationMatch[1]) }, nextMessages)
            } else if (gmailMatch) {
              resetForTarget({ kind: "gmail_thread", key: decodeURIComponent(gmailMatch[1]) }, nextMessages)
            }
          })
          .catch(() => undefined)
      }

      return response
    }

    return () => {
      window.fetch = nativeFetch
    }
  }, [resetForTarget])

  useEffect(() => {
    const locate = () => {
      const nextTarget = findTranslationSlot()
      setToolbarTarget(nextTarget)

      if (!nextTarget) {
        setTarget(null)
        setMessages([])
        setIncomingTranslation(null)
        setOriginalReply(null)
      }
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
    if (!textarea) {
      toast.error("Apri Rispondi e scrivi prima la risposta da tradurre")
      return
    }
    if (!reply) {
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

  if (!toolbarTarget || !target) return null

  return createPortal(
    <div className="relative flex min-w-0 items-center gap-1.5" data-inbox-translation-ui>
      <button
        type="button"
        onClick={() => void translateIncoming()}
        disabled={incomingLoading || !latestCustomerText}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-input bg-background px-2 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        title="Traduce in italiano l'ultimo messaggio ricevuto dal cliente"
      >
        {incomingLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />}
        <span className="hidden xl:inline">Traduci messaggio</span>
      </button>

      <button
        type="button"
        onClick={() => void translateReply()}
        disabled={replyLoading || !latestCustomerText}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-input bg-background px-2 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        title="Traduce la tua bozza nella lingua usata dal cliente"
      >
        {replyLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />}
        <span className="hidden xl:inline">Traduci risposta</span>
      </button>

      {originalReply !== null ? (
        <button
          type="button"
          onClick={restoreReply}
          className="inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Ripristina la bozza prima della traduzione"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span className="hidden 2xl:inline">Ripristina</span>
        </button>
      ) : null}

      {incomingTranslation ? (
        <div className="absolute right-0 top-full z-[100] mt-2 max-h-80 w-[min(520px,calc(100vw-2rem))] overflow-auto rounded-lg border border-border bg-background p-3 text-sm shadow-lg">
          <div className="mb-1 flex items-center justify-between gap-3 text-xs font-medium text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Languages className="h-3.5 w-3.5" />
              Traduzione in italiano
            </span>
            <button
              type="button"
              onClick={() => setIncomingTranslation(null)}
              className="rounded px-1.5 py-0.5 text-xs hover:bg-muted hover:text-foreground"
            >
              Chiudi
            </button>
          </div>
          <div className="whitespace-pre-wrap leading-relaxed">{incomingTranslation}</div>
        </div>
      ) : null}
    </div>,
    toolbarTarget,
  )
}
