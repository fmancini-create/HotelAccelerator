import type React from "react"
import "./mobile.css"
import { OmnichannelCompose } from "@/components/admin/inbox/omnichannel-compose"

/**
 * Route-local responsive shell for the operational Inbox.
 *
 * The Inbox page intentionally owns a dense desktop, Gmail-like layout. Keeping
 * the mobile adaptations at the route boundary avoids duplicating or branching
 * its message, collaboration and channel logic. The data attribute scopes every
 * rule in mobile.css so no other admin page is affected.
 *
 * The compose action belongs on the left, like Gmail's "Scrivi". Because the
 * folder sidebar is rendered by the page itself, reserve real vertical space in
 * that sidebar instead of simply overlaying the first folder row.
 */
export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-inbox-mobile className="relative h-full min-h-0 min-w-0 overflow-hidden">
      {children}

      <style>{`
        @media (min-width: 640px) {
          [data-inbox-mobile] .flex-shrink-0.flex.flex-col.py-2.overflow-y-auto.overflow-x-hidden {
            padding-top: 4.5rem !important;
          }
        }
      `}</style>

      <div className="absolute left-4 top-[7.25rem] z-[70] hidden sm:block">
        <OmnichannelCompose />
      </div>
      <div className="fixed bottom-4 left-4 z-[70] sm:hidden">
        <OmnichannelCompose />
      </div>
    </div>
  )
}
