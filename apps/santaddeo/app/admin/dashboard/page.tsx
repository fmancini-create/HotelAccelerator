import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { AdminHeader } from "@/components/admin/admin-header"
import { AppFooter } from "@/components/layout/app-footer"
import { AdminDashboardOverview } from "@/components/admin/sections/overview"
import { AdminStructuresSection } from "@/components/admin/sections/structures"
import { AdminPMSMonitoring } from "@/components/admin/sections/pms-monitoring"
import { AdminCronLogs } from "@/components/admin/sections/cron-logs"
import { AdminAlertsSection } from "@/components/admin/sections/alerts"
import { AdminGlobalSettings } from "@/components/admin/sections/global-settings"
import { safeFetch } from "@/lib/utils/safe-fetch"

export const dynamic = "force-dynamic"

async function getAdminData() {
  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()
  const cookieHeader = allCookies.map((c) => `${c.name}=${c.value}`).join("; ")

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const baseUrl = appUrl
    ? appUrl.startsWith("http") ? appUrl : `https://${appUrl}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000"

  const { data, error } = await safeFetch<any>(`${baseUrl}/api/ui/admin`, {
    headers: { Cookie: cookieHeader },
    cache: "no-store",
  })

  if (error || !data) {
    return { redirect: "/auth/login" }
  }
  return data
}

export default async function AdminDashboardPage() {
  const data = await getAdminData()

  if (data.redirect) {
    redirect(data.redirect)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader openAlertsCount={data.openAlertsCount} hotels={data.hotelsWithRelations} />

      <div className="container mx-auto p-6 space-y-6">
        <AdminDashboardOverview
          hotels={data.hotelsWithRelations}
          organizations={data.organizations || []}
          pmsIntegrations={data.pmsIntegrationsWithHotels}
          syncLogs={data.syncLogs || []}
          etlJobs={data.etlJobs || []}
        />

        <AdminStructuresSection hotels={data.hotelsWithRelations} />

        <AdminPMSMonitoring pmsIntegrations={data.pmsIntegrationsWithHotels} />

        <AdminCronLogs syncLogs={data.syncLogs || []} etlJobs={data.etlJobs || []} />

        <div id="alerts">
          <AdminAlertsSection alerts={data.alertsWithHotels} />
        </div>

        <AdminGlobalSettings />
      </div>
      <AppFooter />
    </div>
  )
}
