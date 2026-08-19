import type React from "react"
import { requireAreaPage } from "@/lib/auth/area-access"
import { CrmWorkspaceNav } from "@/components/crm/crm-workspace-nav"

// Members reach this area only if granted the "crm" area (directly or via group).
export default async function CrmAreaLayout({ children }: { children: React.ReactNode }) {
  await requireAreaPage("crm")
  return (
    <div className="min-h-full bg-muted/20">
      <CrmWorkspaceNav />
      <div className="mx-auto max-w-[1600px] p-4 sm:p-6">{children}</div>
    </div>
  )
}
