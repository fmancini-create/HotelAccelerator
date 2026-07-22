"use client"

import Link from "next/link"
import Image from "next/image"
import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
// FORCE REBUILD v4 - 20260320-0041 - Using span instead of DialogDescription to avoid p-in-p hydration error
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ChevronDown, ChevronLeft, Menu, X, Settings, LogOut, Database, Shield, Sparkles, Lock, HelpCircle, Home, Briefcase, Headphones, TrendingUp, Search, Scale } from "lucide-react"
import { useHotel } from "@/lib/contexts/hotel-context"
import { triggerOpenGuide } from "@/components/layout/page-guide-button"
import { SyncStatusIndicator } from "@/components/dashboard/sync-status-indicator"
import { VatViewToggle } from "@/components/dashboard/vat-view-toggle"
import { NotificationsPopup } from "@/components/notifications/notifications-popup"
import { PendingRequestsDot } from "@/components/superadmin/pending-requests-dot"

interface Hotel {
  id: string
  name: string
  [key: string]: any
}

interface AppHeaderProps {
  hotels: Hotel[]
  selectedHotel: Hotel | null
  onSelectHotel?: (hotelId: string) => void
  isSuperAdmin?: boolean
  profile?: { full_name?: string; email?: string } | null
  subscription?: {
    status?: string
    payment_status?: string
    is_active?: boolean
  } | null
  [key: string]: any
}

