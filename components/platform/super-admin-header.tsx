"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import useSWR from "swr"
import { Building2, ChevronDown, GitCompareArrows, LayoutDashboard, LogOut, MoreHorizontal, ShieldCheck } from "lucide-react"

import { HotelAcceleratorMark } from "@/components/brand/hotel-accelerator-logo"
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
import { PLATFORM_ENTRIES, visibleEntries, type NavEntry } from "@/lib/platform/nav"

type PlatformMe = {
  role: "super_admin" | "tenant_admin" | "member" | "none"
  isAdmin?: boolean
  email?: string
  name?: string
}

const meFetcher = async (url: string): Promise<PlatformMe> => {
  const response = await fetch(url, { credentials: "include" })
  if (!response.ok) return { role: "none" }
  return response.json()
}

function active(item: NavEntry, pathname: string): boolean {
  if (item.match) return item.match(pathname)
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}

/**
 * Header del SUPER ADMIN DI PIATTAFORMA.
 *
 * Qui non esistono Inbox, CRM, turni, canali o impostazioni di un tenant e non
 * viene montato il TenantSwitcher. Il ritorno al lavoro su una struttura e'
 * sempre un cambio di contesto esplicito tramite "Area tenant".
 */
export function SuperAdminHeader() {
  const pathname = usePathname() || ""
  const [signingOut, setSigningOut] = useState(false)
  const { data: me } = useSWR<PlatformMe>("/api/platform/me", meFetcher, { revalidateOnFocus: false })

  const isPlatformAdmin = me?.role === "super_admin"
  const platformNav = visibleEntries(PLATFORM_ENTRIES, {
    isAdmin: me?.isAdmin,
    isPlatformAdmin,
  })
  const primary = platformNav.slice(0, 4)
  const secondary = platformNav.slice(4)
  const isCompetitiveStudy = pathname.startsWith("/super-admin/competitive-study")
  const secondaryActive = secondary.some((item) => active(item, pathname)) || isCompetitiveStudy

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
    <header data-super-admin-header className="flex-shrink-0 h-14 border-b border-border bg-foreground text-background z-30">
      <div className="h-full flex items-center gap-2 px-3 sm:px-4">
        <Link
          href="/super-admin"
          className="flex items-center gap-2 flex-shrink-0 pr-2 sm:pr-4 border-r border-background/20 h-full"
          aria-label="Dashboard Super Admin"
        >
          <span className="rounded-md bg-background p-0.5">
            <HotelAcceleratorMark className="h-7 w-7" priority />
          </span>
          <span className="hidden md:block font-semibold text-sm">HotelAccelerator</span>
          <span className="hidden lg:inline rounded-full border border-background/25 px-2 py-0.5 text-[10px] font-bold tracking-wide">
            SUPER ADMIN
          </span>
        </Link>

        <nav className="hidden xl:flex items-center gap-0.5 h-full" aria-label="Navigazione piattaforma">
          <Link
            href="/super-admin"
            className={[
              "flex items-center gap-1.5 px-3 h-9 rounded-md text-[13px] font-medium transition-colors",
              pathname === "/super-admin" ? "bg-background text-foreground" : "hover:bg-background/10",
            ].join(" ")}
          >
            <LayoutDashboard className="h-4 w-4" aria-hidden />
            <span>Dashboard</span>
          </Link>
          {primary.map((item) => {
            const Icon = item.icon
            const isActive = active(item, pathname)
            return (
              <Link
                key={item.id}
                href={item.href}
                className={[
                  "flex items-center gap-1.5 px-3 h-9 rounded-md text-[13px] font-medium transition-colors",
                  isActive ? "bg-background text-foreground" : "hover:bg-background/10",
                ].join(" ")}
              >
                <Icon className="h-4 w-4" aria-hidden />
                <span>{item.label}</span>
              </Link>
            )
          })}
          <Link
            href="/super-admin/competitive-study"
            className={[
              "flex items-center gap-1.5 px-3 h-9 rounded-md text-[13px] font-medium transition-colors",
              isCompetitiveStudy ? "bg-background text-foreground" : "hover:bg-background/10",
            ].join(" ")}
          >
            <GitCompareArrows className="h-4 w-4" aria-hidden />
            <span>Studio CRM</span>
          </Link>
        </nav>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={[
                "h-9 gap-1 text-background hover:bg-background/10 hover:text-background",
                secondaryActive ? "bg-background/15" : "",
              ].join(" ")}
            >
              <MoreHorizontal className="h-4 w-4 xl:hidden" />
              <span className="hidden xl:inline">Altro</span>
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <div className="xl:hidden">
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Super Admin · Piattaforma
              </DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link href="/super-admin" className="flex items-center gap-2 cursor-pointer font-medium">
                  <LayoutDashboard className="h-4 w-4" aria-hidden />
                  <span>Dashboard piattaforma</span>
                </Link>
              </DropdownMenuItem>
              {primary.map((item) => {
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
              <DropdownMenuItem asChild>
                <Link href="/super-admin/competitive-study" className="flex items-center gap-2 cursor-pointer">
                  <GitCompareArrows className="h-4 w-4" aria-hidden />
                  <span>Studio CRM e competitor</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </div>
            {secondary.length > 0 && (
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Gestione piattaforma
              </DropdownMenuLabel>
            )}
            {secondary.map((item) => {
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
              <Link href="/super-admin/competitive-study" className="flex items-center gap-2 cursor-pointer">
                <GitCompareArrows className="h-4 w-4" aria-hidden />
                <span>Studio CRM e competitor</span>
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex-1" />

        <Button asChild variant="secondary" size="sm" className="hidden sm:inline-flex h-9 gap-1.5">
          <Link href="/admin/dashboard" aria-label="Passa all'area tenant">
            <Building2 className="h-4 w-4" aria-hidden />
            <span>Area tenant</span>
          </Link>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 h-9 px-1.5 rounded-md hover:bg-background/10" aria-label="Menu Super Admin">
              <div className="w-7 h-7 rounded-full bg-background text-foreground flex items-center justify-center text-[11px] font-semibold">
                {initials || "?"}
              </div>
              <ChevronDown className="h-3 w-3 text-background/70" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {me?.email && (
              <>
                <div className="px-2 py-1.5">
                  {me.name && <div className="text-sm font-medium truncate">{me.name}</div>}
                  <div className="text-xs text-muted-foreground truncate">{me.email}</div>
                  <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-ha-brand">
                    <ShieldCheck className="h-3 w-3" aria-hidden /> Super Admin piattaforma
                  </div>
                </div>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem asChild>
              <Link href="/super-admin/settings" className="cursor-pointer">Impostazioni piattaforma</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/admin/dashboard" className="flex items-center gap-2 cursor-pointer">
                <Building2 className="h-4 w-4" aria-hidden />
                <span>Passa all'area tenant</span>
              </Link>
            </DropdownMenuItem>
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
