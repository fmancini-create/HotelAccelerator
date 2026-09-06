"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BarChart3, BrainCircuit, Database, Building2, CalendarDays, KanbanSquare, LayoutGrid, ListTodo, Phone, Search, Settings, Target, Users } from "lucide-react"

const items = [
  { href: "/admin/crm", label: "Dashboard", icon: BarChart3, exact: true },
  { href: "/admin/crm/workspaces", label: "Aree CRM", icon: LayoutGrid },
  { href: "/admin/crm/intelligence", label: "Vendite IA", icon: BrainCircuit },
  { href: "/admin/crm/prospecting", label: "Prospecting", icon: Search },
  { href: "/admin/crm/contacts", label: "Contatti", icon: Users },
  { href: "/admin/crm/companies", label: "Aziende", icon: Building2 },
  { href: "/admin/crm/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/admin/crm/activities", label: "Attivita", icon: ListTodo },
  { href: "/admin/crm/calls", label: "Chiamate", icon: Phone },
  { href: "/admin/crm/calendar", label: "Calendario", icon: CalendarDays },
  { href: "/admin/crm/attack-plan", label: "Piano 30gg", icon: Target },
  { href: "/admin/crm/pms-sync/gestionale", label: "PMS", icon: Database },
  { href: "/admin/crm/settings", label: "Impostazioni", icon: Settings },
]

export function CrmWorkspaceNav() {
  const pathname = usePathname() || ""
  return (
    <nav data-crm-workspace-nav className="border-b bg-white px-4 sm:px-6" aria-label="Sezioni CRM">
      <div className="mx-auto flex max-w-[1600px] gap-1 overflow-x-auto py-2">
        {items.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
              className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${active ? "bg-ha-brand-soft text-ha-brand-soft-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
              <Icon className="h-4 w-4" aria-hidden />{item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
