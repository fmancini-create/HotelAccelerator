import type React from "react"
import { requireAreaPage } from "@/lib/auth/area-access"
import { CrmWorkspaceNav } from "@/components/crm/crm-workspace-nav"
import { AttackPlanReminder } from "@/components/crm/attack-plan-reminder"

// Members reach this area only if granted the "crm" area (directly or via group).
export default async function CrmAreaLayout({ children }: { children: React.ReactNode }) {
  await requireAreaPage("crm")
  return (
    <div data-crm-workspace className="min-h-full bg-muted/20">
      <CrmWorkspaceNav />
      <AttackPlanReminder />
      <div data-crm-workspace-content className="mx-auto max-w-[1600px] p-4 sm:p-6">{children}</div>
    </div>
  )
}
