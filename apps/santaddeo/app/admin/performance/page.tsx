import type { Metadata } from "next"
import { PerformanceDashboard } from "@/components/admin/performance-dashboard"
import { AppFooter } from "@/components/layout/app-footer"

export const metadata: Metadata = {
  title: "Performance Report - SANTADDEO",
  description: "Performance metrics and analysis",
}

export const dynamic = "force-dynamic"

export default function PerformancePage() {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <div className="flex-1">
        <PerformanceDashboard />
      </div>
      <AppFooter />
    </div>
  )
}
