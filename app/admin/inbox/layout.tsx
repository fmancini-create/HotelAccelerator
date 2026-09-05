import type React from "react"
import "./mobile.css"
import { InboxShell } from "@/components/admin/inbox/inbox-shell"
import { MultichannelReplyEnhancer } from "@/components/admin/inbox/multichannel-reply-enhancer"

/**
 * Route-local shell for a single user-facing Inbox.
 *
 * The operational conversation view and the direct email-folder view still use
 * separate data models internally so Sent/Drafts never become inbound customer
 * messages, but the user no longer has to understand or choose between two
 * technical "modes".
 */
export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return (
    <InboxShell>
      <MultichannelReplyEnhancer />
      {children}
    </InboxShell>
  )
}
