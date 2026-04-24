import type React from "react"
import type { Metadata } from "next"
import { PlatformShell } from "@/components/platform/platform-shell"

export const metadata: Metadata = {
  title: {
    default: "Admin",
    template: "%s | HotelAccelerator Admin",
  },
  description: "Dashboard amministrativa HotelAccelerator",
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <PlatformShell>{children}</PlatformShell>
}
