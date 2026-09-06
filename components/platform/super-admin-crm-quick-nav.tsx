"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BarChart3,
  CalendarClock,
  Headphones,
  HeartHandshake,
  Inbox,
  ListTodo,
  Megaphone,
  PhoneCall,
  Star,
  Users,
} from "lucide-react"

import { TenantSwitcher } from "@/components/admin/tenant-switcher"

const PLATFORM_LINKS = [
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

const TENANT_LINKS = [
  { href: "/admin/inbox", label: "Inbox", icon: Inbox },
  { href: "/admin/calls", label: "Telefonate", icon: PhoneCall },
  { href: "/admin/reviews", label: "Recensioni", icon: Star },
  { href: "/admin/todos", label: "Attivita", icon: ListTodo },
  { href: "/admin/tracking/demand", label: "Calendario domanda", icon: CalendarClock },
  { href: "/admin/tracking/visitors", label: "Visitatori", icon: BarChart3 },
  { href: "/admin/marketing", label: "Marketing", icon: Megaphone },
] as const

function QuickLink({
  href,
  label,
  icon: Icon,
  active = false,
}: {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  active?: boolean
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={[
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-card text-foreground hover:bg-muted",
      ].join(" ")}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span>{label}</span>
    </Link>
  )
}

export function SuperAdminCrmQuickNav() {
  const pathname = usePathname() || ""

  return (
    <nav
      aria-label="Centro operativo Super Admin 4BID"
      className="flex-shrink-0 overflow-x-auto border-b border-border bg-background px-3 py-2 sm:px-4"
    >
      <div className="mx-auto flex min-w-max max-w-screen-2xl items-center gap-2">
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          4BID
        </span>
        {PLATFORM_LINKS.map((item) => (
          <QuickLink
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={item.exact ? pathname === item.href : pathname.startsWith(item.href)}
          />
        ))}

        <span className="mx-1 h-6 w-px shrink-0 bg-border" aria-hidden />
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          Operativo tenant
        </span>
        <TenantSwitcher />
        {TENANT_LINKS.map((item) => (
          <QuickLink key={item.href} href={item.href} label={item.label} icon={item.icon} />
        ))}
      </div>
    </nav>
  )
}
