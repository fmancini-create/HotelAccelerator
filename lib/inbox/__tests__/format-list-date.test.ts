import { describe, expect, it } from "vitest"
import { formatInboxTimestamp, formatInboxTimestampFull, formatWaitingSince } from "../format-list-date"

// The reference is the Gmail screenshot taken at 23:13 on 08/08/2026, side by
// side with our Inbox. Every expected value below is what Gmail itself printed
// for that same mail, not what looked plausible.
const NOW = new Date("2026-08-08T23:13:00+02:00")

const at = (iso: string) => new Date(iso)

describe("formatInboxTimestamp", () => {
  it("prints the clock time for mail that arrived today, exactly as Gmail did", () => {
    expect(formatInboxTimestamp(at("2026-08-08T23:11:00+02:00"), NOW)).toBe("23:11")
    expect(formatInboxTimestamp(at("2026-08-08T15:11:00+02:00"), NOW)).toBe("15:11")
    expect(formatInboxTimestamp(at("2026-08-08T14:03:00+02:00"), NOW)).toBe("14:03")
    expect(formatInboxTimestamp(at("2026-08-08T13:00:00+02:00"), NOW)).toBe("13:00")
  })

  it("prints day and short month for older mail in the same year", () => {
    // Gmail showed "7 ago" for these.
    expect(formatInboxTimestamp(at("2026-08-07T09:30:00+02:00"), NOW)).toBe("7 ago")
    expect(formatInboxTimestamp(at("2026-01-03T09:30:00+01:00"), NOW)).toBe("3 gen")
  })

  it("falls back to a numeric date once the year changes", () => {
    expect(formatInboxTimestamp(at("2025-12-31T23:59:00+01:00"), NOW)).toBe("31/12/25")
    expect(formatInboxTimestamp(at("2024-03-12T08:00:00+01:00"), NOW)).toBe("12/03/24")
  })

  it("does not treat 'same date last year' as today", () => {
    // A naive same-day check that ignores the year would print "23:11" here.
    expect(formatInboxTimestamp(at("2025-08-08T23:11:00+02:00"), NOW)).toBe("08/08/25")
  })

  it("keeps the clock time across midnight, as Gmail does", () => {
    // THE CASE THAT WAS WRONG. This used to assert "7 ago" for late-yesterday
    // mail, encoding a calendar-day rule as if it were the correct one.
    // Screenshots taken at 00:14 on 09/08 settled it: Gmail printed 23:59,
    // 23:57, 23:53, 23:50, 23:46, 17:08, 15:11, 14:03, 13:00 for mail from
    // 08/08, while our list showed a flat "8 ago" - even for a message that
    // had arrived 15 minutes earlier.
    const JUST_AFTER_MIDNIGHT = new Date("2026-08-09T00:14:00+02:00")
    expect(formatInboxTimestamp(at("2026-08-09T00:12:00+02:00"), JUST_AFTER_MIDNIGHT)).toBe("00:12")
    expect(formatInboxTimestamp(at("2026-08-08T23:59:00+02:00"), JUST_AFTER_MIDNIGHT)).toBe("23:59")
    expect(formatInboxTimestamp(at("2026-08-08T17:08:00+02:00"), JUST_AFTER_MIDNIGHT)).toBe("17:08")
    expect(formatInboxTimestamp(at("2026-08-08T13:00:00+02:00"), JUST_AFTER_MIDNIGHT)).toBe("13:00")
    // Past 24 hours it becomes a date again, exactly like Gmail's "7 ago".
    expect(formatInboxTimestamp(at("2026-08-07T23:00:00+02:00"), JUST_AFTER_MIDNIGHT)).toBe("7 ago")
  })

  it("switches to a date at the 24-hour boundary, not before", () => {
    // One minute either side of the edge, so an off-by-one cannot slip through.
    expect(formatInboxTimestamp(at("2026-08-07T23:14:00+02:00"), NOW)).toBe("23:14")
    expect(formatInboxTimestamp(at("2026-08-07T23:12:00+02:00"), NOW)).toBe("7 ago")
  })

  it("still shows a time for today's mail even when the clock is skewed", () => {
    // A message stamped slightly in the future must not fall through and read
    // as stale; the calendar-day branch catches it.
    expect(formatInboxTimestamp(at("2026-08-08T23:20:00+02:00"), NOW)).toBe("23:20")
  })

  it("returns an empty string instead of 'Invalid Date' for unusable input", () => {
    expect(formatInboxTimestamp("non-una-data", NOW)).toBe("")
  })
})

