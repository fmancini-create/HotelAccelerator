"use client"

import { DemoPage } from "@/components/sales/demo/demo-page"
import { AcceleratorPaidBanner } from "@/components/sales/demo/accelerator-paid-banner"
import RealTrendPage from "@/app/accelerator/trend/page"

export default function DemoTrendPage() {
  return (
    <DemoPage
      title="Trend Tariffe & Occupazione"
      narration="Qui vedi come la tariffa e l'occupazione della struttura sono evolute giorno per giorno. Per ogni data Santaddeo mostra il prezzo di partenza, il prezzo attuale, quante volte è stato modificato e l'andamento dell'occupazione, così puoi capire a colpo d'occhio se la strategia di prezzo sta funzionando. Cliccando su un giorno apri il dettaglio con la curva del pickup: come si sono accumulate le prenotazioni avvicinandosi alla data di soggiorno, affiancata all'evoluzione della tariffa. È uno strumento dell'Accelerator, disponibile con il piano a pagamento."
    >
      <AcceleratorPaidBanner feature="Trend Tariffe & Occupazione" />
      <RealTrendPage />
    </DemoPage>
  )
}
