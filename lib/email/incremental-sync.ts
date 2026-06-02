// Reliable incremental email sync — provider-polling based.
//
// This does NOT depend on Gmail push (Pub/Sub) delivery, nor on any internal
// self-fetch via NEXT_PUBLIC_APP_URL. It talks to the Gmail API directly using
// a service-role Supabase client, so it works from a cron with no user session.
//
// It is the safety net that guarantees mail keeps flowing even when the
// real-time push pipeline is down. EmailProcessor deduplicates by external id,
// so running this alongside the webhook is safe (idempotent).

import { OAUTH_PROVIDERS, type OAuthProvider } from "@/lib/oauth-config"
import { EmailProcessor, type InboundEmail } from "@/lib/email/email-processor"
import { parseGmailMessage } from "@/lib/email/gmail-parse"

// How many recent INBOX messages to look at per run, per channel.
// 25 comfortably covers any realistic gap between runs while staying fast.
const MAX_MESSAGES_PER_RUN = 25
const PER_MESSAGE_DELAY_MS = 60

export interface SyncableChannel {
  id: string
  property_id: string
  provider: string
  email_address: string | null
  oauth_access_token: string | null
  oauth_refresh_token: string | null
  oauth_expiry: string | null
}

export interface ChannelSyncResult {
  channelId: string
  email: string | null
  imported: number
  duplicates: number
  errors: number
  scanned: number
  error?: string
}

/**
 * Ensures the channel has a non-expired Gmail access token, refreshing it
 * in-process with the service client when needed. Returns the valid token.
 */
async function ensureGmailToken(
  supabase: any,
  channel: SyncableChannel,
): Promise<{ token: string | null; error?: string }> {
  // 5 minute safety buffer
  const isExpired = channel.oauth_expiry
    ? new Date(channel.oauth_expiry).getTime() < Date.now() + 5 * 60 * 1000
    : true

  if (!isExpired && channel.oauth_access_token) {
    return { token: channel.oauth_access_token }
  }

  if (!channel.oauth_refresh_token) {
    return { token: null, error: "Refresh token mancante. Ricollegare l'account." }
  }

  const config = OAUTH_PROVIDERS[(channel.provider as OAuthProvider) || "gmail"]
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return { token: null, error: "Configurazione OAuth Google mancante" }
  }

  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: channel.oauth_refresh_token,
      grant_type: "refresh_token",
    }),
  })

  if (!res.ok) {
    return { token: null, error: "Refresh token fallito. Ricollegare l'account." }
  }

  const tokens = await res.json()
  const oauth_expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  await supabase
    .from("email_channels")
    .update({
      oauth_access_token: tokens.access_token,
      oauth_expiry,
      ...(tokens.refresh_token && { oauth_refresh_token: tokens.refresh_token }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", channel.id)

  return { token: tokens.access_token }
}

/**
 * Pulls the most recent INBOX messages for a single Gmail channel and runs them
 * through the centralized EmailProcessor (idempotent). Safe to call repeatedly.
 */
export async function syncChannelIncremental(
  supabase: any,
  channel: SyncableChannel,
): Promise<ChannelSyncResult> {
  const out: ChannelSyncResult = {
    channelId: channel.id,
    email: channel.email_address,
    imported: 0,
    duplicates: 0,
    errors: 0,
    scanned: 0,
  }

  if (channel.provider !== "gmail") {
    out.error = "Provider non supportato dal polling (solo Gmail)"
    return out
  }

  const { token, error: tokenError } = await ensureGmailToken(supabase, channel)
  if (!token) {
    out.error = tokenError || "Token non disponibile"
    return out
  }

  // List recent INBOX messages (newest first).
  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages")
  listUrl.searchParams.set("maxResults", String(MAX_MESSAGES_PER_RUN))
  listUrl.searchParams.set("q", "in:inbox")

  const listRes = await fetch(listUrl.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!listRes.ok) {
    out.error = `Gmail list HTTP ${listRes.status}`
    return out
  }

  const listData = await listRes.json()
  const ids: Array<{ id: string }> = listData.messages || []
  if (ids.length === 0) return out

  const processor = new EmailProcessor(supabase)

  for (const { id } of ids) {
    try {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (msgRes.status === 429) break // rate limited, stop early; next run resumes
      if (!msgRes.ok) {
        out.errors++
        out.scanned++
        continue
      }
      const msgData = await msgRes.json()
      const parsed: InboundEmail = parseGmailMessage(msgData)
      const result = await processor.processInboundEmail(parsed, channel.id, channel.property_id)
      if (result?.success) {
        if (result.isDuplicate) out.duplicates++
        else out.imported++
      } else {
        out.errors++
      }
      out.scanned++
      if (PER_MESSAGE_DELAY_MS > 0) {
        await new Promise((r) => setTimeout(r, PER_MESSAGE_DELAY_MS))
      }
    } catch (e) {
      console.error("[v0][incremental-sync] message error:", e)
      out.errors++
      out.scanned++
    }
  }

  await supabase
    .from("email_channels")
    .update({ last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", channel.id)

  return out
}
