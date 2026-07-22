"use client"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  Building2,
  AlertTriangle,
  Zap,
  Settings,
  Users,
  Gauge,
  Plug,
  LogOut,
  Map,
  FileSpreadsheet,
  Code,
  MessageCircle,
  Lightbulb,
  DollarSign,
  SlidersHorizontal,
  RefreshCw,
  Database,
  Variable,
  Mail,
  LayoutDashboard,
  HeartPulse,
  Briefcase,
  Target,
  Kanban,
} from "lucide-react"
import { useState, useEffect } from "react"
import { GlobalAlertRulesManager } from "./global-alert-rules-manager"
import { OrganizationsManager } from "./organizations-manager"
import { SystemSettingsManager } from "./system-settings-manager"
import { SyncConfigurationManager } from "./sync-configuration-manager"
import { PageNavigation } from "@/components/layout/page-navigation"
import { HotelsManager } from "./hotels-manager"
import { SubscriptionsManager } from "./subscriptions-manager"
import { AuditLogsViewer } from "./audit-logs-viewer"
import { CommunicationsManager } from "./communications-manager"
import { KpiSuggestionsManager } from "./kpi-suggestions-manager"
import { KpiPlanManager } from "./kpi-plan-manager"
import { UsersManager } from "./users-manager"
import { Button } from "@/components/ui/button"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/browser-client"
import { SuperAdminHeader } from "./superadmin-header"
import { PricingIntegrityBanner } from "./pricing-integrity-banner"
import { AvailabilityIntegrityBanner } from "./availability-integrity-banner"
import { PricingVariablesManager } from "./pricing-variables-manager"
import { PricingDefaultsManager } from "./pricing-defaults-manager"
import { MarketingManager } from "./marketing-manager"
import { AddonsManager } from "./addons-manager"
import { CatalogManager } from "./catalog-manager"
import { AppFooter } from "@/components/layout/app-footer"
import { CommissionRequestsManager } from "./commission-requests-manager"
import { InvoicesManager } from "./invoices-manager"
import { PaymentsRegistryManager } from "./payments-registry-manager"

interface Organization {
  id: string
  name: string
  type: string
  created_at: string
}

interface Subscription {
  id: string
  hotel_id: string
  plan_type: string
  algorithm_type: string
  is_active: boolean
  hotel: {
    name: string
    total_rooms: number
  }
}

interface AlertRule {
  id: string
  name: string
  metric: string
  operator: string
  threshold: number
  severity: string
  is_active: boolean
}

