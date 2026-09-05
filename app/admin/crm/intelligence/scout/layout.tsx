import type React from "react"
import { ScoutAccessGate } from "@/components/crm/scout-access-gate"

export default function ScoutLayout({ children }: { children: React.ReactNode }) {
  return <ScoutAccessGate>{children}</ScoutAccessGate>
}