export function AppHeader({ hotels, selectedHotel: propSelectedHotel, onSelectHotel, isSuperAdmin, profile, subscription }: AppHeaderProps) {
  // Check if Accelerator is active based on subscription status
  // payment_status is the actual DB column; status is mapped server-side for compatibility
  const subStatus = subscription?.payment_status || subscription?.status
  const hasAccelerator = subStatus === "active" || subStatus === "trialing" || subscription?.is_active === true
  // Link al tour demo. Se il tenant e' su piano a fee mensile passiamo
  // ?plan=fee, cosi' la demo Commissioni & Fatture nasconde le commissioni e
  // mostra solo le fatture. Default (commissione / sconosciuto) -> demo piena.
  const planType = (subscription?.plan_type || "").toLowerCase()
  const isMonthlyFee = planType === "monthly_fee" || planType === "monthly" || planType === "fee"
  const demoHref = isMonthlyFee ? "/demo?plan=fee" : "/demo"
  // Gating del menu Accelerator/"Dati" (17/07/2026): il super_admin ha SEMPRE
  // il bypass, anche quando ha selezionato un hotel senza Accelerator (es.
  // Superlusso). Prima si sottraeva l'impersonation-hotel (isImpersonatingUser
  // veniva alimentato col flag di selezione hotel dai layout), quindi bastava
  // scegliere un hotel per bloccare le sezioni a pagamento nella nav. Ora e'
  // coerente col server: hasAddon()/hub sbloccano gia' i super_admin usando la
  // loro identita' reale, indipendentemente dall'hotel selezionato.
  const effectiveSuperAdmin = Boolean(isSuperAdmin)
  const router = useRouter()
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false)

  // Mostra il link "Area venditori" se l'utente ha doppio ruolo:
  // role primario property_admin / sub_user / super_admin (ha hotel) MA ha
  // anche una riga in `sales_agents` attiva. Per il "pure agent"
  // (role='sales_agent' senza hotel propri) il link e' superfluo perche'
  // sta gia' su /sales — anzi, in quel caso il middleware redirige
  // qualsiasi accesso a hotel-area su /sales (vedi session-handler).
  const [showSalesLink, setShowSalesLink] = useState(false)
  useEffect(() => {
    let cancelled = false
    fetch("/api/me/is-sales-agent", { cache: "no-store", credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return
        // Mostra link SOLO se ha la doppia identita': agente + ha hotel.
        // Per i pure agent il link e' inutile (sono gia' su /sales).
        if (j && j.isSalesAgent && !j.isPureSalesAgent) {
          setShowSalesLink(true)
        }
      })
      .catch(() => {
        /* soft fail: il link non appare, niente di critico */
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Mostra "Onboarding Consulenza" SOLO se il SuperAdmin ha gia' creato
  // la checklist per l'hotel selezionato. Per gli hotel senza checklist,
  // la voce resta nascosta ai tenant (il SuperAdmin la vede sempre).
  const [hasOnboardingChecklist, setHasOnboardingChecklist] = useState(false)
  // selectedHotel viene calcolato piu' sotto: rileggiamo qui il valore
  // dal context/props per usarlo nell'effect.
  let _ctxHotelForOnb: Hotel | null = null
  try { _ctxHotelForOnb = useHotel().selectedHotel } catch { /* no ctx */ }
  const _onbHotelId = (_ctxHotelForOnb || propSelectedHotel)?.id || null
  useEffect(() => {
    let cancelled = false
    if (!_onbHotelId) { setHasOnboardingChecklist(false); return }
    fetch(`/api/onboarding/checklist?hotel_id=${_onbHotelId}`, { cache: "no-store", credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return
        setHasOnboardingChecklist(Boolean(j?.checklist))
      })
      .catch(() => { if (!cancelled) setHasOnboardingChecklist(false) })
    return () => { cancelled = true }
  }, [_onbHotelId])
  
  // Handler per le voci Accelerator quando l'utente non ha il piano
  const handleAcceleratorClick = (e: React.MouseEvent, path: string) => {
    if (hasAccelerator || effectiveSuperAdmin) {
      router.push(path)
    } else {
      e.preventDefault()
      setUpgradeDialogOpen(true)
    }
  }
  
  // Try to use context, fallback to props
  let contextHotel: Hotel | null = null
  let contextSetHotel: ((hotel: Hotel) => void) | null = null
  try {
    const hotelContext = useHotel()
    contextHotel = hotelContext.selectedHotel
    contextSetHotel = hotelContext.setSelectedHotel
  } catch {
    // Context not available, use props
  }
  
  const selectedHotel = contextHotel || propSelectedHotel
  
  const handleSelectHotel = async (hotelId: string) => {
    const hotel = hotels.find(h => h.id === hotelId)
    if (!hotel) return

    // Update React state immediately (visual feedback in the selector).
    if (contextSetHotel) {
      contextSetHotel(hotel)
    }
    if (onSelectHotel) {
      onSelectHotel(hotelId)
    }

    // FIX 30/04/2026 (post-incident "cambio struttura non va su /dati/bookings"):
    // Persist the impersonation cookie SERVER-SIDE *before* navigating.
    // `document.cookie = ...` (still done as a fallback in the hotel context)
    // is committed lazily on some browsers and the upcoming
    // `window.location.href` navigation can fire before the cookie store is
    // flushed -> the new request is sent with the previous (stale) cookie,
    // and getSettingsData() returns the wrong hotel server-side.
    //
    // The endpoint validates that the user is allowed to switch to that
    // hotel (super_admin or same organization) and writes the cookie via
    // Set-Cookie. Awaiting the fetch guarantees the cookie is in the browser
    // store before we navigate.
    try {
      await fetch("/api/ui/select-hotel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId }),
        cache: "no-store",
      })
    } catch (err) {
      // Non-fatal: we still try to navigate; the URL ?hotel= param will be
      // honored by /api/ui/selected-hotel even if the cookie write failed.
      console.error("[v0] Failed to persist hotel cookie:", err)
    }

    // Per multitenant / superadmin: rimani sulla stessa pagina cambiando solo
    // il param `hotel`. Le pagine server-side che leggono ?hotel= o il cookie
    // `impersonated_hotel_id` rifaranno il fetch dei dati per il nuovo hotel.
    //
    // Eccezioni: alcune pagine sono dipendenti dal singolo hotel via path
    // segment (es. /superadmin/hotels/[id]/...) o sono pagine wizard/onboarding
    // che non hanno senso preservare. In questi casi torniamo a /dashboard.
    const currentPath = window.location.pathname
    const ALWAYS_GO_TO_DASHBOARD = [
      "/onboarding",
      "/auth",
      "/superadmin/hotels/", // dynamic [id] path
    ]
    const shouldRedirectToDashboard = ALWAYS_GO_TO_DASHBOARD.some((p) => currentPath.startsWith(p))

    if (shouldRedirectToDashboard) {
      window.location.href = `/dashboard?hotel=${hotelId}`
      return
    }

    // Preserva pathname + query, sostituisci/aggiungi `hotel` param.
    // window.location.assign() is equivalent to setting `href` but conveys
    // intent more clearly and ensures a full document navigation rather than
    // any potential router-intercepted soft-navigation.
    const url = new URL(window.location.href)
    url.searchParams.set("hotel", hotelId)
    window.location.assign(url.pathname + url.search + url.hash)
  }

  const logout = () => {
    window.location.href = "/api/auth/logout-now"
  }

  const isHomePage = pathname === "/dashboard" || pathname === "/"

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between px-4">
        {/* Navigation buttons + Logo */}
        <div className="flex items-center gap-2">
          {/* Back button - hidden on home */}
          {!isHomePage && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8"
              onClick={() => router.back()}
              title="Indietro"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          {/* Home button - hidden on home */}
          {!isHomePage && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8"
              asChild
              title="Home"
            >
              <Link href="/dashboard">
                <Home className="h-4 w-4" />
              </Link>
            </Button>
          )}
          {/* Logo */}
          <Link href="/dashboard" className="flex items-center gap-2">
            <Image 
              src="/logo-santaddeo.png" 
              alt="Santaddeo" 
              width={140} 
              height={40} 
              className="h-8 w-auto"
              priority
            />
          </Link>
        </div>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-4">
          {/* Hotel Selector */}
          {hotels.length > 0 && (
            <Select value={selectedHotel?.id || ""} onValueChange={handleSelectHotel}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Seleziona struttura" />
              </SelectTrigger>
              <SelectContent>
                {hotels.map((h) => (
                  <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Toggle visualizzazione IVA (solo pagine KPI) */}
          <VatViewToggle />

          {/* Sync Status Indicator */}
          <SyncStatusIndicator hotelId={selectedHotel?.id || null} />

          {/* SuperAdmin Button */}
          {isSuperAdmin && (
            <Button variant="outline" size="sm" asChild>
              <Link href="/superadmin" className="relative flex items-center gap-2">
                <Shield className="h-4 w-4" />
                SuperAdmin
                <PendingRequestsDot />
              </Link>
            </Button>
          )}

          {/* Area venditori (visibile a chi ha il dual role) */}
          {showSalesLink && (
            <Button variant="outline" size="sm" asChild>
              <Link href="/sales" className="flex items-center gap-2">
                <Briefcase className="h-4 w-4" />
                Area venditori
              </Link>
            </Button>
          )}

          {/* Dati Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1">
                <Database className="h-4 w-4" />
                Dati
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {/* Sezione Base - visibile a tutti (voci free in verde) */}
              <DropdownMenuItem asChild><Link href="/dati/production" className="text-emerald-600 focus:text-emerald-700">Produzione</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link href="/dati/bookings" className="text-emerald-600 focus:text-emerald-700">Prenotazioni</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link href="/dati/calendario" className="text-emerald-600 focus:text-emerald-700">Calendario</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link href="/dati/performance-ota" className="text-emerald-600 focus:text-emerald-700">Performance OTA</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link href="/dati/commissioni-fatture" className="text-emerald-600 focus:text-emerald-700">Commissioni &amp; Fatture</Link></DropdownMenuItem>

              <DropdownMenuSeparator />
              
              {/* Sezione Accelerator */}
              <DropdownMenuLabel className="flex items-center gap-2 text-xs font-semibold text-primary">
                <Sparkles className="h-3 w-3" />
                Accelerator
              </DropdownMenuLabel>
              
              <DropdownMenuItem 
                className={!hasAccelerator && !effectiveSuperAdmin ? "text-muted-foreground" : "text-amber-600 focus:text-amber-700"}
                onClick={(e) => handleAcceleratorClick(e, "/dati/objectives")}
              >
                <span className="flex items-center gap-2 w-full">
                  Obiettivi
                  {!hasAccelerator && !effectiveSuperAdmin && <Lock className="h-3 w-3 ml-auto" />}
                </span>
              </DropdownMenuItem>
              
              <DropdownMenuItem 
                className={!hasAccelerator && !effectiveSuperAdmin ? "text-muted-foreground" : "text-amber-600 focus:text-amber-700"}
                onClick={(e) => handleAcceleratorClick(e, "/accelerator/pricing")}
              >
                <span className="flex items-center gap-2 w-full">
                  Pricing
                  {!hasAccelerator && !effectiveSuperAdmin && <Lock className="h-3 w-3 ml-auto" />}
                </span>
              </DropdownMenuItem>
              
              <DropdownMenuItem 
                className={!hasAccelerator && !effectiveSuperAdmin ? "text-muted-foreground" : "text-amber-600 focus:text-amber-700"}
                onClick={(e) => handleAcceleratorClick(e, "/accelerator/trend")}
              >
                <span className="flex items-center gap-2 w-full">
                  Trend Tariffe &amp; Occupazione
                  {!hasAccelerator && !effectiveSuperAdmin && <Lock className="h-3 w-3 ml-auto" />}
                </span>
              </DropdownMenuItem>

              <DropdownMenuItem 
                className={!hasAccelerator && !effectiveSuperAdmin ? "text-muted-foreground" : "text-amber-600 focus:text-amber-700"}
                onClick={(e) => handleAcceleratorClick(e, "/accelerator/pace")}
              >
                <span className="flex items-center gap-2 w-full">
                  Booking Pace
                  {!hasAccelerator && !effectiveSuperAdmin && <Lock className="h-3 w-3 ml-auto" />}
                </span>
              </DropdownMenuItem>

              <DropdownMenuItem 
                className={!hasAccelerator && !effectiveSuperAdmin ? "text-muted-foreground" : "text-amber-600 focus:text-amber-700"}
                onClick={(e) => handleAcceleratorClick(e, "/accelerator/commercial-balance")}
              >
                <span className="flex items-center gap-2 w-full">
                  Bilancio Commerciale
                  {!hasAccelerator && !effectiveSuperAdmin && <Lock className="h-3 w-3 ml-auto" />}
                </span>
              </DropdownMenuItem>

              <DropdownMenuItem 
                className={!hasAccelerator && !effectiveSuperAdmin ? "text-muted-foreground" : "text-amber-600 focus:text-amber-700"}
                onClick={(e) => handleAcceleratorClick(e, "/accelerator/rate-shopper")}
              >
                <span className="flex items-center gap-2 w-full">
                  Rate Shopper
                  {!hasAccelerator && !effectiveSuperAdmin && <Lock className="h-3 w-3 ml-auto" />}
                </span>
              </DropdownMenuItem>

              <DropdownMenuItem 
                className={!hasAccelerator && !effectiveSuperAdmin ? "text-muted-foreground" : "text-amber-600 focus:text-amber-700"}
                onClick={(e) => handleAcceleratorClick(e, "/accelerator/price")}
              >
                <span className="flex items-center gap-2 w-full">
                  Produzione per Canali
                  {!hasAccelerator && !effectiveSuperAdmin && <Lock className="h-3 w-3 ml-auto" />}
                </span>
              </DropdownMenuItem>
              
              <DropdownMenuItem 
                className={!hasAccelerator && !effectiveSuperAdmin ? "text-muted-foreground" : "text-amber-600 focus:text-amber-700"}
                onClick={(e) => handleAcceleratorClick(e, "/dati/rooms-sold")}
              >
                <span className="flex items-center gap-2 w-full">
                  Disponibilita
                  {!hasAccelerator && !effectiveSuperAdmin && <Lock className="h-3 w-3 ml-auto" />}
                </span>
              </DropdownMenuItem>
              
              <DropdownMenuItem 
                className={!hasAccelerator && !effectiveSuperAdmin ? "text-muted-foreground" : "text-amber-600 focus:text-amber-700"}
                onClick={(e) => handleAcceleratorClick(e, "/dati/guard")}
              >
                <span className="flex items-center gap-2 w-full">
                  Guard
                  {!hasAccelerator && !effectiveSuperAdmin && <Lock className="h-3 w-3 ml-auto" />}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem 
                className={!hasAccelerator && !effectiveSuperAdmin ? "text-muted-foreground" : "text-amber-600 focus:text-amber-700"}
                onClick={(e) => handleAcceleratorClick(e, "/dati/log-prezzi")}
              >
                <span className="flex items-center gap-2 w-full">
                  Log Invio Prezzi
                  {!hasAccelerator && !effectiveSuperAdmin && <Lock className="h-3 w-3 ml-auto" />}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className={!hasAccelerator && !effectiveSuperAdmin ? "text-muted-foreground" : "text-amber-600 focus:text-amber-700"}
                onClick={(e) => handleAcceleratorClick(e, "/dati/ai-report")}
              >
                <span className="flex items-center gap-2 w-full">
                  Insight AI
                  {!hasAccelerator && !effectiveSuperAdmin && <Lock className="h-3 w-3 ml-auto" />}
                </span>
              </DropdownMenuItem>

              <DropdownMenuItem
                className={!hasAccelerator && !effectiveSuperAdmin ? "text-muted-foreground" : "text-amber-600 focus:text-amber-700"}
                onClick={(e) => handleAcceleratorClick(e, "/dati/reviews")}
              >
                <span className="flex items-center gap-2 w-full">
                  Recensioni
                  {!hasAccelerator && !effectiveSuperAdmin && <Lock className="h-3 w-3 ml-auto" />}
                </span>
              </DropdownMenuItem>
              
              <DropdownMenuItem
                className={!hasAccelerator && !effectiveSuperAdmin ? "text-muted-foreground" : "text-amber-600 focus:text-amber-700"}
                onClick={(e) => handleAcceleratorClick(e, "/dati/analytics")}
              >
                <span className="flex items-center gap-2 w-full">
                  Analytics
                  {!hasAccelerator && !effectiveSuperAdmin && <Lock className="h-3 w-3 ml-auto" />}
                </span>
              </DropdownMenuItem>

              <DropdownMenuItem
                className={!hasAccelerator && !effectiveSuperAdmin ? "text-muted-foreground" : "text-amber-600 focus:text-amber-700"}
                onClick={(e) => handleAcceleratorClick(e, "/accelerator/events")}
              >
                <span className="flex items-center gap-2 w-full">
                  Eventi
                  {!hasAccelerator && !effectiveSuperAdmin && <Lock className="h-3 w-3 ml-auto" />}
                </span>
              </DropdownMenuItem>

              {(effectiveSuperAdmin || hasOnboardingChecklist) && (
                <DropdownMenuItem
                  className={!hasAccelerator && !effectiveSuperAdmin ? "text-muted-foreground" : "text-amber-600 focus:text-amber-700"}
                  onClick={(e) => handleAcceleratorClick(e, "/accelerator/onboarding")}
                >
                  <span className="flex items-center gap-2 w-full">
                    Onboarding Consulenza
                    {!hasAccelerator && !effectiveSuperAdmin && <Lock className="h-3 w-3 ml-auto" />}
                  </span>
                </DropdownMenuItem>
              )}

              <DropdownMenuItem
                className={!hasAccelerator && !effectiveSuperAdmin ? "text-muted-foreground" : "text-amber-600 focus:text-amber-700"}
                onClick={(e) => handleAcceleratorClick(e, "/accelerator/revman")}
              >
                <span className="flex items-center gap-2 w-full">
                  Area Revenue Manager
                  {!hasAccelerator && !effectiveSuperAdmin && <Lock className="h-3 w-3 ml-auto" />}
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Tour guidato con audio (demo navigabile della piattaforma) */}
          <Button variant="outline" size="sm" asChild className="gap-2">
            <Link href={demoHref} title="Tour guidato con audio">
              <Headphones className="h-4 w-4" />
              <span className="hidden lg:inline">Tour guidato</span>
            </Link>
          </Button>

          {/* Platform announcements (new features, releases) */}
          <NotificationsPopup />

          {/* Settings */}
          <Button variant="ghost" size="sm" asChild>
            <Link href="/settings/pms"><Settings className="h-4 w-4" /></Link>
          </Button>

          {/* Guide Button */}
          <button
            onClick={() => triggerOpenGuide()}
            title="Guida interattiva"
            className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-blue-400 bg-blue-600 text-white shadow-md transition-all hover:bg-blue-700 hover:shadow-lg hover:scale-105 active:scale-95 cursor-pointer"
            aria-label="Guida interattiva"
          >
            <HelpCircle className="h-5 w-5" />
          </button>

          {/* Logout */}
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>

        {/* Mobile Menu Button */}
        <Button variant="ghost" size="sm" className="md:hidden" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t bg-background p-4 space-y-3 max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain">
          {hotels.length > 0 && (
            <Select value={selectedHotel?.id || ""} onValueChange={(v) => { handleSelectHotel(v); setMobileMenuOpen(false) }}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Seleziona struttura" />
              </SelectTrigger>
              <SelectContent>
                {hotels.map((h) => (
                  <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {/* Toggle visualizzazione IVA (solo pagine KPI) */}
          <div className="flex items-center gap-2 p-2">
            <VatViewToggle />
          </div>
          {/* Sync Status */}
          <div className="flex items-center gap-2 p-2">
            <SyncStatusIndicator hotelId={selectedHotel?.id || null} />
          </div>
          {isSuperAdmin && (
              <Link href="/superadmin" className="flex items-center gap-2 p-2 rounded hover:bg-muted" onClick={() => setMobileMenuOpen(false)}>
                <Shield className="h-4 w-4" /> SuperAdmin
                <PendingRequestsDot variant="badge" className="ml-auto" />
              </Link>
          )}
          {showSalesLink && (
            <Link href="/sales" className="flex items-center gap-2 p-2 rounded hover:bg-muted" onClick={() => setMobileMenuOpen(false)}>
              <Briefcase className="h-4 w-4" /> Area venditori
            </Link>
          )}
          {/* Sezione Base (voci free in verde) */}
          <Link href="/dati/production" className="flex items-center gap-2 p-2 rounded hover:bg-muted text-emerald-600" onClick={() => setMobileMenuOpen(false)}>
            <Database className="h-4 w-4" /> Produzione
          </Link>
          <Link href="/dati/bookings" className="flex items-center gap-2 p-2 rounded hover:bg-muted text-emerald-600" onClick={() => setMobileMenuOpen(false)}>
            <Database className="h-4 w-4" /> Prenotazioni
          </Link>
          <Link href="/dati/calendario" className="flex items-center gap-2 p-2 rounded hover:bg-muted text-emerald-600" onClick={() => setMobileMenuOpen(false)}>
            <Database className="h-4 w-4" /> Calendario
          </Link>
          <Link href="/dati/performance-ota" className="flex items-center gap-2 p-2 rounded hover:bg-muted text-emerald-600" onClick={() => setMobileMenuOpen(false)}>
            <Database className="h-4 w-4" /> Performance OTA
          </Link>
          <Link href="/dati/commissioni-fatture" className="flex items-center gap-2 p-2 rounded hover:bg-muted text-emerald-600" onClick={() => setMobileMenuOpen(false)}>
            <Database className="h-4 w-4" /> Commissioni &amp; Fatture
          </Link>
          
          {/* Sezione Accelerator */}
          <div className="flex items-center gap-2 p-2 text-xs font-semibold text-primary border-t mt-2 pt-2">
            <Sparkles className="h-3 w-3" />
            Accelerator
          </div>
          
          <button 
            className={`flex items-center gap-2 p-2 rounded hover:bg-muted w-full text-left ${!hasAccelerator && !effectiveSuperAdmin ? "text-muted-foreground" : "text-amber-600"}`}
            onClick={(e) => { handleAcceleratorClick(e, "/dati/objectives"); setMobileMenuOpen(false) }}
          >
            <Database className="h-4 w-4" /> Obiettivi
            {!hasAccelerator && !effectiveSuperAdmin && <Lock className="h-3 w-3 ml-auto" />}
          </button>
          
          <button 
            className={`flex items-center gap-2 p-2 rounded hover:bg-muted w-full text-left ${!hasAccelerator && !effectiveSuperAdmin ? "text-muted-foreground" : "text-amber-600"}`}
            onClick={(e) => { handleAcceleratorClick(e, "/accelerator/pricing"); setMobileMenuOpen(false) }}
          >
            <Database className="h-4 w-4" /> Pricing
            {!hasAccelerator && !effectiveSuperAdmin && <Lock className="h-3 w-3 ml-auto" />}
          </button>
          
          <button 
            className={`flex items-center gap-2 p-2 rounded hover:bg-muted w-full text-left ${!hasAccelerator && !effectiveSuperAdmin ? "text-muted-foreground" : "text-amber-600"}`}
            onClick={(e) => { handleAcceleratorClick(e, "/accelerator/trend"); setMobileMenuOpen(false) }}
          >
            <Database className="h-4 w-4" /> Trend Tariffe &amp; Occupazione
            {!hasAccelerator && !effectiveSuperAdmin && <Lock className="h-3 w-3 ml-auto" />}
          </button>

          <button 
            className={`flex items-center gap-2 p-2 rounded hover:bg-muted w-full text-left ${!hasAccelerator && !effectiveSuperAdmin ? "text-muted-foreground" : "text-amber-600"}`}
            onClick={(e) => { handleAcceleratorClick(e, "/accelerator/pace"); setMobileMenuOpen(false) }}
          >
            <TrendingUp className="h-4 w-4" /> Booking Pace
            {!hasAccelerator && !effectiveSuperAdmin && <Lock className="h-3 w-3 ml-auto" />}
          </button>

          <button 
            className={`flex items-center gap-2 p-2 rounded hover:bg-muted w-full text-left ${!hasAccelerator && !effectiveSuperAdmin ? "text-muted-foreground" : "text-amber-600"}`}
            onClick={(e) => { handleAcceleratorClick(e, "/accelerator/commercial-balance"); setMobileMenuOpen(false) }}
          >
            <Scale className="h-4 w-4" /> Bilancio Commerciale
            {!hasAccelerator && !effectiveSuperAdmin && <Lock className="h-3 w-3 ml-auto" />}
          </button>

          <button 
            className={`flex items-center gap-2 p-2 rounded hover:bg-muted w-full text-left ${!hasAccelerator && !effectiveSuperAdmin ? "text-muted-foreground" : "text-amber-600"}`}
            onClick={(e) => { handleAcceleratorClick(e, "/accelerator/rate-shopper"); setMobileMenuOpen(false) }}
          >
            <Search className="h-4 w-4" /> Rate Shopper
            {!hasAccelerator && !effectiveSuperAdmin && <Lock className="h-3 w-3 ml-auto" />}
          </button>

          <button 
            className={`flex items-center gap-2 p-2 rounded hover:bg-muted w-full text-left ${!hasAccelerator && !effectiveSuperAdmin ? "text-muted-foreground" : "text-amber-600"}`}
            onClick={(e) => { handleAcceleratorClick(e, "/accelerator/price"); setMobileMenuOpen(false) }}
          >
            <Database className="h-4 w-4" /> Produzione per Canali
            {!hasAccelerator && !effectiveSuperAdmin && <Lock className="h-3 w-3 ml-auto" />}
          </button>
          
          <button 
            className={`flex items-center gap-2 p-2 rounded hover:bg-muted w-full text-left ${!hasAccelerator && !effectiveSuperAdmin ? "text-muted-foreground" : "text-amber-600"}`}
            onClick={(e) => { handleAcceleratorClick(e, "/dati/rooms-sold"); setMobileMenuOpen(false) }}
          >
            <Database className="h-4 w-4" /> Disponibilita
            {!hasAccelerator && !effectiveSuperAdmin && <Lock className="h-3 w-3 ml-auto" />}
          </button>
          
          <button 
            className={`flex items-center gap-2 p-2 rounded hover:bg-muted w-full text-left ${!hasAccelerator && !effectiveSuperAdmin ? "text-muted-foreground" : "text-amber-600"}`}
            onClick={(e) => { handleAcceleratorClick(e, "/dati/guard"); setMobileMenuOpen(false) }}
          >
            <Database className="h-4 w-4" /> Guard
            {!hasAccelerator && !effectiveSuperAdmin && <Lock className="h-3 w-3 ml-auto" />}
          </button>
          <button 
            className={`flex items-center gap-2 p-2 rounded hover:bg-muted w-full text-left ${!hasAccelerator && !effectiveSuperAdmin ? "text-muted-foreground" : "text-amber-600"}`}
            onClick={(e) => { handleAcceleratorClick(e, "/dati/log-prezzi"); setMobileMenuOpen(false) }}
          >
            <Database className="h-4 w-4" /> Log Invio Prezzi
            {!hasAccelerator && !effectiveSuperAdmin && <Lock className="h-3 w-3 ml-auto" />}
          </button>
          <button
            className={`flex items-center gap-2 p-2 rounded hover:bg-muted w-full text-left ${!hasAccelerator && !effectiveSuperAdmin ? "text-muted-foreground" : "text-amber-600"}`}
            onClick={(e) => { handleAcceleratorClick(e, "/dati/ai-report"); setMobileMenuOpen(false) }}
          >
            <Sparkles className="h-4 w-4" /> Insight AI
            {!hasAccelerator && !effectiveSuperAdmin && <Lock className="h-3 w-3 ml-auto" />}
          </button>
          <button
            className={`flex items-center gap-2 p-2 rounded hover:bg-muted w-full text-left ${!hasAccelerator && !effectiveSuperAdmin ? "text-muted-foreground" : "text-amber-600"}`}
            onClick={(e) => { handleAcceleratorClick(e, "/dati/reviews"); setMobileMenuOpen(false) }}
          >
            <Database className="h-4 w-4" /> Recensioni
            {!hasAccelerator && !effectiveSuperAdmin && <Lock className="h-3 w-3 ml-auto" />}
          </button>
          <button
            className={`flex items-center gap-2 p-2 rounded hover:bg-muted w-full text-left ${!hasAccelerator && !effectiveSuperAdmin ? "text-muted-foreground" : "text-amber-600"}`}
            onClick={(e) => { handleAcceleratorClick(e, "/dati/analytics"); setMobileMenuOpen(false) }}
          >
            <Database className="h-4 w-4" /> Analytics
            {!hasAccelerator && !effectiveSuperAdmin && <Lock className="h-3 w-3 ml-auto" />}
          </button>
          <button
            className={`flex items-center gap-2 p-2 rounded hover:bg-muted w-full text-left ${!hasAccelerator && !effectiveSuperAdmin ? "text-muted-foreground" : "text-amber-600"}`}
            onClick={(e) => { handleAcceleratorClick(e, "/accelerator/events"); setMobileMenuOpen(false) }}
          >
            <Database className="h-4 w-4" /> Eventi
            {!hasAccelerator && !effectiveSuperAdmin && <Lock className="h-3 w-3 ml-auto" />}
          </button>
          <Link href={demoHref} className="flex items-center gap-2 p-2 rounded hover:bg-muted border-t mt-2 pt-3" onClick={() => setMobileMenuOpen(false)}>
            <Headphones className="h-4 w-4" /> Tour guidato con audio
          </Link>
          <Link href="/settings/pms" className="flex items-center gap-2 p-2 rounded hover:bg-muted" onClick={() => setMobileMenuOpen(false)}>
            <Settings className="h-4 w-4" /> Impostazioni
          </Link>
          <button onClick={logout} className="flex items-center gap-2 p-2 rounded hover:bg-muted w-full text-left">
            <LogOut className="h-4 w-4" /> Esci
          </button>
        </div>
      )}
      
      {/* Dialog Upgrade Accelerator */}
      <Dialog open={upgradeDialogOpen} onOpenChange={setUpgradeDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Sblocca Accelerator
            </DialogTitle>
            {/* Using span with aria-describedby pattern to avoid p-in-p hydration error */}
            <span id="accelerator-dialog-description" className="sr-only">
              Informazioni sul piano Accelerator per massimizzare i ricavi
            </span>
            <div className="text-sm text-muted-foreground text-left space-y-3 pt-2" aria-describedby="accelerator-dialog-description">
              <p>
                Questa funzionalita fa parte del piano <strong>Accelerator</strong>, 
                progettato per aiutarti a massimizzare i ricavi della tua struttura.
              </p>
              <p>Con Accelerator ottieni:</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Analisi avanzate di pricing e revenue</li>
                <li>Obiettivi di fatturato personalizzati</li>
                <li>Produzione per canali e piani tariffari</li>
                <li>Dashboard disponibilita in tempo reale</li>
                <li>Guard per protezione dei prezzi</li>
              </ul>
            </div>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setUpgradeDialogOpen(false)}>
              Chiudi
            </Button>
            <Button asChild>
              <Link href="/upgrade">
                <Sparkles className="h-4 w-4 mr-2" />
                Attiva Accelerator
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  )
}

// Export with old name for backward compatibility
export { AppHeader as DashboardHeader }
