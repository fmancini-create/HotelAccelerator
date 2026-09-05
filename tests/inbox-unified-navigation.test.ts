import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()
const source = (path: string) => readFileSync(join(root, path), "utf8")

describe("unified Inbox navigation", () => {
  it("keeps compose out of an absolutely positioned overlay", () => {
    const layout = source("app/admin/inbox/layout.tsx")
    const shell = source("components/admin/inbox/inbox-shell.tsx")

    expect(layout).toContain("<InboxShell>{children}</InboxShell>")
    expect(shell).toContain("w-[256px]")
    expect(shell).toContain("<OmnichannelCompose />")
    expect(shell).not.toContain('top-[7.25rem]')
    expect(shell).not.toContain('absolute left-4')
  })

  it("presents email folders as a subview instead of a second Inbox mode", () => {
    const layout = source("app/admin/inbox/layout.tsx")
    const shell = source("components/admin/inbox/inbox-shell.tsx")

    expect(layout).not.toContain("InboxViewSwitcher")
    expect(shell).toContain("Cartelle email")
    expect(shell).toContain("Conversazioni")
    expect(shell).not.toContain("Inbox omnicanale")
    expect(shell).not.toContain("Posta email")
  })

  it("uses HotelAccelerator branding instead of Gmail branding in the Inbox", () => {
    const shell = source("components/admin/inbox/inbox-shell.tsx")

    expect(shell).not.toMatch(/GmailLogo|gmail-logo|gmail\.svg|gmail\.png/i)
    expect(shell).toContain('/logo-ha-mark-64.png')
    expect(shell).toContain('data-inbox-view={emailFoldersOpen ? "email" : sentOpen ? "sent" : "operational"}')
  })

  it("keeps the common Inbox toolbar compact", () => {
    const shell = source("components/admin/inbox/inbox-shell.tsx")

    expect(shell).toContain('data-inbox-toolbar')
    expect(shell).toContain('min-h-11')
    expect(shell).toContain('height: 2.25rem !important')
    expect(shell).toContain('height: 3.25rem !important')
  })
})
