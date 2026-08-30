import { createHmac, timingSafeEqual } from "node:crypto"
import { type NextRequest, NextResponse } from "next/server"
import { ingestSocialInboxEvent } from "@/lib/social/inbox"

function xWebhookSecret(): string | null {
  return process.env.X_CONSUMER_SECRET || process.env.X_CLIENT_SECRET || null
}

function hmacBase64(value: string): string {
  const secret = xWebhookSecret()
  if (!secret) throw new Error("X webhook secret non configurato")
  return createHmac("sha256", secret).update(value).digest("base64")
}

function verifySignature(rawBody: string, signature: string | null): boolean {
  if (!signature?.startsWith("sha256=")) return false
  const expected = `sha256=${hmacBase64(rawBody)}`
  const actual = Buffer.from(signature)
  const wanted = Buffer.from(expected)
  return actual.length === wanted.length && timingSafeEqual(actual, wanted)
}

export async function GET(request: NextRequest) {
  const crcToken = request.nextUrl.searchParams.get("crc_token")
  if (!crcToken) return NextResponse.json({ error: "crc_token mancante" }, { status: 400 })
  try {
    return NextResponse.json({ response_token: `sha256=${hmacBase64(crcToken)}` })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "CRC X fallito" }, { status: 503 })
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  if (!verifySignature(rawBody, request.headers.get("x-twitter-webhooks-signature"))) {
    return NextResponse.json({ error: "Firma X non valida" }, { status: 401 })
  }

  let payload: any
  try { payload = JSON.parse(rawBody) } catch { return NextResponse.json({ error: "Payload non valido" }, { status: 400 }) }
  const accountId = String(payload?.for_user_id || payload?.user_id || "")
  if (!accountId) return NextResponse.json({ received: true, processed: 0 })

  const jobs: Promise<unknown>[] = []
  for (const tweet of payload?.tweet_create_events || []) {
    const tweetId = String(tweet?.id_str || tweet?.id || "")
    const actorId = String(tweet?.user?.id_str || tweet?.user?.id || "")
    if (!tweetId || actorId === accountId) continue
    jobs.push(ingestSocialInboxEvent({
      provider: "x",
      channel: "x",
      externalAccountId: accountId,
      externalThreadId: `x:mention:${tweetId}`,
      externalMessageId: `x:tweet:${tweetId}`,
      eventType: "mention",
      text: String(tweet?.full_text || tweet?.text || "[Menzione X]"),
      actorId,
      actorName: tweet?.user?.screen_name ? String(tweet.user.screen_name) : null,
      occurredAt: tweet?.created_at ? new Date(tweet.created_at).toISOString() : null,
      metadata: { tweet_id: tweetId },
    }))
  }

  for (const dm of payload?.direct_message_events || []) {
    if (String(dm?.type || "") !== "message_create") continue
    const data = dm?.message_create || {}
    const senderId = String(data?.sender_id || "")
    if (!senderId || senderId === accountId) continue
    const dmId = String(dm?.id || `${senderId}:${dm?.created_timestamp || Date.now()}`)
    jobs.push(ingestSocialInboxEvent({
      provider: "x",
      channel: "x",
      externalAccountId: accountId,
      externalThreadId: `x:dm:${senderId}`,
      externalMessageId: `x:dm:${dmId}`,
      eventType: "direct_message",
      text: String(data?.message_data?.text || "[Messaggio diretto X]"),
      actorId: senderId,
      occurredAt: dm?.created_timestamp ? new Date(Number(dm.created_timestamp)).toISOString() : null,
      metadata: { dm_id: dmId },
    }))
  }

  const results = await Promise.allSettled(jobs)
  const failed = results.filter((result) => result.status === "rejected").length
  if (failed) console.error(`[social/x] ${failed}/${results.length} eventi non importati`)
  return NextResponse.json({ received: true, processed: results.length, failed })
}
