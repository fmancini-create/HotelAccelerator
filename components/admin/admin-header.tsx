"use client"

import type React from "react"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight, Home } from "lucide-react"

interface BreadcrumbItem {
  label: string
  href: string
}

interface AdminHeaderProps {
  title: string
  subtitle?: string
  backHref?: string
  backLabel?: string
  actions?: React.ReactNode
}

// Mappa dei path alle breadcrumb
const pathMap: Record<string, { label: string; parent?: string }> = {
  "/admin/dashboard": { label: "Dashboard" },
  "/admin/photos": { label: "Gestione Foto", parent: "/admin/dashboard" },
  "/admin/cms": { label: "Pagine CMS", parent: "/admin/dashboard" },
  "/admin/channels": { label: "Canali", parent: "/admin/dashboard" },
  "/admin/channels/email": { label: "Email", parent: "/admin/channels" },
  "/admin/channels/chat": { label: "Chat Widget", parent: "/admin/channels" },
  "/admin/channels/whatsapp": { label: "WhatsApp", parent: "/admin/channels" },
  "/admin/channels/telegram": { label: "Telegram", parent: "/admin/channels" },
  "/admin/channels/phone": { label: "Telefono IP", parent: "/admin/channels" },
  "/admin/inbox": { label: "Inbox", parent: "/admin/dashboard" },
  "/admin/inbox/email": { label: "Email Inbox", parent: "/admin/inbox" },
  "/admin/message-rules": { label: "Smart Messages", parent: "/admin/dashboard" },
  "/admin/users": { label: "Gestione Utenti", parent: "/admin/dashboard" },
  "/admin/profile": { label: "Il Mio Profilo", parent: "/admin/dashboard" },
  "/admin/settings": { label: "Impostazioni", parent: "/admin/dashboard" },
  "/admin/settings/domains": { label: "Domini", parent: "/admin/settings" },
  "/admin/tracking/demand": { label: "Calendario Domanda", parent: "/admin/dashboard" },
}

function buildBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const breadcrumbs: BreadcrumbItem[] = []
  let currentPath = pathname

  while (currentPath && pathMap[currentPath]) {
    const { label, parent } = pathMap[currentPath]
    breadcrumbs.unshift({ label, href: currentPath })
    currentPath = parent || ""
  }

  return breadcrumbs
}

export function AdminHeader({ title, subtitle, actions }: AdminHeaderProps) {
  const pathname = usePathname()
  const breadcrumbs = buildBreadcrumbs(pathname)

  return (
    <header className="bg-white border-b border-[#e5e5e5] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            {/* Breadcrumb compatto */}
            <nav className="flex items-center gap-1.5 text-sm">
              <Link href="/admin/dashboard" className="text-[#8b8b8b] hover:text-[#8b7355] transition-colors">
                <Home className="w-4 h-4" />
              </Link>
              {breadcrumbs.map((crumb, index) => (
                <div key={crumb.href} className="flex items-center gap-1.5">
                  <ChevronRight className="w-3 h-3 text-[#c0c0c0]" />
                  {index === breadcrumbs.length - 1 ? (
                    <span className="text-[#5c5c5c] font-medium">{crumb.label}</span>
                  ) : (
                    <Link href={crumb.href} className="text-[#8b8b8b] hover:text-[#8b7355] transition-colors">
                      {crumb.label}
                    </Link>
                  )}
                </div>
              ))}
            </nav>

            {/* Separatore e sottotitolo */}
            {subtitle && (
              <>
                <div className="h-4 w-px bg-[#e5e5e5]" />
                <p className="text-xs text-[#8b8b8b]">{subtitle}</p>
              </>
            )}
          </div>

          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      </div>
    </header>
  )
}
