import type React from "react"
import { ScoutAssignedWorkPanel } from "@/components/crm/scout-assigned-work-panel"

export default function ProspectingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ScoutAssignedWorkPanel />
      {children}
    </>
  )
}
