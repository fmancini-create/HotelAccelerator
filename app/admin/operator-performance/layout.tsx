import type { ReactNode } from "react"

import { requireAreaPage } from "@/lib/auth/area-access"

export default async function OperatorPerformanceLayout({ children }: { children: ReactNode }) {
  // Guardia nel layout: e' il punto dove il progetto applica il controllo d'area
  // (verificato: i page.tsx non la ripetono).
  await requireAreaPage("tracking")
  return <>{children}</>
}
