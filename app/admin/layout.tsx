import type React from "react"
import type { Metadata } from "next"
import { PlatformFooter } from "@/components/platform-footer"

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
  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1">{children}</main>
      <PlatformFooter />
    </div>
  )
}
