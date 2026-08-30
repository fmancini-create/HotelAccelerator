import { createHmac, timingSafeEqual } from "node:crypto"
import { type NextRequest, NextResponse } from "next/server"
import { ingestSocialInboxEvent } from "@/lib/social/inbox"

function secret(): string | null {
  return process.env.LINKEDIN_CLIENT_SECRET || null
}

function verifySignature(rawBody: string, header: string | null): boolean {
  const clientSecret = secret()
  if (!clientSecret || !header?.startsWith("hmacsha256=")) return false
  const expected = `hmacsha256=${createHmac("sha256", clientSecret).update(rawBody).digest("hex")}`
  const actual = Buffer.from(header)
  const wanted = Buffer.from(expected)
  return actual.length === wanted.length && timingSafeEqual(actual, wanted)
}

function organizationId(urn: unknown): string | null {
  const match = String(urn || "").match(/urn:li:organization:(\d+)/)
  return match?.[1] || null
}

export async function GET(request: NextRequest) {
  const challengeCode = request.nextUrl.searchParams.get("challengeCode")
  const clientSecret = secret()
  if (!challengeCode || !clientSecret) {
    return NextResponse.json({ error: "Challenge LinkedIn non valido" }, { status: 400 })
  }
  const challengeResponse = createHmac("sha256", clientSecret).update(challengeCode).digest("hex")
  return NextResponse.json({ challengeCode, challengeResponse })
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  if (!verifySignature(rawBody, request.headers.get("x-li-signature"))) {
    return NextResponse.json({ error: "Firma LinkedIn non valida" }, { status: 401 })
  }

  let payload: any
  try { payload = JSON.parse(rawBody) } catch { return NextResponse.json({ error: "Payload non valido" }, { status: 400 }) }
  if (payload?.type !== "ORGANIZATION_SOCIAL_ACTION_NOTIFICATIONS") {
    return NextResponse.json({ received: true, processed: 0 })
  }

  const jobs: Promise<unknown>[] = []
  for (const notification of payload?.notifications || []) {
    const orgId = organizationId(notification?.organizationalEntity)
    if (!orgId || notification?.notificationId == null) continue
    const action = String(notification?.action || "").toUpperCase()
    const sourcePost = String(notification?.sourcePost || notification?.object || notification?.generatedActivity || notification.notificationId)
    const generatedActivity = String(notification?.generatedActivity || notification?.notificationId)
    const eventType = action === "COMMENT" || action === "ADMIN_COMMENT" || action === "COMMENT_EDIT" || action === "COMMENT_DELETE"
      ? "comment"
      : action === "LIKE"
        ? "reaction"
        : action === "SHARE_MENTION"
          ? "mention"
          : "post"
    const decoratedText = notification?.decoratedGeneratedActivity?.share?.text || notification?.decoratedGeneratedActivity?.comment?.message?.text
    const text = String(decoratedText || `[LinkedIn ${action || "attività"}]`)

    jobs.push(ingestSocialInboxEvent({
      provider: "linkedin",
      channel: "linkedin",
      externalAccountId: orgId,
      externalThreadId: `linkedin:post:${sourcePost}`,
      externalMessageId: `linkedin:notification:${notification.notificationId}`,
      eventType,
      text,
      actorId: notification?.actor ? String(notification.actor) : notification?.subscriber ? String(notification.subscriber) : null,
      occurredAt: notification?.lastModifiedAt ? new Date(Number(notification.lastModifiedAt)).toISOString() : null,
      metadata: {
        action,
        source_post: sourcePost,
        generated_activity: generatedActivity,
        notification_id: notification.notificationId,
      },
    }))
  }

  const results = await Promise.allSettled(jobs)
  const failed = results.filter((result) => result.status === "rejected").length
  if (failed) console.error(`[social/linkedin] ${failed}/${results.length} notifiche non importate`)
  return NextResponse.json({ received: true, processed: results.length, failed })
}
