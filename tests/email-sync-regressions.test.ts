import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  deriveInboundConversationState,
  isUnreadFromGmailLabels,
  statusFromGmailLabels,
} from "@/lib/email/email-processor"
import { listRecentInboxMessageIds } from "@/lib/email/incremental-sync"
import { syncHistoricalChannels } from "@/lib/email/full-sync-client"

vi.mock("server-only", () => ({}))

const root = process.cwd()

function source(path: string) {
  return readFileSync(join(root, path), "utf8")
}

function typescriptFiles(path: string): string[] {
  const absolute = join(root, path)
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relative = join(path, entry.name)
    if (entry.isDirectory()) return typescriptFiles(relative)
    return /\.tsx?$/.test(entry.name) ? [relative] : []
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("email synchronization regressions", () => {
  it("derives read and folder state from Gmail labels", () => {
    expect(isUnreadFromGmailLabels(["INBOX", "UNREAD"])).toBe(true)
    expect(isUnreadFromGmailLabels(["INBOX"])).toBe(false)
    expect(isUnreadFromGmailLabels(undefined)).toBe(true)
    expect(statusFromGmailLabels(["INBOX"])).toBe("open")
    expect(statusFromGmailLabels(["SPAM", "INBOX"])).toBe("spam")
    expect(statusFromGmailLabels(["TRASH"])).toBe("deleted")
    expect(statusFromGmailLabels(["IMPORTANT"])).toBe("resolved")
  })

  it("keeps an existing conversation timestamp stable during an older historical import", () => {
    expect(
      deriveInboundConversationState(
        {
          unread_count: 3,
          last_message_at: "2026-08-08T12:00:00.000Z",
          status: "open",
        },
        "2026-07-01T08:00:00.000Z",
        false,
        ["INBOX"],
      ),
    ).toEqual({
      unread_count: 3,
      last_message_at: "2026-08-08T12:00:00.000Z",
    })
  })

  it("does not overwrite an application workflow status with the Gmail inbox folder", () => {
    expect(
      deriveInboundConversationState(
        {
          unread_count: 0,
          last_message_at: "2026-08-08T10:00:00.000Z",
          status: "pending",
        },
        "2026-08-08T11:00:00.000Z",
        true,
        ["INBOX", "UNREAD"],
      ),
    ).toEqual({
      unread_count: 1,
      last_message_at: "2026-08-08T11:00:00.000Z",
      gmail_labels: ["INBOX", "UNREAD"],
    })
  })

  it("paginates the Gmail polling window completely before declaring it safe", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({ id: `message-${index}` }))
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ messages: firstPage, nextPageToken: "page-2" }), {
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ messages: [{ id: "message-100" }] }), {
          headers: { "Content-Type": "application/json" },
        }),
      )

    const result = await listRecentInboxMessageIds("token", "in:inbox after:1", 200)

    expect(result.complete).toBe(true)
    expect(result.ids).toHaveLength(101)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("refuses to advance from a truncated Gmail polling window", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          messages: [{ id: "message-1" }, { id: "message-2" }],
          nextPageToken: "still-more",
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
    )

    const result = await listRecentInboxMessageIds("token", "in:inbox after:1", 2)

    expect(result.complete).toBe(false)
    expect(result.ids).toEqual([])
    expect(result.error).toContain("sincronizzazione storica")
  })

  it("uses a service client and retryable failures in the Pub/Sub webhook", () => {
    const webhook = source("app/api/channels/email/webhook/gmail/route.ts")

    expect(webhook).toContain("createServiceClient")
    expect(webhook).toContain("CURSOR_UPDATE_FAILED")
    expect(webhook).toContain('status: 503, headers: { "Retry-After": "15" }')
    expect(webhook).not.toContain("Always return 200 to prevent Pub/Sub retries")
  })

  it("never serializes NextResponse.json as a JSON value", () => {
    const apiSource = typescriptFiles("app/api").map(source).join("\n")

    expect(apiSource).not.toMatch(
      /const\s*\{\s*status\s*,\s*json\s*\}\s*=\s*handleServiceError/,
    )
  })

  it("does not import Sent or Draft mail as inbound customers", () => {
    const fullSync = source("app/api/channels/email/sync/full/route.ts")

    expect(fullSync).toContain('labels.includes("SENT") || labels.includes("DRAFT")')
    expect(fullSync).toContain("full_sync_start_history_id")
    expect(fullSync).toContain("promoteFullSyncCursor")
  })

  it("runs historical synchronization for every Gmail mailbox", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ done: true, processed: 10, imported: 8, duplicates: 2, errors: 0 })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ done: false, processed: 50, imported: 45, duplicates: 5, errors: 0 })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ done: true, processed: 70, imported: 62, duplicates: 8, errors: 0 })),
      )

    const result = await syncHistoricalChannels([
      { id: "channel-a", email: "a@example.com" },
      { id: "channel-b", email: "b@example.com" },
    ])

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).channel_id)).toEqual([
      "channel-a",
      "channel-b",
      "channel-b",
    ])
    expect(result).toMatchObject({
      channelIndex: 2,
      channelCount: 2,
      processed: 80,
      imported: 70,
      duplicates: 10,
      errors: 0,
    })
  })

  it("starts a tenant-scoped initial history import after Gmail OAuth", () => {
    const callback = source("app/api/channels/email/oauth/callback/route.ts")
    const emailPage = source("app/admin/channels/email/email-channels-client.tsx")
    const debugRoute = source("app/api/inbox/debug/route.ts")

    expect(callback).toContain("getAuthenticatedPropertyId(request)")
    expect(callback).toContain("authenticatedPropertyId !== property_id")
    expect(callback).toContain('destination.searchParams.set("initial_sync", channel.id)')
    expect(emailPage).toContain("syncHistoricalChannels")
    expect(emailPage).toContain('channel.full_sync_status === "running"')
    expect(debugRoute).toContain("channels: serializedChannels")
    expect(debugRoute).not.toContain('.eq("provider", "gmail")\n      .maybeSingle()')
  })

  it("does not let the partial interactive refresh move the durable polling watermark", () => {
    const interactiveSync = source("app/api/channels/email/sync/route.ts")

    expect(interactiveSync).not.toContain("last_sync_at:")
  })

  it("distinguishes a transient outage from an OAuth reconnect", () => {
    const inbox = source("app/admin/inbox/page.tsx")

    expect(inbox).toContain("Sincronizzazione Gmail rallentata")
    expect(inbox).toContain("Nessuna riconnessione è necessaria")
    expect(inbox).toContain('errorData?.code === "GMAIL_RECONNECT_REQUIRED"')
  })

  it("reads debug message subjects from metadata instead of a missing column", () => {
    const debugRoute = source("app/api/inbox/debug/route.ts")

    expect(debugRoute).toContain('select("id, metadata, received_at, created_at")')
    expect(debugRoute).toContain('select("id, metadata, sender_email, received_at, created_at")')
    expect(debugRoute).toContain("messageSubject(lastMessage?.metadata)")
    expect(debugRoute).not.toMatch(/select\(["']id,\s*subject/)
  })

  it("keeps automatic Smart Inbox refresh tenant-scoped and backpressured", () => {
    const inbox = source("app/admin/inbox/page.tsx")

    expect(inbox).toContain("conversationsLoadInFlightRef")
    expect(inbox).toContain("scheduleRealtimeReload")
    expect(inbox).toContain("filter: tenantFilter")
    expect(inbox).not.toContain("const syncInterval = setInterval")
    expect(inbox).not.toMatch(
      /useEffect\(\(\) => \{\s*if \(inboxMode === ["']smart["']\) \{\s*performInitialSmartSync\(\)/,
    )
  })

  it("contains legacy duplicate contacts and Gmail threads instead of multiplying them", () => {
    const autoCapture = source("lib/crm/auto-capture.ts")
    const processor = source("lib/email/email-processor.ts")

    expect(
      autoCapture.match(/\.order\("created_at", \{ ascending: true \}\)\s*\.limit\(1\)/g),
    ).toHaveLength(2)
    expect(processor).toContain("byThreadCandidates")
    expect(processor).toContain('.in("conversation_id", candidateIds)')
    expect(processor).toContain("linkedConversation?.conversation_id")
  })
})
