import { CallAlertsPanel } from "@/components/admin/dashboard/call-alerts-panel"
import PersonalizedDashboard from "@/components/admin/dashboard/personalized-dashboard"
import { ResourceUsagePanel } from "@/components/admin/dashboard/resource-usage-panel"

export default function AdminDashboardPage() {
  return (
    <>
      <CallAlertsPanel />
      <PersonalizedDashboard />
      <ResourceUsagePanel />
    </>
  )
}
