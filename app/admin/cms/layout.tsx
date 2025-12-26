import type React from "react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "CMS - Admin",
  description: "Gestisci le pagine del tuo sito",
}

export default function CMSLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
