"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { Building2, ChevronDown, Database, LogOut, Menu, Settings, Shield, X } from "lucide-react"
import { PendingRequestsDot } from "@/components/superadmin/pending-requests-dot"

interface Hotel {
  id: string
  name: string
}

interface DashboardHeaderProps {
  profile: { full_name?: string; email?: string } | null
  hotels: Hotel[]
  selectedHotel: Hotel | null
  isSuperAdmin: boolean
  onHotelChange?: (hotelId: string) => void
}

export function DashboardHeader({
  profile,
  hotels,
  selectedHotel,
  isSuperAdmin,
  onHotelChange,
}: DashboardHeaderProps) {
  const router = useRouter()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const handleHotelChange = (hotelId: string) => {
    if (onHotelChange) {
      onHotelChange(hotelId)
      return
    }

    // Per multitenant / superadmin: rimani sulla stessa pagina cambiando solo
    // il param `hotel`. Eccezioni: pagine onboarding/auth/hotel-specific path.
    if (typeof window !== "undefined") {
      const currentPath = window.location.pathname
      const ALWAYS_GO_TO_DASHBOARD = [
        "/onboarding",
        "/auth",
        "/superadmin/hotels/",
      ]
      const shouldRedirectToDashboard = ALWAYS_GO_TO_DASHBOARD.some((p) =>
        currentPath.startsWith(p)
      )

      if (shouldRedirectToDashboard) {
        router.push(`/dashboard?hotel=${hotelId}`)
        router.refresh()
        return
      }

      const url = new URL(window.location.href)
      url.searchParams.set("hotel", hotelId)
      router.push(url.pathname + url.search + url.hash)
      router.refresh()
      return
    }

    // SSR fallback (non dovrebbe accadere perche' siamo in "use client")
    router.push(`/dashboard?hotel=${hotelId}`)
    router.refresh()
  }

  const handleLogout = () => {
    window.location.href = "/api/auth/logout-now"
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2">
          <img src="/logo-santaddeo.png" alt="SANTADDEO" width={120} height={36} className="h-9 w-auto" />
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-3">
          {/* Hotel Selector */}
          {hotels.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Building2 className="h-4 w-4" />
                  <span className="max-w-[200px] truncate">{selectedHotel?.name || "Seleziona struttura"}</span>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                {hotels.map((hotel) => (
                  <DropdownMenuItem
                    key={hotel.id}
                    onClick={() => handleHotelChange(hotel.id)}
                    className={selectedHotel?.id === hotel.id ? "bg-accent" : ""}
                  >
                    {hotel.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* SuperAdmin Badge */}
          {isSuperAdmin && (
            <Link href="/superadmin" className="relative">
              <Badge variant="secondary" className="gap-1 cursor-pointer hover:bg-secondary/80">
                <Shield className="h-3 w-3" />
                SuperAdmin
              </Badge>
              <PendingRequestsDot />
            </Link>
          )}

          {/* Dati Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2">
                <Database className="h-4 w-4" />
                Dati
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href="/dati/production">Produzione Fiscale</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dati/bookings">Prenotazioni</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dati/calendario">Calendario</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dati/reviews">Recensioni</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dati/performance-ota">Performance OTA</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dati/commissioni-fatture">Commissioni &amp; Fatture</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/accelerator">Accelerator Dashboard</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/accelerator/pricing">Pricing Config</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/accelerator/pricing/settings">Pricing Settings</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/accelerator/events">Calendario Eventi</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/accelerator/onboarding">Onboarding Consulenza</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/accelerator/revman">Area Revenue Manager</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/accelerator/activate">Attiva Accelerator</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Settings */}
          <Button variant="ghost" size="icon" asChild>
            <Link href="/settings/pms">
              <Settings className="h-5 w-5" />
            </Link>
          </Button>

          {/* Logout */}
          <Button variant="ghost" size="icon" onClick={handleLogout}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>

        {/* Mobile Menu Button */}
        <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
          {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </Button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t bg-white px-4 py-4 space-y-3">
          {/* Hotel Selector Mobile */}
          {hotels.length > 0 && (
            <div className="space-y-2">
              <span className="text-sm font-medium text-muted-foreground">Struttura</span>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={selectedHotel?.id || ""}
                onChange={(e) => handleHotelChange(e.target.value)}
              >
                {hotels.map((hotel) => (
                  <option key={hotel.id} value={hotel.id}>
                    {hotel.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* SuperAdmin Link Mobile */}
          {isSuperAdmin && (
            <Link href="/superadmin" className="block">
              <Button variant="outline" className="w-full gap-2">
                <Shield className="h-4 w-4" />
                SuperAdmin Dashboard
                <PendingRequestsDot variant="badge" className="ml-1" />
              </Button>
            </Link>
          )}

          {/* Dati Links Mobile */}
          <div className="space-y-1">
            <span className="text-sm font-medium text-muted-foreground">Dati</span>
            <Link href="/dati/production" className="block py-2 text-sm">Produzione Fiscale</Link>
            <Link href="/dati/bookings" className="block py-2 text-sm">Prenotazioni</Link>
            <Link href="/dati/calendario" className="block py-2 text-sm">Calendario</Link>
            <Link href="/dati/reviews" className="block py-2 text-sm">Recensioni</Link>
            <Link href="/dati/performance-ota" className="block py-2 text-sm">Performance OTA</Link>
          </div>

          {/* Accelerator Links Mobile */}
          <div className="space-y-1">
            <span className="text-sm font-medium text-muted-foreground">Accelerator</span>
            <Link href="/accelerator" className="block py-2 text-sm">Dashboard</Link>
            <Link href="/accelerator/pricing" className="block py-2 text-sm">Pricing Config</Link>
            <Link href="/accelerator/pricing/settings" className="block py-2 text-sm">Pricing Settings</Link>
            <Link href="/accelerator/activate" className="block py-2 text-sm">Attiva Accelerator</Link>
          </div>

          <DropdownMenuSeparator />

          {/* Settings Mobile */}
          <Link href="/settings/pms" className="block">
            <Button variant="ghost" className="w-full justify-start gap-2">
              <Settings className="h-4 w-4" />
              Impostazioni
            </Button>
          </Link>

          {/* Logout Mobile */}
          <Button variant="ghost" className="w-full justify-start gap-2 text-destructive" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            Esci
          </Button>
        </div>
      )}
    </header>
  )
}
