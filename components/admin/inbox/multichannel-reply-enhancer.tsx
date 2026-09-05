"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Bot, Mail, MessageCircle } from "lucide-react"
import { toast } from "sonner"

const CHANNEL_LABELS = {
  email: "Email",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
} as const

type Channel = keyof typeof CHANNEL_LABELS

type DestinationData = {
  primaryChannel?: string | null
  contact?: { id?: string | null; name?: string | null } | null
  destinations?: Partial<Record<Channel, string | null>>
}

type ExtraSelection = Partial<Record<Channel, { enabled: boolean; to: string }>>

function pathFromFetch(input: RequestInfo | URL) {
  try {
    if (typeof input === "string") return new URL(input, window.location.origin).pathname
    if (input instanceof URL) return input.pathname
    return new URL(input.url, window.location.origin).pathname
  } catch {
    return ""
  }
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.method) return init.method.toUpperCase()
  if (typeof Request !== "undefined" && input instanceof Request) return input.method.toUpperCase()
  return "GET"
}

function parseBody(init?: RequestInit): Record<string, any> | null {
  if (typeof init?.body !== "string") return null
  try {
    return JSON.parse(init.body)
  } catch {
    return null
  }
}

function iconFor(channel: Channel) {
  if (channel === "email") return Mail
  if (channel === "whatsapp") return MessageCircle
  return Bot
}

/**
 * Route-local enhancement for the legacy Inbox page.
 *
 * The page itself is intentionally left untouched: it is a very large component
 * with two historical inbox implementations. This small bridge observes the
 * existing reply composer, renders the extra-channel controls next to its
 * recipient header, and augments only the final POST to the canonical reply
 * endpoint. The primary reply still follows the original thread; extra sends
 * create/reuse their own channel conversations.
 */
