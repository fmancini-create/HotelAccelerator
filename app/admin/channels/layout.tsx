import type React from "react"
import { requireAdminPage } from "@/lib/auth/require-admin-page"

// Server-side admin guard: channel configuration & assignment management is
// admin-only. Non-admin members reach their assigned channels via the Inbox.
export default async function ChannelsLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage()
  return <>{children}</>
}
