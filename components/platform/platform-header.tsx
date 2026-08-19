"use client"

/**
 * PlatformHeader
 *
 * Global top-bar for all internal admin pages.
 *
 * Architecture (script-first, multi-tenant):
 *  - Le voci NON sono dichiarate qui: arrivano da lib/platform/nav.ts, che e'
 *    la fonte unica letta anche dalla pagina /admin/settings. I link non sono
 *    legati a una struttura e usano i normali percorsi /admin/*.
 *  - TenantSwitcher is always mounted; it self-degrades based on the user's
 *    role (super_admin, tenant_admin, none).
 *  - User menu wires up Supabase signOut.
 *
 * Organizzazione del menu:
 *  - in chiaro e nella tendina "Altro" stanno solo le parti OPERATIVE (Inbox,
 *    Telefonate, turni, campagne...);
 *  - tutto cio' che si IMPOSTA sta nell'unica tendina "Impostazioni", il cui
 *    piede porta alla pagina che raccoglie le stesse voci in schede.
 *
 * Layout is mobile-first: on small screens, le voci in chiaro collassano nella
 * stessa tendina "Altro" per non far tracimare la barra.
 */

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useMemo, useState } from "react"
import useSWR from "swr"
import { Building2, ChevronDown, LogOut, MoreHorizontal } from "lucide-react"
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
import { HotelAcceleratorLogo, HotelAcceleratorMark } from "@/components/brand/hotel-accelerator-logo"
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

/*
 * Le voci NON si dichiarano piu' qui.
 *
 * Menu e pagina /admin/settings leggono lo STESSO elenco
 * (lib/platform/nav.ts). Prima erano due elenchi scritti a mano e divergevano
 * davvero: "Tracking" e "CMS" risultavano concedibili nel menu e solo-admin
 * nelle schede delle impostazioni, cioe' un membro con l'area concessa li
 * vedeva in un posto e non nell'altro.
 */
type NavItem = NavEntry

/**
 * Micro-indicatore cromatico della voce attiva (Step 3 - design token
 * --ha-module-*). Mappa STATICA ed esplicita per `href` (chiave stabile gia'
 * presente nel codice): niente derivazione fragile, niente lettura DB. Le
 * classi sono stringhe letterali cosi' lo scanner di Tailwind v4 le rileva.
 * Le voci non presenti qui non mostrano alcun dot => comportamento invariato.
 */
const NAV_ACCENT_DOT: Record<string, string> = {
  "/admin/inbox": "bg-ha-module-crm",
  "/admin/crm": "bg-ha-module-crm",
  "/admin/channels": "bg-ha-module-crm",
  "/admin/message-rules": "bg-ha-module-crm",
  "/admin/cms/studio": "bg-ha-module-marketing",
  "/admin/marketing": "bg-ha-module-marketing",
  // Il tracking ora ha tre destinazioni distinte (visitatori e domanda fra le
  // operative, chiavi fra le impostazioni): serve una riga per ciascuna,
  // altrimenti il puntino spariva dove prima c'era.
  "/admin/tracking/visitors": "bg-ha-module-automation",
  "/admin/tracking/demand": "bg-ha-module-automation",
  "/admin/tracking/sites": "bg-ha-module-automation",
}

