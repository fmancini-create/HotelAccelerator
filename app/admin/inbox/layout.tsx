import type React from "react"
import "./mobile.css"
import { OmnichannelCompose } from "@/components/admin/inbox/omnichannel-compose"
import { InboxViewSwitcher } from "@/components/admin/inbox/inbox-view-switcher"

/**
 * Route-local responsive shell for the operational Inbox and the full email
 * mailbox view. The switcher lives at the route boundary so the operational
 * omnichannel list and the provider-backed mailbox mirror remain separate data
 * models: Sent/Drafts must never be imported as inbound customer messages.
 */
export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <InboxViewSwitcher />

      <div data-inbox-mobile className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
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
    </div>
  )
}
