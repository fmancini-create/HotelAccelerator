"use client"

import { DemoPage } from "@/components/sales/demo/demo-page"
import { AcceleratorPaidBanner } from "@/components/sales/demo/accelerator-paid-banner"
import { PricingLogViewer } from "@/components/superadmin/pricing-log-viewer"

/**
 * Demo Log Invio Prezzi: monta il componente REALE PricingLogViewer, che fa
 * fetch di /api/superadmin/pricing-log (+ coverage). In demo l'interceptor
 * serve i mock corrispondenti.
 */
export default function DemoLogPrezziPage() {
  return (
    <DemoPage
      title="Log Invio Prezzi"
      narration="Questo e' lo storico completo della gestione prezzi: ogni variazione tariffaria, ogni trigger dell'autopilot e ogni invio al PMS viene registrato con data, dettaglio e esito. Puoi espandere ogni evento per vedere i prezzi prima e dopo, le variazioni proposte dall'algoritmo e il risultato dell'invio ai canali. E' la trasparenza totale su cosa fa il sistema, momento per momento. Il Log Invio Prezzi fa parte della suite Accelerator: e' una funzione disponibile attivando il piano a pagamento."
    >
      <div className="container mx-auto py-6 px-4 max-w-7xl">
        <AcceleratorPaidBanner feature="Log Invio Prezzi" />
        <PricingLogViewer />
      </div>
    </DemoPage>
  )
}