export function SuperAdminDashboard({
  organizations,
  hotels,
  activeSubscriptions,
  allSubscriptions,
  globalAlertRules,
  commissionRequests = [],
}: {
  organizations: Organization[]
  hotels: any[]
  activeSubscriptions: Subscription[]
  allSubscriptions: any[]
  globalAlertRules: AlertRule[]
  commissionRequests?: any[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isReprocessing, setIsReprocessing] = useState(false)
  const [reprocessResult, setReprocessResult] = useState<any>(null)

  // 19/05/2026: tab deep-linkable via `?tab=...` (es. /superadmin?tab=payments).
  // Whitelist degli ID supportati per evitare valori arbitrari nel querystring.
  const VALID_TABS = [
    "subscriptions", "invoices", "payments", "commission-requests", "addons",
    "hotels", "users", "organizations", "alert-rules", "audit-logs",
    "comunicazioni", "kpi-suggestions", "kpi-plans", "sync-config", "settings",
    "pricing-variables", "pricing-defaults", "marketing",
  ] as const
  type TabId = (typeof VALID_TABS)[number]
  const initialTab = (() => {
    const t = searchParams?.get("tab")
    return (t && (VALID_TABS as readonly string[]).includes(t) ? t : "subscriptions") as TabId
  })()
  const [activeTab, setActiveTab] = useState<TabId>(initialTab)
  // 19/05/2026: i link "Billing" puntano a /superadmin?tab=... e Next.js
  // li tratta come navigazione client-side mantenendo il componente
  // montato. Senza questo effect lo stato resta sul tab precedente.
  useEffect(() => {
    const t = searchParams?.get("tab")
    const next = (t && (VALID_TABS as readonly string[]).includes(t) ? t : "subscriptions") as TabId
    setActiveTab((prev) => (prev === next ? prev : next))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])
  // Mantiene URL e stato in sync quando l'utente clicca un altro tab.
  const handleTabChange = (value: string) => {
    setActiveTab(value as TabId)
    const sp = new URLSearchParams(searchParams?.toString() ?? "")
    if (value === "subscriptions") sp.delete("tab")
    else sp.set("tab", value)
    const qs = sp.toString()
    router.replace(qs ? `/superadmin?${qs}` : "/superadmin", { scroll: false })
  }

  // FIX 02/05/2026: pallino rosso "Comunicazioni" quando ci sono nuove
  // conversazioni della Chat Guida non lette. Polling ogni 60s + listener
  // dell'evento `guide-unread-changed` che il manager interno emette quando
  // si segna come letta una conversazione (refresh immediato del badge).
  const [unreadGuideCount, setUnreadGuideCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    const fetchUnread = async () => {
      try {
        const res = await fetch("/api/superadmin/guide-leads/unread-count", { cache: "no-store" })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setUnreadGuideCount(Number(data.count) || 0)
      } catch {
        /* soft fail */
      }
    }
    fetchUnread()
    const interval = setInterval(fetchUnread, 60_000)
    const onChanged = () => fetchUnread()
    window.addEventListener("guide-unread-changed", onChanged)
    return () => {
      cancelled = true
      clearInterval(interval)
      window.removeEventListener("guide-unread-changed", onChanged)
    }
  }, [])

  // Avviso feedback tenant: quante segnalazioni (suggerimenti/problemi) sono
  // ancora aperte. Mostra un banner in cima alla dashboard che porta al tab
  // "Comunicazioni" dove il FeedbackManager permette di rispondere/gestire.
  const [openFeedbackCount, setOpenFeedbackCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    const fetchFeedback = async () => {
      try {
        const res = await fetch("/api/superadmin/feedback/unread-count", { cache: "no-store" })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setOpenFeedbackCount(Number(data.count) || 0)
      } catch {
        /* soft fail */
      }
    }
    fetchFeedback()
    const interval = setInterval(fetchFeedback, 60_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  // Derived stats for the summary cards
  const totalRooms = hotels.reduce((sum: number, h: any) => sum + (h.total_rooms || 0), 0)
  const fixedFeeSubscriptions = activeSubscriptions.filter((s) => s.algorithm_type === "fixed_fee").length
  const commissionSubscriptions = activeSubscriptions.filter((s) => s.algorithm_type === "commission").length

  const handleReprocessBookings = async () => {
    if (!confirm("Riprocessare TUTTI i raw bookings per tutti gli hotel? Questa operazione puo' richiedere diversi minuti.")) return
    setIsReprocessing(true)
    setReprocessResult(null)
    try {
      const res = await fetch("/api/superadmin/reprocess-bookings", { method: "POST" })
      const data = await res.json()
      setReprocessResult(data)
    } catch (err) {
      setReprocessResult({ error: err instanceof Error ? err.message : "Errore sconosciuto" })
    } finally {
      setIsReprocessing(false)
    }
  }

  const handleLogout = async () => {
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
      window.location.href = "/auth/login"
    } catch {
      window.location.href = "/auth/login"
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <SuperAdminHeader />

      <main className="container mx-auto px-6 py-8">
        <PricingIntegrityBanner />
        <AvailabilityIntegrityBanner />
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Pannello SuperAdmin</h1>
            <p className="text-muted-foreground">Gestione globale del sistema SANTADDEO - Strutture Affiliate</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReprocessBookings}
              disabled={isReprocessing}
            >
              {isReprocessing ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Database className="h-4 w-4 mr-2" />
              )}
              {isReprocessing ? "Riprocessando..." : "Riprocessa Bookings"}
            </Button>
            {reprocessResult && (
              <div className="text-xs text-right max-w-sm">
                {reprocessResult.error ? (
                  <span className="text-red-600">Errore: {reprocessResult.error}</span>
                ) : (
                  <div className="text-green-700 space-y-0.5">
                    {reprocessResult.results?.map((r: any, i: number) => (
                      <div key={i}>
                        {r.hotel}: {r.imported}/{r.raw_count} importati
                        {r.errors > 0 && <span className="text-orange-600"> ({r.errors} errori)</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {openFeedbackCount > 0 && (
          <button
            type="button"
            onClick={() => handleTabChange("comunicazioni")}
            className="mb-6 flex w-full items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-left transition-colors hover:bg-red-100"
          >
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-red-500 text-white">
              <MessageCircle className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-900">
                {openFeedbackCount === 1
                  ? "1 nuova segnalazione dai tenant"
                  : `${openFeedbackCount} nuove segnalazioni dai tenant`}
              </p>
              <p className="text-xs text-red-700">
                Suggerimenti o problemi in attesa di risposta. Clicca per gestirli in Comunicazioni.
              </p>
            </div>
            <Badge className="bg-red-500 hover:bg-red-500 text-white">{openFeedbackCount}</Badge>
          </button>
        )}

        <div className="grid gap-6 md:grid-cols-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Organizzazioni</span>
                <Building2 className="h-4 w-4 text-blue-600" />
              </div>
              <div className="text-3xl font-bold">{organizations.length}</div>
              <p className="text-xs text-muted-foreground mt-1">Totali nel sistema</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Hotel Affiliati</span>
                <AlertTriangle className="h-4 w-4 text-green-600" />
              </div>
              <div className="text-3xl font-bold">{hotels.length}</div>
              <p className="text-xs text-muted-foreground mt-1">{totalRooms} camere totali</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Accelerator Attivi</span>
                <Zap className="h-4 w-4 text-purple-600" />
              </div>
              <div className="text-3xl font-bold">{activeSubscriptions.length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {fixedFeeSubscriptions} fee fissa, {commissionSubscriptions} commissione
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Alert Globali</span>
                <AlertTriangle className="h-4 w-4 text-orange-600" />
              </div>
              <div className="text-3xl font-bold">{globalAlertRules.length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {globalAlertRules.filter((r) => r.is_active).length} attive
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          {/* La navigazione (TabsList + link rapidi) è stata sostituita dalla
              barra unica per aree in app/superadmin/layout.tsx (SuperAdminNav).
              Qui restano solo i contenuti, pilotati da activeTab via URL ?tab=. */}
          <TabsContent value="subscriptions">
            <SubscriptionsManager subscriptions={allSubscriptions} hotels={hotels} organizations={organizations} />
          </TabsContent>

          <TabsContent value="invoices">
            <InvoicesManager hotels={hotels} />
          </TabsContent>

          <TabsContent value="payments">
            <PaymentsRegistryManager hotels={hotels} />
          </TabsContent>

          <TabsContent value="commission-requests">
            <CommissionRequestsManager requests={commissionRequests} />
          </TabsContent>

          <TabsContent value="addons" className="space-y-8">
            <CatalogManager />
            <AddonsManager hotels={hotels} />
          </TabsContent>

          <TabsContent value="hotels">
            <HotelsManager initialHotels={hotels} organizations={organizations} />
          </TabsContent>

          <TabsContent value="users">
            <UsersManager />
          </TabsContent>

          <TabsContent value="organizations">
            <OrganizationsManager organizations={organizations} hotels={hotels} />
          </TabsContent>

          <TabsContent value="alert-rules">
            <GlobalAlertRulesManager initialRules={globalAlertRules} />
          </TabsContent>

          <TabsContent value="audit-logs">
            <AuditLogsViewer />
          </TabsContent>

          <TabsContent value="comunicazioni">
            <CommunicationsManager />
          </TabsContent>

          <TabsContent value="kpi-suggestions">
            <KpiSuggestionsManager />
          </TabsContent>

          <TabsContent value="kpi-plans">
            <KpiPlanManager />
          </TabsContent>



          <TabsContent value="sync-config">
            <SyncConfigurationManager />
          </TabsContent>

          <TabsContent value="settings">
            <SystemSettingsManager />
          </TabsContent>

          <TabsContent value="pricing-variables">
            <PricingVariablesManager />
          </TabsContent>

          <TabsContent value="pricing-defaults">
            <PricingDefaultsManager />
          </TabsContent>

          <TabsContent value="marketing">
            <MarketingManager />
          </TabsContent>
        </Tabs>
      </main>
      <AppFooter />
    </div>
  )
}
