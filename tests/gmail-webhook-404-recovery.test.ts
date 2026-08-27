import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const webhook = readFileSync(
  join(process.cwd(), "app/api/channels/email/webhook/gmail/route.ts"),
  "utf8",
)

describe("Gmail Pub/Sub 404 recovery", () => {
  it("acknowledges an expired history cursor instead of retrying forever", () => {
    expect(webhook).toContain('status === 404')
    expect(webhook).toContain('result.retryable = status !== 401 && status !== 404')
    expect(webhook).toContain('status: "history_cursor_expired"')
    expect(webhook).toContain('recovery: "full_sync_required"')
    expect(webhook).toContain("history cursor expired; notification acknowledged")
  })

  it("treats a disappeared message as a durable tombstone", () => {
    expect(webhook).toContain('if (status === 404)')
    expect(webhook).toContain('return { success: true, skipped: true }')
    expect(webhook).toContain("message disappeared before fetch; skipping")
    expect(webhook).toContain("messagesSkipped")
  })

  it("keeps transient Gmail failures retryable", () => {
    expect(webhook).toContain('"GMAIL_TEMPORARILY_UNAVAILABLE"')
    expect(webhook).toContain('retryResponse(syncResult.failureCode || "SYNC_INCOMPLETE")')
    expect(webhook).toContain('status: 503, headers: { "Retry-After": "15" }')
  })
})
