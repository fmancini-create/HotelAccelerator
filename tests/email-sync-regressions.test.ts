import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  deriveInboundConversationState,
  isUnreadFromGmailLabels,
  statusFromGmailLabels,
} from "@/lib/email/email-processor"
import { listRecentInboxMessageIds } from "@/lib/email/incremental-sync"

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
})
