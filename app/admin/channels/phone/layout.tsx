import type { ReactNode } from "react"
import { requireAdminPage } from "@/lib/auth/require-admin-page"

// Phone channel configuration is tenant-wide and admin-only.
export default async function PhoneChannelLayout({ children }: { children: ReactNode }) {
  await requireAdminPage()
  return <>{children}</>
}
