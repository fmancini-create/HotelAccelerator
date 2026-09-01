"use client"

import type React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowLeft, FolderOpen } from "lucide-react"
import { OmnichannelCompose } from "@/components/admin/inbox/omnichannel-compose"

/**
 * One user-facing Inbox, two internal data sources.
 *
 * The operational conversation list stays DB-driven while email folders such as
 * Sent/Drafts are read directly from the provider. We deliberately keep that
 * technical separation without presenting it as two separate Inbox "modes".
 */
export function InboxShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const emailFoldersOpen = pathname.startsWith("/admin/inbox/email")

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center border-b bg-card">
        <div className="hidden w-[256px] shrink-0 px-4 py-3 sm:block">
          <OmnichannelCompose />
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-between gap-3 px-3 py-2 sm:px-4">
          <span className="truncate text-sm font-semibold">Inbox</span>
          <Link
            href={emailFoldersOpen ? "/admin/inbox" : "/admin/inbox/email"}
            className="inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {emailFoldersOpen ? (
              <ArrowLeft className="h-4 w-4" aria-hidden />
            ) : (
              <FolderOpen className="h-4 w-4" aria-hidden />
            )}
            <span>{emailFoldersOpen ? "Conversazioni" : "Cartelle email"}</span>
          </Link>
        </div>
      </div>

      <div
        data-inbox-mobile
        data-inbox-view={emailFoldersOpen ? "email" : "operational"}
        className="relative min-h-0 min-w-0 flex-1 overflow-hidden"
      >
        {children}
      </div>

      <div className="fixed bottom-4 left-4 z-[70] sm:hidden">
        <OmnichannelCompose />
      </div>

      <style>{`
        /* The mailbox page uses a generic envelope icon in its local heading.
           The unified Inbox shell already supplies the context, so keep the
           heading text and remove the redundant provider-like mark. */
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
