"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Edit3 } from "lucide-react"
import { Button } from "@/components/ui/button"

export function StudioModernNavigation({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isStudioHome = pathname === "/admin/cms/studio"

  return (
    <div className={isStudioHome ? "cms-studio-home space-y-4" : "space-y-4"}>
      {isStudioHome && (
        <>
          <style>{`
            .cms-studio-home a[href="/admin/cms"] { display: none !important; }
          `}</style>
          <div className="flex flex-col gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Gestisci le pagine nel nuovo editor</p>
              <p className="mt-1 text-sm text-muted-foreground">Creazione, contenuti, menu e SEO sono ora nello stesso builder multipagina.</p>
            </div>
            <Button asChild>
              <Link href="/admin/cms/studio/builder">
                <Edit3 className="mr-2 h-4 w-4" />
                Apri editor multipagina
              </Link>
            </Button>
          </div>
        </>
      )}
      {children}
    </div>
  )
}
