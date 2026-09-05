import type { ReactNode } from "react"
import Link from "next/link"
import { requireAdminPage } from "@/lib/auth/require-admin-page"
import { Button } from "@/components/ui/button"

// Phone channel configuration is tenant-wide and admin-only.
export default async function PhoneChannelLayout({ children }: { children: ReactNode }) {
  await requireAdminPage()

  return (
    <>
      <div className="sticky top-0 z-[60] border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <div className="container flex flex-wrap items-center gap-2 py-3">
          <span className="mr-1 text-xs font-medium text-muted-foreground">Telefono IP</span>
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/channels/phone">Configurazione telefono</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/channels/phone/audio">Esperienza audio 3CX</Link>
          </Button>
        </div>
      </div>
      {children}
    </>
  )
}