type PlatformMe = {
  role: "super_admin" | "tenant_admin" | "member" | "none"
  isAdmin?: boolean
  isTenantAdmin?: boolean
  canManageUsers?: boolean
  memberRole?: string | null
  email?: string
  name?: string
  /** Effective area keys for members; empty/undefined for admins (= all). */
  areas?: string[]
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

/*
 * I tre filtri (moduli / ruolo / aree) stavano qui e venivano rifatti a modo
 * proprio dalla pagina Impostazioni: due implementazioni della stessa regola.
 * Ora la regola e' una sola, `visibleEntries` in lib/platform/nav.ts, usata da
 * entrambi.
 */

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
  const isAdmin = me?.isAdmin
  const areas = me?.areas
  const canManageUsers = me?.canManageUsers

  // Un solo contesto, passato allo stesso filtro per tutti e tre gli elenchi.
  const viewer = useMemo(
    () => ({ isAdmin, areas, activeModules, canManageUsers }),
    [isAdmin, areas, activeModules, canManageUsers],
  )

  const primaryNav = useMemo(() => visibleEntries(OPERATIVE_PRIMARY, viewer), [viewer])
  const moreNav = useMemo(() => visibleEntries(OPERATIVE_SECONDARY, viewer), [viewer])
  const settingsNav = useMemo(() => visibleEntries(SETTINGS_ENTRIES, viewer), [viewer])

  const moreHasActive = useMemo(
    () => moreNav.some((item) => isActive(item, pathname)),
    [moreNav, pathname],
  )

  // La tendina Impostazioni si evidenzia anche quando si e' sulla pagina che
  // le raccoglie, non solo su una singola destinazione.
  const settingsHasActive = useMemo(
    () =>
      pathname.startsWith(SETTINGS_HUB_HREF) ||
      settingsNav.some((item) => isActive(item, pathname)),
    [settingsNav, pathname],
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
      <header className="flex-shrink-0 h-14 border-b border-border bg-white z-30">
        <div className="h-full flex items-center px-3 sm:px-4">
          <Link href="/admin" className="flex items-center gap-2" aria-label="HotelAccelerator">
            <HotelAcceleratorLogo markClassName="h-8 w-8" priority />
          </Link>
        </div>
      </header>
    )
  }

  return (
    <header className="flex-shrink-0 h-14 border-b border-border bg-white z-30">
      <div className="h-full flex items-center gap-2 px-3 sm:px-4">
        {/* Logo / brand */}
        <Link
          href="/admin/dashboard"
          className="flex items-center gap-2 flex-shrink-0 pr-2 sm:pr-4 border-r border-border h-full"
          aria-label="Torna alla dashboard"
        >
          <HotelAcceleratorMark className="h-8 w-8" priority />
          <span className="hidden md:block font-semibold text-foreground text-sm">
            HotelAccelerator
          </span>
        </Link>

        {/* Primary nav (desktop inline, mobile hidden: collapses into Altro) */}
        <nav className="hidden lg:flex items-center gap-0.5 h-full" aria-label="Navigazione principale">
          {primaryNav.map((item) => {
            const active = isActive(item, pathname)
            const Icon = item.icon
            const dot = active ? NAV_ACCENT_DOT[item.href] : undefined
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "flex items-center gap-1.5 px-3 h-9 rounded-md text-[13px] font-medium transition-colors",
                  active
                    ? "bg-ha-brand-soft text-ha-brand-soft-foreground"
                    : "text-foreground hover:bg-muted",
                ].join(" ")}
              >
                {dot && (
                  <span
                    className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${dot}`}
                    aria-hidden
                  />
                )}
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
                moreHasActive ? "bg-ha-brand-soft text-ha-brand-soft-foreground" : "text-foreground",
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
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                Principali
              </DropdownMenuLabel>
              {primaryNav.map((item) => {
                const Icon = item.icon
                const active = isActive(item, pathname)
                const dot = active ? NAV_ACCENT_DOT[item.href] : undefined
                return (
                  <DropdownMenuItem key={item.href} asChild>
                    <Link
                      href={item.href}
                      className={[
                        "flex items-center gap-2 cursor-pointer",
                        active && "text-ha-brand-soft-foreground font-medium",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                      <span>{item.label}</span>
                      {dot && (
                        <span
                          className={`ml-auto h-1.5 w-1.5 rounded-full flex-shrink-0 ${dot}`}
                          aria-hidden
                        />
                      )}
                    </Link>
                  </DropdownMenuItem>
                )
              })}
              <DropdownMenuSeparator />
            </div>
            {/*
              "Strumenti" mescolava operative e configurazione. Ora qui ci sono
              SOLO parti operative: la configurazione ha la sua voce.
              L'etichetta compare solo se c'e' almeno una voce, altrimenti
              resterebbe un titolo sopra il nulla.
            */}
            {moreNav.length > 0 && (
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                Altre sezioni operative
              </DropdownMenuLabel>
            )}
            {moreNav.map((item) => {
              const Icon = item.icon
              const active = isActive(item, pathname)
              const dot = active ? NAV_ACCENT_DOT[item.href] : undefined
              return (
                <DropdownMenuItem key={item.href} asChild>
                  <Link
                    href={item.href}
                    className={[
                      "flex items-center gap-2 cursor-pointer",
                      active && "text-ha-brand-soft-foreground font-medium",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                    <span>{item.label}</span>
                    {dot && (
                      <span
                        className={`ml-auto h-1.5 w-1.5 rounded-full flex-shrink-0 ${dot}`}
                        aria-hidden
                      />
                    )}
                  </Link>
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        {/*
          L'unica voce "Impostazioni": tutto cio' che si IMPOSTA sta qui dentro.
          E' una tendina (accesso in un clic) il cui piede porta alla pagina che
          raccoglie le stesse voci in schede: due strade, un solo elenco.
          Se chi guarda non ha nemmeno una impostazione visibile, la tendina non
          si mostra: un pulsante che apre un menu vuoto sembra un guasto.
        */}
        {settingsNav.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={[
                  "h-9 text-[13px] font-medium gap-1",
                  settingsHasActive ? "bg-ha-brand-soft text-ha-brand-soft-foreground" : "text-foreground",
                ].join(" ")}
                aria-label="Impostazioni"
              >
                <SETTINGS_ICON className="h-4 w-4" aria-hidden />
                <span className="hidden lg:inline">Impostazioni</span>
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                Configurazione
              </DropdownMenuLabel>
              {settingsNav.map((item) => {
                const Icon = item.icon
                const active = isActive(item, pathname)
                return (
                  <DropdownMenuItem key={item.id} asChild>
                    <Link
                      href={item.href}
                      className={[
                        "flex items-center gap-2 cursor-pointer",
                        active && "text-ha-brand-soft-foreground font-medium",
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
              <DropdownMenuItem asChild>
                <Link
                  href={SETTINGS_HUB_HREF}
                  className="flex items-center gap-2 cursor-pointer text-muted-foreground"
                >
                  <SETTINGS_ICON className="h-4 w-4" aria-hidden />
                  <span>Tutte le impostazioni</span>
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Tenant switcher (self-hides when role=none) */}
        <TenantSwitcher />

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2 h-9 px-1.5 rounded-md hover:bg-muted transition-colors"
              aria-label="Menu utente"
            >
              <div className="w-7 h-7 rounded-full bg-ha-brand flex items-center justify-center text-ha-brand-foreground text-[11px] font-semibold">
                {userInitials || "?"}
              </div>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {me?.email && (
              <>
                <div className="px-2 py-1.5">
                  {me.name && (
                    <div className="text-sm font-medium text-foreground truncate">{me.name}</div>
                  )}
                  <div className="text-xs text-muted-foreground truncate">{me.email}</div>
                  {me.role === "super_admin" && (
                    <div className="mt-1 inline-block px-1.5 py-0.5 rounded bg-ha-brand-soft text-ha-brand-soft-foreground text-[10px] font-medium">
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
              <Link href={SETTINGS_HUB_HREF} className="flex items-center gap-2 cursor-pointer">
                <SETTINGS_ICON className="h-4 w-4" aria-hidden />
                <span>Impostazioni</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleSignOut}
              className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive"
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
