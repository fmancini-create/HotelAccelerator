"use client"

import { DemoPage } from "@/components/sales/demo/demo-page"
import { AcceleratorPaidBanner } from "@/components/sales/demo/accelerator-paid-banner"
import RealAiReportPage from "@/app/dati/ai-report/page"

export default function DemoInsightAiPage() {
  return (
    <DemoPage
      title="Insight AI"
      narration="Insight AI è il tuo analista revenue virtuale. Con un click genera un rapporto narrativo completo sul periodo che scegli: produzione, camere-notte, RevPOR, lead time e tasso di cancellazioni, tutto confrontato con l'anno precedente. L'intelligenza artificiale interpreta i numeri e ti propone raccomandazioni operative concrete, come spingere il canale diretto o ritoccare i prezzi nelle date di alta domanda. Qui vedi un rapporto di esempio già pronto nell'archivio. È una funzione disponibile attivando il piano a pagamento."
    >
      <AcceleratorPaidBanner feature="Insight AI" />
      <RealAiReportPage />
    </DemoPage>
  )
}
