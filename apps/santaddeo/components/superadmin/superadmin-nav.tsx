"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import useSWR from "swr"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Receipt,
  Users2,
  SlidersHorizontal,
  Plug,
  Search,
  Settings,
  ChevronDown,
  ExternalLink,
  Rocket,
} from "lucide-react"

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json())

type NavItem = { label: string; href: string; external?: boolean }
type NavArea = {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  items: NavItem[]
}

// Navigazione unica del pannello Super Admin, organizzata per aree.
// Le voci che corrispondono a un tab in-pagina puntano a /superadmin?tab=<id>
// (il dashboard sincronizza il tab attivo dall'URL); le altre sono pagine autonome.
const AREAS: NavArea[] = [
  {
    id: "panoramica",
    label: "Panoramica",
    icon: LayoutDashboard,
    items: [
      { label: "Abbonamenti", href: "/superadmin" },
      { label: "Hotel", href: "/superadmin?tab=hotels" },
      { label: "Utenti", href: "/superadmin?tab=users" },
      { label: "Organizzazioni", href: "/superadmin?tab=organizations" },
    ],
  },
  {
    id: "onboarding",
    label: "Onboarding",
    icon: Rocket,
    items: [{ label: "Avanzamento go-live", href: "/superadmin/onboarding" }],
  },
  {
    id: "billing",
    label: "Billing",
    icon: Receipt,
    items: [
      { label: "Fatture", href: "/superadmin/invoices" },
      { label: "Pagamenti", href: "/superadmin/payments" },
      { label: "Richieste Commissione", href: "/superadmin?tab=commission-requests" },
      { label: "Addon Premium", href: "/superadmin?tab=addons" },
      { label: "Onboarding Templates", href: "/superadmin/onboarding-templates" },
    ],
  },
  {
    id: "crm",
    label: "CRM",
    icon: Users2,
    items: [
      { label: "Venditori", href: "/superadmin/sales" },
      { label: "Commissioni", href: "/superadmin/sales/commissions" },
      { label: "Prospect", href: "/superadmin/prospects" },
      { label: "Lead", href: "/superadmin/sales/leads" },
      { label: "Posta", href: "/superadmin/sales/posta" },
      { label: "Posta non abbinata", href: "/superadmin/sales/posta-non-abbinata" },
      { label: "Template email", href: "/superadmin/sales/email-template" },
      { label: "Comunicazioni venditori", href: "/superadmin/sales/comunicazioni" },
      { label: "Richieste demo", href: "/superadmin/demo-requests" },
      { label: "Calendario", href: "/superadmin/calendar" },
      { label: "Vista Venditore", href: "/sales", external: true },
    ],
  },
  {
    id: "pricing",
    label: "Pricing",
    icon: SlidersHorizontal,
    items: [
      { label: "Config", href: "/superadmin/pricing" },
      { label: "Push PMS", href: "/superadmin/push-prices" },
      { label: "Log", href: "/superadmin/pricing-log" },
      { label: "Audit", href: "/superadmin/pricing-params-audit" },
      { label: "Drain Email", href: "/superadmin/pricing-tools" },
      { label: "Suggerimenti KPI", href: "/superadmin?tab=kpi-suggestions" },
      { label: "KPI per Piano", href: "/superadmin?tab=kpi-plans" },
    ],
  },
  {
    id: "pms",
    label: "PMS",
    icon: Plug,
    items: [
      { label: "Connectors", href: "/superadmin/connectors-mapping" },
      { label: "Health", href: "/superadmin/connectors-health" },
      { label: "Roadmap", href: "/superadmin/pms-roadmap" },
      { label: "Codici RMS", href: "/superadmin/rms-codes" },
      { label: "Apify schedule", href: "/superadmin/review-schedules" },
      { label: "Sync Automatico", href: "/superadmin?tab=sync-config" },
    ],
  },
  {
    id: "marketing",
    label: "Marketing & SEO",
    icon: Search,
    items: [
      { label: "SEO", href: "/superadmin/seo" },
      { label: "Sitemap", href: "/superadmin/sitemap" },
    ],
  },
  {
    id: "sistema",
    label: "Sistema",
    icon: Settings,
    items: [
      { label: "Impostazioni Sistema", href: "/superadmin?tab=settings" },
      { label: "Regole Alert Globali", href: "/superadmin?tab=alert-rules" },
      { label: "Audit Logs", href: "/superadmin?tab=audit-logs" },
      { label: "Comunicazioni", href: "/superadmin?tab=comunicazioni" },
      { label: "Business Plan", href: "/superadmin/business-plan" },
      { label: "Sviluppo", href: "/superadmin/features" },
      { label: "Dashboard Lab", href: "/superadmin/dashboard-lab" },
      { label: "API Keys", href: "/superadmin/api-keys" },
      { label: "Costi", href: "/superadmin/tenant-costs" },
      { label: "Performance", href: "/admin/performance" },
    ],
  },
]

