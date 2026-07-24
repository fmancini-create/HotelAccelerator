"use client"

/**
 * PlatformFooter
 *
 * Minimal footer shown on all internal admin pages. Intentionally slim so it
 * also fits inside dense app-shell pages like the Inbox.
 *
 * Client component so it can hide itself on auth pages (login / reset), which
 * share the /admin layout but must not expose links to authenticated sections.
 */

import Link from "next/link"
import { usePathname } from "next/navigation"

function isAuthPage(pathname: string): boolean {
  return pathname === "/admin" || pathname === "/admin/login" || pathname.startsWith("/admin/reset-password")
}

export function PlatformFooter() {
  const pathname = usePathname() || ""
  const year = new Date().getFullYear()

  // Auth pages (login / reset) keep a consistent footer but without links to
  // authenticated sections (they would just bounce back to the login).
  if (isAuthPage(pathname)) {
    return (
      <footer
        className="flex-shrink-0 h-9 border-t border-border bg-background text-muted-foreground text-[11px]"
        aria-label="Footer piattaforma"
      >
        <div className="h-full flex items-center justify-center px-3 sm:px-4 gap-3">
          <span className="truncate">&copy; {year} HotelAccelerator</span>
          <span className="hidden sm:inline text-muted-foreground/40">|</span>
          <span className="hidden sm:inline truncate">SaaS multitenant per hotel</span>
        </div>
      </footer>
    )
  }

  return (
    <footer
      className="flex-shrink-0 h-9 border-t border-border bg-background text-muted-foreground text-[11px]"
      aria-label="Footer piattaforma"
    >
      <div className="h-full flex items-center justify-between px-3 sm:px-4 gap-4">
        <div className="flex items-center gap-3">
          <span className="truncate">
            &copy; {year} HotelAccelerator
          </span>
          <span className="hidden sm:inline text-muted-foreground/40">|</span>
          <span className="hidden sm:inline truncate">
            SaaS multitenant per hotel
          </span>
        </div>
        <nav className="flex items-center gap-3" aria-label="Link utili">
          <Link
            href="/admin/monitoring"
            className="hover:text-ha-brand transition-colors"
          >
            Stato
          </Link>
          <Link
            href="/admin/settings"
            className="hover:text-ha-brand transition-colors"
          >
            Impostazioni
          </Link>
          <Link
            href="/admin/profile"
            className="hover:text-ha-brand transition-colors hidden sm:inline"
          >
            Profilo
          </Link>
        </nav>
      </div>
    </footer>
  )
}
