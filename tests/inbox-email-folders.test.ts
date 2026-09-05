import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()
const source = (path: string) => readFileSync(join(root, path), "utf8")

describe("Inbox full email mailbox", () => {
  it("keeps the omnichannel Inbox and full mailbox as explicit sibling views", () => {
    const switcher = source("components/admin/inbox/inbox-view-switcher.tsx")
    expect(switcher).toContain("Inbox omnicanale")
    expect(switcher).toContain("Posta email")
    expect(switcher).toContain('href="/admin/inbox/email"')
  })

  it("exposes Sent, Drafts, All Mail, Spam and Trash in the mailbox view", () => {
    const mailbox = source("app/admin/inbox/email/page.tsx")
    expect(mailbox).toContain('{ id: "SENT", label: "Posta inviata"')
    expect(mailbox).toContain('{ id: "DRAFT", label: "Bozze"')
    expect(mailbox).toContain('{ id: "ALL", label: "Tutta la posta"')
    expect(mailbox).toContain('{ id: "SPAM", label: "Spam"')
    expect(mailbox).toContain('{ id: "TRASH", label: "Cestino"')
  })

  it("loads mailbox-specific Gmail labels and threads instead of inventing local folders", () => {
    const mailbox = source("app/admin/inbox/email/page.tsx")
    expect(mailbox).toContain("/api/gmail/channels")
    expect(mailbox).toContain("/api/gmail/labels?channelId=")
    expect(mailbox).toContain("/api/gmail/threads?")
    expect(mailbox).toContain("userLabels.map")
    expect(mailbox).toContain("extraSystemLabels.map")
  })

  it("scopes platform super-admin Gmail mailboxes to the tenant selected in the global switcher", () => {
    const resolver = source("lib/gmail-channel-resolver.ts")
    expect(resolver).toContain("readActivePropertyOverride")
    expect(resolver).toContain('.eq("property_id", propertyId)')
    expect(resolver).not.toContain("Super admin: every active Gmail channel")
  })

  it("does not import Sent or Draft messages as inbound customer conversations", () => {
    const fullSync = source("app/api/channels/email/sync/full/route.ts")
    expect(fullSync).toContain('labels.includes("SENT") || labels.includes("DRAFT")')
    expect(fullSync).toContain("EmailProcessor models inbound customer mail")
  })
})
