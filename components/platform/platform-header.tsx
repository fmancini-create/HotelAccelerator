"use client"

/**
 * PlatformHeader
 *
 * Global top-bar for all internal admin pages.
 *
 * Architecture (script-first, multi-tenant):
 *  - Navigation is data-driven (see PRIMARY_NAV / MORE_NAV below). Links are
 *    not hardcoded to a specific tenant and route to the user's currently
 *    active tenant via the standard /admin/* paths.
 *  - TenantSwitcher is always mounted; it self-degrades based on the user's
 *    role (super_admin, tenant_admin, none).
 *  - User menu wires up Supabase signOut.
 *
 * Layout is mobile-first: on small screens, PRIMARY_NAV collapses into the
 * same "Altro" dropdown to avoid overflow.
 */

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useMemo, useState } from "react"
import useSWR from "swr"
import {
  BarChart3,
  Boxes,
  Building2,
  ChevronDown,
  FileText,
  Image as ImageIcon,
  Inbox,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Mail,
  Megaphone,
  MessageSquare,
  MoreHorizontal,
  Radio,
  Settings,
  Tag,
  Users,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { TenantSwitcher } from "@/components/admin/tenant-switcher"
import { createClient } from "@/lib/supabase/client"

type NavItem = {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  match?: (pathname: string) => boolean
  /**
   * Chiave del modulo che governa questa voce. Se presente e il modulo NON
   * e' attivo per la struttura corrente, la voce viene nascosta dal menu.
   * Voci senza `module` sono sempre visibili.
   */
  module?: string
  /**
   * Se true, la voce e' riservata agli amministratori (super_admin o tenant
   * admin). I membri non-admin (es. "editor") non la vedono.
   */
  adminOnly?: boolean
}

// Primary navigation shown inline on the header (desktop).
const PRIMARY_NAV: NavItem[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/inbox", label: "Inbox", icon: Inbox, module: "inbox" },
  {
    href: "/admin/crm",
    label: "CRM",
    icon: Users,
    match: (p) => p.startsWith("/admin/crm"),
    module: "crm",
  },
  {
    href: "/admin/cms",
    label: "CMS",
    icon: FileText,
    match: (p) => p.startsWith("/admin/cms"),
    module: "cms",
  },
  {
    href: "/admin/channels/email",
    label: "Canali",
    icon: Radio,
    match: (p) => p.startsWith("/admin/channels"),
    module: "inbox",
    adminOnly: true,
  },
  {
    href: "/admin/users",
    label: "Utenti",
    icon: Users,
    match: (p) => p.startsWith("/admin/users"),
    adminOnly: true,
  },
]

// Secondary sections accessible via the "Altro" dropdown.
const MORE_NAV: NavItem[] = [
  { href: "/admin/photos", label: "Foto", icon: ImageIcon },
  { href: "/admin/gallery", label: "Gallery", icon: ImageIcon },
  { href: "/admin/categories", label: "Categorie", icon: Tag },
  { href: "/admin/message-rules", label: "Smart Messages", icon: MessageSquare, module: "inbox" },
  {
    href: "/admin/tracking",
    label: "Tracking",
    icon: BarChart3,
    match: (p) => p.startsWith("/admin/tracking"),
    module: "tracking",
  },
  { href: "/admin/todos", label: "Todos", icon: ListTodo },
  { href: "/admin/monitoring", label: "Monitoring", icon: BarChart3 },
  { href: "/admin/embed-scripts", label: "Embed scripts", icon: Mail },
  {
    href: "/admin/marketing",
    label: "Marketing",
    icon: Megaphone,
    match: (p) => p.startsWith("/admin/marketing"),
  },
  {
    href: "/admin/modules",
    label: "Moduli",
    icon: Boxes,
    match: (p) => p.startsWith("/admin/modules"),
  },
  {
    href: "/admin/settings",
    label: "Impostazioni",
    icon: Settings,
    match: (p) => p.startsWith("/admin/settings"),
  },
]

type PlatformMe = {
  role: "super_admin" | "tenant_admin" | "none"
  email?: string
  name?: string
}

const meFetcher = async (url: string): Promise<PlatformMe> => {
  const res = await fetch(url, { credentials: "include" })
  if (!res.ok) return { role: "none" }
  return res.json()
}

type ActiveModules = { activeModules: string[] | null }

const modulesFetcher = async (url: string): Promise<ActiveModules> => {
  const res = await fetch(url, { credentials: "include" })
  if (!res.ok) return { activeModules: null }
  return res.json()
}

/**
 * Filtra le voci di menu in base ai moduli attivi.
 * Fail-open: se `activeModules` e' null/undefined (dato non pronto o errore),
 * mostriamo tutto per non far sparire il menu per sbaglio.
 */
function filterByModules(items: NavItem[], activeModules: string[] | null | undefined): NavItem[] {
  if (!activeModules) return items
  const active = new Set(activeModules)
  return items.filter((item) => !item.module || active.has(item.module))
}

function isActive(item: NavItem, pathname: string): boolean {
  if (item.match) return item.match(pathname)
  return pathname === item.href || pathname.startsWith(item.href + "/")
}

/**
 * Auth pages (login gate, password reset) must NOT show the authenticated
 * chrome. The /admin layout wraps every page in PlatformShell, so without this
 * guard the full nav would still render on the login form after logout.
 */
function isAuthPage(pathname: string): boolean {
  return pathname === "/admin" || pathname === "/admin/login" || pathname.startsWith("/admin/reset-password")
}

export function PlatformHeader() {
  const pathname = usePathname() || ""
  const [signingOut, setSigningOut] = useState(false)
  const onAuthPage = isAuthPage(pathname)
  const { data: me } = useSWR<PlatformMe>("/api/platform/me", meFetcher, {
    revalidateOnFocus: false,
  })
  const { data: modulesData } = useSWR<ActiveModules>("/api/platform/modules", modulesFetcher, {
    revalidateOnFocus: false,
  })

  const activeModules = modulesData?.activeModules
  const primaryNav = useMemo(
    () => filterByModules(PRIMARY_NAV, activeModules),
    [activeModules],
  )
  const moreNav = useMemo(
    () => filterByModules(MORE_NAV, activeModules),
    [activeModules],
  )

  const moreHasActive = useMemo(
    () => moreNav.some((item) => isActive(item, pathname)),
    [moreNav, pathname],
  )

  const handleSignOut = async () => {
    if (signingOut) return
    setSigningOut(true)
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
      // Full reload to /admin (the login gate). A hard navigation clears any
      // cached SWR state (me / modules) so no authenticated data lingers.
      window.location.href = "/admin"
    } finally {
      setSigningOut(false)
    }
  }

  const userInitials = (me?.name || me?.email || "?")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("")

  // Auth pages (login / reset) show a consistent header but only the brand:
  // no authenticated navigation, tenant switcher or user menu are exposed.
  if (onAuthPage) {
    return (
      <header className="flex-shrink-0 h-14 border-b border-[#e5e7eb] bg-white z-30">
        <div className="h-full flex items-center px-3 sm:px-4">
          <Link href="/admin" className="flex items-center gap-2" aria-label="HotelAccelerator">
            <div className="w-8 h-8 rounded-md bg-[#0b57d0] flex items-center justify-center text-white font-semibold text-sm">
              HA
            </div>
            <span className="font-semibold text-[#111827] text-sm">HotelAccelerator</span>
          </Link>
        </div>
      </header>
    )
  }

  return (
    <header className="flex-shrink-0 h-14 border-b border-[#e5e7eb] bg-white z-30">
      <div className="h-full flex items-center gap-2 px-3 sm:px-4">
        {/* Logo / brand */}
        <Link
          href="/admin/dashboard"
          className="flex items-center gap-2 flex-shrink-0 pr-2 sm:pr-4 border-r border-[#e5e7eb] h-full"
          aria-label="Torna alla dashboard"
        >
          <div className="w-8 h-8 rounded-md bg-[#0b57d0] flex items-center justify-center text-white font-semibold text-sm">
            HA
          </div>
          <span className="hidden md:block font-semibold text-[#111827] text-sm">
            HotelAccelerator
          </span>
        </Link>

        {/* Primary nav (desktop inline, mobile hidden: collapses into Altro) */}
        <nav className="hidden lg:flex items-center gap-0.5 h-full" aria-label="Navigazione principale">
          {primaryNav.map((item) => {
            const active = isActive(item, pathname)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "flex items-center gap-1.5 px-3 h-9 rounded-md text-[13px] font-medium transition-colors",
                  active
                    ? "bg-[#eef2ff] text-[#0b57d0]"
                    : "text-[#374151] hover:bg-[#f3f4f6]",
                ].join(" ")}
              >
                <Icon className="h-4 w-4" aria-hidden />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* "Altro" dropdown (always visible - contains secondary nav; on mobile also primary nav) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={[
                "h-9 text-[13px] font-medium gap-1",
                moreHasActive ? "bg-[#eef2ff] text-[#0b57d0]" : "text-[#374151]",
              ].join(" ")}
              aria-label="Altre sezioni"
            >
              <MoreHorizontal className="h-4 w-4 lg:hidden" />
              <span className="hidden lg:inline">Altro</span>
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            {/* On mobile, show primary nav items as well */}
            <div className="lg:hidden">
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-[#6b7280] font-medium">
                Principali
              </DropdownMenuLabel>
              {primaryNav.map((item) => {
                const Icon = item.icon
                const active = isActive(item, pathname)
                return (
                  <DropdownMenuItem key={item.href} asChild>
                    <Link
                      href={item.href}
                      className={[
                        "flex items-center gap-2 cursor-pointer",
                        active && "text-[#0b57d0] font-medium",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                      <span>{item.label}</span>
                    </Link>
                  </DropdownMenuItem>
                )
              })}
              <DropdownMenuSeparator />
            </div>
            <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-[#6b7280] font-medium">
              Strumenti
            </DropdownMenuLabel>
            {moreNav.map((item) => {
              const Icon = item.icon
              const active = isActive(item, pathname)
              return (
                <DropdownMenuItem key={item.href} asChild>
                  <Link
                    href={item.href}
                    className={[
                      "flex items-center gap-2 cursor-pointer",
                      active && "text-[#0b57d0] font-medium",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                    <span>{item.label}</span>
                  </Link>
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Tenant switcher (self-hides when role=none) */}
        <TenantSwitcher />

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2 h-9 px-1.5 rounded-md hover:bg-[#f3f4f6] transition-colors"
              aria-label="Menu utente"
            >
              <div className="w-7 h-7 rounded-full bg-[#0b57d0] flex items-center justify-center text-white text-[11px] font-semibold">
                {userInitials || "?"}
              </div>
              <ChevronDown className="h-3 w-3 text-[#6b7280]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {me?.email && (
              <>
                <div className="px-2 py-1.5">
                  {me.name && (
                    <div className="text-sm font-medium text-[#111827] truncate">{me.name}</div>
                  )}
                  <div className="text-xs text-[#6b7280] truncate">{me.email}</div>
                  {me.role === "super_admin" && (
                    <div className="mt-1 inline-block px-1.5 py-0.5 rounded bg-[#eef2ff] text-[#0b57d0] text-[10px] font-medium">
                      Super Admin
                    </div>
                  )}
                </div>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem asChild>
              <Link href="/admin/profile" className="flex items-center gap-2 cursor-pointer">
                <Building2 className="h-4 w-4" aria-hidden />
                <span>Il mio profilo</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/admin/settings" className="flex items-center gap-2 cursor-pointer">
                <Settings className="h-4 w-4" aria-hidden />
                <span>Impostazioni</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleSignOut}
              className="flex items-center gap-2 cursor-pointer text-[#dc2626] focus:text-[#dc2626]"
              disabled={signingOut}
            >
              <LogOut className="h-4 w-4" aria-hidden />
              <span>{signingOut ? "Disconnessione..." : "Esci"}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
