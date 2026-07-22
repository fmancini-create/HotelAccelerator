"use client"

import { DemoPage } from "@/components/sales/demo/demo-page"
import { AcceleratorPaidBanner } from "@/components/sales/demo/accelerator-paid-banner"
import RealChannelProductionPage from "@/app/accelerator/price/page"

/**
 * Demo Produzione per Canali: monta la pagina REALE (default export), che fa
 * fetch di /api/auth/me, /api/ui/selected-hotel e
 * /api/accelerator/channel-production. In demo l'interceptor serve i mock.
 */
export default function DemoProduzioneCanaliPage() {
  return (
    <DemoPage
      title="Produzione per Canali"
      narration="Questa pagina scompone la produzione per canale di vendita e tipologia di camera, giorno per giorno. Vedi quanto fattura ogni canale - Booking, sito diretto, Airbnb, Expedia - e l'occupazione associata, cosi' da capire da dove arriva davvero il fatturato e dove conviene ridurre la dipendenza dalle OTA. La Produzione per Canali fa parte della suite Accelerator: e' una funzione disponibile attivando il piano a pagamento."
    >
      <AcceleratorPaidBanner feature="Produzione per Canali" />
      <RealChannelProductionPage />
    </DemoPage>
  )
}
