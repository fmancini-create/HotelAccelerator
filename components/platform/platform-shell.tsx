/**
 * PlatformShell
 *
 * Unified chrome used by every internal admin page:
 *   [ PlatformHeader ]     <- fixed height, primary + "Altro" nav, tenant, user
 *   [ <main>          ]     <- flex-1, owns its own scroll; children choose
 *                              whether to stretch (Inbox) or use normal flow.
 *   [ PlatformFooter ]     <- fixed height, minimal
 *
 * The shell is a rigid 100dvh flex column so Gmail-style pages (Inbox) can
 * still stretch full-height *inside* the <main> area without breaking the
 * surrounding header/footer. Child pages that want their own scrollable area
 * can use `h-full` on their root.
 *
 * This is intentionally a server component so it can be used from the admin
 * root layout without opting subtrees into "use client".
 */

import type React from "react"
import { PlatformHeader } from "@/components/platform/platform-header"
import { PlatformFooter } from "@/components/platform/platform-footer"

export function PlatformShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-[100dvh] flex flex-col bg-[#f9fafb] overflow-hidden">
      <PlatformHeader />
      <main className="flex-1 min-h-0 overflow-auto bg-white">{children}</main>
      <PlatformFooter />
    </div>
  )
}
