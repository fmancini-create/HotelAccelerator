"use client"

import Link from "next/link"
import Image from "next/image"
import { useState } from "react"
import {
  ChevronDown,
  Database,
  Sparkles,
  Lock,
  Settings,
  HelpCircle,
  LogOut,
  Bell,
  ArrowLeft,
  Info,
  Menu,
  X,
  CheckCircle2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AppFooter } from "@/components/layout/app-footer"
import { DemoTaddeoWidget } from "@/components/sales/demo/demo-taddeo-widget"

/**
 * Shell della modalita' demo.
 *
 * OBIETTIVO (28/05/2026): la demo per i venditori deve essere VISIVAMENTE
 * IDENTICA al prodotto reale. Questo header replica `components/dashboard/
 * app-header.tsx` (alias DashboardHeader): logo Santaddeo, selettore
 * struttura, indicatore di sync, menu a tendina "Dati" con le STESSE
 * etichette e lo STESSO ordine del reale (Base + Accelerator con lucchetti),
 * notifiche, Impostazioni, bottone Guida, Logout.
 *
 * Differenze rispetto al reale (tutte FINTE / decorative, nessun fetch):
 * - selettore struttura mostra solo "Hotel Santaddeo" (mock);
 * - indicatore sync statico ("Sincronizzato - 2m fa");
 * - le voci Accelerator non clonate restano col lucchetto come nel reale;
 * - le icone Notifiche/Impostazioni/Guida/Logout sono decorative.
 *
 * In piu', una sottile barra "Modalita' Demo" ospita i controlli specifici
 * della demo: "Torna al CRM" e "Riapri info pagina" (riapre il popup narrato).
 */

// Voci Base del menu "Dati" che hanno un clone demo navigabile.
const DEMO_DATI_BASE: Array<{ href: string; label: string }> = [
  { href: "/demo/production", label: "Produzione" },
  { href: "/demo/bookings", label: "Prenotazioni" },
  { href: "/demo/calendar", label: "Calendario" },
  { href: "/demo/reviews", label: "Recensioni" },
  { href: "/demo/ota", label: "Performance OTA" },
  { href: "/demo/commissioni-fatture", label: "Commissioni & Fatture" },
]

// Voci Accelerator. NEL PRODOTTO REALE sono TUTTE a pagamento: in
// components/dashboard/app-header.tsx ogni voce passa da handleAcceleratorClick
// con gating `hasAccelerator || effectiveSuperAdmin` (Analytics e Pricing
// inclusi). Per la demo le marchiamo tutte come premium (lucchetto) e, dove
// esiste gia' una pagina demo navigabile (href), restano cliccabili per
// mostrarne il valore; il resto resta col lucchetto in attesa del clone demo.
const DEMO_DATI_ACCELERATOR: Array<{ label: string; href?: string }> = [
  { label: "Obiettivi", href: "/demo/obiettivi" },
  { label: "Pricing", href: "/demo/pricing" },
  { label: "Rate Shopper", href: "/demo/rate-shopper" },
  { label: "Booking Pace", href: "/demo/pace" },
  { label: "Trend Tariffe & Occupazione", href: "/demo/trend" },
  { label: "Produzione per Canali", href: "/demo/produzione-canali" },
  { label: "Disponibilita", href: "/demo/disponibilita" },
  { label: "Guard", href: "/demo/guard" },
  { label: "Log Invio Prezzi", href: "/demo/log-prezzi" },
  { label: "Insight AI", href: "/demo/insight-ai" },
  { label: "Analytics", href: "/demo/analytics" },
  { label: "Eventi", href: "/demo/eventi" },
  { label: "Area Revenue Manager", href: "/demo/revman" },
]

