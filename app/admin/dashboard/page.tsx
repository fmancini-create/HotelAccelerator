import PersonalizedDashboard from "@/components/admin/dashboard/personalized-dashboard"
import { ResourceUsagePanel } from "@/components/admin/dashboard/resource-usage-panel"

export default function AdminDashboardPage() {
  return (
    <>
      <PersonalizedDashboard />
      <ResourceUsagePanel />
    </>
  )
}
