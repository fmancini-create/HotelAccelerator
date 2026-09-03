import type React from "react"
import Link from "next/link"
import { Mail, Megaphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { requireAreaPage } from "@/lib/auth/area-access"

export default async function MarketingAreaLayout({ children }: { children: React.ReactNode }) {
  await requireAreaPage("marketing")

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/marketing">
            <Mail className="mr-2 h-4 w-4" />
            Email Marketing
          </Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/marketing/ads">
            <Megaphone className="mr-2 h-4 w-4" />
            Smart Ads
          </Link>
        </Button>
      </div>
      {children}
    </div>
  )
}
