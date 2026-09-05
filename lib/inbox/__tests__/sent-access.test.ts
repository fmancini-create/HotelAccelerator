import { describe, expect, it } from "vitest"
import {
  SENT_DEFAULT_LIMIT,
  SENT_MAX_LIMIT,
  buildSentConversationAccessFilter,
  parseSentLimit,
  parseSentOffset,
} from "@/lib/inbox/sent-access"

describe("sent inbox access helpers", () => {
  it("bounds pagination values", () => {
    expect(parseSentLimit(null)).toBe(SENT_DEFAULT_LIMIT)
    expect(parseSentLimit("0")).toBe(SENT_DEFAULT_LIMIT)
    expect(parseSentLimit("abc")).toBe(SENT_DEFAULT_LIMIT)
    expect(parseSentLimit("25")).toBe(25)
    expect(parseSentLimit("9999")).toBe(SENT_MAX_LIMIT)
    expect(parseSentOffset(null)).toBe(0)
    expect(parseSentOffset("-1")).toBe(0)
    expect(parseSentOffset("75.8")).toBe(75)
  })

  it("combines assigned email and messaging channels", () => {
    const filter = buildSentConversationAccessFilter({
      emailChannelIds: ["11111111-1111-4111-8111-111111111111"],
      messagingChannelIds: ["22222222-2222-4222-8222-222222222222"],
      chatChannelIds: [],
    })

    expect(filter).toContain("channel_id.in.(11111111-1111-4111-8111-111111111111)")
    expect(filter).toContain("messaging_channel_id.in.(22222222-2222-4222-8222-222222222222)")
    expect(filter).toContain("metadata->>messaging_channel_id.in.(22222222-2222-4222-8222-222222222222)")
  })

  it("drops invalid ids instead of interpolating them into PostgREST filters", () => {
    const filter = buildSentConversationAccessFilter({
      emailChannelIds: ["not-a-uuid),property_id.neq.safe"],
      messagingChannelIds: [],
      chatChannelIds: ["33333333-3333-4333-8333-333333333333"],
    })

    expect(filter).toBeNull()
  })
})
