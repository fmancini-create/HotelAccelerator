import type { ReactNode } from "react"
import { requireAdminPage } from "@/lib/auth/require-admin-page"

// WhatsApp channel configuration is tenant-wide and admin-only.
export default async function WhatsappChannelLayout({ children }: { children: ReactNode }) {
  await requireAdminPage()
  return <>{children}</>
}
