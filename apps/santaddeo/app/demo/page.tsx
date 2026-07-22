"use client"

import { DemoPage } from "@/components/sales/demo/demo-page"
import { DashboardOverviewClient } from "@/components/dashboard/dashboard-overview-client"
import { DEMO_HOTEL, DEMO_HOTEL_ID, DEMO_ROOM_TYPES } from "@/lib/sales/demo/mock-api"

/**
 * Demo Dashboard: monta il componente REALE <DashboardOverviewClient/>.
 * I dati (disponibilita', produzione) arrivano dai mock /api/dashboard/*
 * serviti dall'interceptor demo. Stessa UI del prodotto, sempre in sync.
 */
export default function DemoDashboardPage() {
  return (
    <DemoPage
      title="Benvenuto nella Dashboard"
      narration="Questa è la tua pagina principale, quella che apri ogni mattina. In un colpo d'occhio vedi l'andamento della tua struttura: occupazione, produzione, ricavo medio per camera, arrivi e partenze del giorno e il pickup delle ultime ore. Tutti gli indicatori sono confrontati con l'anno precedente e sincronizzati in tempo reale con il tuo P.M.S. e i canali di vendita."
    >
      <div className="container mx-auto p-4 md:p-6">
        <DashboardOverviewClient
          hotelId={DEMO_HOTEL_ID}
          hotelName={DEMO_HOTEL.name}
          accommodationType="camere"
          initialRoomTypes={DEMO_ROOM_TYPES}
        />
      </div>
    </DemoPage>
  )
}
