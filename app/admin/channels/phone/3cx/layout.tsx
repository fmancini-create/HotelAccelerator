import type { ReactNode } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function ThreeCxAdvancedLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="border-b bg-muted/30">
        <div className="container flex flex-wrap items-center gap-2 py-2">
          <span className="text-sm font-medium">Strumenti specifici 3CX</span>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/channels/phone/audio">Esperienza audio 3CX</Link>
          </Button>
        </div>
      </div>
      {children}
    </>
  )
}