export function SuperAdminNav() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentTab = searchParams?.get("tab") ?? null

  const { data } = useSWR<{ counts: Record<string, number> }>(
    "/api/superadmin/demo-requests?status=pending",
    fetcher,
    { refreshInterval: 60_000 },
  )
  const pendingDemos = data?.counts?.pending || 0

  // Avviso feedback tenant: badge rosso quando un tenant ha inviato un
  // suggerimento o una segnalazione di problema ancora da prendere in carico
  // (status "open"). Il FeedbackManager vive nel tab "Comunicazioni".
  const { data: feedbackData } = useSWR<{ count: number }>(
    "/api/superadmin/feedback/unread-count",
    fetcher,
    { refreshInterval: 60_000 },
  )
  const openFeedback = feedbackData?.count || 0

  // Avviso nuova registrazione hotel: badge quando un hotel si e' appena
  // registrato e non e' ancora stato "visto" (superadmin_seen_at NULL). Si
  // azzera quando il super admin apre il tab "Hotel" (vedi hotels-manager).
  const { data: newHotelsData } = useSWR<{ count: number }>(
    "/api/superadmin/hotels/unread-count",
    fetcher,
    { refreshInterval: 60_000 },
  )
  const newHotels = newHotelsData?.count || 0

  // Un'area è "attiva" se l'URL corrente combacia con una sua voce.
  const isItemActive = (item: NavItem) => {
    if (item.external) return false
    const [path, query] = item.href.split("?")
    if (query) {
      const tab = new URLSearchParams(query).get("tab")
      return pathname === "/superadmin" && currentTab === tab
    }
    // Voce "Abbonamenti" = /superadmin senza tab.
    if (path === "/superadmin") return pathname === "/superadmin" && !currentTab
    return pathname === path || pathname.startsWith(`${path}/`)
  }

  return (
    <nav className="flex flex-wrap items-center gap-1">
      {AREAS.map((area) => {
        const Icon = area.icon
        const areaActive = area.items.some(isItemActive)
        const showDemoBadge = area.id === "crm" && pendingDemos > 0
        const showFeedbackBadge = area.id === "sistema" && openFeedback > 0
        const showNewHotelsBadge = area.id === "panoramica" && newHotels > 0
        return (
          <DropdownMenu key={area.id}>
            <DropdownMenuTrigger
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors outline-none",
                "hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                areaActive ? "bg-muted text-foreground" : "text-muted-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {area.label}
              {showDemoBadge && (
                <Badge className="bg-amber-500 hover:bg-amber-500 text-xs px-1.5 py-0">{pendingDemos}</Badge>
              )}
              {showFeedbackBadge && (
                <Badge className="bg-red-500 hover:bg-red-500 text-xs px-1.5 py-0">{openFeedback}</Badge>
              )}
              {showNewHotelsBadge && (
                <Badge className="bg-emerald-500 hover:bg-emerald-500 text-xs px-1.5 py-0">{newHotels}</Badge>
              )}
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-52">
              {area.items.map((item) => (
                <DropdownMenuItem key={item.href + item.label} asChild>
                  <Link
                    href={item.href}
                    target={item.external ? "_blank" : undefined}
                    className={cn(
                      "flex items-center justify-between gap-2 cursor-pointer",
                      isItemActive(item) && "bg-muted font-medium",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      {item.label}
                      {item.label === "Richieste demo" && pendingDemos > 0 && (
                        <Badge className="bg-amber-500 hover:bg-amber-500 text-xs px-1.5 py-0">{pendingDemos}</Badge>
                      )}
                      {item.label === "Comunicazioni" && openFeedback > 0 && (
                        <Badge className="bg-red-500 hover:bg-red-500 text-xs px-1.5 py-0">{openFeedback}</Badge>
                      )}
                      {item.label === "Hotel" && newHotels > 0 && (
                        <Badge className="bg-emerald-500 hover:bg-emerald-500 text-xs px-1.5 py-0">{newHotels}</Badge>
                      )}
                    </span>
                    {item.external && <ExternalLink className="h-3.5 w-3.5 opacity-60" />}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      })}
    </nav>
  )
}
