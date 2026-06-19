import type React from "react"
import { requireAreaPage } from "@/lib/auth/area-access"

export default async function MonitoringAreaLayout({ children }: { children: React.ReactNode }) {
  await requireAreaPage("monitoring")
  return <>{children}</>
}
