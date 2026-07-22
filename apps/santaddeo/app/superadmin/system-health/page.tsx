import { SystemHealthDashboard } from "@/components/superadmin/system-health-dashboard"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "System Health | Super Admin",
  description: "Pannello di monitoraggio dello stato di salute del sistema",
}

export default function SystemHealthPage() {
  return <SystemHealthDashboard />
}
