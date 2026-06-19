import type React from "react"
import type { Metadata } from "next"
import { requireAreaPage } from "@/lib/auth/area-access"

export const metadata: Metadata = {
  title: "CMS - Admin",
  description: "Gestisci le pagine del tuo sito",
}

export default async function CMSLayout({ children }: { children: React.ReactNode }) {
  await requireAreaPage("cms")
  return <>{children}</>
}
