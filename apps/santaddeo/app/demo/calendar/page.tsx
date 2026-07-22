"use client"

import { DemoPage } from "@/components/sales/demo/demo-page"
import { PageHeader } from "@/components/layout/page-header"
import { BookingActivityCalendar } from "@/components/calendario/booking-activity-calendar"
import { DEMO_HOTEL_ID } from "@/lib/sales/demo/mock-api"

/**
 * Demo Calendario: monta il componente REALE BookingActivityCalendar.
 * I dati arrivano dal mock /api/dati/calendario (vedi mock-api.ts), servito
 * dall'interceptor del layout demo. Identico al prodotto, con dati finti.
 */
export default function DemoCalendarPage() {
  return (
    <DemoPage
      title="Calendario Prenotazioni"
      narration="Questo è il calendario annuale delle prenotazioni, identico a quello che usi ogni giorno. Ogni data è colorata in base al suo stato: verde quando ci sono prenotazioni attive, arancione per le cancellazioni, rosso per le date ferme cioè quelle con camere ancora libere e nessuna nuova prenotazione da troppo tempo. Il pallino blu segnala le prenotazioni ricevute oggi. Cliccando su un giorno vedi il dettaglio degli ospiti, le tariffe e i canali di vendita."
    >
      <PageHeader
        title="Calendario Prenotazioni"
        description="Attività prenotazioni per data di soggiorno: prenotazioni, cancellazioni e date ferme"
      />
      <main className="p-4 md:p-6">
        <div className="mx-auto max-w-[1600px]">
          <BookingActivityCalendar hotelId={DEMO_HOTEL_ID} />
        </div>
      </main>
    </DemoPage>
  )
}
