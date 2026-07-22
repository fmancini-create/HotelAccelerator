"use client"

import { DemoPage } from "@/components/sales/demo/demo-page"
import { PageHeader } from "@/components/layout/page-header"
import { ReviewsClient } from "@/components/reviews/reviews-client"
import { DEMO_HOTEL, DEMO_HOTEL_ID } from "@/lib/sales/demo/mock-api"

/**
 * Demo Recensioni: monta il componente REALE <ReviewsClient/>, alimentato
 * dai mock /api/reviews/* serviti dall'interceptor in modalita' demo.
 * Cosi' la demo resta identica al prodotto e si aggiorna da sola.
 */
export default function DemoReviewsPage() {
  return (
    <DemoPage
      title="Recensioni e reputazione online"
      narration="Tutte le recensioni dei tuoi ospiti, da Booking, Google, TripAdvisor e altre piattaforme, raccolte in un unico posto. L'intelligenza artificiale analizza il sentiment di ogni recensione, identifica i temi ricorrenti e ti suggerisce risposte personalizzate da inviare con un click. Puoi monitorare il punteggio di reputazione nel tempo e capire dove migliorare."
    >
      <PageHeader title="Recensioni" description={`Reputazione e insight AI per ${DEMO_HOTEL.name}`} />
      <ReviewsClient hotelId={DEMO_HOTEL_ID} />
    </DemoPage>
  )
}
