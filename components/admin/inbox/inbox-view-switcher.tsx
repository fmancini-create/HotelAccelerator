"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Inbox, Mail } from "lucide-react"
import { cn } from "@/lib/utils"

export function InboxViewSwitcher() {
  const pathname = usePathname()
  const emailView = pathname.startsWith("/admin/inbox/email")

  return (
    <div className="flex flex-shrink-0 items-center gap-1 border-b bg-card px-2 py-2 sm:px-4" aria-label="Viste Inbox">
      <Link
        href="/admin/inbox"
        className={cn(
          "inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors",
          !emailView ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <Inbox className="h-4 w-4" aria-hidden />
        <span>Inbox omnicanale</span>
      </Link>
      <Link
        href="/admin/inbox/email"
        className={cn(
          "inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors",
          emailView ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <Mail className="h-4 w-4" aria-hidden />
        <span>Posta email</span>
      </Link>
    </div>
  )
}
