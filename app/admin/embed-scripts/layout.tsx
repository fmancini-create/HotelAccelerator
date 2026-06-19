import type React from "react"
import { requireAreaPage } from "@/lib/auth/area-access"

export default async function EmbedScriptsAreaLayout({ children }: { children: React.ReactNode }) {
  await requireAreaPage("embed-scripts")
  return <>{children}</>
}
