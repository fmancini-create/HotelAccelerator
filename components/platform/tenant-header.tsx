"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import useSWR from "swr"
import { ChevronDown, LogOut, MoreHorizontal, ShieldCheck } from "lucide-react"

import { TenantSwitcher } from "@/components/admin/tenant-switcher"
import { HotelAcceleratorLogo, HotelAcceleratorMark } from "@/components/brand/hotel-accelerator-logo"
import { isImmersiveAdminPage } from "@/components/platform/platform-chrome-routes"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { createClient } from "@/lib/supabase/client"
import {
  OPERATIVE_PRIMARY,
  OPERATIVE_SECONDARY,
  SETTINGS_ENTRIES,
  SETTINGS_HUB_HREF,
  SETTINGS_ICON,
  visibleEntries,
  type NavEntry,
} from "@/lib/platform/nav"

type PlatformMe = {
  role: "super_admin" | "tenant_admin" | "member" | "none"
  isAdmin?: boolean
  canManageUsers?: boolean
  email?: string
  name?: string
  areas?: string[]
}

type ActiveModules = { activeModules: string[] | null }

const meFetcher = async (url: string): Promise<PlatformMe> => {
  const response = await fetch(url, { credentials: "include" })
  if (!response.ok) return { role: "none" }
  return response.json()
}

const modulesFetcher = async (url: string): Promise<ActiveModules> => {
  const response = await fetch(url, { credentials: "include" })
  if (!response.ok) return { activeModules: null }
  return response.json()
}

function isActive(item: NavEntry, pathname: string): boolean {
  if (item.match) return item.match(pathname)
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}

function isAuthPage(pathname: string): boolean {
  return pathname === "/admin" || pathname === "/admin/login" || pathname.startsWith("/admin/reset-password")
}

const NAV_ACCENT_DOT: Record<string, string> = {
  "/admin/inbox": "bg-ha-module-crm",
  "/admin/crm": "bg-ha-module-crm",
  "/admin/channels": "bg-ha-module-crm",
  "/admin/message-rules": "bg-ha-module-crm",
  "/admin/cms/studio": "bg-ha-module-marketing",
  "/admin/marketing": "bg-ha-module-marketing",
  "/admin/tracking/visitors": "bg-ha-module-automation",
  "/admin/tracking/demand": "bg-ha-module-automation",
  "/admin/tracking/sites": "bg-ha-module-automation",
}

