"use client"

import type React from "react"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight, Home } from "lucide-react"
import { TenantSwitcher } from "@/components/admin/tenant-switcher"

interface BreadcrumbItem {
  label: string
  href: string
}

export interface AdminHeaderProps {
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
  "/admin/message-rules": { label: "Smart Messages", parent: "/admin/dashboard" },
  "/admin/users": { label: "Gestione Utenti", parent: "/admin/dashboard" },
  "/admin/profile": { label: "Il Mio Profilo", parent: "/admin/dashboard" },
  "/admin/settings": { label: "Impostazioni", parent: "/admin/dashboard" },
  "/admin/settings/domains": { label: "Domini", parent: "/admin/settings" },
  "/admin/tracking/demand": { label: "Calendario Domanda", parent: "/admin/dashboard" },
  "/admin/todos": { label: "Task & To-Do", parent: "/admin/dashboard" },
}

/**
 * Micro-accento cromatico del modulo per l'ultima crumb attiva (Step 4 -
 * design token --ha-module-*). Mappa STATICA e locale per `href` (chiave
 * stabile gia' presente nel codice): niente lettura DB, classi Tailwind
 * letterali per lo scanner v4. Allineata a NAV_ACCENT_DOT in platform-header;
 * verra' consolidata in un helper condiviso in un futuro Step 5.
 * Le crumb con href non mappato non mostrano alcun dot => invariate.
 */
const SECTION_ACCENT_DOT: Record<string, string> = {
  "/admin/inbox": "bg-ha-module-crm",
  "/admin/crm": "bg-ha-module-crm",
  "/admin/channels/email": "bg-ha-module-crm",
  "/admin/message-rules": "bg-ha-module-crm",
  "/admin/cms": "bg-ha-module-marketing",
  "/admin/marketing": "bg-ha-module-marketing",
  "/admin/tracking/demand": "bg-ha-module-automation",
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
    <header className="bg-background border-b border-border sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            {/* Breadcrumb compatto */}
            <nav className="flex items-center gap-1.5 text-sm">
              <Link href="/admin/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">
                <Home className="w-4 h-4" />
              </Link>
              {breadcrumbs.map((crumb, index) => (
                <div key={crumb.href} className="flex items-center gap-1.5">
                  <ChevronRight className="w-3 h-3 text-muted-foreground/50" />
                  {index === breadcrumbs.length - 1 ? (
                    <span className="flex items-center gap-1.5 text-foreground font-medium">
                      {SECTION_ACCENT_DOT[crumb.href] && (
                        <span
                          className={`h-1.5 w-1.5 rounded-full inline-block flex-shrink-0 ${SECTION_ACCENT_DOT[crumb.href]}`}
                          aria-hidden
                        />
                      )}
                      {crumb.label}
                    </span>
                  ) : (
                    <Link href={crumb.href} className="text-muted-foreground hover:text-foreground transition-colors">
                      {crumb.label}
                    </Link>
                  )}
                </div>
              ))}
            </nav>

            {/* Separatore e sottotitolo */}
            {subtitle && (
              <>
                <div className="h-4 w-px bg-border" />
                <p className="text-xs text-muted-foreground">{subtitle}</p>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <TenantSwitcher />
            {actions}
          </div>
        </div>
      </div>
    </header>
  )
}
