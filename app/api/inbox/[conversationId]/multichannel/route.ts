import { type NextRequest, NextResponse } from "next/server"
import { richiediOperatore } from "@/lib/inbox/identity"

export const runtime = "nodejs"

type ExtraChannel = "email" | "whatsapp" | "telegram"

type ChannelRequest = {
  channel?: ExtraChannel
  to?: string | null
}

type DestinationsPayload = {
  subject?: string | null
  contact?: { id?: string | null; name?: string | null } | null
  destinations?: {
    email?: string | null
    whatsapp?: string | null
    telegram?: string | null
  }
}

function urlFor(request: NextRequest, path: string) {
  return new URL(path, request.url)
}

async function readJson(response: Response) {
  return response.json().catch(() => ({}))
}

/**
 * Fan out one operator reply to additional channels without merging their
 * underlying threads. Each destination goes through the canonical composer for
 * that channel, so WhatsApp keeps its 24h/template rules and Telegram keeps its
 * chat-id rules. A failure on one extra channel never rolls back another one.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  try {
    await richiediOperatore(request)
    const { conversationId } = await params
    const payload = await request.json()
    const content = String(payload.content || "").trim()
    const requested = Array.isArray(payload.channels) ? (payload.channels as ChannelRequest[]) : []

    if (!content) {
      return NextResponse.json({ error: "Il messaggio non può essere vuoto." }, { status: 400 })
    }

    const channels = requested
      .filter((item): item is Required<Pick<ChannelRequest, "channel">> & ChannelRequest =>
        item?.channel === "email" || item?.channel === "whatsapp" || item?.channel === "telegram",
      )
      .filter((item, index, all) => all.findIndex((candidate) => candidate.channel === item.channel) === index)

    if (channels.length === 0) {
      return NextResponse.json({ success: true, results: [] })
    }

    // Use the same authenticated browser session for internal composer calls.
    const forwardedHeaders = new Headers()
    const cookie = request.headers.get("cookie")
    const authorization = request.headers.get("authorization")
    if (cookie) forwardedHeaders.set("cookie", cookie)
    if (authorization) forwardedHeaders.set("authorization", authorization)

    const destinationResponse = await fetch(
      urlFor(request, `/api/inbox/${conversationId}/reply-destinations`),
      { headers: forwardedHeaders, cache: "no-store" },
    )
    const destinationData = (await readJson(destinationResponse)) as DestinationsPayload & { error?: string }
    if (!destinationResponse.ok) {
      return NextResponse.json(
        { error: destinationData.error || "Impossibile risolvere i destinatari multicanale." },
        { status: destinationResponse.status },
      )
    }

    const results: Array<{
      channel: ExtraChannel
      ok: boolean
      mode?: string | null
      to?: string | null
      error?: string | null
    }> = []

    for (const item of channels) {
      const channel = item.channel
      const automatic = destinationData.destinations?.[channel] || ""
      const to = String(item.to || automatic || "").trim()

      if (!to) {
        results.push({
          channel,
          ok: false,
          to: null,
          error:
            channel === "telegram"
              ? "Nessuna chat Telegram collegata al contatto. Il cliente deve aver già avviato il bot."
              : channel === "whatsapp"
                ? "Numero WhatsApp non disponibile per il contatto."
                : "Email non disponibile per il contatto.",
        })
        continue
      }

      try {
        if (channel === "whatsapp") {
          const response = await fetch(urlFor(request, "/api/inbox/compose/whatsapp"), {
            method: "POST",
            headers: new Headers({
              ...Object.fromEntries(forwardedHeaders.entries()),
              "Content-Type": "application/json",
            }),
            body: JSON.stringify({
              to,
              body: content,
              contactId: destinationData.contact?.id || undefined,
              contactName: destinationData.contact?.name || undefined,
            }),
          })
          const data = await readJson(response)
          results.push({
            channel,
            ok: response.ok,
            mode: data.mode || null,
            to,
            error: response.ok ? null : data.error || "Invio WhatsApp non riuscito.",
          })
          continue
        }

        if (channel === "telegram") {
          const response = await fetch(urlFor(request, "/api/inbox/compose/telegram"), {
            method: "POST",
            headers: new Headers({
              ...Object.fromEntries(forwardedHeaders.entries()),
              "Content-Type": "application/json",
            }),
            body: JSON.stringify({ to, body: content }),
          })
          const data = await readJson(response)
          results.push({
            channel,
            ok: response.ok,
            mode: response.ok ? "sent" : null,
            to,
            error: response.ok ? null : data.error || "Invio Telegram non riuscito.",
          })
          continue
        }

        const baseSubject = String(destinationData.subject || "Senza oggetto").trim()
        const subject = baseSubject.startsWith("Re:") ? baseSubject : `Re: ${baseSubject}`
        const response = await fetch(urlFor(request, "/api/gmail/compose"), {
          method: "POST",
          headers: new Headers({
            ...Object.fromEntries(forwardedHeaders.entries()),
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({ to, subject, body: content }),
        })
        const data = await readJson(response)
        results.push({
          channel,
          ok: response.ok,
          mode: response.ok ? "sent" : null,
          to,
          error: response.ok ? null : data.error || "Invio email non riuscito.",
        })
      } catch (error) {
        results.push({
          channel,
          ok: false,
          to,
          error: error instanceof Error ? error.message : "Invio non riuscito.",
        })
      }
    }

    return NextResponse.json({
      success: results.every((result) => result.ok),
      partial: results.some((result) => result.ok) && results.some((result) => !result.ok),
      results,
    })
  } catch (error) {
    const status = typeof (error as any)?.status === "number" ? (error as any).status : 500
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invio multicanale non riuscito." },
      { status },
    )
  }
}
