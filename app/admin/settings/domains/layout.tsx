import type React from "react"
import { requireAdminPage } from "@/lib/auth/require-admin-page"

// Server-side admin guard: domain configuration is admin-only.
// (The /admin/settings hub itself is open to members so they can reach
// "Canali" and "Il Mio Profilo"; admin destinations stay guarded.)
export default async function DomainsLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage()
  return <>{children}</>
}
