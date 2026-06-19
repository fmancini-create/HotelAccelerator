import type React from "react"
import { requireAdminPage } from "@/lib/auth/require-admin-page"

// Server-side admin guard: tenant settings are admin-only.
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage()
  return <>{children}</>
}
