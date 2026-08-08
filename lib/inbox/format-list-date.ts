import { format, formatDistanceStrict, isSameDay, isSameYear } from "date-fns"
import { it } from "date-fns/locale"
import { isNoReplyExpected } from "../crm/machine-sender"

/** Gmail keeps showing a clock time for a full 24 hours, not until midnight. */
const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * Gmail-style timestamp for the conversation list.
 *
 * Gmail shows an absolute value, and only widens the unit as the message ages:
 *  - within the last 24 hours -> "23:11"
 *  - earlier this year        -> "7 ago"
 *  - previous years           -> "12/03/24"
 *
 * A relative label ("circa 2 ore") reads fine for fresh mail but degrades fast:
 * it cannot be compared between two rows, it cannot be matched against what
 * Gmail itself shows, and past a day it stops answering "when did this arrive".
 *
 * The window is a ROLLING 24 hours, not the calendar day. This was calendar-day
 * at first, with a comment claiming that was the deliberate, more correct
 * choice; two screenshots taken at 00:14 settled it. Gmail showed `13:00`,
 * `14:03`, `15:11`, `17:08`, `23:46` for mail from the previous calendar day,
 * while our list collapsed all of it - including a message from 15 minutes
 * earlier - into a flat "8 ago". Just after midnight the calendar rule throws
 * away the time on the whole working day just ended, which is exactly the mail
 * someone reading at that hour cares about.
 */
export function formatInboxTimestamp(value: string | Date, now: Date = new Date()): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  const age = now.getTime() - date.getTime()
  // `age >= 0` guards against a clock skew putting a message in the future,
  // which would otherwise fall through to the date branches and read as stale.
  if (age >= 0 && age < RECENT_WINDOW_MS) return format(date, "HH:mm", { locale: it })
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
  // Wider than the CRM rule on purpose. Adding transactional mailboxes such as
  // reservation@scidoo.com to `isMachineSender` would have reclassified 91 of
  // 832 existing CRM contacts (measured), including real people at supplier
  // companies. `isNoReplyExpected` only suppresses this badge.
  if (isNoReplyExpected(senderEmail)) return null

  const date = new Date(lastMessage.created_at)
  if (Number.isNaN(date.getTime())) return null

  // Under an hour the Gmail-style clock already reads as "just now"; a second
  // number next to it would add noise instead of information.
  if (now.getTime() - date.getTime() < 60 * 60 * 1000) return null

  // `formatDistanceToNowStrict` reads Date.now() internally, so the `now`
  // argument above was decorative: the function could not be tested at a fixed
  // instant, and it only appeared to work because the tests happened to run on
  // the same day they were written. `formatDistanceStrict` compares the two
  // instants it is given.
  return formatDistanceStrict(date, now, { locale: it, addSuffix: false })
}
