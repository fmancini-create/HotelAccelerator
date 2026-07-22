"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import type { KpiMode } from "@/components/dashboard/kpi-mode-selector"
import {
  DashboardOverviewSkeleton,
  DashboardMetricsSkeleton,
  AlertsPanelSkeleton,
} from "@/components/dashboard/dashboard-shell"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertTriangle, Link2, Zap, TrendingUp, Target, Bell } from "lucide-react"
import Link from "next/link"

const DashboardHeader = dynamic(
  () => import("@/components/dashboard/header-dashboard").then((mod) => mod.DashboardHeader),
  { ssr: false, loading: () => <HeaderSkeleton /> },
)

const DeveloperNav = dynamic(() => import("@/components/layout/developer-nav").then((mod) => mod.DeveloperNav), {
  ssr: false,
  loading: () => null,
})



const SetupReminderDialog = dynamic(
  () => import("@/components/dashboard/setup-reminder-dialog").then((mod) => mod.SetupReminderDialog),
  { ssr: false, loading: () => null },
)

const SyncProgressBar = dynamic(
  () => import("@/components/dashboard/sync-progress-bar").then((mod) => mod.SyncProgressBar),
  { ssr: false, loading: () => null },
)

const DashboardOverviewClient = dynamic(
  () => import("@/components/dashboard/dashboard-overview-client").then((mod) => mod.DashboardOverviewClient),
  { ssr: false, loading: () => <DashboardOverviewSkeleton /> },
)

const DashboardMetrics = dynamic(
  () => import("@/components/dashboard/dashboard-metrics").then((mod) => mod.DashboardMetrics),
  { ssr: false, loading: () => <DashboardMetricsSkeleton /> },
)

const AlertsPanel = dynamic(() => import("@/components/dashboard/alerts-panel").then((mod) => mod.AlertsPanel), {
  ssr: false,
  loading: () => <AlertsPanelSkeleton />,
})

const KpiModeSelector = dynamic(
  () => import("@/components/dashboard/kpi-mode-selector").then((mod) => mod.KpiModeSelector),
  { ssr: false, loading: () => null },
)

const MotivationalSplash = dynamic(
  () => import("@/components/motivational-splash").then((mod) => mod.MotivationalSplash),
  { ssr: false, loading: () => null },
)

import type { HotelCapabilities } from "@/lib/capabilities/get-capabilities"

