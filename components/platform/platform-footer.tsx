/**
 * PlatformFooter
 *
 * Minimal footer shown on all internal admin pages. Intentionally slim so it
 * also fits inside dense app-shell pages like the Inbox.
 *
 * Kept server-only: no client state, no hooks.
 */

import Link from "next/link"

export function PlatformFooter() {
  const year = new Date().getFullYear()
  return (
    <footer
      className="flex-shrink-0 h-9 border-t border-[#e5e7eb] bg-white text-[#6b7280] text-[11px]"
      aria-label="Footer piattaforma"
    >
      <div className="h-full flex items-center justify-between px-3 sm:px-4 gap-4">
        <div className="flex items-center gap-3">
          <span className="truncate">
            &copy; {year} HotelAccelerator
          </span>
          <span className="hidden sm:inline text-[#d1d5db]">|</span>
          <span className="hidden sm:inline truncate">
            SaaS multitenant per hotel
          </span>
        </div>
        <nav className="flex items-center gap-3" aria-label="Link utili">
          <Link
            href="/admin/monitoring"
            className="hover:text-[#374151] transition-colors"
          >
            Stato
          </Link>
          <Link
            href="/admin/settings"
            className="hover:text-[#374151] transition-colors"
          >
            Impostazioni
          </Link>
          <Link
            href="/admin/profile"
            className="hover:text-[#374151] transition-colors hidden sm:inline"
          >
            Profilo
          </Link>
        </nav>
      </div>
    </footer>
  )
}
