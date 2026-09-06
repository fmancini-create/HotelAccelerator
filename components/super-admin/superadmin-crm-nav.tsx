"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Headphones, HeartHandshake, LineChart } from "lucide-react"

const CRM_AREAS = [
  {
    href: "/super-admin/crm",
    label: "Commerciale",
    description: "Vendite e clienti",
    icon: LineChart,
    exact: true,
  },
  {
    href: "/super-admin/crm/support",
    label: "Assistenza",
    description: "Ticket e SLA",
    icon: Headphones,
  },
  {
    href: "/super-admin/crm/success",
    label: "Customer Success",
    description: "Health e rinnovi",
    icon: HeartHandshake,
  },
] as const

export function SuperAdminCrmNav() {
  const pathname = usePathname()

  return (
    <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex max-w-[1700px] flex-wrap gap-2 px-4 py-3 sm:px-6">
        {CRM_AREAS.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-w-[180px] items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                active
                  ? "border-foreground/15 bg-foreground text-background shadow-sm"
                  : "border-border bg-card hover:bg-muted/70"
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{item.label}</span>
                <span className={`block truncate text-xs ${active ? "text-background/70" : "text-muted-foreground"}`}>
                  {item.description}
                </span>
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
