import { beforeAll, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const getValidGmailToken = vi.fn()
const gmailFetchWithToken = vi.fn()

vi.mock("@/lib/gmail-client", () => ({
  getValidGmailToken,
  gmailFetchWithToken,
}))

let sendGmailEmailWithServiceClient: typeof import("@/lib/email/gmail-service-send").sendGmailEmailWithServiceClient

beforeAll(async () => {
  ;({ sendGmailEmailWithServiceClient } = await import("@/lib/email/gmail-service-send"))
})

function channelSupabase(isActive: boolean) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: {
      email_address: "reception@example.test",
      display_name: "Reception",
      provider: "gmail",
      is_active: isActive,
    },
    error: null,
  })
  const eqId = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq: eqId }))
  return { from: vi.fn(() => ({ select })) } as any
}

describe("sendGmailEmailWithServiceClient", () => {
  it("refuses an inactive mailbox before resolving a Gmail token", async () => {
    getValidGmailToken.mockReset()
    gmailFetchWithToken.mockReset()

    const result = await sendGmailEmailWithServiceClient(
      channelSupabase(false),
      "channel-1",
      "guest@example.test",
      "Re: Test",
      "<p>Risposta</p>",
      "gmail-message-1",
      "gmail-thread-1",
    )

    expect(result).toEqual({ success: false, error: "Canale email disattivato" })
    expect(getValidGmailToken).not.toHaveBeenCalled()
    expect(gmailFetchWithToken).not.toHaveBeenCalled()
  })

  it("uses the caller service client for token resolution on an active mailbox", async () => {
    getValidGmailToken.mockReset()
    gmailFetchWithToken.mockReset()
    getValidGmailToken.mockResolvedValue({ token: "token", error: null, status: 200, reconnectRequired: false })
    gmailFetchWithToken.mockResolvedValue({ data: { id: "sent-1" }, error: null, status: 200 })
    const supabase = channelSupabase(true)

    const result = await sendGmailEmailWithServiceClient(
      supabase,
      "channel-1",
      "guest@example.test",
      "Re: Test",
      "<p>Risposta</p>",
      "gmail-message-1",
      "gmail-thread-1",
    )

    expect(result).toEqual({ success: true, messageId: "sent-1" })
    expect(getValidGmailToken).toHaveBeenCalledWith("channel-1", supabase)
    expect(gmailFetchWithToken).toHaveBeenCalledOnce()
  })
})
