import type React from "react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: {
    default: "HotelAccelerator - Software Gestionale per Hotel",
    template: "%s | HotelAccelerator",
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
