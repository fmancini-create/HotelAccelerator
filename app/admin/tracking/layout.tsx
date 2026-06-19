import type React from "react"
import { requireAreaPage } from "@/lib/auth/area-access"

export default async function TrackingAreaLayout({ children }: { children: React.ReactNode }) {
  await requireAreaPage("tracking")
  return <>{children}</>
}
