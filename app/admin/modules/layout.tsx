import type React from "react"
import { requireAdminPage } from "@/lib/auth/require-admin-page"

// Server-side admin guard: enabling/disabling tenant modules is admin-only.
export default async function ModulesLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage()
  return <>{children}</>
}
