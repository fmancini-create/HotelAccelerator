"use client"

import { DemoPage } from "@/components/sales/demo/demo-page"
import { PageHeader } from "@/components/layout/page-header"
import { PerformanceOtaClient } from "@/components/ota/performance-ota-client"

/**
 * Demo Performance OTA: monta il componente REALE <PerformanceOtaClient/>.
 * Il componente legge l'hotel dal contesto (HotelProvider demo) e i dati da
 * /api/ota/stats, servito dai mock dell'interceptor.
 */
export default function DemoOtaPage() {
  return (
    <DemoPage
      title="Performance OTA"
      narration="Qui confronti l'andamento del canale Booking con i dati reali del tuo PMS. Vedi a colpo d'occhio il mix dei canali di vendita, le prenotazioni, i ricavi e le commissioni applicate, per capire quali canali rendono di piu' al netto delle commissioni e dove conviene spingere la vendita diretta."
    >
      <div className="container mx-auto py-6 space-y-6">
        <PageHeader
          title="Performance OTA"
          description="Confronta l'andamento del canale Booking.com con i dati reali del tuo PMS."
        />
        <PerformanceOtaClient />
      </div>
    </DemoPage>
  )
}
