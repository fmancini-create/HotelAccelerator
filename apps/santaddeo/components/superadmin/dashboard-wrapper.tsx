"use client"

import dynamic from "next/dynamic"

// Dynamic import to avoid hydration mismatch caused by browser extensions (like 3CX)
// that modify phone numbers in the HTML before React hydrates
const SuperAdminDashboard = dynamic(
  () => import("@/components/superadmin/dashboard").then((mod) => mod.SuperAdminDashboard),
  { ssr: false, loading: () => <div className="min-h-screen flex items-center justify-center">Caricamento...</div> }
)

interface DashboardWrapperProps {
  organizations: any[]
  hotels: any[]
  activeSubscriptions: any[]
  allSubscriptions: any[]
  globalAlertRules: any[]
  commissionRequests?: any[]
}

export function SuperAdminDashboardWrapper(props: DashboardWrapperProps) {
  return <SuperAdminDashboard {...props} />
}
