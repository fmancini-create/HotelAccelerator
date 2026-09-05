import type { AccessibleChannelIds } from "@/lib/channel-access"

export const SENT_DEFAULT_LIMIT = 50
export const SENT_MAX_LIMIT = 200

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseSentLimit(raw: string | null): number {
  const parsed = Number(raw)
  if (!raw || !Number.isFinite(parsed) || parsed < 1) return SENT_DEFAULT_LIMIT
  return Math.min(Math.floor(parsed), SENT_MAX_LIMIT)
}

export function parseSentOffset(raw: string | null): number {
  const parsed = Number(raw)
  if (!raw || !Number.isFinite(parsed) || parsed < 0) return 0
  return Math.floor(parsed)
}

/**
 * Builds the PostgREST OR applied to the referenced conversations table for a
 * restricted user. Only concrete messaging-channel assignments are accepted.
 *
 * Chat is intentionally absent: the current Inbox cannot prove which embed
 * script owns a legacy chat conversation, so exposing it here would make Sent
 * less restrictive than the Inbox itself.
 */
export function buildSentMessagingAccessFilter(access: AccessibleChannelIds): string | null {
  const ids = Array.from(new Set(access.messagingChannelIds.filter((id) => UUID_RE.test(id))))
  if (ids.length === 0) return null

  const list = ids.join(",")
  return `messaging_channel_id.in.(${list}),metadata->>messaging_channel_id.in.(${list})`
}
