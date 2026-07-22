import type React from "react"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import Link from "next/link"
import { getSettingsData } from "@/lib/settings/get-settings-data"
import { AppLayout } from "@/components/layout/app-layout"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Building2, Users, Wrench, Zap, Link2 as LinkIcon, BarChart3, DollarSign, Clock, Target, Code, Bell } from "lucide-react"

// Check if running in v0 preview
async function isV0Preview(): Promise<boolean> {
  try {
    const headersList = await headers()
    const host = headersList.get("host") || ""
    return host.includes("v0.dev") || host.includes("v0.app") || host.includes("vusercontent.net")
  } catch {
    return false
  }
}

export const dynamic = "force-dynamic"

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const data = await getSettingsData()
  const isPreview = await isV0Preview()

  // Skip redirect in v0 preview (DEV database may not have all mappings)
  if (data.redirect && !isPreview) {
    redirect(data.redirect)
  }

  // If we only have redirect data (no profile/hotels), provide defaults
  const initialData = {
    profile: data.profile || null,
    hotels: data.hotels || [],
    selectedHotel: data.selectedHotel || null,
    pmsIntegration: data.pmsIntegration || null,
    subscription: data.subscription || null,
    isSuperAdmin: data.isSuperAdmin || false,
    isDeveloper: data.isDeveloper || false,
    isImpersonating: data.isImpersonating || false,
    roomTypes: data.roomTypes || [],
    hasMappings: data.hasMappings || false,
    allHotels: data.allHotels || data.hotels || [],
  }

  return (
    <AppLayout initialData={initialData}>
      <main className="flex-1">
        <div className="container mx-auto max-w-6xl p-6">
          <div className="mb-6">
            <h1 className="text-3xl font-bold">Impostazioni</h1>
            <p className="text-muted-foreground mt-2">Gestisci la tua struttura, il team e le integrazioni</p>
          </div>

          <Tabs defaultValue="hotel" className="space-y-6">
            <TabsList className="flex w-full overflow-x-auto">
              <TabsTrigger value="hotel" asChild className="flex-1 min-w-0">
                <Link href="/settings/hotel">
                  <Building2 className="h-4 w-4 mr-2 shrink-0" />
                  <span className="truncate">Struttura</span>
                </Link>
              </TabsTrigger>
              <TabsTrigger value="users" asChild className="flex-1 min-w-0">
                <Link href="/settings/users">
                  <Users className="h-4 w-4 mr-2 shrink-0" />
                  <span className="truncate">Team</span>
                </Link>
              </TabsTrigger>
              <TabsTrigger value="pms" asChild className="flex-1 min-w-0">
                <Link href="/settings/pms">
                  <Wrench className="h-4 w-4 mr-2 shrink-0" />
                  <span className="truncate">PMS</span>
                </Link>
              </TabsTrigger>
              <TabsTrigger value="mappings" asChild className="flex-1 min-w-0">
                <Link href="/settings/mappings">
                  <LinkIcon className="h-4 w-4 mr-2 shrink-0" />
                  <span className="truncate">Mappature</span>
                </Link>
              </TabsTrigger>
              <TabsTrigger value="occupancy-bands" asChild className="flex-1 min-w-0">
                <Link href="/settings/occupancy-bands">
                  <BarChart3 className="h-4 w-4 mr-2 shrink-0" />
                  <span className="truncate">Fasce Occ.</span>
                </Link>
              </TabsTrigger>
              <TabsTrigger value="last-minute-levels" asChild className="flex-1 min-w-0">
                <Link href="/settings/last-minute-levels">
                  <Clock className="h-4 w-4 mr-2 shrink-0" />
                  <span className="truncate">Last Minute</span>
                </Link>
              </TabsTrigger>
              <TabsTrigger value="rate-limits" asChild className="flex-1 min-w-0">
                <Link href="/settings/rate-limits">
                  <DollarSign className="h-4 w-4 mr-2 shrink-0" />
                  <span className="truncate">Limiti Tariffari</span>
                </Link>
              </TabsTrigger>
              <TabsTrigger value="kpi" asChild className="flex-1 min-w-0">
                <Link href="/settings/kpi">
                  <Target className="h-4 w-4 mr-2 shrink-0" />
                  <span className="truncate">KPI</span>
                </Link>
              </TabsTrigger>
              <TabsTrigger value="notifications" asChild className="flex-1 min-w-0">
                <Link href="/settings/notifications">
                  <Bell className="h-4 w-4 mr-2 shrink-0" />
                  <span className="truncate">Notifiche</span>
                </Link>
              </TabsTrigger>
              <TabsTrigger value="api" asChild className="flex-1 min-w-0">
                <Link href="/settings/api">
                  <Code className="h-4 w-4 mr-2 shrink-0" />
                  <span className="truncate">API</span>
                </Link>
              </TabsTrigger>
              <TabsTrigger value="advanced" asChild className="flex-1 min-w-0">
                <Link href="/settings/advanced">
                  <Zap className="h-4 w-4 mr-2 shrink-0" />
                  <span className="truncate">Avanzate</span>
                </Link>
              </TabsTrigger>
            </TabsList>

            {children}
          </Tabs>
        </div>
      </main>
    </AppLayout>
  )
}
