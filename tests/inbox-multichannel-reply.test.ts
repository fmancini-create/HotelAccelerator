import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()

function source(path: string) {
  return readFileSync(join(root, path), "utf8")
}

describe("Inbox multichannel reply", () => {
  it("mounts the route-local multichannel enhancer", () => {
    const layout = source("app/admin/inbox/layout.tsx")
    expect(layout).toContain("MultichannelReplyEnhancer")
  })

  it("fans additional replies through the canonical channel composers", () => {
    const route = source("app/api/inbox/[conversationId]/multichannel/route.ts")
    expect(route).toContain('/api/inbox/compose/whatsapp')
    expect(route).toContain('/api/inbox/compose/telegram')
    expect(route).toContain('/api/gmail/compose')
    expect(route).toContain("results.every")
  })

  it("keeps WhatsApp 24h handling in the existing composer and resolves Telegram chats from history", () => {
    const destinations = source("app/api/inbox/[conversationId]/reply-destinations/route.ts")
    const enhancer = source("components/admin/inbox/multichannel-reply-enhancer.tsx")
    expect(destinations).toContain('eq("channel", "telegram")')
    expect(enhancer).toContain("Telegram funziona solo con una chat già avviata")
    expect(enhancer).toContain("channel !== primary")
  })
})
