import type { ReactNode } from "react"
import { requireAdminPage } from "@/lib/auth/require-admin-page"

// Chat/widget channel configuration is tenant-wide and admin-only.
export default async function ChatChannelLayout({ children }: { children: ReactNode }) {
  await requireAdminPage()
  return <>{children}</>
}
