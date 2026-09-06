"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Headphones, HeartHandshake, Users } from "lucide-react"

const LINKS = [
  {
    href: "/super-admin/crm",
    label: "CRM 4BID",
    icon: Users,
    exact: true,
  },
  {
    href: "/super-admin/crm/support",
    label: "Assistenza 4BID",
    icon: Headphones,
    exact: false,
  },
  {
    href: "/super-admin/crm/success",
    label: "Customer Success",
    icon: HeartHandshake,
    exact: false,
  },
] as const

export function SuperAdminCrmQuickNav() {
  const pathname = usePathname() || ""

  return (
    <nav
      aria-label="CRM e assistenza 4BID"
      className="flex-shrink-0 overflow-x-auto border-b border-border bg-background px-3 py-2 sm:px-4"
    >
      <div className="mx-auto flex max-w-screen-2xl items-center gap-2">
        {LINKS.map((item) => {
          const Icon = item.icon
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={[
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold transition-colors",
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-foreground hover:bg-muted",
              ].join(" ")}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
