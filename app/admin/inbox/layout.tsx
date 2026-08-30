import type React from "react"
import "./mobile.css"

/**
 * Route-local responsive shell for the operational Inbox.
 *
 * The Inbox page intentionally owns a dense desktop, Gmail-like layout. Keeping
 * the mobile adaptations at the route boundary avoids duplicating or branching
 * its message, collaboration and channel logic. The data attribute scopes every
 * rule in mobile.css so no other admin page is affected.
 */
export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-inbox-mobile className="h-full min-h-0 min-w-0 overflow-hidden">
      {children}
    </div>
  )
}