function HeaderSkeleton() {
  return (
    <div className="border-b bg-white">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-24 md:w-48" />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-10 md:w-32" />
            <Skeleton className="h-10 w-10 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  )
}

interface DashboardData {
  profile: any
  hotels: any[]
  selectedHotel: any
  pmsIntegration: any
  subscription: any
  isSuperAdmin: boolean
  isDeveloper: boolean
  isImpersonating: boolean
  roomTypes: any[]
  etlStatus?: {
    can_run: boolean
    mapping_status?: string
    binding_status?: string
    blockers?: Array<{ code: string; message: string }>
  } | null
  hasMappings: boolean
  capabilities?: HotelCapabilities
  kpiConfigs?: any[]
  hasCustomThresholds?: boolean
  allHotels?: any[] // All platform hotels for superadmin dropdown
}

interface DashboardShellClientProps {
  userId: string
  userEmail: string
  impersonatedHotelId?: string
  initialData: DashboardData
}

export function DashboardShellClient({
  userId,
  userEmail,
  impersonatedHotelId,
  initialData,
}: DashboardShellClientProps) {
  const router = useRouter()
  const [data] = useState<DashboardData>(initialData)
  // FIX 06/05/2026: kpiMode viene persistito in localStorage cosi' la
  // scelta dell'utente ("KPI Sistema" vs "KPI Personalizzati") sopravvive
  // ai ricaricamenti della pagina e ai login successivi. Default: "system"
  // se la storage e' vuota. La key e' globale (non per-hotel) perche'
  // l'utente ha una preferenza visiva sua.
  const KPI_MODE_STORAGE_KEY = "dashboard.kpiMode"
  const [kpiMode, setKpiModeState] = useState<KpiMode>("system")

  // Hydrate from localStorage at mount (SSR-safe).
  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const stored = window.localStorage.getItem(KPI_MODE_STORAGE_KEY)
      if (stored === "system" || stored === "custom") {
        setKpiModeState(stored)
      }
    } catch {
      // localStorage disabilitato (private browsing strict, ecc.) -> ignore
    }
  }, [])

  // Wrapper che persiste la scelta dell'utente su disco.
  const setKpiMode = (next: KpiMode) => {
    setKpiModeState(next)
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(KPI_MODE_STORAGE_KEY, next)
      } catch {
        // ignore
      }
    }
  }
  // Pre-fetched server-side - no useState needed
  const hasCustomThresholds = initialData.hasCustomThresholds ?? false
  const [showSplash, setShowSplash] = useState(initialData.selectedHotel?.show_motivational_splash ?? false)

  const {
    profile,
    hotels,
    selectedHotel,
    pmsIntegration,
    subscription,
    isSuperAdmin,
    isDeveloper,
    isImpersonating,
    roomTypes,
    hasMappings,
    etlStatus,
    capabilities,
    allHotels,
  } = data
  // FIX 12/05/2026: il setup e' completo quando l'utente ha completato il
  // form di onboarding (profile.setup_completed=true) E ha almeno un hotel.
  // Prima la condizione richiedeva anche pmsIntegration/hasMappings/etlStatus,
  // ma cosi' il modal "Completa la Configurazione" si apriva subito dopo
  // onboarding per chi aveva selezionato un PMS diverso da Scidoo (es. Hotel
  // Cassero che non ha ancora pms_integration.is_active) o per chi e' in
  // attesa di mappature lato superadmin. La configurazione PMS/mappings
  // resta segnalata altrove (banner ETL "NoMappingsMessage").
  // Il modale "Completa la Configurazione" si basa su profile.setup_completed,
  // che e' una flag del PROFILO UTENTE. I venditori (sales_agent) accedono pero'
  // alle strutture dei clienti (es. Villa I Barronci) come "Hotel + Venditore":
  // hanno setup_completed=false sul proprio profilo ma NON devono configurare il
  // PMS di una struttura altrui, gia' operativa. Escludiamo quindi il modale per
  // i venditori, oltre che per super_admin e developer.
  const isSalesAgent = (profile?.role || "").toLowerCase() === "sales_agent"
  const isSetupComplete = !!(profile?.setup_completed && selectedHotel)

  // hasCustomThresholds is now pre-fetched server-side in DashboardContent
  // No need for client-side API call - initialData.hasCustomThresholds is already set

  const AcceleratorCTA = () => (
    <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100 shadow-md">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-full bg-blue-600">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <CardTitle className="text-base font-bold text-blue-900">Attiva Accelerator</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <p className="text-sm text-blue-800 mb-3">
          Sblocca il pricing dinamico e massimizza il tuo revenue con l'algoritmo SANTADDEO.
        </p>
        <ul className="space-y-2 mb-4">
          <li className="flex items-center gap-2 text-sm text-blue-700">
            <TrendingUp className="h-4 w-4 text-blue-600 shrink-0" />
            <span>Pricing dinamico automatico</span>
          </li>
          <li className="flex items-center gap-2 text-sm text-blue-700">
            <Target className="h-4 w-4 text-blue-600 shrink-0" />
            <span>Ottimizzazione tariffe in tempo reale</span>
          </li>
          <li className="flex items-center gap-2 text-sm text-blue-700">
            <Bell className="h-4 w-4 text-blue-600 shrink-0" />
            <span>Alert avanzati e suggerimenti</span>
          </li>
        </ul>
        <Link href="/accelerator/activate" className="block">
          <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2">
            <Zap className="h-4 w-4" />
            Scopri Accelerator
          </Button>
        </Link>
        <p className="text-xs text-blue-600 text-center mt-2">
          Scegli tra piano mensile o a commissione
        </p>
      </CardContent>
    </Card>
  )

  const NoMappingsMessage = () => (
    <Card className="border-amber-200 bg-amber-50">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <CardTitle className="text-lg text-amber-800">Sincronizzazione ETL non attiva</CardTitle>
        </div>
        <CardDescription className="text-amber-700">
          I dati della dashboard non sono disponibili finché la configurazione non è completa.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm text-amber-700">
          {etlStatus?.blockers && etlStatus.blockers.length > 0 ? (
            <div className="space-y-1">
              <span className="font-medium">Motivo:</span>
              <ul className="list-disc pl-5">
                {etlStatus.blockers.map((blocker, i) => (
                  <li key={i}>{blocker.message || blocker.code}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              <span>Contatta il SuperAdmin per configurare le mappature di camere, tariffe e altri dati PMS.</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {showSplash && (
        <MotivationalSplash 
          onComplete={() => setShowSplash(false)} 
          duration={4000} 
          userName={profile?.first_name || profile?.full_name?.split(' ')[0]}
        />
      )}
      {!isSuperAdmin && !isDeveloper && !isSalesAgent && (
        <SetupReminderDialog isSetupComplete={isSetupComplete} planType={subscription?.plan_type} />
      )}

      <DeveloperNav
        userEmail={userEmail}
        userRole={profile?.role || "user"}
        hotels={hotels}
        selectedHotel={selectedHotel}
        pmsIntegration={pmsIntegration}
      />

      {selectedHotel && <SyncProgressBar hotelId={selectedHotel.id} />}

      {/* FIX 06/05/2026: rimosso il banner "PMS: scidoo (api) [Scarica]"
          sotto l'header dashboard (era visibile solo a superadmin con
          pmsIntegration configurato). Il sync manuale resta disponibile
          via DeveloperNav e l'auto-sync via cron sync-and-etl. */}

      {/* KPI Mode Selector - shown when hotel is selected and has mappings */}
      {selectedHotel && hasMappings && (
        <div className="border-b bg-white/80 backdrop-blur-sm">
          <div className="container mx-auto px-4 py-2 md:px-6">
            <KpiModeSelector
              mode={kpiMode}
              onModeChange={setKpiMode}
              subscription={subscription}
              hasCustomThresholds={hasCustomThresholds}
            />
          </div>
        </div>
      )}

      <main className="flex-1">
        <div className="container mx-auto p-4 md:p-6">
          {selectedHotel ? (
            hasMappings ? (
              <div className="flex flex-col gap-4 md:gap-6">
                {/* Sidebar: Legenda + Accelerator CTA + Alerts - ALWAYS on top on mobile/tablet */}
                <div className="flex flex-col md:flex-row lg:hidden gap-4">
                  {/* Legenda Semafori - compact horizontal on mobile */}
                  <Card className="flex-1">
                    <CardHeader className="pb-2 pt-3 px-4">
                      <CardTitle className="text-sm font-semibold">Legenda Performance</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-3 pt-0">
                      <div className="flex gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="inline-block h-3 w-3 rounded-full bg-green-500 shrink-0" />
                          <span className="text-sm text-muted-foreground">In linea con gli obiettivi</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="inline-block h-3 w-3 rounded-full bg-orange-500 shrink-0" />
                          <span className="text-sm text-muted-foreground">Richiede monitoraggio</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="inline-block h-3 w-3 rounded-full bg-red-500 shrink-0" />
                          <span className="text-sm text-muted-foreground">Intervento consigliato</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  {/* Accelerator CTA - shown when no active subscription */}
                  {!subscription && (
                    <div className="flex-1">
                      <AcceleratorCTA />
                    </div>
                  )}
                  <div className="flex-1">
                    <AlertsPanel hotelId={selectedHotel.id} kpiMode={kpiMode} subscription={subscription} />
                  </div>
                </div>

                {/* Desktop: 3-column grid layout */}
                <div className="hidden lg:grid lg:grid-cols-3 gap-6">
                  {/* Left column: Overview + Metrics */}
                  <div className="lg:col-span-2 space-y-6">
                    <DashboardOverviewClient
                      hotelId={selectedHotel.id}
                      hotelName={selectedHotel.name}
                      accommodationType={selectedHotel.accommodation_type || "camere"}
                      initialRoomTypes={roomTypes}
                      capabilities={capabilities}
                    />
                    <DashboardMetrics hotelId={selectedHotel.id} kpiMode={kpiMode} />
                  </div>
                  {/* Right column: Legenda + Accelerator CTA + Alerts (sticky) */}
                  <div className="lg:col-span-1">
                    <div className="lg:sticky lg:top-4 space-y-4">
                      <Card>
                        <CardHeader className="pb-2 pt-4 px-4">
                          <CardTitle className="text-sm font-semibold">Legenda Performance</CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 pb-4 pt-0">
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                              <span className="inline-block h-3 w-3 rounded-full bg-green-500 shrink-0" />
                              <span className="text-sm text-muted-foreground">In linea con gli obiettivi</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="inline-block h-3 w-3 rounded-full bg-orange-500 shrink-0" />
                              <span className="text-sm text-muted-foreground">Richiede monitoraggio</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="inline-block h-3 w-3 rounded-full bg-red-500 shrink-0" />
                              <span className="text-sm text-muted-foreground">Intervento consigliato</span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      {/* Accelerator CTA - shown when no active subscription */}
                      {!subscription && <AcceleratorCTA />}
                      <AlertsPanel hotelId={selectedHotel.id} kpiMode={kpiMode} subscription={subscription} />
                    </div>
                  </div>
                </div>

                {/* Mobile/Tablet: Overview + Metrics below the sidebar */}
                <div className="lg:hidden space-y-4 md:space-y-6 min-w-0">
                  <DashboardOverviewClient
                    hotelId={selectedHotel.id}
                    hotelName={selectedHotel.name}
                    accommodationType={selectedHotel.accommodation_type || "camere"}
                    initialRoomTypes={roomTypes}
                    capabilities={capabilities}
                  />
                  <DashboardMetrics hotelId={selectedHotel.id} kpiMode={kpiMode} />
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <NoMappingsMessage />
                <div className="flex flex-col lg:grid lg:grid-cols-3 gap-4 md:gap-6">
                  <div className="lg:col-span-2">
                    <Card className="opacity-50 pointer-events-none">
                      <CardHeader>
                        <CardTitle className="text-muted-foreground">Dati PMS</CardTitle>
                        <CardDescription>
                          Disponibilità, occupazione, produzione e prenotazioni saranno visibili dopo la configurazione
                          delle mappature.
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  </div>
                  <div className="lg:col-span-1">
                    <AlertsPanel hotelId={selectedHotel.id} kpiMode={kpiMode} subscription={subscription} />
                  </div>
                </div>
              </div>
            )
          ) : (
            // FIX 13/07/2026: rimosso l'empty state "database DEV" con pulsante
            // sync PROD→DEV. Il database DEV e' stato ELIMINATO (esiste solo la
            // produzione), quindi quel percorso era codice morto che falliva con
            // "DEV_SUPABASE_SERVICE_ROLE_KEY non configurata". Se un superadmin
            // vede zero hotel ora significa dati non caricati (es. anteprima v0
            // con client no-op) o un problema reale: messaggio onesto + Ricarica.
            <div className="flex items-center justify-center min-h-[400px] px-4">
              {isSuperAdmin || isDeveloper ? (
                <div className="text-center space-y-4 max-w-md">
                  <h2 className="text-xl md:text-2xl font-semibold">Benvenuto in SANTADDEO</h2>
                  <p className="text-muted-foreground text-sm md:text-base">
                    Nessun hotel caricato. In anteprima v0 e&apos; normale (i dati non sono
                    accessibili); in produzione riprova con Ricarica o controlla i log.
                  </p>
                  <Button variant="outline" onClick={() => router.refresh()}>
                    Ricarica
                  </Button>
                </div>
              ) : (
                <div className="text-center space-y-4 max-w-md">
                  <h2 className="text-xl md:text-2xl font-semibold">Benvenuto in SANTADDEO</h2>
                  <p className="text-muted-foreground text-sm md:text-base">
                    Non risulta ancora associata nessuna struttura al tuo account. Completa la
                    configurazione iniziale per accedere alla dashboard.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2 justify-center">
                    <Link href="/onboarding">
                      <Button>Vai alla configurazione</Button>
                    </Link>
                    <Button
                      variant="outline"
                      onClick={() => router.refresh()}
                      title="Ricarica i dati dell'account"
                    >
                      Ricarica
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground pt-2">
                    Se hai gia&apos; completato la configurazione e vedi ancora questa pagina,
                    contatta l&apos;assistenza.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
