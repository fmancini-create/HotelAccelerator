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

function uniqueUuids(ids: string[]): string[] {
  return Array.from(new Set(ids.filter((id) => UUID_RE.test(id))))
}

/**
 * Builds the PostgREST OR applied to the referenced conversations table for a
 * restricted user. This mirrors the operational Inbox rule: email is linked by
 * `channel_id`; messaging providers may be linked by the current column or by
 * the legacy metadata field.
 *
 * Chat is intentionally absent: the current Inbox cannot prove which embed
 * script owns a legacy chat conversation, so exposing it here would make Sent
 * less restrictive than the Inbox itself.
 */
export function buildSentConversationAccessFilter(access: AccessibleChannelIds): string | null {
  const emailIds = uniqueUuids(access.emailChannelIds)
  const messagingIds = uniqueUuids(access.messagingChannelIds)
  const clauses: string[] = []

  if (emailIds.length > 0) clauses.push(`channel_id.in.(${emailIds.join(",")})`)
  if (messagingIds.length > 0) {
    const list = messagingIds.join(",")
    clauses.push(`messaging_channel_id.in.(${list})`)
    clauses.push(`metadata->>messaging_channel_id.in.(${list})`)
  }

  return clauses.length > 0 ? clauses.join(",") : null
}
