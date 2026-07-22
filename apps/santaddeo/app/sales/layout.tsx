import type React from "react"
import { redirect } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { resolveLanding } from "@/lib/auth/resolve-landing"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { TasksNavLink } from "@/components/sales/tasks-nav-link"
import { CalendarNavLink } from "@/components/sales/calendar-nav-link"
import { SalesMobileNav } from "@/components/sales/sales-mobile-nav"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { Settings } from "lucide-react"

export const dynamic = "force-dynamic"

/**
 * Layout del CRM per i venditori SANTADDEO.
 *
 * Accesso consentito a:
 *  - profiles.role = 'sales_agent'  (utente puramente venditore)
 *  - profiles.role = 'super_admin'  (puo' impersonare e vedere tutto)
 *  - chiunque abbia una riga in `sales_agents` con `is_active=true`
 *    (dual role: es. property_admin che e' anche venditore — vedi
 *    memoria 03/05/2026 "role primario + flag agente")
 *
 * Ogni venditore deve avere una riga in `sales_agents` con `user_id =
 * profiles.id`. Se il profile e' 'sales_agent' ma manca la riga su
 * sales_agents, mostriamo un messaggio invece di crashare.
 */
export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  const { user, supabase } = await getAuthUserOrDev()

  if (!user) {
    redirect("/auth/login")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, first_name, last_name")
    .eq("id", user.id)
    .single()

  // Permesso: sales_agent puro, super_admin, o utente con dual-role
  // (hotel + agente). Gli ultimi vengono identificati dalla presenza di
  // una riga sales_agents attiva.
  let allowed = profile?.role === "sales_agent" || profile?.role === "super_admin"
  // Flag aggiuntivo: l'utente e' un capo area? (mostra la voce "Team" in nav).
  // Caricato sempre per coerenza, anche per super_admin (false di default).
  let isAreaManager = false
  {
    const { data: maybeAgent } = await supabase
      .from("sales_agents")
      .select("id, is_area_manager")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle()
    if (!allowed && maybeAgent) allowed = true
    if (maybeAgent?.is_area_manager) isAreaManager = true
  }
  if (!allowed) {
    redirect("/dashboard")
  }

  // Per dual-role (accesso struttura + agente) mostriamo "Torna a hotel"
  // invece di "Esci", perche' hanno una dashboard hotel dove tornare.
  // ATTENZIONE: il dual-role include ANCHE i venditori con role='sales_agent'
  // che hanno pero' accesso a una struttura (riga user_property_map o
  // organization_id). Per loro "puro" e' falso: usiamo resolveLanding come
  // sorgente di verita' condivisa (stessa logica del selettore di login).
  const isSuperAdmin = profile?.role === "super_admin"
  let hasTenantAccess = false
  try {
    const svc = await createServiceRoleClient()
    const landing = await resolveLanding(svc, user.id)
    hasTenantAccess = landing.hasTenantAccess
  } catch {
    // soft-fail: in caso di errore trattiamo come venditore puro (mostra Esci)
  }
  const isPureAgent = !isSuperAdmin && !hasTenantAccess
  const isDualRole = !isPureAgent && !isSuperAdmin // accesso struttura + agente

  const fullName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || user.email || "Venditore"

  // Modalita' di uscita per la nav mobile (stessa logica del pulsante desktop)
  const exitMode: "superadmin" | "hotel" | "logout" = isSuperAdmin
    ? "superadmin"
    : isDualRole
      ? "hotel"
      : "logout"

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/sales" className="flex items-center gap-3">
            <Image 
              src="/logo-santaddeo.png" 
              alt="Santaddeo" 
              width={140} 
              height={40} 
              className="h-8 w-auto"
              priority
            />
            <div className="hidden sm:block">
              <p className="text-xs text-muted-foreground">CRM Venditori</p>
            </div>
          </Link>
          <nav className="hidden md:flex items-center gap-1 text-sm">
            <Link href="/sales" className="px-3 py-2 rounded-md hover:bg-muted">
              Dashboard
            </Link>
            <Link href="/sales/prospects" className="px-3 py-2 rounded-md hover:bg-muted">
              Prospect
            </Link>
            <Link href="/sales/pipeline" className="px-3 py-2 rounded-md hover:bg-muted">
              Pipeline
            </Link>
            <TasksNavLink />
            <CalendarNavLink />
            <Link href="/sales/leads" className="px-3 py-2 rounded-md hover:bg-muted">
              Lead
            </Link>
            <Link href="/sales/posta" className="px-3 py-2 rounded-md hover:bg-muted">
              Posta
            </Link>
            <Link href="/sales/commissions" className="px-3 py-2 rounded-md hover:bg-muted">
              Commissioni
            </Link>
            <Link href="/sales/revman" className="px-3 py-2 rounded-md hover:bg-muted">
              RevMan
            </Link>
            {isAreaManager && (
              <Link
                href="/sales/team"
                className="px-3 py-2 rounded-md hover:bg-muted text-amber-700 font-medium"
              >
                Team
              </Link>
            )}
            <Link href="/sales/stats" className="px-3 py-2 rounded-md hover:bg-muted">
              Statistiche
            </Link>
            <Link href="/sales/playbook" className="px-3 py-2 rounded-md hover:bg-muted">
              Disco Vendita
            </Link>
            <Link href="/sales/glossary" className="px-3 py-2 rounded-md hover:bg-muted">
              Glossario
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <Link
              href="/sales/settings/calendar"
              className="text-muted-foreground hover:text-foreground"
              title="Calendario personale"
              aria-label="Impostazioni calendario personale"
            >
              <Settings className="h-5 w-5" />
            </Link>
            <div className="hidden sm:block text-right">
              <p className="text-sm font-medium">{fullName}</p>
              <p className="text-xs text-muted-foreground">
                {isSuperAdmin
                  ? "Super Admin (impersonato)"
                  : isDualRole
                    ? "Hotel + Venditore"
                    : "Venditore"}
              </p>
            </div>
            {/*
              Pulsante uscita dal CRM venditori, role-aware:
              - super_admin: torna al pannello /superadmin (impersonazione).
              - dual-role (hotel + agente): "Torna a hotel" → /dashboard.
                Il middleware NON li redirige perche' il role non e'
                'sales_agent' puro.
              - pure agent (role='sales_agent'): logout vero, niente
                uscita verso /dashboard (il middleware lo redirigerebbe
                comunque a /sales = loop).
                Uso <a> nativo perche' /api/auth/logout-now risponde con
                un 302 redirect e non vogliamo client-side navigation
                Next.js (perderemmo il signOut server-side).
            */}
            {isSuperAdmin ? (
              <Link
                href="/superadmin"
                className="hidden md:inline-block text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted"
              >
                Torna a Superadmin
              </Link>
            ) : isDualRole ? (
              <Link
                href="/dashboard"
                className="hidden md:inline-block text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted"
              >
                Torna a hotel
              </Link>
            ) : (
              <a
                href="/api/auth/logout-now"
                className="hidden md:inline-block text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted"
              >
                Esci
              </a>
            )}
          </div>
        </div>
      </header>
      <main className="pb-4">{children}</main>
      <SalesMobileNav isAreaManager={isAreaManager} exitMode={exitMode} fullName={fullName} />
    </div>
  )
}