/** Header esclusivo dell'area di un singolo tenant. */
export function TenantHeader() {
  const pathname = usePathname() || ""
  const immersive = isImmersiveAdminPage(pathname)
  const [signingOut, setSigningOut] = useState(false)
  const { data: me } = useSWR<PlatformMe>("/api/platform/me", meFetcher, { revalidateOnFocus: false })
  const { data: modulesData } = useSWR<ActiveModules>("/api/platform/modules", modulesFetcher, {
    revalidateOnFocus: false,
  })

  const viewer = {
    isAdmin: me?.isAdmin,
    isPlatformAdmin: me?.role === "super_admin",
    areas: me?.areas,
    activeModules: modulesData?.activeModules,
    canManageUsers: me?.canManageUsers,
  }
  const primaryNav = visibleEntries(OPERATIVE_PRIMARY, viewer)
  const secondaryNav = visibleEntries(OPERATIVE_SECONDARY, viewer)
  const settingsNav = visibleEntries(SETTINGS_ENTRIES, viewer)
  const secondaryActive = secondaryNav.some((item) => isActive(item, pathname))
  const settingsActive =
    pathname.startsWith(SETTINGS_HUB_HREF) || settingsNav.some((item) => isActive(item, pathname))
  const isPlatformAdmin = me?.role === "super_admin"

  if (isAuthPage(pathname)) {
    return (
      <header className="flex-shrink-0 h-14 border-b border-border bg-white z-30">
        <div className="h-full flex items-center px-3 sm:px-4">
          <Link href="/admin" className="flex items-center gap-2" aria-label="HotelAccelerator">
            <HotelAcceleratorLogo markClassName="h-8 w-8" priority />
          </Link>
        </div>
      </header>
    )
  }

  const handleSignOut = async () => {
    if (signingOut) return
    setSigningOut(true)
    try {
      await createClient().auth.signOut()
      window.location.href = "/admin"
    } finally {
      setSigningOut(false)
    }
  }

  const initials = (me?.name || me?.email || "?")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")

  return (
    <header
      data-tenant-header
      data-immersive={immersive ? "true" : undefined}
      onMouseLeave={() => {
        if (immersive) document.documentElement.dataset.pmsMenuVisible = "false"
      }}
      className="flex-shrink-0 h-14 border-b border-border bg-white z-30"
    >
      <div className="h-full flex items-center gap-2 px-3 sm:px-4">
        <Link
          href="/admin/dashboard"
          className="flex items-center gap-2 flex-shrink-0 pr-2 sm:pr-4 border-r border-border h-full"
          aria-label="Dashboard tenant"
        >
          <HotelAcceleratorMark className="h-8 w-8" priority />
          <span className="hidden md:block font-semibold text-foreground text-sm">HotelAccelerator</span>
          <span className="hidden xl:inline rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground">
            TENANT
          </span>
        </Link>

        <nav className="hidden lg:flex items-center gap-0.5 h-full" aria-label="Navigazione tenant">
          {primaryNav.map((item) => {
            const Icon = item.icon
            const selected = isActive(item, pathname)
            const dot = selected ? NAV_ACCENT_DOT[item.href] : undefined
            return (
              <Link
                key={item.id}
                href={item.href}
                className={[
                  "flex items-center gap-1.5 px-3 h-9 rounded-md text-[13px] font-medium transition-colors",
                  selected ? "bg-ha-brand-soft text-ha-brand-soft-foreground" : "text-foreground hover:bg-muted",
                ].join(" ")}
              >
                {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />}
                <Icon className="h-4 w-4" aria-hidden />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={[
                "h-9 text-[13px] font-medium gap-1",
                secondaryActive ? "bg-ha-brand-soft text-ha-brand-soft-foreground" : "text-foreground",
              ].join(" ")}
              aria-label="Altre sezioni tenant"
            >
              <MoreHorizontal className="h-4 w-4 lg:hidden" />
              <span className="hidden lg:inline">Altro</span>
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <div className="lg:hidden">
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">Area tenant</DropdownMenuLabel>
              {primaryNav.map((item) => {
                const Icon = item.icon
                return (
                  <DropdownMenuItem key={item.id} asChild>
                    <Link href={item.href} className="flex items-center gap-2 cursor-pointer">
                      <Icon className="h-4 w-4" aria-hidden />
                      <span>{item.label}</span>
                    </Link>
                  </DropdownMenuItem>
                )
              })}
              <DropdownMenuSeparator />
            </div>
            {secondaryNav.length > 0 && (
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">Altre sezioni tenant</DropdownMenuLabel>
            )}
            {secondaryNav.map((item) => {
              const Icon = item.icon
              return (
                <DropdownMenuItem key={item.id} asChild>
                  <Link href={item.href} className="flex items-center gap-2 cursor-pointer">
                    <Icon className="h-4 w-4" aria-hidden />
                    <span>{item.label}</span>
                  </Link>
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        {settingsNav.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={[
                  "h-9 text-[13px] font-medium gap-1",
                  settingsActive ? "bg-ha-brand-soft text-ha-brand-soft-foreground" : "text-foreground",
                ].join(" ")}
              >
                <SETTINGS_ICON className="h-4 w-4" aria-hidden />
                <span className="hidden lg:inline">Impostazioni tenant</span>
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">Configurazione del tenant</DropdownMenuLabel>
              {settingsNav.map((item) => {
                const Icon = item.icon
                return (
                  <DropdownMenuItem key={item.id} asChild>
                    <Link href={item.href} className="flex items-center gap-2 cursor-pointer">
                      <Icon className="h-4 w-4" aria-hidden />
                      <span>{item.label}</span>
                    </Link>
                  </DropdownMenuItem>
                )
              })}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href={SETTINGS_HUB_HREF} className="flex items-center gap-2 cursor-pointer font-medium">
                  <SETTINGS_ICON className="h-4 w-4" aria-hidden />
                  <span>Tutte le impostazioni tenant</span>
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <div className="flex-1" />

        {isPlatformAdmin && (
          <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex h-9 gap-1.5 border-ha-brand/30">
            <Link href="/super-admin" aria-label="Passa al Super Admin di piattaforma">
              <ShieldCheck className="h-4 w-4" aria-hidden />
              <span>Piattaforma</span>
            </Link>
          </Button>
        )}

        <TenantSwitcher />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 h-9 px-1.5 rounded-md hover:bg-muted" aria-label="Menu utente">
              <div className="w-7 h-7 rounded-full bg-ha-brand flex items-center justify-center text-ha-brand-foreground text-[11px] font-semibold">
                {initials || "?"}
              </div>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            {me?.email && (
              <>
                <div className="px-2 py-1.5">
                  {me.name && <div className="text-sm font-medium truncate">{me.name}</div>}
                  <div className="text-xs text-muted-foreground truncate">{me.email}</div>
                  <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Area tenant</div>
                </div>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem asChild><Link href="/admin/profile" className="cursor-pointer">Il mio profilo</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link href={SETTINGS_HUB_HREF} className="cursor-pointer">Impostazioni tenant</Link></DropdownMenuItem>
            {isPlatformAdmin && (
              <DropdownMenuItem asChild>
                <Link href="/super-admin" className="flex items-center gap-2 cursor-pointer font-medium">
                  <ShieldCheck className="h-4 w-4" aria-hidden />
                  <span>Super Admin piattaforma</span>
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleSignOut}
              disabled={signingOut}
              className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive"
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
