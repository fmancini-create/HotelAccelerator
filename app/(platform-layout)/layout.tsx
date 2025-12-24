import type React from "react"
import type { Metadata } from "next"
import { PlatformFooter } from "@/components/platform-footer"

export const metadata: Metadata = {
  title: {
    default: "HotelAccelerator",
    template: "%s | HotelAccelerator",
  },
  description: "Piattaforma SaaS per la gestione intelligente degli hotel",
}

export default function PlatformLayout({
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
