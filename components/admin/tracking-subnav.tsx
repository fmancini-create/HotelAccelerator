"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BarChart3, CalendarDays, RadioTower, Settings2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"

const baseClass =
  "inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors"

export function TrackingSubnav({ webTrafficActive }: { webTrafficActive: boolean }) {
  const pathname = usePathname()
  const items = [
    ...(webTrafficActive
      ? [
          {
            href: "/admin/tracking/analytics",
            label: "Visite sito",
            icon: BarChart3,
            badge: "Addon attivo",
          },
        ]
      : []),
    {
      href: "/admin/tracking/visitors",
      label: "Visitatori CRM",
      icon: RadioTower,
      badge: null,
    },
    {
      href: "/admin/tracking/demand",
      label: "Calendario domanda",
      icon: CalendarDays,
      badge: null,
    },
    {
      href: "/admin/tracking/sites",
      label: "Siti tracking",
      icon: Settings2,
      badge: null,
    },
  ]

  return (
    <div className="border-b bg-background/95">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-3 sm:px-6 lg:px-8">
        {items.map((item) => {
          const Icon = item.icon
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${baseClass} ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:bg-muted"
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
              {item.badge && (
                <Badge
                  variant="secondary"
                  className={active ? "bg-white/20 text-primary-foreground" : "bg-ha-success-soft text-ha-success-soft-foreground"}
                >
                  {item.badge}
                </Badge>
              )}
            </Link>
          )
        })}
        {webTrafficActive && (
          <span className="ml-auto hidden text-xs text-muted-foreground lg:inline">
            Visite sito condivise con Santaddeo · Visitatori CRM separati
          </span>
        )}
      </div>
    </div>
  )
}