export function DemoShell({
  children,
  onReopenInfo,
}: {
  children: React.ReactNode
  onReopenInfo: () => void
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* ===== Header (replica del reale) ===== */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between px-4">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <Link href="/demo" className="flex items-center gap-2">
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
            {/* Hotel Selector (finto, una sola struttura) */}
            <Select value="demo" disabled>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Seleziona struttura" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="demo">Hotel Santaddeo</SelectItem>
              </SelectContent>
            </Select>

            {/* Sync indicator finto */}
            <div className="flex items-center gap-1.5 text-xs text-emerald-600" title="Sincronizzato">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <CheckCircle2 className="h-4 w-4" />
              <span className="hidden lg:inline">2m fa</span>
            </div>

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
                {DEMO_DATI_BASE.map((item) => (
                  <DropdownMenuItem key={item.href} asChild>
                    <Link href={item.href}>{item.label}</Link>
                  </DropdownMenuItem>
                ))}

                <DropdownMenuSeparator />

                <DropdownMenuLabel className="flex items-center gap-2 text-xs font-semibold text-primary">
                  <Sparkles className="h-3 w-3" />
                  Accelerator
                </DropdownMenuLabel>

                {DEMO_DATI_ACCELERATOR.map((item) =>
                  item.href ? (
                    <DropdownMenuItem key={item.label} asChild>
                      <Link href={item.href} className="flex items-center gap-2 w-full">
                        {item.label}
                        <Lock className="h-3 w-3 ml-auto text-primary/70" />
                      </Link>
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      key={item.label}
                      className="text-muted-foreground"
                      onSelect={(e) => e.preventDefault()}
                    >
                      <span className="flex items-center gap-2 w-full">
                        {item.label}
                        <Lock className="h-3 w-3 ml-auto" />
                      </span>
                    </DropdownMenuItem>
                  ),
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Notifiche (decorativo) */}
            <Button variant="ghost" size="sm" className="relative" aria-label="Notifiche">
              <Bell className="h-4 w-4" />
            </Button>

            {/* Impostazioni (decorativo) */}
            <Button variant="ghost" size="sm" aria-label="Impostazioni">
              <Settings className="h-4 w-4" />
            </Button>

            {/* Guida (decorativo, stesso stile del reale) */}
            <span
              title="Guida interattiva"
              className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-blue-400 bg-blue-600 text-white shadow-md"
              aria-label="Guida interattiva"
            >
              <HelpCircle className="h-5 w-5" />
            </span>

            {/* Logout (decorativo -> esce dalla demo verso l'area dell'utente.
                /dashboard funziona per tutti: i tenant restano in dashboard,
                i venditori puri vengono rediretti a /sales dal middleware). */}
            <Button variant="ghost" size="sm" asChild aria-label="Esci dalla demo">
              <Link href="/dashboard">
                <LogOut className="h-4 w-4" />
              </Link>
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="sm"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t bg-background p-4 space-y-3 max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain">
            <Select value="demo" disabled>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Seleziona struttura" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="demo">Hotel Santaddeo</SelectItem>
              </SelectContent>
            </Select>

            <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Dati
            </p>
            {DEMO_DATI_BASE.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded px-2 py-2 text-sm hover:bg-muted"
                onClick={() => setMobileMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <div className="flex items-center gap-2 px-1 pt-2 text-xs font-semibold text-primary">
              <Sparkles className="h-3 w-3" />
              Accelerator
            </div>
            {DEMO_DATI_ACCELERATOR.map((item) =>
              item.href ? (
                <Link
                  key={item.label}
                  href={item.href}
                  className="flex items-center gap-2 rounded px-2 py-2 text-sm hover:bg-muted"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item.label}
                  <Lock className="h-3 w-3 ml-auto text-primary/70" />
                </Link>
              ) : (
                <div
                  key={item.label}
                  className="flex items-center gap-2 rounded px-2 py-2 text-sm text-muted-foreground"
                >
                  {item.label}
                  <Lock className="h-3 w-3 ml-auto" />
                </div>
              ),
            )}
          </div>
        )}
      </header>

      {/* ===== Barra Modalita' Demo (controlli specifici della demo) ===== */}
      <div className="border-b border-amber-200 bg-amber-50">
        <div className="container flex items-center justify-between gap-2 px-4 py-2">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800 hover:text-amber-900"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Esci dalla demo</span>
            </Link>
            <div className="h-4 w-px bg-amber-200" />
            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border border-amber-200">
              <Sparkles className="h-3 w-3 mr-1" />
              Modalita' Demo
            </Badge>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onReopenInfo}
            className="h-7 gap-2 border-amber-300 bg-transparent text-amber-800 hover:bg-amber-100"
          >
            <Info className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Riapri info pagina</span>
            <span className="sm:hidden">Info</span>
          </Button>
        </div>
      </div>

      {/* ===== Contenuto pagina =====
          Come nel prodotto reale, ogni pagina rende la propria fascia titolo
          (PageHeader, full-bleed) + il proprio container per il contenuto. */}
      <main className="flex-1 min-w-0 bg-gray-50">{children}</main>

      <AppFooter />

      {/* RevMentor "Taddeo" (verde) versione demo. Sostituisce in basso a destra
          il FAB blu della guida, soppresso su /demo nel PageGuideButton. */}
      <DemoTaddeoWidget />
    </div>
  )
}
