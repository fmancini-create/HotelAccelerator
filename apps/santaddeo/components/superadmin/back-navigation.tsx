"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronLeft, Home, LayoutGrid, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const SUPERADMIN_PAGES: Record<string, string> = {
  "/superadmin": "Dashboard",
  "/superadmin/connectors-mapping": "Mappatura Connettori",
  "/superadmin/connectors-health": "Health Monitor",
  "/superadmin/pms-roadmap": "PMS Roadmap",
  "/superadmin/rms-codes": "Codici RMS",
  "/superadmin/business-plan": "Business Plan",
  "/superadmin/tenant-costs": "Costi Tenant",
  "/superadmin/pricing": "Pricing",
  "/superadmin/pricing-log": "Log Prezzi",
  "/superadmin/push-prices": "Push Prezzi PMS",
  "/superadmin/features": "Sviluppo",
  "/superadmin/progressive-sandbox": "Sandbox Progressive",
}

export function BackNavigation() {
  const pathname = usePathname()

  // Non mostrare nella dashboard principale
  if (pathname === "/superadmin") {
    return null
  }

  const currentPageName = SUPERADMIN_PAGES[pathname] || "Pagina"

  return (
    <div className="border-b bg-muted/30">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/superadmin" className="flex items-center gap-2">
                <ChevronLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Torna alla Dashboard</span>
                <span className="sm:hidden">Indietro</span>
              </Link>
            </Button>

            <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground min-w-0">
              <Link href="/superadmin" className="hover:text-foreground transition-colors shrink-0">
                <Home className="h-4 w-4" />
              </Link>
              <span className="shrink-0">/</span>
              <span className="text-foreground font-medium truncate">{currentPageName}</span>
            </div>
          </div>

          {/* Menu compatto: prima era una nav inline con 11 voci che sfondava
              il viewport. Ora un dropdown unico evidenzia la pagina attiva. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 shrink-0 bg-transparent">
                <LayoutGrid className="h-4 w-4" />
                <span className="hidden sm:inline">Vai a sezione</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Aree SuperAdmin</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {Object.entries(SUPERADMIN_PAGES).map(([path, name]) => {
                const active = pathname === path
                return (
                  <DropdownMenuItem key={path} asChild>
                    <Link
                      href={path}
                      className="flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <span className={active ? "font-semibold" : ""}>{name}</span>
                      {active && <Check className="h-4 w-4 text-primary" />}
                    </Link>
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}
