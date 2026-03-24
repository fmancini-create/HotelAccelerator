import type React from "react"
import type { Metadata } from "next"

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
    <div className="h-screen flex flex-col overflow-hidden bg-white">
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
