import type { Metadata } from "next"
import { PageHeader } from "@/components/layout/page-header"
import { PerformanceOtaClient } from "@/components/ota/performance-ota-client"

export const metadata: Metadata = {
  title: "Performance OTA | Santaddeo",
  description: "Analisi dei canali OTA con KPI manuali Booking.com e mix canale dal DB interno.",
}

export default function PerformanceOtaPage() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title="Performance OTA"
        description="Confronta l'andamento del canale Booking.com con i dati reali del tuo PMS. Aggiornato ogni volta che inserisci i KPI dall'Extranet."
      />
      <PerformanceOtaClient />
    </div>
  )
}
