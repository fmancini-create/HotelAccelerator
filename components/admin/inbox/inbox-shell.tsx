"use client"

import type React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowLeft, FolderOpen, Send } from "lucide-react"
import { OmnichannelCompose } from "@/components/admin/inbox/omnichannel-compose"

/**
 * One user-facing Inbox, multiple internal data sources.
 *
 * Operational conversations and the unified Sent projection are DB-driven.
 * Native email folders (including the provider's own Sent/Drafts) are read
 * directly from the provider under "Cartelle email" so they never pollute
 * customer-message, unread or KPI semantics.
 */
export function InboxShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const emailFoldersOpen = pathname.startsWith("/admin/inbox/email")
  const sentOpen = pathname.startsWith("/admin/inbox/sent")
  const subviewOpen = emailFoldersOpen || sentOpen

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center border-b bg-card">
        <div className="hidden w-[256px] shrink-0 px-4 py-3 sm:block">
          <OmnichannelCompose />
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-between gap-3 px-3 py-2 sm:px-4">
          <span className="truncate text-sm font-semibold">Inbox</span>

          {subviewOpen ? (
            <Link
              href="/admin/inbox"
              className="inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              <span>Conversazioni</span>
            </Link>
          ) : (
            <div className="flex items-center gap-1 sm:gap-2">
              <Link
                href="/admin/inbox/sent"
                className="inline-flex min-h-9 items-center gap-2 rounded-lg px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:px-3"
              >
                <Send className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">Inviati</span>
              </Link>
              <Link
                href="/admin/inbox/email"
                className="inline-flex min-h-9 items-center gap-2 rounded-lg px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:px-3"
              >
                <FolderOpen className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">Cartelle email</span>
              </Link>
            </div>
          )}
        </div>
      </div>

      <div
        data-inbox-mobile
        data-inbox-view={emailFoldersOpen ? "email" : sentOpen ? "sent" : "operational"}
        className="relative min-h-0 min-w-0 flex-1 overflow-hidden"
      >
        {children}
      </div>

      <div className="fixed bottom-4 left-4 z-[70] sm:hidden">
        <OmnichannelCompose />
      </div>

      <style>{`
        /* The native mailbox page can use a generic envelope icon in its local
           heading. The unified Inbox shell already supplies the context, so
           remove only that redundant icon. Sent is NOT a mailbox page. */
        [data-inbox-view="email"] > .flex.h-full.min-h-0.flex-col.bg-card
          > .flex.flex-wrap.items-center.gap-3.border-b
          > .min-w-0
          > .flex.items-center.gap-2
          > svg {
          display: none !important;
        }
      `}</style>
    </div>
  )
}