export function MultichannelReplyEnhancer() {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [destinations, setDestinations] = useState<DestinationData | null>(null)
  const [selection, setSelection] = useState<ExtraSelection>({})
  const conversationRef = useRef<string | null>(null)
  const destinationsRef = useRef<DestinationData | null>(null)
  const selectionRef = useRef<ExtraSelection>({})

  useEffect(() => {
    conversationRef.current = conversationId
  }, [conversationId])
  useEffect(() => {
    destinationsRef.current = destinations
  }, [destinations])
  useEffect(() => {
    selectionRef.current = selection
  }, [selection])

  const refreshDestinations = async (id: string) => {
    try {
      const res = await fetch(`/api/inbox/${id}/reply-destinations`, { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return
      if (conversationRef.current !== id) return
      setDestinations(data)
      setSelection({})
    } catch {
      // Non bloccare la risposta principale per un arricchimento opzionale.
    }
  }

  useEffect(() => {
    const nativeFetch = window.fetch.bind(window)

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = pathFromFetch(input)
      const method = requestMethod(input, init)
      const detailMatch = method === "GET" ? path.match(/^\/api\/inbox\/([^/]+)$/) : null
      const sendMatch = method === "POST" ? path.match(/^\/api\/inbox\/([^/]+)\/send$/) : null

      const response = await nativeFetch(input, init)

      if (detailMatch && response.ok) {
        const id = detailMatch[1]
        void response.clone().json().then((data) => {
          if (!data?.conversation) return
          conversationRef.current = id
          setConversationId(id)
          void refreshDestinations(id)
        }).catch(() => undefined)
      }

      if (sendMatch && response.ok) {
        const id = sendMatch[1]
        const body = parseBody(init)
        const content = String(body?.content || "").trim()
        const primary = destinationsRef.current?.primaryChannel || null
        const extras = (Object.entries(selectionRef.current) as Array<[Channel, { enabled: boolean; to: string }]>)
          .filter(([channel, value]) => value?.enabled && channel !== primary)
          .map(([channel, value]) => ({ channel, to: value.to.trim() || undefined }))

        if (content && extras.length > 0) {
          try {
            const extraRes = await nativeFetch(`/api/inbox/${id}/multichannel`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ content, channels: extras }),
            })
            const extraData = await extraRes.json().catch(() => ({}))
            const results = Array.isArray(extraData.results) ? extraData.results : []
            const ok = results.filter((result: any) => result.ok)
            const failed = results.filter((result: any) => !result.ok)

            if (ok.length) {
              const labels = ok.map((result: any) => {
                const base = CHANNEL_LABELS[result.channel as Channel] || result.channel
                return result.mode === "queued" ? `${base} in coda` : base
              })
              toast.success(`Inviato anche su ${labels.join(" · ")}`)
            }
            if (failed.length) {
              toast.error(
                failed
                  .map((result: any) => `${CHANNEL_LABELS[result.channel as Channel] || result.channel}: ${result.error || "invio non riuscito"}`)
                  .join("\n"),
              )
            }
            if (!extraRes.ok && !results.length) {
              toast.error(extraData.error || "Invio sui canali aggiuntivi non riuscito")
            }
          } catch {
            toast.error("Risposta principale inviata, ma i canali aggiuntivi non sono raggiungibili")
          }
        }
      }

      return response
    }

    return () => {
      window.fetch = nativeFetch
    }
    // Installare l'intercettore una sola volta; i valori mutabili passano dai ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const locate = () => {
      const to = document.getElementById("reply-to")
      if (!to) {
        setPortalTarget(null)
        return
      }
      const header = to.closest(".border-b.border-border") as HTMLElement | null
      if (!header) return
      let target = header.querySelector<HTMLElement>("[data-multichannel-reply-target]")
      if (!target) {
        target = document.createElement("div")
        target.dataset.multichannelReplyTarget = "true"
        header.appendChild(target)
      }
      setPortalTarget(target)
    }

    locate()
    const observer = new MutationObserver(locate)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  const availableChannels = useMemo(() => {
    const primary = destinations?.primaryChannel
    return (["email", "whatsapp", "telegram"] as Channel[]).filter((channel) => channel !== primary)
  }, [destinations?.primaryChannel])

  if (!portalTarget || !conversationId || !destinations) return null

  const toggle = (channel: Channel) => {
    setSelection((current) => {
      const previous = current[channel]
      const auto = destinations.destinations?.[channel] || ""
      let fallback = auto
      if (!fallback && channel === "whatsapp") {
        const currentTo = (document.getElementById("reply-to") as HTMLInputElement | null)?.value || ""
        if (/^[+\d\s().-]{8,}$/.test(currentTo.trim())) fallback = currentTo.trim()
      }
      return {
        ...current,
        [channel]: {
          enabled: !previous?.enabled,
          to: previous?.to || fallback,
        },
      }
    })
  }

  const content = (
    <div className="border-t border-border px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Invia anche su</span>
        {availableChannels.map((channel) => {
          const Icon = iconFor(channel)
          const enabled = Boolean(selection[channel]?.enabled)
          return (
            <button
              key={channel}
              type="button"
              onClick={() => toggle(channel)}
              className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors ${
                enabled
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background text-foreground hover:bg-muted"
              }`}
              aria-pressed={enabled}
            >
              <Icon className="h-3.5 w-3.5" />
              {CHANNEL_LABELS[channel]}
            </button>
          )
        })}
      </div>

      {(Object.entries(selection) as Array<[Channel, { enabled: boolean; to: string }]>).map(([channel, value]) => {
        if (!value?.enabled || channel === destinations.primaryChannel) return null
        const automatic = destinations.destinations?.[channel]
        return (
          <div key={channel} className="mt-2 flex items-center gap-2">
            <span className="w-20 shrink-0 text-xs text-muted-foreground">{CHANNEL_LABELS[channel]}</span>
            <input
              value={value.to}
              onChange={(event) => {
                const to = event.target.value
                setSelection((current) => ({
                  ...current,
                  [channel]: { enabled: true, to },
                }))
              }}
              placeholder={
                channel === "email"
                  ? "email destinatario"
                  : channel === "whatsapp"
                    ? "+39 numero WhatsApp"
                    : "chat ID Telegram"
              }
              className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
            {automatic && value.to === automatic ? (
              <span className="text-[11px] text-muted-foreground">dal CRM</span>
            ) : null}
          </div>
        )
      })}

      {selection.telegram?.enabled ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Telegram funziona solo con una chat già avviata dal cliente con il bot della struttura.
        </p>
      ) : null}
    </div>
  )

  return createPortal(content, portalTarget)
}
