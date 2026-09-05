import type { ReactNode } from "react"
import Link from "next/link"
import { requireAdminPage } from "@/lib/auth/require-admin-page"
import { Button } from "@/components/ui/button"
import { ActiveTelephonyProviderTools } from "@/components/admin/telephony/active-provider-tools"

// Phone channel configuration is tenant-wide and admin-only. Provider-specific
// tools are rendered only when the backend reports that provider as active.
export default async function PhoneChannelLayout({ children }: { children: ReactNode }) {
  await requireAdminPage()

  return (
    <>
      <div className="sticky top-0 z-[60] border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <div className="container flex flex-wrap items-center gap-2 py-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/channels/phone">Centralino telefonico</Link>
          </Button>
          <ActiveTelephonyProviderTools />
        </div>
      </div>
      {children}
    </>
  )
}
