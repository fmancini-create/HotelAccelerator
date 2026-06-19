import type React from "react"
import { requireAreaPage } from "@/lib/auth/area-access"

export default async function MarketingAreaLayout({ children }: { children: React.ReactNode }) {
  await requireAreaPage("marketing")
  return <>{children}</>
}
