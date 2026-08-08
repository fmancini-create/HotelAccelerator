import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

let getGmailLabelsWithCounts: typeof import("@/lib/gmail-client").getGmailLabelsWithCounts
let getValidGmailToken: typeof import("@/lib/gmail-client").getValidGmailToken

beforeAll(async () => {
  const gmailClient = await import("@/lib/gmail-client")
  getGmailLabelsWithCounts = gmailClient.getGmailLabelsWithCounts
  getValidGmailToken = gmailClient.getValidGmailToken
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

function expiredChannelSupabase() {
  const single = vi.fn().mockResolvedValue({
    data: {
      id: "channel-1",
      provider: "gmail",
      oauth_access_token: "expired-access-token",
      oauth_refresh_token: "refresh-token",
      oauth_expiry: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      property_id: "property-1",
      email_address: "mail@example.test",
    },
    error: null,
  })
  const selectEq = vi.fn(() => ({ single }))
  const select = vi.fn(() => ({ eq: selectEq }))
  const updateEq = vi.fn().mockResolvedValue({ error: null })
  const update = vi.fn(() => ({ eq: updateEq }))
  return { from: vi.fn(() => ({ select, update })) } as any
}

describe("getGmailLabelsWithCounts", () => {
  it("resolves the database token once for the whole Gmail fan-out", async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        id: "channel-1",
        provider: "gmail",
        oauth_access_token: "access-token",
        oauth_refresh_token: "refresh-token",
        oauth_expiry: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        property_id: "property-1",
        email_address: "mail@example.test",
      },
      error: null,
    })
    const eq = vi.fn(() => ({ single }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))
    const supabase = { from } as any

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith("/labels")) {
        return new Response(
          JSON.stringify({
            labels: [
              { id: "INBOX", name: "INBOX", type: "system" },
              { id: "Label_1", name: "Prenotazioni", type: "user" },
            ],
          }),
          { headers: { "Content-Type": "application/json" } },
        )
      }
      return new Response(
        JSON.stringify({ messagesTotal: 12, messagesUnread: 3, threadsTotal: 8, threadsUnread: 2 }),
        { headers: { "Content-Type": "application/json" } },
      )
    })

    const result = await getGmailLabelsWithCounts("channel-1", supabase)

    expect(result.error).toBeUndefined()
    expect(result.labels).toHaveLength(2)
    expect(from).toHaveBeenCalledTimes(1)
    expect(select).toHaveBeenCalledTimes(1)
    expect(single).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    for (const [, options] of fetchMock.mock.calls) {
      expect((options?.headers as Record<string, string>).Authorization).toBe("Bearer access-token")
    }
  })

  it("treats invalid_grant as a real reconnect requirement", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "client-id")
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret")
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "invalid_grant" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    )

    const result = await getValidGmailToken("channel-1", expiredChannelSupabase())

    expect(result.token).toBeNull()
    expect(result.status).toBe(401)
    expect(result.reconnectRequired).toBe(true)
  })

  it("keeps a temporary Google outage distinct from a revoked OAuth grant", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "client-id")
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret")
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "server_error" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    )

    const result = await getValidGmailToken("channel-1", expiredChannelSupabase())

    expect(result.token).toBeNull()
    expect(result.status).toBe(503)
    expect(result.reconnectRequired).toBe(false)
  })

  it("does not turn a Supabase lookup outage into a fake reconnect request", async () => {
    const single = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "521", message: "Web server is down" },
    })
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq: vi.fn(() => ({ single })) })),
      })),
    } as any

    const result = await getValidGmailToken("channel-1", supabase)

    expect(result.token).toBeNull()
    expect(result.status).toBe(503)
    expect(result.reconnectRequired).toBe(false)
  })
})
