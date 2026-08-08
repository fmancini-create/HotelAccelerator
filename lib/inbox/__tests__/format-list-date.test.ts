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

  it("distinguishes midnight today from late yesterday", () => {
    expect(formatInboxTimestamp(at("2026-08-08T00:04:00+02:00"), NOW)).toBe("00:04")
    expect(formatInboxTimestamp(at("2026-08-07T23:58:00+02:00"), NOW)).toBe("7 ago")
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
