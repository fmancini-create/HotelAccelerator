"use client"

import type React from "react"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight, Home, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

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

export function AdminHeader({ title, subtitle, backHref, backLabel, actions }: AdminHeaderProps) {
  const pathname = usePathname()
  const breadcrumbs = buildBreadcrumbs(pathname)

  // Trova il parent diretto per il bottone "Indietro"
  const parentPath = pathMap[pathname]?.parent || "/admin/dashboard"
  const effectiveBackHref = backHref || parentPath
  const effectiveBackLabel =
    backLabel || (parentPath === "/admin/dashboard" ? "Dashboard" : pathMap[parentPath]?.label || "Indietro")

  return (
    <header className="bg-white border-b border-[#e5e5e5] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 py-2 text-sm text-[#8b8b8b] border-b border-[#f0f0f0]">
          <Link href="/admin/dashboard" className="hover:text-[#8b7355] transition-colors">
            <Home className="w-4 h-4" />
          </Link>
          {breadcrumbs.map((crumb, index) => (
            <div key={crumb.href} className="flex items-center gap-2">
              <ChevronRight className="w-4 h-4" />
              {index === breadcrumbs.length - 1 ? (
                <span className="text-[#5c5c5c] font-medium">{crumb.label}</span>
              ) : (
                <Link href={crumb.href} className="hover:text-[#8b7355] transition-colors">
                  {crumb.label}
                </Link>
              )}
            </div>
          ))}
        </div>

        {/* Header principale */}
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-4">
            <Link href={effectiveBackHref}>
              <Button variant="ghost" size="sm" className="text-[#8b8b8b] hover:text-[#8b7355]">
                <ArrowLeft className="w-4 h-4 mr-2" />
                {effectiveBackLabel}
              </Button>
            </Link>
            <div className="h-6 w-px bg-[#e5e5e5]" />
            <div>
              <h1 className="text-lg font-serif text-[#5c5c5c]">{title}</h1>
              {subtitle && <p className="text-xs text-[#8b8b8b]">{subtitle}</p>}
            </div>
          </div>

          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      </div>
    </header>
  )
}
