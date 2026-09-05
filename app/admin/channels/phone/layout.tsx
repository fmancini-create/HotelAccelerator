import type { ReactNode } from "react"
import Link from "next/link"
import { requireAdminPage } from "@/lib/auth/require-admin-page"
import { Button } from "@/components/ui/button"

// Phone channel configuration is tenant-wide and admin-only. Provider-specific
// tools live below their provider route: the shared shell must stay PBX-agnostic.
export default async function PhoneChannelLayout({ children }: { children: ReactNode }) {
  await requireAdminPage()

  return (
    <>
      <div className="border-b bg-background">
        <div className="container flex flex-wrap items-center gap-2 py-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/channels/phone">Centralino telefonico</Link>
          </Button>
        </div>
      </div>
      {children}
    </>
  )
}
