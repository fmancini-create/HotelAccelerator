import PersonalizedDashboard from "@/components/admin/dashboard/personalized-dashboard"
import { DesktopTimeClockPrompt } from "@/components/admin/dashboard/desktop-time-clock-prompt"
import { OperatorRewardsMotivation } from "@/components/admin/dashboard/operator-rewards-motivation"
import { ResourceUsagePanel } from "@/components/admin/dashboard/resource-usage-panel"

export default function AdminDashboardPage() {
  return (
    <>
      <DesktopTimeClockPrompt />
      <OperatorRewardsMotivation />
      <PersonalizedDashboard />
      <ResourceUsagePanel />
    </>
  )
}