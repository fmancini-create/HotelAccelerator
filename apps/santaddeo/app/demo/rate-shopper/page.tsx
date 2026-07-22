"use client"

import { DemoPage } from "@/components/sales/demo/demo-page"
import { AcceleratorPaidBanner } from "@/components/sales/demo/accelerator-paid-banner"
import RealRateShopperPage from "@/app/accelerator/rate-shopper/page"

export default function DemoRateShopperPage() {
  return (
    <DemoPage
      title="Rate Shopper"
      narration="Il Rate Shopper confronta i tuoi prezzi con quelli del comp set, giorno per giorno. Per ogni notte vedi la tua tariffa, quella di ogni competitor e il mercato (minimo, mediana, massimo), con il tuo posizionamento e lo scostamento percentuale rispetto alla mediana. Le celle verdi indicano che sei competitivo, quelle rosse che sei sopra mercato. Puoi confrontare per notte oppure per tipologia, associando le tue camere a quelle equivalenti dei competitor. È uno strumento dell'Accelerator, disponibile con il piano a pagamento."
    >
      <AcceleratorPaidBanner feature="Rate Shopper" />
      <RealRateShopperPage />
    </DemoPage>
  )
}
