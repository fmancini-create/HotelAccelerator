import { format, formatDistanceToNowStrict, isSameDay, isSameYear } from "date-fns"
import { it } from "date-fns/locale"
import { isMachineSender } from "../crm/machine-sender"

/**
 * Gmail-style timestamp for the conversation list.
 *
 * Gmail shows an absolute value, and only widens the unit as the message ages:
 *  - today            -> "23:11"
 *  - earlier this year -> "7 ago"
 *  - previous years   -> "12/03/24"
 *
 * A relative label ("circa 2 ore") reads fine for fresh mail but degrades fast:
 * it cannot be compared between two rows, it cannot be matched against what
 * Gmail itself shows, and past a day it stops answering "when did this arrive".
 */
export function formatInboxTimestamp(value: string | Date, now: Date = new Date()): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  if (isSameDay(date, now)) return format(date, "HH:mm", { locale: it })
  if (isSameYear(date, now)) return format(date, "d MMM", { locale: it })
  return format(date, "dd/MM/yy", { locale: it })
}

/** Full date for the tooltip, so the exact instant is always one hover away. */
export function formatInboxTimestampFull(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return format(date, "EEEE d MMMM yyyy, HH:mm", { locale: it })
}

/**
 * How long a conversation has been waiting for us.
 *
 * Only meaningful while the last message is inbound: once someone replies, the
 * clock is no longer running and the value would be noise. Returns null when
 * there is nothing to report, so the caller renders nothing at all.
 *
 * Machine senders are excluded too. They also arrive as `sender_type:
 * "customer"`, so without this the badge showed up on `no-reply@amazon.it` and
 * `notifications@vercel.com` — the bulk of this inbox — announcing a reply
 * nobody is waiting for. A wait that is always on stops meaning anything.
 */
export function formatWaitingSince(
  lastMessage: { sender_type?: string | null; created_at?: string | null } | null | undefined,
  now: Date = new Date(),
  senderEmail?: string | null,
): string | null {
  if (!lastMessage?.created_at) return null
  if (lastMessage.sender_type !== "customer") return null
  if (isMachineSender(senderEmail)) return null

  const date = new Date(lastMessage.created_at)
  if (Number.isNaN(date.getTime())) return null

  // Under an hour the Gmail-style clock already reads as "just now"; a second
  // number next to it would add noise instead of information.
  if (now.getTime() - date.getTime() < 60 * 60 * 1000) return null

  return formatDistanceToNowStrict(date, { locale: it, addSuffix: false })
}
