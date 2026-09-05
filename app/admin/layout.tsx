import type React from "react"
import type { Metadata } from "next"
import { PlatformShell } from "@/components/platform/platform-shell"
import { ClientToaster } from "@/components/admin/client-toaster"
import { OperatorPresenceBeacon } from "@/components/admin/operator-presence-beacon"
import { AutoLogoutWatchdog } from "@/components/admin/auto-logout-watchdog"
import { InternalSupportAssistant } from "@/components/admin/internal-support-assistant"
import { GlobalCommunicationAlerts } from "@/components/admin/global-communication-alerts"
import { DashboardCardQuickActionMounts } from "@/components/admin/dashboard/dashboard-card-quick-action-mounts"

export const metadata: Metadata = {
  title: {
    default: "Area tenant",
    template: "%s | HotelAccelerator Tenant",
  },
  description: "Area operativa del tenant HotelAccelerator",
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <PlatformShell scope="tenant">
      {children}
      <ClientToaster />
      <OperatorPresenceBeacon />
      <AutoLogoutWatchdog />
      <GlobalCommunicationAlerts />
      <DashboardCardQuickActionMounts />
      <InternalSupportAssistant />
    </PlatformShell>
  )
}
