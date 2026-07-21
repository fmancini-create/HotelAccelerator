"use client"

import { DemoPage } from "@/components/sales/demo/demo-page"
import { AcceleratorPaidBanner } from "@/components/sales/demo/accelerator-paid-banner"
import RealRevmanPage from "@/app/accelerator/revman/page"

export default function DemoRevmanPage() {
  return (
    <DemoPage
      title="Area Revenue Manager"
      narration="L'Area Revenue Manager è il filo diretto con il consulente che ti segue. Qui trovi le note condivise, le attività in corso con le relative scadenze, i file e i report che il revenue manager prepara per te, e lo storico delle conversazioni con l'assistente Taddeo. È uno spazio di lavoro collaborativo tra te e il tuo consulente dedicato. È una funzione disponibile attivando il piano a pagamento."
    >
      <AcceleratorPaidBanner feature="Area Revenue Manager" />
      <RealRevmanPage />
    </DemoPage>
  )
}
