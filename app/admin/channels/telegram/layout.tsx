import type { ReactNode } from "react"
import { requireAdminPage } from "@/lib/auth/require-admin-page"

// Telegram channel configuration is tenant-wide and admin-only.
export default async function TelegramChannelLayout({ children }: { children: ReactNode }) {
  await requireAdminPage()
  return <>{children}</>
}
