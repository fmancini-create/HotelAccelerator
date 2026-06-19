import type React from "react"
import { requireAreaPage } from "@/lib/auth/area-access"

// Members reach this area only if granted the "crm" area (directly or via group).
export default async function CrmAreaLayout({ children }: { children: React.ReactNode }) {
  await requireAreaPage("crm")
  return <>{children}</>
}