describe("formatInboxTimestampFull", () => {
  it("spells out the full instant for the tooltip", () => {
    expect(formatInboxTimestampFull(at("2026-08-08T23:11:00+02:00"))).toContain("8 agosto 2026")
    expect(formatInboxTimestampFull("non-una-data")).toBe("")
  })
})

describe("formatWaitingSince", () => {
  it("reports the wait while the last word is the customer's", () => {
    expect(formatWaitingSince({ sender_type: "customer", created_at: "2026-08-08T20:13:00+02:00" }, NOW)).toBe("3 ore")
    expect(formatWaitingSince({ sender_type: "customer", created_at: "2026-08-06T23:13:00+02:00" }, NOW)).toBe("2 giorni")
  })

  it("measures against the instant it is given, not the real clock", () => {
    // This function used to call formatDistanceToNowStrict, which reads
    // Date.now() internally: the `now` argument was ignored and the tests only
    // passed because they ran on the day they were written. A reference date
    // far from today makes that impossible to hide.
    const LAST_YEAR = new Date("2025-03-10T12:00:00+01:00")
    expect(formatWaitingSince({ sender_type: "customer", created_at: "2025-03-10T09:00:00+01:00" }, LAST_YEAR)).toBe(
      "3 ore",
    )
    expect(formatWaitingSince({ sender_type: "customer", created_at: "2025-03-08T12:00:00+01:00" }, LAST_YEAR)).toBe(
      "2 giorni",
    )
  })

  it("stays silent once we have replied: the clock is no longer running", () => {
    expect(formatWaitingSince({ sender_type: "agent", created_at: "2026-08-08T20:13:00+02:00" }, NOW)).toBeNull()
    expect(formatWaitingSince({ sender_type: "system", created_at: "2026-08-08T20:13:00+02:00" }, NOW)).toBeNull()
  })

  it("stays silent under an hour, where the timestamp already says it", () => {
    expect(formatWaitingSince({ sender_type: "customer", created_at: "2026-08-08T22:45:00+02:00" }, NOW)).toBeNull()
  })

  it("stays silent for machine senders, who are not waiting for anything", () => {
    // Measured against real production rows: these two printed "un'ora" and
    // "2 ore" before the rule was applied.
    const inbound = { sender_type: "customer", created_at: "2026-08-08T20:13:00+02:00" }
    expect(formatWaitingSince(inbound, NOW, "no-reply@amazon.it")).toBeNull()
    expect(formatWaitingSince(inbound, NOW, "notifications@vercel.com")).toBeNull()
    expect(formatWaitingSince(inbound, NOW, "noreply@santaddeo.com")).toBeNull()
  })

  it("documents the senders the shared rule does NOT cover", () => {
    // `conferma-ordine@amazon.it` is plainly automated, but the CRM rule is
    // deliberately narrow and does not match it, so the wait still shows.
    // Widening the rule from here would silently change who gets captured as a
    // contact in production, which is not this change's business.
    const inbound = { sender_type: "customer", created_at: "2026-08-08T20:13:00+02:00" }
    expect(formatWaitingSince(inbound, NOW, "conferma-ordine@amazon.it")).toBe("3 ore")
  })

  it("still reports the wait for a real person", () => {
    const inbound = { sender_type: "customer", created_at: "2026-08-08T20:13:00+02:00" }
    expect(formatWaitingSince(inbound, NOW, "deborah.morin@gmail.com")).toBe("3 ore")
    // An address that merely contains a keyword must not be silenced.
    expect(formatWaitingSince(inbound, NOW, "digestivo@ristorante.it")).toBe("3 ore")
    // No address known at all: fall back to showing the wait.
    expect(formatWaitingSince(inbound, NOW, null)).toBe("3 ore")
  })

  it("stays silent when there is no last message at all", () => {
    // The list used to read `conv.lastMessage` while the API sends
    // `last_message`, so this argument was permanently undefined.
    expect(formatWaitingSince(null, NOW)).toBeNull()
    expect(formatWaitingSince(undefined, NOW)).toBeNull()
    expect(formatWaitingSince({ sender_type: "customer", created_at: null }, NOW)).toBeNull()
  })
})
