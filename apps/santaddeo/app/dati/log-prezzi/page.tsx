import { PricingLogViewer } from "@/components/superadmin/pricing-log-viewer"

export const metadata = {
  title: "Log Invio Prezzi | Santaddeo",
  description: "Storico variazioni prezzi, trigger autopilot e invii al PMS",
}

export default function LogPrezziPage() {
  return (
    <div className="container mx-auto py-6 px-4 max-w-7xl">
      <PricingLogViewer />
    </div>
  )
}
