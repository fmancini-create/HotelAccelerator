import type React from "react"
import "./mobile.css"
import { OmnichannelCompose } from "@/components/admin/inbox/omnichannel-compose"

/**
 * Route-local responsive shell for the operational Inbox.
 *
 * Desktop intentionally mirrors Gmail: the primary compose action lives on the
 * left, above the mailbox folders. On small screens it falls back to the
 * floating bottom-right action so it remains reachable without stealing space.
 */
export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-inbox-mobile className="relative h-full min-h-0 min-w-0 overflow-hidden">
      {children}
      <div className="fixed left-4 top-[250px] z-[70] max-sm:bottom-5 max-sm:left-auto max-sm:right-5 max-sm:top-auto">
        <OmnichannelCompose />
      </div>
    </div>
  )
}
