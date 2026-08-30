import { createHmac, timingSafeEqual } from "node:crypto"
import { type NextRequest, NextResponse } from "next/server"
import { ingestSocialInboxEvent } from "@/lib/social/inbox"

function verifyMetaSignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.META_APP_SECRET
  if (!appSecret || !signatureHeader?.startsWith("sha256=")) return false
  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`
  const actualBuffer = Buffer.from(signatureHeader)
  const expectedBuffer = Buffer.from(expected)
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
}

function isoFromUnixMillis(value: unknown): string {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? new Date(number).toISOString() : new Date().toISOString()
}

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode")
  const token = request.nextUrl.searchParams.get("hub.verify_token")
  const challenge = request.nextUrl.searchParams.get("hub.challenge")
  if (mode === "subscribe" && token && token === process.env.META_WEBHOOK_VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, { status: 200 })
  }
  return NextResponse.json({ error: "Webhook Meta non verificato" }, { status: 403 })
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  if (!verifyMetaSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Firma Meta non valida" }, { status: 401 })
  }

  let payload: any
  try { payload = JSON.parse(rawBody) } catch { return NextResponse.json({ error: "Payload non valido" }, { status: 400 }) }

  const jobs: Promise<unknown>[] = []
  const object = String(payload?.object || "")

  for (const entry of payload?.entry || []) {
    const accountId = String(entry?.id || "")
    if (!accountId) continue

    for (const item of entry?.messaging || []) {
      const message = item?.message
      if (!message?.mid || message?.is_echo) continue
      const senderId = String(item?.sender?.id || "")
      const text = String(message?.text || (message?.attachments?.length ? "[Allegato]" : "[Messaggio]"))
      const isInstagram = object === "instagram"
      jobs.push(ingestSocialInboxEvent({
        provider: isInstagram ? "instagram" : "facebook",
        channel: isInstagram ? "instagram" : "messenger",
        externalAccountId: accountId,
        externalThreadId: `${isInstagram ? "instagram" : "messenger"}:dm:${senderId}`,
        externalMessageId: String(message.mid),
        eventType: "direct_message",
        text,
        actorId: senderId,
        occurredAt: isoFromUnixMillis(item?.timestamp),
        metadata: { attachments: message?.attachments || [] },
      }))
    }

    for (const change of entry?.changes || []) {
      const field = String(change?.field || "")
      const value = change?.value || {}

      if (object === "page" && field === "feed" && (value?.item === "comment" || value?.comment_id)) {
        const commentId = String(value?.comment_id || value?.id || "")
        if (!commentId) continue
        const postId = String(value?.post_id || value?.parent_id || commentId)
        const actorId = String(value?.from?.id || value?.sender_id || "")
        jobs.push(ingestSocialInboxEvent({
          provider: "facebook",
          channel: "messenger",
          externalAccountId: accountId,
          externalThreadId: `facebook:post:${postId}`,
          externalMessageId: commentId,
          eventType: "comment",
          text: String(value?.message || "[Commento Facebook]"),
          actorId,
          actorName: value?.from?.name ? String(value.from.name) : null,
          occurredAt: value?.created_time ? new Date(Number(value.created_time) * 1000).toISOString() : null,
          metadata: { post_id: postId, verb: value?.verb || null },
        }))
      }

      if (object === "instagram" && (field === "comments" || field === "mentions")) {
        const eventId = String(value?.id || value?.comment_id || `${field}:${entry?.time || Date.now()}`)
        const mediaId = String(value?.media?.id || value?.media_id || value?.parent_id || eventId)
        jobs.push(ingestSocialInboxEvent({
          provider: "instagram",
          channel: "instagram",
          externalAccountId: accountId,
          externalThreadId: `instagram:media:${mediaId}`,
          externalMessageId: eventId,
          eventType: field === "mentions" ? "mention" : "comment",
          text: String(value?.text || value?.message || (field === "mentions" ? "[Menzione Instagram]" : "[Commento Instagram]")),
          actorId: value?.from?.id ? String(value.from.id) : value?.user_id ? String(value.user_id) : null,
          actorName: value?.from?.username ? String(value.from.username) : value?.username ? String(value.username) : null,
          occurredAt: value?.timestamp ? String(value.timestamp) : entry?.time ? new Date(Number(entry.time) * 1000).toISOString() : null,
          metadata: { media_id: mediaId, field },
        }))
      }
    }
  }

  const results = await Promise.allSettled(jobs)
  const failures = results.filter((result) => result.status === "rejected")
  if (failures.length) console.error(`[social/meta] ${failures.length}/${results.length} eventi non importati`)
  return NextResponse.json({ received: true, processed: results.length, failed: failures.length })
}
