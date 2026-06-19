import type React from "react"
import { requireAreaPage } from "@/lib/auth/area-access"

export default async function MessageRulesAreaLayout({ children }: { children: React.ReactNode }) {
  await requireAreaPage("message-rules")
  return <>{children}</>
}
