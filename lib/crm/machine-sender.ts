/**
 * Machine-sender detection.
 *
 * Transactional/bulk senders (noreply@, notifications@, newsletter@, ...) are
 * NOT people and must never become CRM contacts. Their mail still has to reach
 * the Inbox, so the conversation is kept and the sender is denormalised onto
 * `conversations.contact_email` / `conversations.contact_name` instead of being
 * modelled as a contact row.
 *
 * The pattern below is the single source of truth. `MACHINE_LOCAL_PART_PATTERN`
 * is exported as a plain string because the historical backfill runs the very
 * same expression inside Postgres (`~`), and a second hand-copied regex would
 * silently drift from this one. Both engines share POSIX-compatible syntax
 * here: character classes, `-?`, alternation and anchors behave identically.
 */

/** Local-part tokens that identify an automated sender. */
export const MACHINE_LOCAL_PART_PATTERN =
  "(^|[._+-])(no-?reply|do-?not-?reply|donotreply|noreplay|non-?rispondere|mailer-?daemon|postmaster|bounce|bounces|notification|notifications|notifica|notifiche|newsletter|digest|alert|alerts|avvisi|automated|automatic|automatico|automatica|auto-?mail|mailer|mailing|no-?answer|unsubscribe|invio-?automatico|comunicazioni)([._+-]|$)"

const MACHINE_LOCAL_PART_REGEX = new RegExp(MACHINE_LOCAL_PART_PATTERN)

/**
 * True when the address belongs to an automated sender.
 *
 * Only the local part is inspected: domain-level heuristics would catch real
 * humans at the same company (a booking notification and a sales rep can share
 * `@booking.com`). A malformed address is not a machine — it is just invalid,
 * and the caller already rejects it.
 */
export function isMachineSender(email: string | null | undefined): boolean {
  const normalized = (email || "").trim().toLowerCase()
  const at = normalized.indexOf("@")
  if (at < 1 || at === normalized.length - 1) return false
  return MACHINE_LOCAL_PART_REGEX.test(normalized.slice(0, at))
}

/**
 * Additional local parts that are not worth chasing for a reply.
 *
 * DELIBERATELY SEPARATE from `MACHINE_LOCAL_PART_PATTERN`, and used ONLY by the
 * Inbox "waiting for a reply" badge — never by CRM capture.
 *
 * The reason is measured, not assumed: adding these tokens to the CRM pattern
 * reclassified 91 of 832 existing contacts as machines, among them
 * `support@bokun.io` ("The Bókun Team") and `marketing@mintsd.com` — real
 * people at supplier companies who would have stopped being contacts. Losing
 * a CRM contact is far worse than an extra badge, so the two questions are kept
 * apart: "may this become a contact?" and "is someone waiting for us?".
 *
 * Being on this list only suppresses a timer. The conversation, the sender and
 * the contact are all unaffected.
 */
const NO_REPLY_EXPECTED_PATTERN =
  "(^|[._+-])(reservation|reservations|prenotazioni|conferma-?ordine|conferma-?ordini|conferme|ordini|delivery|spedizione|spedizioni|tracking|receipt|ricevuta|billing|invoice|invoices|fatturazione)([._+-]|$)"

const NO_REPLY_EXPECTED_REGEX = new RegExp(NO_REPLY_EXPECTED_PATTERN)

/**
 * True when nobody is realistically waiting for us to answer this address:
 * either a machine sender, or a transactional mailbox (order confirmations,
 * booking receipts, shipping notices).
 *
 * Used for display only.
 */
export function isNoReplyExpected(email: string | null | undefined): boolean {
  if (isMachineSender(email)) return true
  const normalized = (email || "").trim().toLowerCase()
  const at = normalized.indexOf("@")
  if (at < 1 || at === normalized.length - 1) return false
  return NO_REPLY_EXPECTED_REGEX.test(normalized.slice(0, at))
}

/**
 * Display label for a conversation whose sender has no CRM contact.
 * Falls back to the address, then to the local part, then to a neutral string,
 * so the Inbox never renders an empty row.
 */
export function machineSenderLabel(email: string | null | undefined, name?: string | null): string {
  const cleanName = (name || "").trim()
  if (cleanName) return cleanName
  const cleanEmail = (email || "").trim()
  if (cleanEmail) return cleanEmail
  return "Mittente automatico"
}
