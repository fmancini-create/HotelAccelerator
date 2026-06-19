import type React from "react"
import { requireAdminPage } from "@/lib/auth/require-admin-page"

// Server-side admin guard: only super_admins / tenant admins may access the
// user & permission management section. Non-admins are redirected away.
export default async function UsersLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage()
  return <>{children}</>
}
