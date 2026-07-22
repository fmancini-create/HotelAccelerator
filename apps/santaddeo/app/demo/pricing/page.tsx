"use client"

import { DemoPage } from "@/components/sales/demo/demo-page"
import { AcceleratorPaidBanner } from "@/components/sales/demo/accelerator-paid-banner"
import RealPricingPage from "@/app/accelerator/pricing/page"

export default function DemoPricingPage() {
  return (
    <DemoPage
      title="Pricing"
      narration="Questa è la sezione di Revenue Management, il cuore dell'Accelerator. L'algoritmo proprietario analizza ogni secondo tutti i dati: domanda, occupazione, eventi del territorio e molto altro. In base a come tu o il tuo revenue manager avete impostato le variabili che concorrono a determinare il miglior prezzo di vendita delle camere, Santaddeo decide il prezzo ottimale per ogni tipologia e per ogni giorno. Vedi il prezzo attuale e quello suggerito dall'intelligenza artificiale, e se l'autopilot è attivo i prezzi vengono inviati subito a tutti i canali collegati: Booking, Expedia, Airbnb e il sito diretto. È una funzione disponibile attivando il piano a pagamento."
    >
      <AcceleratorPaidBanner feature="Pricing" />
      <RealPricingPage />
    </DemoPage>
  )
}
